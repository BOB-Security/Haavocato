'use strict';

const express=require('express');
const {requirePermission}=require('../middleware/require-permission');

function createAdminAuditRouter(pool){
  const router=express.Router();
  router.get('/',requirePermission(pool,'audit.read'),async(req,res)=>{
    const action=typeof req.query.action==='string'?req.query.action.trim().slice(0,100):'';
    const entity=typeof req.query.entity==='string'?req.query.entity.trim().slice(0,80):'';
    const limitRaw=Number(req.query.limit||100);
    const limit=Number.isInteger(limitRaw)?Math.min(Math.max(limitRaw,1),200):100;
    const values=[];
    const conditions=[];
    if(action){values.push(action);conditions.push(`e.action_code ILIKE '%'||$${values.length}||'%'`);}
    if(entity){values.push(entity);conditions.push(`e.entity_type=$${values.length}`);}
    values.push(limit);
    const where=conditions.length?'WHERE '+conditions.join(' AND '):'';
    try{
      const result=await pool.query(
        `SELECT e.id,e.actor_user_id,u.email AS actor_email,sp.display_name AS actor_name,
                e.action_code,e.entity_type,e.entity_id,e.request_id,e.outcome,e.metadata,e.created_at
           FROM audit_events e
           LEFT JOIN app_users u ON u.id=e.actor_user_id
           LEFT JOIN staff_profiles sp ON sp.user_id=e.actor_user_id
          ${where}
          ORDER BY e.created_at DESC LIMIT $${values.length}`,
        values
      );
      return res.json({events:result.rows});
    }catch(error){console.error('Audit trail query failed:',error.message);return res.status(503).json({error:'Audit events are temporarily unavailable.'});}
  });
  return router;
}
module.exports={createAdminAuditRouter};
