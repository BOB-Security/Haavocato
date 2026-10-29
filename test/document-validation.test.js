'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { safeFilename, validateFile } = require('../src/routes/documents');

test('accepts a PDF whose extension, MIME type, and signature agree', () => {
  const buffer = Buffer.from('%PDF-1.7\nfixture');
  assert.equal(validateFile({ originalname: 'brief.pdf', mimetype: 'application/pdf', buffer, size: buffer.length }), true);
});

test('rejects a renamed executable or mismatched file signature', () => {
  const buffer = Buffer.from('MZ-not-a-pdf');
  assert.equal(validateFile({ originalname: 'brief.pdf', mimetype: 'application/pdf', buffer, size: buffer.length }), false);
});

test('rejects unsupported file extensions and oversized payload metadata', () => {
  const buffer = Buffer.from('%PDF-1.7');
  assert.equal(validateFile({ originalname: 'brief.exe', mimetype: 'application/pdf', buffer, size: buffer.length }), false);
  assert.equal(validateFile({ originalname: 'brief.pdf', mimetype: 'application/pdf', buffer, size: 10 * 1024 * 1024 + 1 }), false);
});

test('sanitizes path separators and line breaks from uploaded filenames', () => {
  const name = safeFilename('../../client\\\nfile.pdf');
  assert.equal(name.includes('/'), false);
  assert.equal(name.includes('\\'), false);
  assert.equal(name.includes('\n'), false);
  assert.ok(name.endsWith('.pdf'));
});

test('document scan status and its audit event share one database transaction', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'documents.js'), 'utf8');
  const start = source.indexOf('function createDocumentScanWebhook');
  const end = source.indexOf('module.exports', start);
  assert.ok(start >= 0 && end > start, 'scan webhook must exist');
  const webhook = source.slice(start, end);
  const begin = webhook.indexOf("client.query('BEGIN')");
  const update = webhook.indexOf('UPDATE private_documents SET scan_status');
  const audit = webhook.indexOf('INSERT INTO audit_events');
  const commit = webhook.indexOf("client.query('COMMIT')");
  assert.ok(begin >= 0 && update > begin);
  assert.ok(audit > update && commit > audit);
  assert.match(webhook, /if\s*\(client\s*&&\s*transactionStarted\)\s*await client\.query\('ROLLBACK'\)/);
});
