'use strict';

const express = require('express');
const { requirePermission } = require('../middleware/require-permission');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createAdminNotificationRouter(pool) {
  const router=express.Router();
  router.get('/',requirePermission(pool,'notifications.manage'),async(_req,res)=>{
    try{
      const result=await pool.query(
        `SELECT id,recipient_email,channel,template_code,status,attempt_count,next_attempt_at,
                failure_code,sent_at,created_at
           FROM notification_events
          ORDER BY created_at DESC LIMIT 200`
      );
      return res.json({notifications:result.rows});
    }catch(error){console.error('Notification queue list failed:',error.message);return res.status(503).json({error:'Notification queue is temporarily unavailable.'});}
  });
  router.post('/:id/retry',requirePermission(pool,'notifications.manage'),async(req,res)=>{
    const id=String(req.params.id||'');
    if(!UUID.test(id))return res.status(400).json({error:'Invalid notification identifier.'});
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const current=await client.query('SELECT id,status,attempt_count FROM notification_events WHERE id=$1 FOR UPDATE',[id]);
      if(!current.rows[0]){await client.query('ROLLBACK');return res.status(404).json({error:'Notification not found.'});}
      if(current.rows[0].status!=='failed'){await client.query('ROLLBACK');return res.status(409).json({error:'Only failed notifications can be retried manually.'});}
      await client.query(
        `UPDATE notification_events SET status='queued',attempt_count=0,next_attempt_at=NOW(),locked_at=NULL,failure_code=NULL WHERE id=$1`,
        [id]
      );
      await client.query(
        `INSERT INTO audit_events (actor_user_id,action_code,entity_type,entity_id,outcome)
         VALUES ($1,'notification.retry_requested','notification',$2,'success')`,
        [req.auth.userId,id]
      );
      await client.query('COMMIT');
      return res.json({ok:true,message:'Notification queued for retry.'});
    }catch(error){await client.query('ROLLBACK').catch(()=>{});console.error('Notification retry failed:',error.message);return res.status(503).json({error:'Notification could not be queued for retry.'});}
    finally{client.release();}
  });
  return router;
}

module.exports={createAdminNotificationRouter};
