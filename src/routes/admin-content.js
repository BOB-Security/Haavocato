'use strict';

const express = require('express');
const { requirePermission } = require('../middleware/require-permission');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PAGE_STATUSES = new Set(['draft','published','archived']);
const SERVICE_TYPES = new Set(['consultation','document_review','document_drafting','translation','company_formation','litigation','course','other']);

function text(value, max, required = false) {
  if (typeof value !== 'string') return required ? null : '';
  const clean = value.trim();
  return clean.length <= max && (!required || clean.length > 0) ? clean : null;
}

async function recordRevision(client, entityType, entityId, snapshot, actorUserId) {
  await client.query(
    'INSERT INTO content_revisions (entity_type, entity_id, snapshot, saved_by) VALUES ($1,$2,$3::jsonb,$4)',
    [entityType, String(entityId), JSON.stringify(snapshot), actorUserId]
  );
}

async function audit(client, actorUserId, action, entityType, entityId) {
  await client.query(
    'INSERT INTO audit_events (actor_user_id, action_code, entity_type, entity_id, outcome) VALUES ($1,$2,$3,$4,\'success\')',
    [actorUserId, action, entityType, String(entityId)]
  );
}

function createAdminContentRouter(pool) {
  const router = express.Router();

  router.get('/pages', requirePermission(pool, 'cms.manage'), async (_req,res) => {
    try {
      const result = await pool.query('SELECT * FROM site_pages ORDER BY slug');
      return res.json({ pages: result.rows });
    } catch (error) {
      console.error('CMS page list failed:', error.message);
      return res.status(503).json({ error: 'Page content is temporarily unavailable.' });
    }
  });

  router.put('/pages/:slug', requirePermission(pool, 'cms.manage'), async (req,res) => {
    const slug=String(req.params.slug||'');
    const titleEn=text(req.body.titleEn,200,true), titleAr=text(req.body.titleAr,200,true);
    const bodyEn=text(req.body.bodyEn,100000), bodyAr=text(req.body.bodyAr,100000);
    const status=String(req.body.status||'draft');
    if(!SLUG.test(slug)||!titleEn||!titleAr||bodyEn===null||bodyAr===null||!PAGE_STATUSES.has(status)){
      return res.status(400).json({error:'Review the page slug, bilingual titles, body text, and publication status.'});
    }
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const result=await client.query(
        `INSERT INTO site_pages (slug,title_en,title_ar,body_en,body_ar,status,updated_by,published_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,CASE WHEN $6='published' THEN NOW() ELSE NULL END)
         ON CONFLICT (slug) DO UPDATE SET title_en=EXCLUDED.title_en,title_ar=EXCLUDED.title_ar,
           body_en=EXCLUDED.body_en,body_ar=EXCLUDED.body_ar,status=EXCLUDED.status,
           updated_by=EXCLUDED.updated_by,
           published_at=CASE WHEN EXCLUDED.status='published' THEN COALESCE(site_pages.published_at,NOW()) ELSE NULL END,
           updated_at=NOW()
         RETURNING *`,
        [slug,titleEn,titleAr,bodyEn,bodyAr,status,req.auth.userId]
      );
      await recordRevision(client,'page',slug,result.rows[0],req.auth.userId);
      await audit(client,req.auth.userId,'cms.page.saved','page',slug);
      await client.query('COMMIT');
      return res.json({page:result.rows[0]});
    }catch(error){
      await client.query('ROLLBACK').catch(()=>{});
      console.error('CMS page save failed:',error.message);
      return res.status(503).json({error:'Page could not be saved.'});
    }finally{client.release();}
  });

  router.get('/insights', requirePermission(pool,'cms.manage'), async (_req,res)=>{
    try{
      const result=await pool.query('SELECT * FROM legal_insights ORDER BY updated_at DESC LIMIT 500');
      return res.json({insights:result.rows});
    }catch(error){console.error('Insight list failed:',error.message);return res.status(503).json({error:'Legal insights are temporarily unavailable.'});}
  });

  router.put('/insights/:slug', requirePermission(pool,'cms.manage'), async (req,res)=>{
    const slug=String(req.params.slug||'');
    const titleEn=text(req.body.titleEn,240,true),titleAr=text(req.body.titleAr,240,true);
    const excerptEn=text(req.body.excerptEn,1000),excerptAr=text(req.body.excerptAr,1000);
    const bodyEn=text(req.body.bodyEn,100000),bodyAr=text(req.body.bodyAr,100000);
    const category=text(req.body.category,80);
    const status=String(req.body.status||'draft');
    if(!SLUG.test(slug)||!titleEn||!titleAr||excerptEn===null||excerptAr===null||bodyEn===null||bodyAr===null||category===null||!PAGE_STATUSES.has(status)){
      return res.status(400).json({error:'Review the article slug, bilingual content, category, and status.'});
    }
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const result=await client.query(
        `INSERT INTO legal_insights (slug,title_en,title_ar,excerpt_en,excerpt_ar,body_en,body_ar,category,status,author_user_id,published_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CASE WHEN $9='published' THEN NOW() ELSE NULL END)
         ON CONFLICT (slug) DO UPDATE SET title_en=EXCLUDED.title_en,title_ar=EXCLUDED.title_ar,
          excerpt_en=EXCLUDED.excerpt_en,excerpt_ar=EXCLUDED.excerpt_ar,body_en=EXCLUDED.body_en,
          body_ar=EXCLUDED.body_ar,category=EXCLUDED.category,status=EXCLUDED.status,
          author_user_id=EXCLUDED.author_user_id,
          published_at=CASE WHEN EXCLUDED.status='published' THEN COALESCE(legal_insights.published_at,NOW()) ELSE NULL END,
          updated_at=NOW()
         RETURNING *`,
        [slug,titleEn,titleAr,excerptEn,excerptAr,bodyEn,bodyAr,category,status,req.auth.userId]
      );
      await recordRevision(client,'insight',result.rows[0].id,result.rows[0],req.auth.userId);
      await audit(client,req.auth.userId,'cms.insight.saved','insight',result.rows[0].id);
      await client.query('COMMIT');
      return res.json({insight:result.rows[0]});
    }catch(error){await client.query('ROLLBACK').catch(()=>{});console.error('Insight save failed:',error.message);return res.status(503).json({error:'Article could not be saved.'});}
    finally{client.release();}
  });

  router.get('/partners', requirePermission(pool,'partners.manage'), async (_req,res)=>{
    try{
      const result=await pool.query('SELECT * FROM partner_profiles ORDER BY display_order,name_en');
      return res.json({partners:result.rows});
    }catch(error){console.error('Partner list failed:',error.message);return res.status(503).json({error:'Partner profiles are temporarily unavailable.'});}
  });

  router.post('/partners', requirePermission(pool,'partners.manage'), async (req,res)=>{
    const nameEn=text(req.body.nameEn,160,true),nameAr=text(req.body.nameAr,160,true);
    const titleEn=text(req.body.titleEn,160),titleAr=text(req.body.titleAr,160);
    const bioEn=text(req.body.bioEn,5000),bioAr=text(req.body.bioAr,5000);
    const displayOrder=Number(req.body.displayOrder||0);
    const isPublished=req.body.isPublished===true;
    if(!nameEn||!nameAr||titleEn===null||titleAr===null||bioEn===null||bioAr===null||!Number.isInteger(displayOrder)||displayOrder<0||displayOrder>10000){
      return res.status(400).json({error:'Review partner names, biography, and display order.'});
    }
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const result=await client.query(
        `INSERT INTO partner_profiles (name_en,name_ar,title_en,title_ar,bio_en,bio_ar,is_published,display_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [nameEn,nameAr,titleEn,titleAr,bioEn,bioAr,isPublished,displayOrder]
      );
      await recordRevision(client,'partner',result.rows[0].id,result.rows[0],req.auth.userId);
      await audit(client,req.auth.userId,'cms.partner.created','partner',result.rows[0].id);
      await client.query('COMMIT');
      return res.status(201).json({partner:result.rows[0]});
    }catch(error){await client.query('ROLLBACK').catch(()=>{});console.error('Partner creation failed:',error.message);return res.status(503).json({error:'Partner profile could not be created.'});}
    finally{client.release();}
  });

  router.patch('/partners/:id', requirePermission(pool,'partners.manage'), async (req,res)=>{
    const id=String(req.params.id||'');
    const nameEn=text(req.body.nameEn,160,true),nameAr=text(req.body.nameAr,160,true);
    const titleEn=text(req.body.titleEn,160),titleAr=text(req.body.titleAr,160);
    const bioEn=text(req.body.bioEn,5000),bioAr=text(req.body.bioAr,5000);
    const displayOrder=Number(req.body.displayOrder||0);
    const isPublished=req.body.isPublished===true;
    if(!UUID.test(id)||!nameEn||!nameAr||titleEn===null||titleAr===null||bioEn===null||bioAr===null||!Number.isInteger(displayOrder)||displayOrder<0||displayOrder>10000){
      return res.status(400).json({error:'Review partner profile fields.'});
    }
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const result=await client.query(
        `UPDATE partner_profiles SET name_en=$1,name_ar=$2,title_en=$3,title_ar=$4,bio_en=$5,bio_ar=$6,
          is_published=$7,display_order=$8,updated_at=NOW() WHERE id=$9 RETURNING *`,
        [nameEn,nameAr,titleEn,titleAr,bioEn,bioAr,isPublished,displayOrder,id]
      );
      if(!result.rows[0]){await client.query('ROLLBACK');return res.status(404).json({error:'Partner profile not found.'});}
      await recordRevision(client,'partner',id,result.rows[0],req.auth.userId);
      await audit(client,req.auth.userId,'cms.partner.updated','partner',id);
      await client.query('COMMIT');
      return res.json({partner:result.rows[0]});
    }catch(error){await client.query('ROLLBACK').catch(()=>{});console.error('Partner update failed:',error.message);return res.status(503).json({error:'Partner profile could not be updated.'});}
    finally{client.release();}
  });

  router.get('/services', requirePermission(pool,'services.manage'), async (_req,res)=>{
    try{const result=await pool.query('SELECT * FROM legal_services ORDER BY display_order,name_en');return res.json({services:result.rows});}
    catch(error){console.error('Service management list failed:',error.message);return res.status(503).json({error:'Services are temporarily unavailable.'});}
  });

  router.patch('/services/:id', requirePermission(pool,'services.manage'), async (req,res)=>{
    const id=String(req.params.id||'');
    const nameEn=text(req.body.nameEn,200,true),nameAr=text(req.body.nameAr,200,true);
    const summaryEn=text(req.body.summaryEn,1000),summaryAr=text(req.body.summaryAr,1000);
    const descriptionEn=text(req.body.descriptionEn,5000),descriptionAr=text(req.body.descriptionAr,5000);
    const deliveryType=String(req.body.deliveryType||'');
    const isPublished=req.body.isPublished===true;
    const displayOrder=Number(req.body.displayOrder||0);
    if(!UUID.test(id)||!nameEn||!nameAr||summaryEn===null||summaryAr===null||descriptionEn===null||descriptionAr===null||
       !SERVICE_TYPES.has(deliveryType)||!Number.isInteger(displayOrder)||displayOrder<0||displayOrder>10000){
      return res.status(400).json({error:'Review the bilingual service content, type, and display order.'});
    }
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const result=await client.query(
        `UPDATE legal_services SET name_en=$1,name_ar=$2,summary_en=$3,summary_ar=$4,
          description_en=$5,description_ar=$6,delivery_type=$7,is_published=$8,display_order=$9,updated_at=NOW()
          WHERE id=$10 RETURNING *`,
        [nameEn,nameAr,summaryEn,summaryAr,descriptionEn,descriptionAr,deliveryType,isPublished,displayOrder,id]
      );
      if(!result.rows[0]){await client.query('ROLLBACK');return res.status(404).json({error:'Service not found.'});}
      await recordRevision(client,'service',id,result.rows[0],req.auth.userId);
      await audit(client,req.auth.userId,'cms.service.updated','service',id);
      await client.query('COMMIT');
      return res.json({service:result.rows[0]});
    }catch(error){await client.query('ROLLBACK').catch(()=>{});console.error('Service update failed:',error.message);return res.status(503).json({error:'Service could not be updated.'});}
    finally{client.release();}
  });

  return router;
}

module.exports = { createAdminContentRouter };
