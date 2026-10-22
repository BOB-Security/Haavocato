'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('application entrypoint and public landing page exist', () => {
  const root = path.join(__dirname, '..');
  assert.ok(fs.existsSync(path.join(root, 'server.js')));
  assert.ok(fs.existsSync(path.join(root, 'public', 'index.html')));
  assert.ok(fs.existsSync(path.join(root, 'public', 'styles.css')));
  assert.ok(fs.existsSync(path.join(root, 'public', 'app.js')));
});

test('landing page provides consultation form and bilingual controls', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(html, /id="consultationForm"/);
  assert.match(html, /data-ar=/);
  assert.match(html, /id="languageToggle"/);
  assert.match(html, /id="details"/);
});