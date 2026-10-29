'use strict';

const express = require('express');
const { requirePermission } = require('../middleware/require-permission');
const { enqueueEmail } = require('../services/notification-service');

const SLOT_MINUTES = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createAppointmentRouter(pool) {
  const router = express.Router();

  router.get('/availability', async (req, res) => {
    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const to = typeof req.query.to === 'string' ? req.query.to : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return res.status(400).json({ error: 'Provide from and to dates in YYYY-MM-DD format.' });
    }
    const startDate = new Date(from + 'T00:00:00Z');
    const endDate = new Date(to + 'T00:00:00Z');
    const dayCount = Math.round((endDate - startDate) / 86400000);
    if (!Number.isFinite(dayCount) || dayCount < 0 || dayCount > 14) {
      return res.status(400).json({ error: 'The availability window must be between 1 and 15 calendar days.' });
    }

    try {
      const result = await pool.query(
        `WITH days AS (
           SELECT generate_series($1::date, $2::date, INTERVAL '1 day')::date AS local_day
         ), candidate_slots AS (
           SELECT r.staff_user_id, r.timezone, slot_start AS starts_at,
                  slot_start + INTERVAL '30 minutes' AS ends_at
             FROM availability_rules r
             JOIN days d ON EXTRACT(DOW FROM d.local_day)::int = r.weekday
             CROSS JOIN LATERAL generate_series(
               (d.local_day + r.starts_local) AT TIME ZONE r.timezone,
               ((d.local_day + r.ends_local) AT TIME ZONE r.timezone) - INTERVAL '30 minutes',
               INTERVAL '30 minutes'
             ) AS slot_start
            WHERE r.is_active = TRUE
              AND (r.valid_from IS NULL OR d.local_day >= r.valid_from)
              AND (r.valid_until IS NULL OR d.local_day <= r.valid_until)
              AND slot_start > NOW()
              AND NOT EXISTS (
                SELECT 1 FROM appointments a
                 WHERE a.assigned_lawyer_id = r.staff_user_id
                   AND a.status <> 'cancelled'
                   AND a.starts_at < slot_start + INTERVAL '30 minutes'
                   AND a.ends_at > slot_start
              )
              AND NOT EXISTS (
                SELECT 1 FROM availability_exceptions e
                 WHERE e.staff_user_id = r.staff_user_id
                   AND e.kind = 'unavailable'
                   AND e.starts_at < slot_start + INTERVAL '30 minutes'
                   AND e.ends_at > slot_start
              )
         )
         SELECT cs.staff_user_id, sp.display_name, cs.timezone, cs.starts_at, cs.ends_at
           FROM candidate_slots cs
           JOIN staff_profiles sp ON sp.user_id = cs.staff_user_id AND sp.is_lawyer = TRUE
          ORDER BY cs.starts_at ASC
          LIMIT 300`,
        [from, to]
      );
      return res.json({ slotMinutes: SLOT_MINUTES, slots: result.rows });
    } catch (error) {
      console.error('Appointment availability lookup failed:', error.message);
      return res.status(503).json({ error: 'Availability is temporarily unavailable.' });
    }
  });

  router.get('/mine',
    requirePermission(pool, 'client.appointments.manage_own'),
    async (req, res) => {
      try {
        const result = await pool.query(
          `SELECT a.id, a.request_id, sr.reference_code, a.consultation_mode, a.status,
                  a.starts_at, a.ends_at, a.timezone, a.location_or_meeting_reference,
                  a.created_at, sp.display_name AS lawyer_name
             FROM appointments a
             LEFT JOIN service_requests sr ON sr.id = a.request_id
             LEFT JOIN staff_profiles sp ON sp.user_id = a.assigned_lawyer_id
            WHERE a.client_user_id = $1
            ORDER BY a.starts_at DESC
            LIMIT 100`,
          [req.auth.userId]
        );
        return res.json({ appointments: result.rows });
      } catch (error) {
        console.error('Client appointment list failed:', error.message);
        return res.status(503).json({ error: 'Your appointments are temporarily unavailable.' });
      }
    }
  );

  router.post('/',
    requirePermission(pool, 'client.appointments.manage_own'),
    async (req, res) => {
      const lawyerId = typeof req.body.lawyerId === 'string' ? req.body.lawyerId : '';
      const startsAtText = typeof req.body.startsAt === 'string' ? req.body.startsAt : '';
      const requestId = req.body.requestId == null || req.body.requestId === '' ? null : String(req.body.requestId);
      const mode = String(req.body.mode || '');
      const startsAt = new Date(startsAtText);
      if (!UUID.test(lawyerId) || !Number.isFinite(startsAt.getTime()) ||
          !['video','phone','in_person'].includes(mode) ||
          (requestId && !UUID.test(requestId)) || startsAt.getTime() <= Date.now()) {
        return res.status(400).json({ error: 'Select a valid future slot and consultation mode.' });
      }
      const endsAt = new Date(startsAt.getTime() + SLOT_MINUTES * 60 * 1000);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lawyerId]);

        if (requestId) {
          const ownedRequest = await client.query(
            'SELECT id, reference_code, service_name_snapshot FROM service_requests WHERE id = $1 AND client_user_id = $2 LIMIT 1',
            [requestId, req.auth.userId]
          );
          if (!ownedRequest.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'The linked request was not found.' });
          }
        }

        const rule = await client.query(
          `SELECT r.timezone
             FROM availability_rules r
            WHERE r.staff_user_id = $1 AND r.is_active = TRUE
              AND r.weekday = EXTRACT(DOW FROM ($2::timestamptz AT TIME ZONE r.timezone))::int
              AND (r.valid_from IS NULL OR ( $2::timestamptz AT TIME ZONE r.timezone)::date >= r.valid_from)
              AND (r.valid_until IS NULL OR ( $2::timestamptz AT TIME ZONE r.timezone)::date <= r.valid_until)
              AND ($2::timestamptz AT TIME ZONE r.timezone)::time >= r.starts_local
              AND ($3::timestamptz AT TIME ZONE r.timezone)::time <= r.ends_local
              AND MOD(EXTRACT(EPOCH FROM (
                ($2::timestamptz AT TIME ZONE r.timezone) -
                ((($2::timestamptz AT TIME ZONE r.timezone)::date) + r.starts_local)
              ))::bigint, 1800) = 0
            LIMIT 1`,
          [lawyerId, startsAt.toISOString(), endsAt.toISOString()]
        );
        if (!rule.rows[0]) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'That slot is no longer available. Please choose another time.' });
        }

        const exception = await client.query(
          `SELECT 1 FROM availability_exceptions
            WHERE staff_user_id = $1 AND kind = 'unavailable'
              AND starts_at < $3 AND ends_at > $2 LIMIT 1`,
          [lawyerId, startsAt.toISOString(), endsAt.toISOString()]
        );
        const overlap = await client.query(
          `SELECT 1 FROM appointments
            WHERE assigned_lawyer_id = $1 AND status <> 'cancelled'
              AND starts_at < $3 AND ends_at > $2 LIMIT 1`,
          [lawyerId, startsAt.toISOString(), endsAt.toISOString()]
        );
        if (exception.rows[0] || overlap.rows[0]) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'That slot is no longer available. Please choose another time.' });
        }

        const inserted = await client.query(
          `INSERT INTO appointments
            (request_id, client_user_id, assigned_lawyer_id, consultation_mode, status,
             starts_at, ends_at, timezone, created_by)
           VALUES ($1,$2,$3,$4,'requested',$5,$6,$7,$2)
           RETURNING id, status, starts_at, ends_at, timezone`,
          [requestId, req.auth.userId, lawyerId, mode, startsAt.toISOString(), endsAt.toISOString(), rule.rows[0].timezone]
        );
        await client.query(
          `INSERT INTO audit_events (actor_user_id, action_code, entity_type, entity_id, outcome)
           VALUES ($1, 'appointment.requested', 'appointment', $2, 'success')`,
          [req.auth.userId, inserted.rows[0].id]
        );
        const clientInfo = await client.query('SELECT email, preferred_language FROM app_users WHERE id = $1 LIMIT 1', [req.auth.userId]);
        await enqueueEmail(client, {
          recipientEmail: clientInfo.rows[0]?.email,
          templateCode: 'appointment_requested',
          relatedRequestId: requestId,
          metadata: {
            startsAt: inserted.rows[0].starts_at,
            mode,
            referenceCode: requestId ? (await client.query('SELECT reference_code FROM service_requests WHERE id = $1', [requestId])).rows[0]?.reference_code : '',
            language: clientInfo.rows[0]?.preferred_language || 'en'
          }
        });
        await client.query('COMMIT');
        return res.status(201).json({ appointment: inserted.rows[0], message: 'Appointment request submitted for confirmation.' });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Appointment booking failed:', error.message);
        return res.status(503).json({ error: 'Appointment booking is temporarily unavailable.' });
      } finally {
        client.release();
      }
    }
  );

  router.post('/:id/cancel',
    requirePermission(pool, 'client.appointments.manage_own'),
    async (req, res) => {
      const id = String(req.params.id || '');
      if (!UUID.test(id)) return res.status(404).json({ error: 'Appointment not found.' });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const updated = await client.query(
          `UPDATE appointments SET status = 'cancelled', updated_at = NOW()
            WHERE id = $1 AND client_user_id = $2 AND status IN ('requested','confirmed','rescheduled')
            RETURNING id, status`,
          [id, req.auth.userId]
        );
        if (!updated.rows[0]) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Appointment not found or cannot be cancelled.' });
        }
        await client.query(
          `INSERT INTO audit_events (actor_user_id, action_code, entity_type, entity_id, outcome)
           VALUES ($1, 'appointment.cancelled_by_client', 'appointment', $2, 'success')`,
          [req.auth.userId, id]
        );
        await client.query('COMMIT');
        return res.json({ appointment: updated.rows[0] });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Appointment cancellation failed:', error.message);
        return res.status(503).json({ error: 'Appointment cancellation is temporarily unavailable.' });
      } finally {
        client.release();
      }
    }
  );

  return router;
}

module.exports = { createAppointmentRouter };
