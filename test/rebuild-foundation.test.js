'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseConfig } = require('../src/config');
const { hashPassword, verifyPassword } = require('../src/security/password');
const { signSession, verifySession } = require('../src/security/session');
const { canTransition, assertTransition, listStatuses } = require('../src/domain/request-status');

test('production configuration rejects weak session secrets', () => {
  assert.throws(() => parseConfig({ NODE_ENV: 'production', SESSION_SECRET: 'weak' }), /SESSION_SECRET/);
});

test('configuration accepts a strong production session secret and canonical HTTPS origin', () => {
  const config = parseConfig({
    NODE_ENV: 'production',
    SESSION_SECRET: 'x'.repeat(40),
    DATABASE_URL: 'postgresql://user:password@localhost:5432/haavocato',
    PUBLIC_ORIGIN: 'https://example.test',
    PORT: '8080',
  });
  assert.equal(config.port, 8080);
  assert.equal(config.cookieSecure, true);
});

test('production configuration rejects a non-HTTPS public origin', () => {
  assert.throws(() => parseConfig({
    NODE_ENV: 'production',
    SESSION_SECRET: 'x'.repeat(40),
    DATABASE_URL: 'postgresql://user:password@localhost:5432/haavocato',
    PUBLIC_ORIGIN: 'http://example.test',
  }), /HTTPS/);
});

test('password hashes verify only the correct password', async () => {
  const stored = await hashPassword('correct horse battery staple');
  assert.equal(await verifyPassword('correct horse battery staple', stored), true);
  assert.equal(await verifyPassword('incorrect password', stored), false);
});

test('signed sessions reject tampering and expiry', () => {
  const secret = 'a'.repeat(48);
  const token = signSession({ userId: 'user-123', expiresAt: 5000 }, secret);
  assert.deepEqual(verifySession(token, secret, 4000), { userId: 'user-123', expiresAt: 5000 });
  assert.equal(verifySession(token, secret, 5000), null);
  assert.equal(verifySession(token + 'x', secret, 4000), null);
});

test('request status transitions allow valid progression and reject invalid jumps', () => {
  assert.equal(canTransition('new', 'triage'), true);
  assert.equal(canTransition('new', 'completed'), false);
  assert.throws(() => assertTransition('new', 'completed'), { code: 'INVALID_STATUS_TRANSITION' });
  assert.ok(listStatuses().includes('archived'));
});
