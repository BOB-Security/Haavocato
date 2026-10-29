'use strict';

// Run once against the intended database after applying migrations:
// BOOTSTRAP_ADMIN_EMAIL=... BOOTSTRAP_ADMIN_PASSWORD=... node scripts/bootstrap-admin.js
// Supply secrets through a protected shell/secret manager. Never commit them to the repository.

const { parseConfig } = require('../src/config');
const { createPool } = require('../src/db/pool');
const { hashPassword } = require('../src/security/password');

async function main() {
  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('Set BOOTSTRAP_ADMIN_EMAIL to a valid email address.');
  }
  if (password.length < 16 || password.length > 200) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be between 16 and 200 characters.');
  }

  const config = parseConfig();
  const pool = createPool(config);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE app_users IN SHARE ROW EXCLUSIVE MODE');
    const existingAdmin = await client.query(
      `SELECT 1 FROM user_roles ur JOIN role_definitions rd ON rd.id = ur.role_id
        WHERE rd.code = 'super_admin' LIMIT 1`
    );
    if (existingAdmin.rowCount > 0) {
      throw new Error('A super administrator already exists. Bootstrap is disabled.');
    }
    const existingUser = await client.query('SELECT 1 FROM app_users WHERE LOWER(email) = $1 LIMIT 1', [email]);
    if (existingUser.rowCount > 0) {
      throw new Error('This email already belongs to an account. Bootstrap will not elevate an existing account.');
    }

    const credentials = await hashPassword(password);
    const userResult = await client.query(
      `INSERT INTO app_users (email, password_hash, password_salt, preferred_language, status, email_verified_at)
       VALUES ($1, $2, $3, 'en', 'active', NOW()) RETURNING id`,
      [email, credentials.hash, credentials.salt]
    );
    const userId = userResult.rows[0].id;
    const roleResult = await client.query('SELECT id FROM role_definitions WHERE code = $1', ['super_admin']);
    if (!roleResult.rows[0]) throw new Error('Role migrations are missing. Apply migrations first.');
    await client.query(
      'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
      [userId, roleResult.rows[0].id]
    );
    await client.query(
      `INSERT INTO audit_events (actor_user_id, action_code, entity_type, entity_id, outcome)
       VALUES ($1, 'admin.bootstrap', 'user', $1, 'success')`,
      [userId]
    );
    await client.query('COMMIT');
    console.log('Initial super administrator created. Remove bootstrap credentials from the shell/session now.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Super-admin bootstrap failed:', error.message);
  process.exitCode = 1;
});
