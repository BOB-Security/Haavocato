'use strict';

const crypto = require('node:crypto');
const { assertTransition } = require('../domain/request-status');

function makeReferenceCode() {
  return 'HA-' + crypto.randomBytes(6).toString('hex').toUpperCase();
}

function requiredText(value, field, maxLength) {
  if (typeof value !== 'string') throw new TypeError(field + ' is required.');
  const clean = value.trim();
  if (!clean || clean.length > maxLength) throw new TypeError(field + ' is invalid.');
  return clean;
}

async function createRequest(pool, input, actorUserId = null) {
  const requesterName = requiredText(input.requesterName, 'requesterName', 120);
  const requesterEmail = requiredText(input.requesterEmail, 'requesterEmail', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) throw new TypeError('requesterEmail is invalid.');
  const requesterPhone = requiredText(input.requesterPhone, 'requesterPhone', 40);
  const description = requiredText(input.description, 'description', 4000);
  const preferredLanguage = input.preferredLanguage === 'ar' ? 'ar' : 'en';
  const serviceId = input.serviceId || null;
  const serviceName = requiredText(input.serviceName, 'serviceName', 160);
  const clientUserId = input.clientUserId || null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const referenceCode = makeReferenceCode();
    const created = await client.query(
      `INSERT INTO service_requests
       (reference_code, client_user_id, service_id, service_name_snapshot, requester_name,
        requester_email, requester_phone, preferred_language, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, reference_code, status, submitted_at`,
      [referenceCode, clientUserId, serviceId, serviceName, requesterName, requesterEmail, requesterPhone, preferredLanguage, description]
    );
    const request = created.rows[0];
    await client.query(
      `INSERT INTO request_status_events (request_id, from_status, to_status, public_message, changed_by)
       VALUES ($1, NULL, 'new', $2, $3)`,
      [request.id, 'We received your request and will review it.', actorUserId]
    );
    await client.query(
      `INSERT INTO audit_events (actor_user_id, action_code, entity_type, entity_id, request_id, outcome)
       VALUES ($1, 'request.created', 'service_request', $2, $3, 'success')`,
      [actorUserId, request.id, request.id]
    );
    await client.query('COMMIT');
    return request;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function changeRequestStatus(pool, { requestId, toStatus, actorUserId, publicMessage = null, internalNote = null }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      'SELECT id, status FROM service_requests WHERE id = $1 FOR UPDATE',
      [requestId]
    );
    const current = currentResult.rows[0];
    if (!current) {
      const error = new Error('Request not found.');
      error.code = 'REQUEST_NOT_FOUND';
      throw error;
    }
    assertTransition(current.status, toStatus);
    const updated = await client.query(
      `UPDATE service_requests SET status = $1, updated_at = NOW(),
         closed_at = CASE WHEN $1 IN ('completed','declined','cancelled','archived') THEN COALESCE(closed_at, NOW()) ELSE NULL END
       WHERE id = $2
       RETURNING id, reference_code, status, updated_at, closed_at`,
      [toStatus, requestId]
    );
    await client.query(
      `INSERT INTO request_status_events (request_id, from_status, to_status, public_message, internal_note, changed_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [requestId, current.status, toStatus, publicMessage, internalNote, actorUserId]
    );
    await client.query(
      `INSERT INTO audit_events (actor_user_id, action_code, entity_type, entity_id, request_id, outcome)
       VALUES ($1, 'request.status_changed', 'service_request', $2, $3, 'success')`,
      [actorUserId, requestId, requestId]
    );
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listRequests(pool, { status, limit = 50, offset = 0 } = {}) {
  const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 50;
  const safeOffset = Number.isInteger(offset) ? Math.max(offset, 0) : 0;
  const values = [];
  let where = '';
  if (status) {
    values.push(status);
    where = 'WHERE status = $1';
  }
  values.push(safeLimit, safeOffset);
  const limitPosition = values.length - 1;
  const offsetPosition = values.length;
  const result = await pool.query(
    `SELECT id, reference_code, service_name_snapshot, requester_name, requester_email,
            requester_phone, status, priority, assigned_to, submitted_at, updated_at
       FROM service_requests ${where}
      ORDER BY submitted_at DESC
      LIMIT $${limitPosition} OFFSET $${offsetPosition}`,
    values
  );
  return result.rows;
}

module.exports = { createRequest, changeRequestStatus, listRequests, makeReferenceCode };
