'use strict';

const express = require('express');
const { requirePermission } = require('../middleware/require-permission');
const { enqueueEmail } = require('../services/notification-service');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_METHODS = new Set(['vodafone_cash','instapay','bank_transfer']);
const PAYMENT_TRANSITIONS = Object.freeze({
  pending: new Set(['submitted','cancelled']),
  submitted: new Set(['under_review','confirmed','rejected']),
  under_review: new Set(['confirmed','rejected']),
  confirmed: new Set(['refunded']),
  rejected: new Set(['submitted','cancelled']),
  refunded: new Set(),
  cancelled: new Set(),
});

function createPaymentRouter(pool) {
  const router = express.Router();

  router.get('/mine',
    requirePermission(pool, 'client.payments.read_own'),
    async (req, res) => {
      try {
        const result = await pool.query(
          `SELECT p.id, p.request_id, sr.reference_code, p.method, p.amount, p.currency,
                  p.status, p.provider_reference, p.created_at, p.updated_at
             FROM payment_records p
             JOIN service_requests sr ON sr.id = p.request_id
            WHERE p.client_user_id = $1
            ORDER BY p.created_at DESC LIMIT 100`,
          [req.auth.userId]
        );
        return res.json({ payments: result.rows });
      } catch (error) {
        console.error('Client payment list failed:', error.message);
        return res.status(503).json({ error: 'Payment records are temporarily unavailable.' });
      }
    }
  );

  router.post('/',
    requirePermission(pool, 'client.payments.submit_own'),
    async (req, res) => {
      const requestId = String(req.body.requestId || '');
      const method = String(req.body.method || '');
      const providerReference = typeof req.body.providerReference === 'string' ? req.body.providerReference.trim() : '';
      const clientNote = typeof req.body.clientNote === 'string' ? req.body.clientNote.trim().slice(0, 1000) : null;
      const amountText = req.body.amount == null || req.body.amount === '' ? null : String(req.body.amount);
      const amount = amountText === null ? null : Number(amountText);
      if (!UUID.test(requestId) || !CLIENT_METHODS.has(method) ||
          !providerReference || providerReference.length > 160 ||
          (amount !== null && (!Number.isFinite(amount) || amount <= 0 || amount > 100000000))) {
        return res.status(400).json({ error: 'Provide a linked request, payment method, transaction reference, and valid amount if known.' });
      }

      try {
        const owned = await pool.query(
          'SELECT id FROM service_requests WHERE id = $1 AND client_user_id = $2 LIMIT 1',
          [requestId, req.auth.userId]
        );
        if (!owned.rows[0]) return res.status(404).json({ error: 'Linked request not found.' });
        const result = await pool.query(
          `INSERT INTO payment_records
            (request_id, client_user_id, method, amount, currency, status, provider_reference, client_note)
           VALUES ($1,$2,$3,$4,'EGP','submitted',$5,$6)
           RETURNING id, request_id, method, amount, currency, status, provider_reference, created_at`,
          [requestId, req.auth.userId, method, amount, providerReference, clientNote]
        );
        await pool.query(
          `INSERT INTO audit_events (actor_user_id, action_code, entity_type, entity_id, request_id, outcome)
           VALUES ($1, 'payment.submitted', 'payment', $2, $3, 'success')`,
          [req.auth.userId, result.rows[0].id, requestId]
        );
        try {
          const clientInfo = await pool.query('SELECT email, preferred_language FROM app_users WHERE id = $1 LIMIT 1', [req.auth.userId]);
          const requestInfo = await pool.query('SELECT reference_code FROM service_requests WHERE id = $1 LIMIT 1', [requestId]);
          await enqueueEmail(pool, {
            recipientEmail: clientInfo.rows[0]?.email,
            templateCode: 'payment_submitted',
            relatedRequestId: requestId,
            metadata: { referenceCode: requestInfo.rows[0]?.reference_code || '', method, language: clientInfo.rows[0]?.preferred_language || 'en' }
          });
        } catch (notificationError) {
          console.error('Payment notification enqueue failed:', notificationError.message);
        }
        return res.status(201).json({ payment: result.rows[0], message: 'Payment details submitted for review.' });
      } catch (error) {
        console.error('Client payment submission failed:', error.message);
        return res.status(503).json({ error: 'Payment details could not be submitted.' });
      }
    }
  );

  router.get('/admin',
    requirePermission(pool, 'payments.read'),
    async (_req, res) => {
      try {
        const result = await pool.query(
          `SELECT p.id, p.request_id, sr.reference_code, cp.full_name AS client_name,
                  p.method, p.amount, p.currency, p.status, p.provider_reference,
                  p.client_note, p.internal_note, p.created_at
             FROM payment_records p
             JOIN service_requests sr ON sr.id = p.request_id
             LEFT JOIN client_profiles cp ON cp.user_id = p.client_user_id
            ORDER BY p.created_at DESC LIMIT 300`
        );
        return res.json({ payments: result.rows });
      } catch (error) {
        console.error('Admin payment list failed:', error.message);
        return res.status(503).json({ error: 'Payment records are temporarily unavailable.' });
      }
    }
  );

  router.patch('/admin/:id/status',
    requirePermission(pool, 'payments.review'),
    async (req, res) => {
      const id = String(req.params.id || '');
      const toStatus = String(req.body.status || '');
      const internalNote = typeof req.body.internalNote === 'string' ? req.body.internalNote.trim().slice(0, 2000) : null;
      if (!UUID.test(id) || !Object.hasOwn(PAYMENT_TRANSITIONS, toStatus)) {
        return res.status(400).json({ error: 'Invalid payment identifier or status.' });
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const currentResult = await client.query('SELECT id, request_id, client_user_id, status FROM payment_records WHERE id = $1 FOR UPDATE', [id]);
        const current = currentResult.rows[0];
        if (!current) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Payment record not found.' });
        }
        if (!PAYMENT_TRANSITIONS[current.status]?.has(toStatus)) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'This payment status transition is not allowed.' });
        }
        const updated = await client.query(
          `UPDATE payment_records
              SET status = $1, internal_note = COALESCE($2, internal_note),
                  reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
            WHERE id = $4
            RETURNING id, request_id, status, reviewed_by, reviewed_at, updated_at`,
          [toStatus, internalNote, req.auth.userId, id]
        );
        await client.query(
          `INSERT INTO audit_events (actor_user_id, action_code, entity_type, entity_id, request_id, outcome, metadata)
           VALUES ($1, 'payment.status_changed', 'payment', $2, $3, 'success', $4)`,
          [req.auth.userId, id, current.request_id, JSON.stringify({ from: current.status, to: toStatus })]
        );
        const clientInfo = current.client_user_id
          ? await client.query('SELECT email, preferred_language FROM app_users WHERE id = $1 LIMIT 1', [current.client_user_id])
          : { rows: [] };
        const requestInfo = await client.query('SELECT reference_code FROM service_requests WHERE id = $1 LIMIT 1', [current.request_id]);
        await enqueueEmail(client, {
          recipientEmail: clientInfo.rows[0]?.email,
          templateCode: 'payment_status',
          relatedRequestId: current.request_id,
          metadata: { referenceCode: requestInfo.rows[0]?.reference_code || '', status: toStatus, language: clientInfo.rows[0]?.preferred_language || 'en' }
        });
        await client.query('COMMIT');
        return res.json({ payment: updated.rows[0] });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Payment review failed:', error.message);
        return res.status(503).json({ error: 'Payment status could not be updated.' });
      } finally {
        client.release();
      }
    }
  );

  return router;
}

module.exports = { createPaymentRouter };
