'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

function testConfig() {
  return {
    nodeEnv: 'test', port: 3000, publicOrigin: 'http://127.0.0.1',
    cookieSecure: false, trustProxy: false, maxRequestBodyBytes: 262144,
  };
}

test('replacement app requires explicit pool and config', () => {
  assert.throws(() => createApp({}), /required/);
});

test('replacement app can be constructed with a stub pool', () => {
  const pool = { query: async () => ({ rows: [{ ok: 1 }] }) };
  const app = createApp({ pool, config: testConfig() });
  assert.equal(typeof app.listen, 'function');
});

test('origin middleware rejects cross-origin mutations', async () => {
  const pool = { query: async () => ({ rows: [{ ok: 1 }] }) };
  const app = createApp({ pool, config: testConfig() });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/logout`, {
      method: 'POST',
      headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'Request origin is not allowed.' });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
