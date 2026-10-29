'use strict';

const express = require('express');
const { requirePermission } = require('../middleware/require-permission');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const APPOINTMENT_TRANSITIONS = Object.freeze({ requested: new Set(['confirmed','cancelled']), confirmed: new Set(['rescheduled','completed','cancelled','no_show']), rescheduled: new Set(['confirmed','completed','cancelled','no_show']), completed: new Set(), cancelled: new Set(), no_show: new Set() });
const APPOINTMENT_STATUSES = new Set(Object.keys(APPOINTMENT_TRANSITIONS));

function createAdminAppointmentRouter(pool) {
  const router = express.Router();

  router.get('/',
    requirePermission(pool, 'appointments.manage'),
    async (_req, res) => {
      try {
        const result = await pool.query(
          `SELECT a.id, a.request_id, sr.reference_code, a.client_user_id,
                  cp.full_name AS client_name, a.assigned_lawyer_id, sp.display_name AS lawyer_name,
                  a.consultation_mode, a.status, a.starts_at, a.ends_at, a.timezone,
                  a.location_or_meeting_reference, a.created_at
             FROM appointments a
             LEFT JOIN service_requests sr ON sr.id = a.request_id
             LEFT JOIN client_profiles cp ON cp.user_id = a.client_user_id
             LEFT JOIN staff_profiles sp ON sp.user_id = a.assigned_lawyer_id
            ORDER BY a.starts_at DESC LIMIT 300`
        );
        return res.json({ appointments: result.rows });
      } catch (error) {
        console.error('Admin appointment list failed:', error.message);
        return res.status(503).json({ error: 'Appointments are temporarily unavailable.' });
      }
    }
  );

  router.patch('/:id/status',
    requirePermission(pool, 'appointments.manage'),
    async (req, res) => {
      const id = String(req.params.id || '');
      const status = String(req.body.status || '');
      if (!UUID.test(id) || !APPOINTMENT_STATUSES.has(status)) {
        return res.status(400).json({ error: 'Invalid appointment identifier or status.' });
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const currentResult = await client.query('SELECT id, status FROM appointments WHERE id = $1 FOR UPDATE', [id]);
        const current = currentResult.rows[0];
        if (!current) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Appointment not found.' });
        }
        if (!APPOINTMENT_TRANSITIONS[current.status]?.has(status)) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'This appointment status transition is not allowed.' });
        }
        const result = await client.query(
          `UPDATE appointments SET status = $1, updated_at = NOW()
            WHERE id = $2
            RETURNING id, status, starts_at, ends_at`,
          [status, id]
        );
        await client.query(
          `INSERT INTO audit_events (actor_user_id, action_code, entity_type, entity_id, outcome, metadata)
           VALUES ($1, 'appointment.status_changed', 'appointment', $2, 'success', $3)`,
          [req.auth.userId, id, JSON.stringify({ from: current.status, to: status })]
        );
        await client.query('COMMIT');
        return res.json({ appointment: result.rows[0] });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Admin appointment status update failed:', error.message);
        return res.status(503).json({ error: 'Appointment status could not be updated.' });
      } finally {
        client.release();
      }
    }
  );

  router.get('/availability',
    requirePermission(pool, 'availability.manage'),
    async (_req, res) => {
      try {
        const result = await pool.query(
          `SELECT ar.id, ar.staff_user_id, sp.display_name, ar.weekday, ar.starts_local,
                  ar.ends_local, ar.timezone, ar.valid_from, ar.valid_until, ar.is_active
             FROM availability_rules ar
             JOIN staff_profiles sp ON sp.user_id = ar.staff_user_id
            ORDER BY sp.display_order, ar.weekday, ar.starts_local`
        );
        return res.json({ rules: result.rows });
      } catch (error) {
        console.error('Availability rules list failed:', error.message);
        return res.status(503).json({ error: 'Availability settings are temporarily unavailable.' });
      }
    }
  );

  router.post('/availability',
    requirePermission(pool, 'availability.manage'),
    async (req, res) => {
      const staffUserId = String(req.body.staffUserId || '');
      const weekday = Number(req.body.weekday);
      const startsLocal = String(req.body.startsLocal || '');
      const endsLocal = String(req.body.endsLocal || '');
      const timezone = String(req.body.timezone || 'Africa/Cairo');
      const validFrom = req.body.validFrom || null;
      const validUntil = req.body.validUntil || null;
      if (!UUID.test(staffUserId) || !Number.isInteger(weekday) || weekday < 0 || weekday > 6 ||
          !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(startsLocal) ||
          !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(endsLocal) ||
          startsLocal >= endsLocal || timezone.length > 80 ||
          (validFrom && !/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) ||
          (validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil))) {
        return res.status(400).json({ error: 'Review the availability rule fields.' });
      }
      try {
        const staff = await pool.query(
          'SELECT user_id FROM staff_profiles WHERE user_id = $1 AND is_lawyer = TRUE LIMIT 1',
          [staffUserId]
        );
        if (!staff.rows[0]) return res.status(400).json({ error: 'Select an active lawyer profile.' });
        const result = await pool.query(
          `INSERT INTO availability_rules
            (staff_user_id, weekday, starts_local, ends_local, timezone, valid_from, valid_until, is_active)
           VALUES ($1,$2,$3::time,$4::time,$5,$6,$7,TRUE)
           RETURNING id, staff_user_id, weekday, starts_local, ends_local, timezone, valid_from, valid_until, is_active`,
          [staffUserId, weekday, startsLocal, endsLocal, timezone, validFrom, validUntil]
        );
        await pool.query(
          `INSERT INTO audit_events (action_code, entity_type, entity_id, outcome, metadata)
           VALUES ('availability.rule_created', 'availability_rule', $1, 'success', $2)`,
          [result.rows[0].id, JSON.stringify({ staffUserId, weekday, startsLocal, endsLocal, timezone })]
        );
        return res.status(201).json({ rule: result.rows[0] });
      } catch (error) {
        if (error.code === '22023' || error.code === '22007') return res.status(400).json({ error: 'Invalid timezone or date value.' });
        console.error('Availability rule creation failed:', error.message);
        return res.status(503).json({ error: 'Availability rule could not be created.' });
      }
    }
  );

  router.delete('/availability/:id',
    requirePermission(pool, 'availability.manage'),
    async (req, res) => {
      const id = String(req.params.id || '');
      if (!UUID.test(id)) return res.status(400).json({ error: 'Invalid availability rule identifier.' });
      try {
        const result = await pool.query(
          'UPDATE availability_rules SET is_active = FALSE WHERE id = $1 RETURNING id',
          [id]
        );
        if (!result.rows[0]) return res.status(404).json({ error: 'Availability rule not found.' });
        await pool.query(
          `INSERT INTO audit_events (action_code, entity_type, entity_id, outcome)
           VALUES ('availability.rule_deactivated', 'availability_rule', $1, 'success')`,
          [id]
        );
        return res.json({ ok: true });
      } catch (error) {
        console.error('Availability rule deactivation failed:', error.message);
        return res.status(503).json({ error: 'Availability rule could not be deactivated.' });
      }
    }
  );

  return router;
}

module.exports = { createAdminAppointmentRouter };
