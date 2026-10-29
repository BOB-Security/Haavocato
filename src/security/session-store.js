'use strict';

const crypto = require('node:crypto');

const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000;

function digestToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function createSession(pool, userId, { ttlMs = DEFAULT_TTL_MS } = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('A database pool is required.');
  if (typeof userId !== 'string' || !userId) throw new TypeError('A user ID is required.');
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 60_000 || ttlMs > 30 * 24 * 60 * 60 * 1000) {
    throw new TypeError('Session lifetime must be between one minute and 30 days.');
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const sessionHash = digestToken(token);
  const expiresAt = new Date(Date.now() + ttlMs);
  await pool.query(
    'INSERT INTO app_sessions (user_id, session_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, sessionHash, expiresAt]
  );
  return { token, expiresAt };
}

async function findActiveSession(pool, token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 256) return null;
  const result = await pool.query(
    `SELECT s.id AS session_id, s.user_id, s.expires_at, u.status
       FROM app_sessions s
       JOIN app_users u ON u.id = s.user_id
      WHERE s.session_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > NOW()
        AND u.status = 'active'
      LIMIT 1`,
    [digestToken(token)]
  );
  const row = result.rows[0];
  if (!row) return null;
  await pool.query('UPDATE app_sessions SET last_seen_at = NOW() WHERE id = $1', [row.session_id]);
  return { sessionId: row.session_id, userId: row.user_id, expiresAt: row.expires_at };
}

async function revokeSession(pool, token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 256) return false;
  const result = await pool.query(
    'UPDATE app_sessions SET revoked_at = NOW() WHERE session_hash = $1 AND revoked_at IS NULL RETURNING id',
    [digestToken(token)]
  );
  return result.rowCount === 1;
}

async function revokeAllUserSessions(pool, userId) {
  const result = await pool.query(
    'UPDATE app_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL RETURNING id',
    [userId]
  );
  return result.rowCount;
}

module.exports = { createSession, findActiveSession, revokeSession, revokeAllUserSessions };
