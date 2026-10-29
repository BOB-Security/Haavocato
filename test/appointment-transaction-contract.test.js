'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'appointments.js'), 'utf8');

test('appointment booking serializes same-lawyer bookings and commits appointment with audit', () => {
  const routeStart = source.indexOf("router.post('/',");
  const routeEnd = source.indexOf("router.post('/:id/cancel'", routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart, 'appointment booking route must exist');
  const route = source.slice(routeStart, routeEnd);
  const begin = route.indexOf("client.query('BEGIN')");
  const lock = route.indexOf('pg_advisory_xact_lock');
  const availabilityCheck = route.indexOf('FROM availability_rules');
  const overlapCheck = route.indexOf('FROM appointments');
  const insertAppointment = route.indexOf('INSERT INTO appointments');
  const audit = route.indexOf('INSERT INTO audit_events');
  const commit = route.indexOf("client.query('COMMIT')");
  assert.ok(begin >= 0 && lock > begin, 'transaction lock must be acquired after transaction begins');
  assert.ok(availabilityCheck > lock && overlapCheck > availabilityCheck);
  assert.ok(insertAppointment > overlapCheck && audit > insertAppointment && commit > audit);
  assert.match(route, /finally\s*\{\s*client\.release\(\)/);
  assert.match(route, /client\.query\('ROLLBACK'\)/);
});

test('client cancellation and audit event are committed atomically', () => {
  const routeStart = source.indexOf("router.post('/:id/cancel'");
  const routeEnd = source.indexOf('return router;', routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart, 'appointment cancellation route must exist');
  const route = source.slice(routeStart, routeEnd);
  const begin = route.indexOf("client.query('BEGIN')");
  const update = route.indexOf("UPDATE appointments SET status = 'cancelled'");
  const audit = route.indexOf('INSERT INTO audit_events');
  const commit = route.indexOf("client.query('COMMIT')");
  assert.ok(begin >= 0 && update > begin && audit > update && commit > audit);
  assert.match(route, /finally\s*\{\s*client\.release\(\)/);
});
