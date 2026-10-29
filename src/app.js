'use strict';

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createAuthRouter } = require('./routes/auth');
const { createPublicRequestRouter } = require('./routes/public-requests');
const { createAdminRequestRouter } = require('./routes/admin-requests');

function createApp({ pool, config }) {
  if (!pool || !config) throw new TypeError('Database pool and validated config are required.');
  const app = express();

  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        upgradeInsecureRequests: config.nodeEnv === 'production' ? [] : null,
      },
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  }));

  app.use(express.json({ limit: config.maxRequestBodyBytes, strict: true }));
  app.use(express.urlencoded({ extended: false, limit: config.maxRequestBodyBytes }));

  // Browser-origin check for state-changing requests. SameSite cookies are an additional layer,
  // not a substitute for server-side authorization.
  app.use((req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (!origin) return next(); // Non-browser clients may omit Origin; authentication is still required.
    if (!config.publicOrigin) {
      return res.status(403).json({ error: 'Request origin is not configured.' });
    }
    try {
      if (new URL(origin).origin !== new URL(config.publicOrigin).origin) {
        return res.status(403).json({ error: 'Request origin is not allowed.' });
      }
    } catch {
      return res.status(403).json({ error: 'Request origin is invalid.' });
    }
    return next();
  });

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      return res.status(200).json({ status: 'ok', database: 'ready' });
    } catch {
      return res.status(503).json({ status: 'degraded', database: 'unavailable' });
    }
  });

  app.use('/api/auth', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  }), createAuthRouter(pool, config));
  app.use('/api/requests', createPublicRequestRouter(pool));
  app.use('/api/admin/requests', createAdminRequestRouter(pool));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  app.use((error, _req, res, _next) => {
    if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
    if (error instanceof SyntaxError && Object.prototype.hasOwnProperty.call(error, 'body')) {
      return res.status(400).json({ error: 'Invalid JSON request body.' });
    }
    console.error('Unhandled application error:', error?.message || 'unknown error');
    return res.status(500).json({ error: 'Unexpected server error.' });
  });

  return app;
}

module.exports = { createApp };
