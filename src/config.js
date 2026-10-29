'use strict';

function required(name, env = process.env) {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

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

  return Object.freeze({
    nodeEnv,
    port,
    databaseUrl: env.DATABASE_URL || '',
    sessionSecret,
    publicOrigin: env.PUBLIC_ORIGIN || '',
    cookieSecure: nodeEnv === 'production',
    trustProxy: env.TRUST_PROXY === 'true',
    maxRequestBodyBytes: Number(env.MAX_REQUEST_BODY_BYTES || 262144),
  });
}

module.exports = { parseConfig };
