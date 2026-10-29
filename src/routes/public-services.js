'use strict';

const express = require('express');

function createPublicServicesRouter(pool) {
  const router = express.Router();
  router.get('/', async (req, res) => {
    const language = req.query.lang === 'ar' ? 'ar' : 'en';
    try {
      const result = await pool.query(
        `SELECT id, slug, name_en, name_ar, summary_en, summary_ar, delivery_type
           FROM legal_services WHERE is_published = TRUE ORDER BY display_order ASC, name_en ASC`
      );
      const services = result.rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: language === 'ar' ? row.name_ar : row.name_en,
        summary: language === 'ar' ? row.summary_ar : row.summary_en,
        deliveryType: row.delivery_type,
      }));
      return res.json({ services, language });
    } catch (error) {
      console.error('Public service catalogue failed:', error.message);
      return res.status(503).json({ error: 'Service catalogue is temporarily unavailable.' });
    }
  });
  return router;
}

module.exports = { createPublicServicesRouter };
