'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { requirePermission } = require('../middleware/require-permission');
const { hashPassword } = require('../security/password');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAFF_ROLES = new Set(['operations_admin','intake_staff','lawyer','finance_staff','content_editor']);

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
function clean(value,max,required=false) {
  if(typeof value!=='string')return required?null:'';
  const result=value.trim();
  return result.length<=max&&(!required||result.length>0)?result:null;
}
async function sendInviteEmail(email,fullName,link) {
  if(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL)throw new Error('EMAIL_PROVIDER_NOT_CONFIGURED');
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({
      from:process.env.RESEND_FROM_EMAIL,to:[email],subject:'Your HA Advocates staff invitation',
      text:'Hello '+fullName+',\n\nAn administrator invited you to the HA Advocates workspace. Use this one-time link within 24 hours to set your password and activate your account:\n'+link+'\n\nIf you were not expecting this invitation, contact the firm administrator.'
    }),
    signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)throw new Error('EMAIL_SEND_FAILED');
}

function createAdminUsersRouter(pool,config) {
  const router=express.Router();

  router.get('/roles',requirePermission(pool,'roles.manage'),async(_req,res)=>{
    try{
      const result=await pool.query(
        `SELECT code,display_name_en,display_name_ar FROM role_definitions
          WHERE code = ANY($1::text[]) ORDER BY display_name_en`,
        [[...STAFF_ROLES]]
      );
      return res.json({roles:result.rows});
    }catch(error){console.error('Staff role list failed:',error.message);return res.status(503).json({error:'Staff roles are temporarily unavailable.'});}
  });

  router.get('/',requirePermission(pool,'users.read'),async(_req,res)=>{
    try{
      const result=await pool.query(
        `SELECT u.id,u.email,u.phone,u.status,u.created_at,sp.display_name,
                ARRAY_AGG(DISTINCT rd.code) FILTER (WHERE rd.code IS NOT NULL) AS roles
           FROM app_users u
           JOIN user_roles ur ON ur.user_id=u.id
           JOIN role_definitions rd ON rd.id=ur.role_id
           LEFT JOIN staff_profiles sp ON sp.user_id=u.id
          WHERE rd.code <> 'client'
          GROUP BY u.id,sp.display_name
          ORDER BY u.created_at DESC LIMIT 300`
      );
      return res.json({users:result.rows});
    }catch(error){console.error('Staff user list failed:',error.message);return res.status(503).json({error:'Staff accounts are temporarily unavailable.'});}
  });

  router.post('/',requirePermission(pool,'users.manage'),async(req,res)=>{
    const email=clean(req.body.email,254,true)?.toLowerCase();
    const fullName=clean(req.body.fullName,120,true);
    const phone=clean(req.body.phone,40);
    const roleCode=String(req.body.roleCode||'');
    const language=req.body.language==='ar'?'ar':'en';
    if(!email||!/^\S+@\S+\.\S+$/.test(email)||!fullName||phone===null||!STAFF_ROLES.has(roleCode)){
      return res.status(400).json({error:'Provide a valid name, email, optional phone, and permitted staff role.'});
    }
    let credentials;
    try{credentials=await hashPassword(crypto.randomBytes(32).toString('base64url'));}
    catch{return res.status(503).json({error:'Secure account initialization is unavailable.'});}
    const client=await pool.connect();
    let userId,rawToken;
    try{
      await client.query('BEGIN');
      const role=await client.query('SELECT id FROM role_definitions WHERE code=$1 LIMIT 1',[roleCode]);
      if(!role.rows[0]){await client.query('ROLLBACK');return res.status(400).json({error:'Staff role is not configured.'});}
      const created=await client.query(
        `INSERT INTO app_users (email,phone,password_hash,password_salt,preferred_language,status)
         VALUES ($1,$2,$3,$4,$5,'pending') ON CONFLICT DO NOTHING RETURNING id`,
        [email,phone||null,credentials.hash,credentials.salt,language]
      );
      if(!created.rows[0]){await client.query('ROLLBACK');return res.status(409).json({error:'An account already exists with that email or phone.'});}
      userId=created.rows[0].id;
      await client.query(
        `INSERT INTO staff_profiles (user_id,display_name,is_lawyer,is_public_profile)
         VALUES ($1,$2,$3,FALSE)`,
        [userId,fullName,roleCode==='lawyer']
      );
      await client.query('INSERT INTO user_roles (user_id,role_id,granted_by) VALUES ($1,$2,$3)',[userId,role.rows[0].id,req.auth.userId]);
      rawToken=crypto.randomBytes(32).toString('base64url');
      await client.query(
        `INSERT INTO auth_tokens (user_id,token_hash,purpose,expires_at)
         VALUES ($1,$2,'staff_invite',NOW()+INTERVAL '24 hours')`,
        [userId,hashToken(rawToken)]
      );
      await client.query(
        `INSERT INTO audit_events (actor_user_id,action_code,entity_type,entity_id,outcome,metadata)
         VALUES ($1,'staff.invited','user',$2,'success',$3)`,
        [req.auth.userId,userId,JSON.stringify({roleCode})]
      );
      await client.query('COMMIT');
    }catch(error){
      await client.query('ROLLBACK').catch(()=>{});
      console.error('Staff invitation creation failed:',error.message);
      return res.status(503).json({error:'Staff invitation could not be created.'});
    }finally{client.release();}

    let invitationSent=true;
    try{await sendInviteEmail(email,fullName,config.publicOrigin+'/accept-invite#token='+encodeURIComponent(rawToken));}
    catch(error){invitationSent=false;console.error('Staff invitation email failed:',error.message);}
    return res.status(201).json({
      user:{id:userId,email,display_name:fullName,status:'pending',roles:[roleCode]},
      invitationSent,
      message:invitationSent?'Staff account created; the invitation email was sent.':'Staff account created but email delivery failed. Check the email provider and use Resend invitation.'
    });
  });

  router.post('/:id/resend-invite',requirePermission(pool,'users.manage'),async(req,res)=>{
    const id=String(req.params.id||'');
    if(!UUID.test(id))return res.status(400).json({error:'Invalid staff account identifier.'});
    const client=await pool.connect();
    let user,rawToken;
    try{
      await client.query('BEGIN');
      const result=await client.query(
        `SELECT u.id,u.email,sp.display_name,u.status
           FROM app_users u JOIN staff_profiles sp ON sp.user_id=u.id
          WHERE u.id=$1 FOR UPDATE`,
        [id]
      );
      user=result.rows[0];
      if(!user||user.status!=='pending'){await client.query('ROLLBACK');return res.status(409).json({error:'Only pending staff accounts can receive a new invitation.'});}
      await client.query(`UPDATE auth_tokens SET consumed_at=NOW() WHERE user_id=$1 AND purpose='staff_invite' AND consumed_at IS NULL`,[id]);
      rawToken=crypto.randomBytes(32).toString('base64url');
      await client.query(
        `INSERT INTO auth_tokens (user_id,token_hash,purpose,expires_at)
         VALUES ($1,$2,'staff_invite',NOW()+INTERVAL '24 hours')`,
        [id,hashToken(rawToken)]
      );
      await client.query(
        `INSERT INTO audit_events (actor_user_id,action_code,entity_type,entity_id,outcome)
         VALUES ($1,'staff.invitation_resent','user',$2,'success')`,
        [req.auth.userId,id]
      );
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK').catch(()=>{});console.error('Staff invitation resend preparation failed:',error.message);return res.status(503).json({error:'Invitation could not be prepared.'});}
    finally{client.release();}
    try{
      await sendInviteEmail(user.email,user.display_name,config.publicOrigin+'/accept-invite#token='+encodeURIComponent(rawToken));
      return res.json({ok:true,message:'Invitation email sent.'});
    }catch(error){console.error('Staff invitation resend failed:',error.message);return res.status(503).json({error:'Email delivery failed. Check provider configuration and retry.'});}
  });

  router.patch('/:id/status',requirePermission(pool,'users.manage'),async(req,res)=>{
    const id=String(req.params.id||'');
    const status=String(req.body.status||'');
    if(!UUID.test(id)||!['active','suspended'].includes(status))return res.status(400).json({error:'Invalid account status.'});
    if(id===req.auth.userId)return res.status(409).json({error:'You cannot suspend your own account from this screen.'});
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const target=await client.query(
        `SELECT u.id,u.status,
          EXISTS(SELECT 1 FROM user_roles ur JOIN role_definitions rd ON rd.id=ur.role_id WHERE ur.user_id=u.id AND rd.code='super_admin') AS is_super_admin,
          EXISTS(SELECT 1 FROM user_roles ur JOIN role_definitions rd ON rd.id=ur.role_id WHERE ur.user_id=u.id AND rd.code <> 'client') AS is_staff
         FROM app_users u WHERE u.id=$1 FOR UPDATE`,
        [id]
      );
      if(!target.rows[0]||!target.rows[0].is_staff){await client.query('ROLLBACK');return res.status(404).json({error:'Staff account not found.'});}
      if(target.rows[0].is_super_admin){await client.query('ROLLBACK');return res.status(403).json({error:'Super administrator accounts require a separate reviewed procedure.'});}
      const updated=await client.query('UPDATE app_users SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING id,email,status',[status,id]);
      if(status==='suspended')await client.query('UPDATE app_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL',[id]);
      await client.query(
        `INSERT INTO audit_events (actor_user_id,action_code,entity_type,entity_id,outcome,metadata)
         VALUES ($1,'staff.status_changed','user',$2,'success',$3)`,
        [req.auth.userId,id,JSON.stringify({from:target.rows[0].status,to:status})]
      );
      await client.query('COMMIT');
      return res.json({user:updated.rows[0]});
    }catch(error){await client.query('ROLLBACK').catch(()=>{});console.error('Staff status update failed:',error.message);return res.status(503).json({error:'Staff account status could not be updated.'});}
    finally{client.release();}
  });

  router.patch('/:id/role',requirePermission(pool,'roles.manage'),async(req,res)=>{
    const id=String(req.params.id||'');
    const roleCode=String(req.body.roleCode||'');
    if(!UUID.test(id)||!STAFF_ROLES.has(roleCode))return res.status(400).json({error:'Invalid staff account or role.'});
    if(id===req.auth.userId)return res.status(409).json({error:'You cannot change your own role.'});
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const target=await client.query(
        `SELECT u.id,
          EXISTS(SELECT 1 FROM user_roles ur JOIN role_definitions rd ON rd.id=ur.role_id WHERE ur.user_id=u.id AND rd.code='super_admin') AS is_super_admin,
          EXISTS(SELECT 1 FROM user_roles ur JOIN role_definitions rd ON rd.id=ur.role_id WHERE ur.user_id=u.id AND rd.code <> 'client') AS is_staff
         FROM app_users u WHERE u.id=$1 FOR UPDATE`,
        [id]
      );
      if(!target.rows[0]){await client.query('ROLLBACK');return res.status(404).json({error:'Staff account not found.'});}
      if(target.rows[0].is_super_admin){await client.query('ROLLBACK');return res.status(403).json({error:'Super administrator role cannot be changed here.'});}
      const role=await client.query('SELECT id FROM role_definitions WHERE code=$1 LIMIT 1',[roleCode]);
      if(!role.rows[0]){await client.query('ROLLBACK');return res.status(400).json({error:'Role is not configured.'});}
      await client.query(
        `DELETE FROM user_roles WHERE user_id=$1 AND role_id IN
          (SELECT id FROM role_definitions WHERE code <> 'super_admin')`,
        [id]
      );
      await client.query('INSERT INTO user_roles (user_id,role_id,granted_by) VALUES ($1,$2,$3)',[id,role.rows[0].id,req.auth.userId]);
      await client.query('UPDATE staff_profiles SET is_lawyer=$1,updated_at=NOW() WHERE user_id=$2',[roleCode==='lawyer',id]);
      await client.query(
        `INSERT INTO audit_events (actor_user_id,action_code,entity_type,entity_id,outcome,metadata)
         VALUES ($1,'staff.role_changed','user',$2,'success',$3)`,
        [req.auth.userId,id,JSON.stringify({roleCode})]
      );
      await client.query('COMMIT');
      return res.json({ok:true,role:roleCode});
    }catch(error){await client.query('ROLLBACK').catch(()=>{});console.error('Staff role update failed:',error.message);return res.status(503).json({error:'Staff role could not be updated.'});}
    finally{client.release();}
  });

  return router;
}

module.exports={createAdminUsersRouter};
