'use strict';

const crypto = require('node:crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { hashPassword } = require('../security/password');
const { revokeAllUserSessions } = require('../security/session-store');

const TOKEN_TTL_MS = 30 * 60 * 1000;
const GENERIC_VERIFY_MESSAGE = 'If the account can be verified, instructions will be sent to its email address.';
const GENERIC_RESET_MESSAGE = 'If an active account matches that email, password-reset instructions will be sent.';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function sendEmail({ apiKey, from, to, subject, text }) {
  if (!apiKey || !from) throw new Error('Email delivery is not configured.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    console.error('Email provider rejected a message with status:', response.status);
    throw new Error('Email delivery failed.');
  }
}

async function createToken(pool, userId, purpose) {
  const raw = crypto.randomBytes(32).toString('base64url');
  await pool.query(
    'UPDATE auth_tokens SET consumed_at = NOW() WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL',
    [userId, purpose]
  );
  await pool.query(
    'INSERT INTO auth_tokens (user_id, token_hash, purpose, expires_at) VALUES ($1, $2, $3, $4)',
    [userId, hashToken(raw), purpose, new Date(Date.now() + TOKEN_TTL_MS)]
  );
  return raw;
}

function createAccountRouter(pool, config) {
  const router = express.Router();
  const limited = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });

  router.post('/register', limited, async (req, res) => {
    const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const language = req.body.language === 'ar' ? 'ar' : 'en';
    if (!fullName || fullName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        email.length > 254 || !phone || phone.length > 40 || password.length < 12 || password.length > 200) {
      return res.status(400).json({ error: 'Provide a valid name, email, phone, and password of at least 12 characters.' });
    }

    let client;
    try {
      const credentials = await hashPassword(password);
      client = await pool.connect();
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO app_users (email, phone, password_hash, password_salt, preferred_language, status)
         VALUES ($1,$2,$3,$4,$5,'pending')
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [email, phone, credentials.hash, credentials.salt, language]
      );
      if (!inserted.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(202).json({ message: GENERIC_VERIFY_MESSAGE });
      }
      const userId = inserted.rows[0].id;
      await client.query('INSERT INTO client_profiles (user_id, full_name) VALUES ($1,$2)', [userId, fullName]);
      const role = await client.query('SELECT id FROM role_definitions WHERE code = $1', ['client']);
      if (!role.rows[0]) throw new Error('Client role migration has not been applied.');
      await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)', [userId, role.rows[0].id]);
      await client.query(
        `INSERT INTO audit_events (actor_user_id, action_code, entity_type, entity_id, outcome)
         VALUES ($1, 'account.registered', 'user', $1, 'success')`,
        [userId]
      );
      await client.query('COMMIT');

      const token = await createToken(pool, userId, 'verify_email');
      const link = config.publicOrigin + '/verify-email#token=' + encodeURIComponent(token);
      try {
        await sendEmail({
          apiKey: process.env.RESEND_API_KEY,
          from: process.env.RESEND_FROM_EMAIL,
          to: email,
          subject: 'Verify your HA Advocates account',
          text: 'Hello ' + fullName + ',\n\nOpen this link to verify your email address. The link expires in 30 minutes and can be used once:\n' + link + '\n\nIf you did not request this account, you can ignore this email.',
        });
      } catch (error) {
        console.error('Verification email could not be sent:', error.message);
        await pool.query('UPDATE auth_tokens SET consumed_at = NOW() WHERE token_hash = $1', [hashToken(token)]).catch(() => {});
        return res.status(503).json({ error: 'Account creation started, but verification email delivery is unavailable. Please contact the firm.' });
      }
      return res.status(201).json({ message: 'Account created. Check your email to verify it before signing in.' });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      console.error('Account registration failed:', error.message);
      return res.status(503).json({ error: 'Account registration is temporarily unavailable.' });
    } finally {
      client?.release();
    }
  });

  router.post('/verification/resend', limited, async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(202).json({ message: GENERIC_VERIFY_MESSAGE });
    }
    try {
      const result = await pool.query(
        `SELECT id, email FROM app_users WHERE LOWER(email) = $1 AND status = 'pending' AND email_verified_at IS NULL LIMIT 1`,
        [email]
      );
      const user = result.rows[0];
      if (user) {
        const token = await createToken(pool, user.id, 'verify_email');
        const link = config.publicOrigin + '/verify-email#token=' + encodeURIComponent(token);
        try {
          await sendEmail({
            apiKey: process.env.RESEND_API_KEY,
            from: process.env.RESEND_FROM_EMAIL,
            to: user.email,
            subject: 'Verify your HA Advocates account',
            text: 'Open this one-time link within 30 minutes to verify your email address:\n' + link + '\n\nIf you did not request this account, ignore this message.',
          });
        } catch (error) {
          console.error('Verification resend failed:', error.message);
          await pool.query('UPDATE auth_tokens SET consumed_at = NOW() WHERE token_hash = $1', [hashToken(token)]).catch(() => {});
        }
      }
      return res.status(202).json({ message: GENERIC_VERIFY_MESSAGE });
    } catch (error) {
      console.error('Verification resend request failed:', error.message);
      return res.status(202).json({ message: GENERIC_VERIFY_MESSAGE });
    }
  });

  router.post('/accept-invite', limited, async (req, res) => {
    const token = typeof req.body.token === 'string' ? req.body.token : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (token.length < 32 || token.length > 256 || password.length < 12 || password.length > 200) {
      return res.status(400).json({ error: 'The invitation link or new password is invalid.' });
    }
    let credentials;
    try { credentials = await hashPassword(password); }
    catch { return res.status(400).json({ error: 'The new password must be between 12 and 200 characters.' }); }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(
        `SELECT t.id,t.user_id FROM auth_tokens t
          JOIN app_users u ON u.id=t.user_id
          WHERE t.token_hash=$1 AND t.purpose='staff_invite'
            AND t.consumed_at IS NULL AND t.expires_at>NOW() AND u.status='pending'
          FOR UPDATE OF t,u`,
        [hashToken(token)]
      );
      const invite = found.rows[0];
      if (!invite) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'The invitation link is invalid or expired.' });
      }
      const staffRole = await client.query(
        `SELECT 1 FROM user_roles ur JOIN role_definitions rd ON rd.id=ur.role_id
          WHERE ur.user_id=$1 AND rd.code <> 'client' LIMIT 1`,
        [invite.user_id]
      );
      if (!staffRole.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'This invitation is not valid for a staff account.' });
      }
      await client.query('UPDATE auth_tokens SET consumed_at=NOW() WHERE id=$1',[invite.id]);
      await client.query(
        `UPDATE app_users SET password_hash=$1,password_salt=$2,email_verified_at=NOW(),status='active',updated_at=NOW()
          WHERE id=$3 AND status='pending'`,
        [credentials.hash,credentials.salt,invite.user_id]
      );
      await client.query(
        `UPDATE auth_tokens SET consumed_at=NOW() WHERE user_id=$1 AND purpose='staff_invite' AND consumed_at IS NULL`,
        [invite.user_id]
      );
      await client.query(
        `INSERT INTO audit_events (actor_user_id,action_code,entity_type,entity_id,outcome)
         VALUES ($1,'staff.invitation_accepted','user',$1,'success')`,
        [invite.user_id]
      );
      await client.query('COMMIT');
      return res.json({ ok:true, message:'Your staff account is active. You can now sign in to the admin workspace.' });
    } catch(error) {
      await client.query('ROLLBACK').catch(()=>{});
      console.error('Staff invitation acceptance failed:',error.message);
      return res.status(503).json({error:'The staff invitation could not be accepted.'});
    } finally { client.release(); }
  });

  router.post('/verify-email', limited, async (req, res) => {
    const token = typeof req.body.token === 'string' ? req.body.token : '';
    if (token.length < 32 || token.length > 256) return res.status(400).json({ error: 'This verification link is invalid or expired.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(
        `SELECT id, user_id FROM auth_tokens
          WHERE token_hash = $1 AND purpose = 'verify_email'
            AND consumed_at IS NULL AND expires_at > NOW()
          FOR UPDATE`,
        [hashToken(token)]
      );
      const authToken = found.rows[0];
      if (!authToken) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'This verification link is invalid or expired.' });
      }
      await client.query('UPDATE auth_tokens SET consumed_at = NOW() WHERE id = $1', [authToken.id]);
      await client.query(
        `UPDATE app_users SET email_verified_at = NOW(), status = 'active', updated_at = NOW()
          WHERE id = $1 AND status = 'pending'`,
        [authToken.user_id]
      );
      await client.query(
        `INSERT INTO audit_events (actor_user_id, action_code, entity_type, entity_id, outcome)
         VALUES ($1, 'account.email_verified', 'user', $1, 'success')`,
        [authToken.user_id]
      );
      await client.query('COMMIT');
      return res.json({ ok: true, message: 'Email verified. You can now sign in.' });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Email verification failed:', error.message);
      return res.status(503).json({ error: 'Email verification is temporarily unavailable.' });
    } finally {
      client.release();
    }
  });

  router.post('/password-reset/request', limited, async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(202).json({ message: GENERIC_RESET_MESSAGE });
    }
    try {
      const result = await pool.query(
        `SELECT id, email FROM app_users
          WHERE LOWER(email) = $1 AND status = 'active' AND email_verified_at IS NOT NULL
          LIMIT 1`,
        [email]
      );
      const user = result.rows[0];
      if (user) {
        const token = await createToken(pool, user.id, 'reset_password');
        const link = config.publicOrigin + '/reset-password#token=' + encodeURIComponent(token);
        try {
          await sendEmail({
            apiKey: process.env.RESEND_API_KEY,
            from: process.env.RESEND_FROM_EMAIL,
            to: user.email,
            subject: 'Reset your HA Advocates password',
            text: 'A password reset was requested for your account. Open this one-time link within 30 minutes:\n' + link + '\n\nIf you did not request this, ignore this message. Your current password will remain unchanged.',
          });
        } catch (error) {
          console.error('Password reset email could not be sent:', error.message);
          await pool.query('UPDATE auth_tokens SET consumed_at = NOW() WHERE token_hash = $1', [hashToken(token)]).catch(() => {});
        }
      }
      return res.status(202).json({ message: GENERIC_RESET_MESSAGE });
    } catch (error) {
      console.error('Password reset request failed:', error.message);
      return res.status(202).json({ message: GENERIC_RESET_MESSAGE });
    }
  });

  router.post('/password-reset/complete', limited, async (req, res) => {
    const token = typeof req.body.token === 'string' ? req.body.token : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (token.length < 32 || token.length > 256 || password.length < 12 || password.length > 200) {
      return res.status(400).json({ error: 'The reset link or new password is invalid.' });
    }
    let credentials;
    try {
      credentials = await hashPassword(password);
    } catch {
      return res.status(400).json({ error: 'The new password must be between 12 and 200 characters.' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(
        `SELECT id, user_id FROM auth_tokens
          WHERE token_hash = $1 AND purpose = 'reset_password'
            AND consumed_at IS NULL AND expires_at > NOW()
          FOR UPDATE`,
        [hashToken(token)]
      );
      const authToken = found.rows[0];
      if (!authToken) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'The reset link is invalid or expired.' });
      }
      await client.query('UPDATE auth_tokens SET consumed_at = NOW() WHERE id = $1', [authToken.id]);
      await client.query(
        `UPDATE app_users SET password_hash = $1, password_salt = $2, updated_at = NOW()
          WHERE id = $3 AND status = 'active'`,
        [credentials.hash, credentials.salt, authToken.user_id]
      );
      await client.query('UPDATE app_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [authToken.user_id]);
      await client.query(
        `INSERT INTO audit_events (actor_user_id, action_code, entity_type, entity_id, outcome)
         VALUES ($1, 'account.password_reset', 'user', $1, 'success')`,
        [authToken.user_id]
      );
      await client.query('COMMIT');
      return res.json({ ok: true, message: 'Password updated. Sign in with your new password.' });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Password reset completion failed:', error.message);
      return res.status(503).json({ error: 'Password reset is temporarily unavailable.' });
    } finally {
      client.release();
    }
  });

  return router;
}

module.exports = { createAccountRouter };
