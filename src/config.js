'use strict';

function parseConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test, or production.');
  }

  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  const sessionSecret = env.SESSION_SECRET || '';
  if (nodeEnv === 'production' && Buffer.byteLength(sessionSecret, 'utf8') < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 bytes in production.');
  }

  const publicOrigin = env.PUBLIC_ORIGIN || '';
  if (nodeEnv === 'production') {
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required in production.');
    if (!publicOrigin) throw new Error('PUBLIC_ORIGIN is required in production.');
    let parsedOrigin;
    try { parsedOrigin = new URL(publicOrigin); } catch { throw new Error('PUBLIC_ORIGIN must be a valid absolute URL.'); }
    if (parsedOrigin.protocol !== 'https:' || parsedOrigin.origin !== publicOrigin.replace(/\/$/, '')) {
      throw new Error('PUBLIC_ORIGIN must be a canonical HTTPS origin without a path.');
    }
  }

  const maxRequestBodyBytes = Number(env.MAX_REQUEST_BODY_BYTES || 262144);
  if (!Number.isSafeInteger(maxRequestBodyBytes) || maxRequestBodyBytes < 1024 || maxRequestBodyBytes > 5 * 1024 * 1024) {
    throw new Error('MAX_REQUEST_BODY_BYTES must be between 1024 and 5242880.');
  }

  return Object.freeze({
    nodeEnv,
    port,
    databaseUrl: env.DATABASE_URL || '',
    sessionSecret,
    publicOrigin,
    cookieSecure: nodeEnv === 'production',
    trustProxy: env.TRUST_PROXY === 'true',
    maxRequestBodyBytes,
  });
}

module.exports = { parseConfig };
