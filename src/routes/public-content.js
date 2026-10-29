'use strict';

const express = require('express');
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function language(req) { return req.query.lang === 'ar' ? 'ar' : 'en'; }

function createPublicContentRouter(pool) {
  const router = express.Router();

  router.get('/pages/:slug', async (req,res) => {
    const slug=String(req.params.slug||'');
    if(!SLUG.test(slug))return res.status(404).json({error:'Page not found.'});
    try{
      const result=await pool.query(
        `SELECT slug,title_en,title_ar,body_en,body_ar,updated_at
           FROM site_pages WHERE slug=$1 AND status='published' LIMIT 1`,
        [slug]
      );
      const row=result.rows[0];
      if(!row)return res.status(404).json({error:'Page not found.'});
      const lang=language(req);
      return res.json({page:{slug,title:lang==='ar'?row.title_ar:row.title_en,body:lang==='ar'?row.body_ar:row.body_en,updatedAt:row.updated_at},language:lang});
    }catch(error){console.error('Public page lookup failed:',error.message);return res.status(503).json({error:'Page content is temporarily unavailable.'});}
  });

  router.get('/insights', async (req,res) => {
    const lang=language(req);
    try{
      const result=await pool.query(
        `SELECT slug,title_en,title_ar,excerpt_en,excerpt_ar,category,published_at
           FROM legal_insights WHERE status='published'
          ORDER BY published_at DESC LIMIT 100`
      );
      return res.json({insights:result.rows.map(row=>({slug:row.slug,title:lang==='ar'?row.title_ar:row.title_en,excerpt:lang==='ar'?row.excerpt_ar:row.excerpt_en,category:row.category,publishedAt:row.published_at})),language:lang});
    }catch(error){console.error('Public insights list failed:',error.message);return res.status(503).json({error:'Legal insights are temporarily unavailable.'});}
  });

  router.get('/insights/:slug', async (req,res) => {
    const slug=String(req.params.slug||'');
    if(!SLUG.test(slug))return res.status(404).json({error:'Article not found.'});
    const lang=language(req);
    try{
      const result=await pool.query(
        `SELECT slug,title_en,title_ar,excerpt_en,excerpt_ar,body_en,body_ar,category,published_at
           FROM legal_insights WHERE slug=$1 AND status='published' LIMIT 1`,
        [slug]
      );
      const row=result.rows[0];
      if(!row)return res.status(404).json({error:'Article not found.'});
      return res.json({article:{slug,title:lang==='ar'?row.title_ar:row.title_en,excerpt:lang==='ar'?row.excerpt_ar:row.excerpt_en,body:lang==='ar'?row.body_ar:row.body_en,category:row.category,publishedAt:row.published_at},language:lang});
    }catch(error){console.error('Public article lookup failed:',error.message);return res.status(503).json({error:'Article is temporarily unavailable.'});}
  });

  router.get('/partners', async (req,res) => {
    const lang=language(req);
    try{
      const result=await pool.query(
        `SELECT id,name_en,name_ar,title_en,title_ar,bio_en,bio_ar,photo_storage_key,external_links
           FROM partner_profiles WHERE is_published=TRUE ORDER BY display_order,name_en`
      );
      return res.json({partners:result.rows.map(row=>({id:row.id,name:lang==='ar'?row.name_ar:row.name_en,title:lang==='ar'?row.title_ar:row.title_en,bio:lang==='ar'?row.bio_ar:row.bio_en,hasPhoto:Boolean(row.photo_storage_key),links:row.external_links||[]})),language:lang});
    }catch(error){console.error('Public partner list failed:',error.message);return res.status(503).json({error:'Partner profiles are temporarily unavailable.'});}
  });

  return router;
}

module.exports = { createPublicContentRouter };
