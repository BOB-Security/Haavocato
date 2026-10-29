'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeReferenceCode } = require('../src/services/request-service');
const { canTransition } = require('../src/domain/request-status');

test('request reference codes are formatted and unique across repeated generation', () => {
  const values = new Set(Array.from({ length: 100 }, () => makeReferenceCode()));
  assert.equal(values.size, 100);
  for (const value of values) assert.match(value, /^HA-[A-F0-9]{12}$/);
});

test('status lifecycle requires triage before assignment', () => {
  assert.equal(canTransition('new', 'assigned'), false);
  assert.equal(canTransition('new', 'triage'), true);
  assert.equal(canTransition('triage', 'assigned'), true);
});
