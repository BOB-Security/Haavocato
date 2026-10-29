'use strict';

const crypto = require('node:crypto');

function signSession({ userId, expiresAt }, secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new TypeError('Session secret must contain at least 32 bytes.');
  }
  if (typeof userId !== 'string' || !userId || !Number.isFinite(expiresAt)) {
    throw new TypeError('Invalid session payload.');
  }

  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: expiresAt })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return payload + '.' + signature;
}

function verifySession(token, secret, now = Date.now()) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) return null;
  if (typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const expected = crypto.createHmac('sha256', secret).update(parts[0]).digest();
  let supplied;
  try {
    supplied = Buffer.from(parts[1], 'base64url');
  } catch {
    return null;
  }
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (typeof payload.sub !== 'string' || !payload.sub || !Number.isFinite(payload.exp) || payload.exp <= now) return null;
    return { userId: payload.sub, expiresAt: payload.exp };
  } catch {
    return null;
  }
}

module.exports = { signSession, verifySession };
