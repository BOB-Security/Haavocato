'use strict';

const express = require('express');
const { requirePermission } = require('../middleware/require-permission');

function createAdminStaffRouter(pool) {
  const router = express.Router();
  router.get('/lawyers', requirePermission(pool, 'availability.manage'), async (_req, res) => {
    try {
      const result = await pool.query(
        `SELECT sp.user_id, sp.display_name, sp.title_en, sp.title_ar
           FROM staff_profiles sp
           JOIN app_users u ON u.id = sp.user_id
          WHERE sp.is_lawyer = TRUE AND u.status = 'active'
          ORDER BY sp.display_order, sp.display_name`
      );
      return res.json({ lawyers: result.rows });
    } catch (error) {
      console.error('Lawyer directory lookup failed:', error.message);
      return res.status(503).json({ error: 'Lawyer directory is temporarily unavailable.' });
    }
  });
  return router;
}

module.exports = { createAdminStaffRouter };
