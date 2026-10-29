'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) {
    throw new TypeError('Password must be between 12 and 200 characters.');
  }
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEY_LENGTH, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return {
    algorithm: 'scrypt',
    salt: salt.toString('base64url'),
    hash: Buffer.from(derived).toString('base64url'),
  };
}

async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || !stored || stored.algorithm !== 'scrypt') return false;
  let salt;
  let expected;
  try {
    salt = Buffer.from(stored.salt, 'base64url');
    expected = Buffer.from(stored.hash, 'base64url');
  } catch {
    return false;
  }
  if (salt.length !== SALT_BYTES || expected.length !== KEY_LENGTH) return false;
  const actual = Buffer.from(await scrypt(password, salt, KEY_LENGTH, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }));
  return crypto.timingSafeEqual(actual, expected);
}

module.exports = { hashPassword, verifyPassword };
