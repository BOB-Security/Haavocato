'use strict';

const express=require('express');
const {requirePermission}=require('../middleware/require-permission');

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createAdminClientRouter(pool){
  const router=express.Router();

  router.get('/',requirePermission(pool,'clients.read'),async(req,res)=>{
    const search=typeof req.query.q==='string'?req.query.q.trim().slice(0,120):'';
    try{
      const result=await pool.query(
        `SELECT u.id,u.email,u.phone,u.status,u.preferred_language,u.created_at,u.last_login_at,
                cp.full_name,cp.organization_name,cp.preferred_contact_method,
                COUNT(DISTINCT sr.id)::int AS request_count,MAX(sr.submitted_at) AS last_request_at
           FROM app_users u
           JOIN user_roles ur ON ur.user_id=u.id
           JOIN role_definitions rd ON rd.id=ur.role_id AND rd.code='client'
           LEFT JOIN client_profiles cp ON cp.user_id=u.id
           LEFT JOIN service_requests sr ON sr.client_user_id=u.id
          WHERE ($1='' OR cp.full_name ILIKE '%'||$1||'%' OR u.email ILIKE '%'||$1||'%' OR COALESCE(u.phone,'') ILIKE '%'||$1||'%')
          GROUP BY u.id,cp.full_name,cp.organization_name,cp.preferred_contact_method
          ORDER BY MAX(sr.submitted_at) DESC NULLS LAST,u.created_at DESC LIMIT 300`,
        [search]
      );
      return res.json({clients:result.rows});
    }catch(error){console.error('Client directory failed:',error.message);return res.status(503).json({error:'Client directory is temporarily unavailable.'});}
  });

  router.get('/:id',requirePermission(pool,'clients.read'),async(req,res)=>{
    const id=String(req.params.id||'');
    if(!UUID.test(id))return res.status(404).json({error:'Client not found.'});
    try{
      const found=await pool.query(
        `SELECT u.id,u.email,u.phone,u.status,u.preferred_language,u.created_at,u.last_login_at,
                cp.full_name,cp.organization_name,cp.preferred_contact_method,cp.notes
           FROM app_users u JOIN user_roles ur ON ur.user_id=u.id
           JOIN role_definitions rd ON rd.id=ur.role_id AND rd.code='client'
           LEFT JOIN client_profiles cp ON cp.user_id=u.id WHERE u.id=$1 LIMIT 1`,
        [id]
      );
      const client=found.rows[0];
      if(!client)return res.status(404).json({error:'Client not found.'});
      const [requests,appointments,payments]=await Promise.all([
        pool.query(`SELECT id,reference_code,service_name_snapshot,status,submitted_at,updated_at FROM service_requests WHERE client_user_id=$1 ORDER BY submitted_at DESC LIMIT 100`,[id]),
        pool.query(`SELECT id,consultation_mode,status,starts_at,ends_at,timezone FROM appointments WHERE client_user_id=$1 ORDER BY starts_at DESC LIMIT 100`,[id]),
        pool.query(`SELECT p.id,sr.reference_code,p.method,p.amount,p.currency,p.status,p.created_at FROM payment_records p JOIN service_requests sr ON sr.id=p.request_id WHERE p.client_user_id=$1 ORDER BY p.created_at DESC LIMIT 100`,[id])
      ]);
      return res.json({client,requests:requests.rows,appointments:appointments.rows,payments:payments.rows});
    }catch(error){console.error('Client detail failed:',error.message);return res.status(503).json({error:'Client details are temporarily unavailable.'});}
  });

  router.patch('/:id/status',requirePermission(pool,'clients.update'),async(req,res)=>{
    const id=String(req.params.id||'');
    const status=String(req.body.status||'');
    if(!UUID.test(id)||!['active','suspended'].includes(status))return res.status(400).json({error:'Invalid client identifier or status.'});
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const found=await client.query(
        `SELECT u.id,u.status,u.email_verified_at,EXISTS(
          SELECT 1 FROM user_roles ur JOIN role_definitions rd ON rd.id=ur.role_id
          WHERE ur.user_id=u.id AND rd.code='client') AS is_client
          FROM app_users u WHERE u.id=$1 FOR UPDATE`,
        [id]
      );
      const user=found.rows[0];
      if(!user||!user.is_client){await client.query('ROLLBACK');return res.status(404).json({error:'Client not found.'});}
      if(status==='active'&&!user.email_verified_at){await client.query('ROLLBACK');return res.status(409).json({error:'The client must verify their email before activation.'});}
      const updated=await client.query('UPDATE app_users SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING id,email,status',[status,id]);
      if(status==='suspended')await client.query('UPDATE app_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL',[id]);
      await client.query(
        `INSERT INTO audit_events (actor_user_id,action_code,entity_type,entity_id,outcome,metadata)
         VALUES ($1,'client.status_changed','user',$2,'success',$3)`,
        [req.auth.userId,id,JSON.stringify({from:user.status,to:status})]
      );
      await client.query('COMMIT');
      return res.json({client:updated.rows[0]});
    }catch(error){await client.query('ROLLBACK').catch(()=>{});console.error('Client status update failed:',error.message);return res.status(503).json({error:'Client status could not be updated.'});}
    finally{client.release();}
  });

  return router;
}
module.exports={createAdminClientRouter};
