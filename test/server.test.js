'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('replacement platform entrypoint and public website exist', () => {
  const root = path.join(__dirname, '..');
  assert.ok(fs.existsSync(path.join(root, 'src', 'server.js')));
  assert.ok(fs.existsSync(path.join(root, 'src', 'app.js')));
  assert.ok(fs.existsSync(path.join(root, 'platform', 'public', 'index.html')));
  assert.ok(fs.existsSync(path.join(root, 'platform', 'public', 'site.css')));
  assert.ok(fs.existsSync(path.join(root, 'platform', 'public', 'site.js')));
});

test('replacement platform includes required public pages and workspaces', () => {
  const root = path.join(__dirname, '..', 'platform', 'public');
  for (const filename of ['about.html','services.html','partners.html','insights.html','contact.html','portal.html','admin.html','verify-email.html','reset-password.html','accept-invite.html']) {
    assert.ok(fs.existsSync(path.join(root, filename)), filename + ' should exist');
  }
});

test('client request form is wired to the replacement API', () => {
  const root = path.join(__dirname, '..', 'platform', 'public');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'site.js'), 'utf8');
  assert.match(html, /id="consultationForm"/);
  assert.match(html, /id="languageToggle"/);
  assert.match(js, /\/api\/requests/);
});
