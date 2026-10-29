'use strict';

const { findActiveSession } = require('../security/session-store');

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return '';
}

function requirePermission(pool, permissionCode) {
  return async function permissionMiddleware(req, res, next) {
    try {
      const token = readCookie(req, 'haavocato_session');
      const session = await findActiveSession(pool, token);
      if (!session) return res.status(401).json({ error: 'Authentication required.' });

      const result = await pool.query(
        `SELECT DISTINCT rp.permission_code
           FROM user_roles ur
           JOIN role_permissions rp ON rp.role_id = ur.role_id
          WHERE ur.user_id = $1`,
        [session.userId]
      );
      const permissions = new Set(result.rows.map((row) => row.permission_code));
      if (!permissions.has(permissionCode)) {
        await pool.query(
          `INSERT INTO audit_events (actor_user_id, action_code, entity_type, outcome, ip_address, user_agent)
           VALUES ($1, 'access.denied', 'permission', 'denied', $2, $3)`,
          [session.userId, req.ip || null, String(req.headers['user-agent'] || '').slice(0, 500)]
        );
        return res.status(403).json({ error: 'You do not have permission to perform this action.' });
      }

      req.auth = { userId: session.userId, sessionId: session.sessionId, permissions };
      return next();
    } catch (error) {
      console.error('Authorization middleware failed:', error.message);
      return res.status(503).json({ error: 'Authentication service is temporarily unavailable.' });
    }
  };
}

module.exports = { requirePermission };
