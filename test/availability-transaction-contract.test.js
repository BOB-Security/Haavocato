'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('availability rule creation and audit event are committed atomically', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'admin-appointments.js'), 'utf8');
  const routeStart = source.indexOf("router.post('/availability',");
  const routeEnd = source.indexOf("router.delete('/availability/:id'", routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart, 'availability creation route must exist');
  const route = source.slice(routeStart, routeEnd);
  const begin = route.indexOf("client.query('BEGIN')");
  const insertRule = route.indexOf('INSERT INTO availability_rules');
  const insertAudit = route.indexOf('INSERT INTO audit_events');
  const commit = route.indexOf("client.query('COMMIT')");
  assert.ok(begin >= 0 && insertRule > begin);
  assert.ok(insertAudit > insertRule && commit > insertAudit);
  assert.match(route, /if\s*\(client\s*&&\s*transactionStarted\)\s*await client\.query\('ROLLBACK'\)/);
  assert.match(route, /finally\s*\{\s*if\s*\(client\)\s*client\.release\(\)/);
});

test('availability rule deactivation and audit event are committed atomically', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'admin-appointments.js'), 'utf8');
  const routeStart = source.indexOf("router.delete('/availability/:id'");
  const routeEnd = source.indexOf('return router;', routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart, 'availability deactivation route must exist');
  const route = source.slice(routeStart, routeEnd);
  const begin = route.indexOf("client.query('BEGIN')");
  const deactivate = route.indexOf('UPDATE availability_rules SET is_active = FALSE');
  const audit = route.indexOf('INSERT INTO audit_events');
  const commit = route.indexOf("client.query('COMMIT')");
  assert.ok(begin >= 0 && deactivate > begin);
  assert.ok(audit > deactivate && commit > audit);
  assert.match(route, /if\s*\(client\s*&&\s*transactionStarted\)\s*await client\.query\('ROLLBACK'\)/);
  assert.match(route, /finally\s*\{\s*if\s*\(client\)\s*client\.release\(\)/);
});
