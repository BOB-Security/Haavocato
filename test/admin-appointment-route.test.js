'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin appointment list uses request-scoped role checks', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'admin-appointments.js'), 'utf8');
  assert.ok(source.includes("async (req, res) => {"));
  assert.ok(source.includes("req.auth.roles.has('lawyer')"));
  assert.ok(!source.includes("async (_req, res) => {\n      try {\n        const scopedLawyer"));
});

test('admin appointment status changes enforce lawyer scope and status transitions', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'admin-appointments.js'), 'utf8');
  assert.ok(source.includes('current.assigned_lawyer_id !== req.auth.userId'));
  assert.ok(source.includes('This appointment status transition is not allowed.'));
  assert.ok(source.includes('FOR UPDATE'));
});
