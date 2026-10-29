'use strict';

const express = require('express');
const { verifyPassword } = require('../security/password');
const { createSession, findActiveSession, revokeSession } = require('../security/session-store');

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index >= 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return '';
}

function createAuthRouter(pool, config) {
  const router = express.Router();
  const cookieName = 'haavocato_session';
  const ttlMs = 8 * 60 * 60 * 1000;

  function setCookie(res, token, maxAgeSeconds) {
    res.setHeader('Set-Cookie',
      cookieName + '=' + token +
      '; Path=/api; HttpOnly; SameSite=Strict; Max-Age=' + maxAgeSeconds +
      (config.cookieSecure ? '; Secure' : '')
    );
  }

  router.post('/login', async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!email || email.length > 254 || !password || password.length > 200) {
      return res.status(400).json({ error: 'Enter a valid email and password.' });
    }
    try {
      const result = await pool.query(
        `SELECT id, password_hash, password_salt, status
           FROM app_users WHERE LOWER(email) = $1 LIMIT 1`,
        [email]
      );
      const user = result.rows[0];
      let valid = false;
      if (user?.status === 'active' && user.password_hash && user.password_salt) {
        valid = await verifyPassword(password, {
          algorithm: 'scrypt', salt: user.password_salt, hash: user.password_hash,
        });
      }
      if (!valid) {
        await pool.query(
          `INSERT INTO audit_events (action_code, entity_type, outcome, ip_address, user_agent, metadata)
           VALUES ('auth.login', 'session', 'denied', $1, $2, $3)`,
          [req.ip || null, String(req.headers['user-agent'] || '').slice(0, 500), JSON.stringify({ email_domain: email.includes('@') ? email.split('@').pop() : null })]
        );
        return res.status(401).json({ error: 'Email or password is incorrect.' });
      }

      const session = await createSession(pool, user.id, { ttlMs });
      await pool.query('UPDATE app_users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [user.id]);
      await pool.query(
        `INSERT INTO audit_events (actor_user_id, action_code, entity_type, entity_id, outcome, ip_address, user_agent)
         VALUES ($1, 'auth.login', 'session', $2, 'success', $3, $4)`,
        [user.id, session.expiresAt.toISOString(), req.ip || null, String(req.headers['user-agent'] || '').slice(0, 500)]
      );
      setCookie(res, session.token, Math.floor(ttlMs / 1000));
      return res.json({ ok: true, expiresAt: session.expiresAt.toISOString() });
    } catch (error) {
      console.error('Login failed:', error.message);
      return res.status(503).json({ error: 'Authentication service is temporarily unavailable.' });
    }
  });

  router.post('/logout', async (req, res) => {
    const token = readCookie(req, cookieName);
    try {
      const session = await findActiveSession(pool, token);
      if (session) {
        await revokeSession(pool, token);
        await pool.query(
          `INSERT INTO audit_events (actor_user_id, action_code, entity_type, entity_id, outcome)
           VALUES ($1, 'auth.logout', 'session', $2, 'success')`,
          [session.userId, session.sessionId]
        );
      }
      setCookie(res, '', 0);
      return res.json({ ok: true });
    } catch (error) {
      console.error('Logout failed:', error.message);
      setCookie(res, '', 0);
      return res.status(503).json({ error: 'Could not complete sign-out safely.' });
    }
  });

  router.get('/me', async (req, res) => {
    const session = await findActiveSession(pool, readCookie(req, cookieName)).catch(() => null);
    if (!session) return res.status(401).json({ error: 'Authentication required.' });
    const result = await pool.query(
      'SELECT u.id, u.email, u.preferred_language, u.status, cp.full_name FROM app_users u LEFT JOIN client_profiles cp ON cp.user_id = u.id WHERE u.id = $1 LIMIT 1',
      [session.userId]
    ).catch(() => ({ rows: [] }));
    if (!result.rows[0]) return res.status(401).json({ error: 'Authentication required.' });
    return res.json({ user: result.rows[0] });
  });

  return router;
}

module.exports = { createAuthRouter };
