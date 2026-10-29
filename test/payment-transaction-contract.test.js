'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('client payment submission wraps payment row and audit event in one transaction', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'payments.js'), 'utf8');
  const routeStart = source.indexOf("router.post('/',");
  const routeEnd = source.indexOf("router.get('/admin'", routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart, 'client payment route must exist');
  const route = source.slice(routeStart, routeEnd);
  const begin = route.indexOf("client.query('BEGIN')");
  const paymentInsert = route.indexOf('INSERT INTO payment_records');
  const auditInsert = route.indexOf('INSERT INTO audit_events');
  const commit = route.indexOf("client.query('COMMIT')");
  assert.ok(begin >= 0 && paymentInsert > begin, 'transaction begins before payment insert');
  assert.ok(auditInsert > paymentInsert, 'audit follows the payment insert in the same transaction');
  assert.ok(commit > auditInsert, 'transaction commits only after the audit event');
  assert.match(route, /if\s*\(client\s*&&\s*transactionStarted\)\s*await client\.query\('ROLLBACK'\)/);
  assert.match(route, /finally\s*\{\s*if\s*\(client\)\s*client\.release\(\)/);
});

test('payment notification is best-effort after payment transaction commits', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'payments.js'), 'utf8');
  const routeStart = source.indexOf("router.post('/',");
  const routeEnd = source.indexOf("router.get('/admin'", routeStart);
  const route = source.slice(routeStart, routeEnd);
  assert.ok(route.indexOf("client.query('COMMIT')") < route.indexOf("enqueueEmail(pool"));
  assert.match(route, /Payment notification enqueue failed/);
});
