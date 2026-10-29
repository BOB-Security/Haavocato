'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const migrationsDir = path.join(root, 'db', 'migrations');

function readMigration(name) {
  return fs.readFileSync(path.join(migrationsDir, name), 'utf8');
}

test('database migrations are ordered, uniquely versioned, and sequential', () => {
  const files = fs.readdirSync(migrationsDir)
    .filter((name) => /^\d{3}_[a-z0-9_-]+\.sql$/.test(name))
    .sort();

  assert.ok(files.length > 0, 'at least one migration must exist');
  const versions = files.map((name) => Number(name.slice(0, 3)));
  assert.equal(new Set(versions).size, versions.length, 'migration versions must be unique');

  for (let index = 0; index < versions.length; index += 1) {
    assert.equal(versions[index], index + 1, 'migration numbering must not contain gaps');
  }
});

test('authentication schema includes the password salt used by the login route', () => {
  const initialSchema = readMigration('001_initial_schema.sql');
  const saltMigration = readMigration('011_app_user_password_salt.sql');
  const authRoute = fs.readFileSync(path.join(root, 'src', 'routes', 'auth.js'), 'utf8');

  assert.match(initialSchema, /CREATE TABLE IF NOT EXISTS app_users/i);
  assert.match(saltMigration, /ALTER TABLE\s+app_users\s+ADD COLUMN IF NOT EXISTS password_salt/i);
  assert.match(authRoute, /SELECT id, password_hash, password_salt, status/i);
  assert.match(authRoute, /user\.password_salt/);
});

test('staff invitation token purpose is allowed by the auth-token schema', () => {
  const tokenMigration = readMigration('004_auth_tokens.sql');
  const inviteMigration = readMigration('010_staff_invites.sql');
  const accountRoute = fs.readFileSync(path.join(root, 'src', 'routes', 'admin-users.js'), 'utf8');

  assert.match(tokenMigration, /auth_tokens/i);
  assert.match(inviteMigration, /staff_invite/i);
  assert.match(accountRoute, /staff_invite/i);
});

test('migration runner refuses edits to already-applied migration files', () => {
  const runner = fs.readFileSync(path.join(root, 'scripts', 'migrate.js'), 'utf8');

  assert.match(runner, /createHash\('sha256'\)/);
  assert.match(runner, /checksum_sha256/);
  assert.match(runner, /was modified\. Create a new migration instead/);
});
