'use strict';

const express = require('express');
const { requirePermission } = require('../middleware/require-permission');

function createClientRequestRouter(pool) {
  const router = express.Router();

  router.get('/',
    requirePermission(pool, 'client.requests.read_own'),
    async (req, res) => {
      try {
        const result = await pool.query(
          `SELECT id, reference_code, service_name_snapshot, status, submitted_at, updated_at
             FROM service_requests
            WHERE client_user_id = $1
            ORDER BY submitted_at DESC
            LIMIT 100`,
          [req.auth.userId]
        );
        return res.json({ requests: result.rows });
      } catch (error) {
        console.error('Client request list failed:', error.message);
        return res.status(503).json({ error: 'Your requests are temporarily unavailable.' });
      }
    }
  );

  router.get('/:referenceCode',
    requirePermission(pool, 'client.requests.read_own'),
    async (req, res) => {
      const referenceCode = String(req.params.referenceCode || '');
      if (!/^HA-[A-F0-9]{12}$/.test(referenceCode)) {
        return res.status(404).json({ error: 'Request not found.' });
      }
      try {
        const found = await pool.query(
          `SELECT id, reference_code, service_name_snapshot, description, status, submitted_at, updated_at
             FROM service_requests
            WHERE reference_code = $1 AND client_user_id = $2
            LIMIT 1`,
          [referenceCode, req.auth.userId]
        );
        const request = found.rows[0];
        if (!request) return res.status(404).json({ error: 'Request not found.' });
        const events = await pool.query(
          `SELECT to_status, public_message, created_at
             FROM request_status_events
            WHERE request_id = $1 AND public_message IS NOT NULL
            ORDER BY created_at ASC`,
          [request.id]
        );
        return res.json({ request, timeline: events.rows });
      } catch (error) {
        console.error('Client request detail failed:', error.message);
        return res.status(503).json({ error: 'Request details are temporarily unavailable.' });
      }
    }
  );

  return router;
}

module.exports = { createClientRequestRouter };
