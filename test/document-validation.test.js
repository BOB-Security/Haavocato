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
