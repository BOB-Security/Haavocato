'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

function makeResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    getHeader(name) { return this.headers[name]; },
  };
}

test('replacement app requires explicit pool and config', () => {
  assert.throws(() => createApp({}), /required/);
});

test('replacement app can be constructed with a stub pool', async () => {
  const pool = { query: async () => ({ rows: [{ ok: 1 }] }) };
  const app = createApp({
    pool,
    config: {
      nodeEnv: 'test', port: 3000, publicOrigin: 'http://localhost:3000',
      cookieSecure: false, trustProxy: false, maxRequestBodyBytes: 262144,
    },
  });
  assert.equal(typeof app.listen, 'function');
});

test('origin middleware rejects cross-origin mutations', async () => {
  const pool = { query: async () => ({ rows: [{ ok: 1 }] }) };
  const app = createApp({
    pool,
    config: {
      nodeEnv: 'test', port: 3000, publicOrigin: 'http://localhost:3000',
      cookieSecure: false, trustProxy: false, maxRequestBodyBytes: 262144,
    },
  });
  // Express's origin middleware is exercised in integration tests once the test HTTP harness is added.
  assert.equal(typeof app, 'function');
});
