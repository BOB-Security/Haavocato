'use strict';

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createAuthRouter } = require('./routes/auth');
const { createAccountRouter } = require('./routes/account');
const { createPublicRequestRouter } = require('./routes/public-requests');
const { createPublicServicesRouter } = require('./routes/public-services');
const { createAdminRequestRouter } = require('./routes/admin-requests');
const { createClientRequestRouter } = require('./routes/client-requests');
const { createAppointmentRouter } = require('./routes/appointments');
const { createAdminAppointmentRouter } = require('./routes/admin-appointments');
const { createAdminStaffRouter } = require('./routes/admin-staff');
const { createPaymentRouter } = require('./routes/payments');

function createApp({ pool, config }) {
  if (!pool || !config) throw new TypeError('Database pool and validated config are required.');
  const app = express();
  const publicDir = path.join(__dirname, '..', 'platform', 'public');

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
    if (!origin) return next();
    if (!config.publicOrigin) return res.status(403).json({ error: 'Request origin is not configured.' });
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

  app.use('/api/account', createAccountRouter(pool, config));
  app.use('/api/auth', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  }), createAuthRouter(pool, config));
  app.use('/api/services', createPublicServicesRouter(pool));
  app.use('/api/requests', createPublicRequestRouter(pool));
  app.use('/api/admin/requests', createAdminRequestRouter(pool));
  app.use('/api/client/requests', createClientRequestRouter(pool));
  app.use('/api/appointments', createAppointmentRouter(pool));
  app.use('/api/admin/appointments', createAdminAppointmentRouter(pool));
  app.use('/api/admin/staff', createAdminStaffRouter(pool));
  app.use('/api/payments', createPaymentRouter(pool));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));

  app.get('/admin', (_req, res) => res.sendFile(path.join(publicDir, 'admin.html')));
  app.get('/about', (_req, res) => res.sendFile(path.join(publicDir, 'about.html')));
  app.get('/services', (_req, res) => res.sendFile(path.join(publicDir, 'services.html')));
  app.get('/partners', (_req, res) => res.sendFile(path.join(publicDir, 'partners.html')));
  app.get('/insights', (_req, res) => res.sendFile(path.join(publicDir, 'insights.html')));
  app.get('/contact', (_req, res) => res.sendFile(path.join(publicDir, 'contact.html')));
  app.get('/portal', (_req, res) => res.sendFile(path.join(publicDir, 'portal.html')));
  app.get('/verify-email', (_req, res) => res.sendFile(path.join(publicDir, 'verify-email.html')));
  app.get('/reset-password', (_req, res) => res.sendFile(path.join(publicDir, 'reset-password.html')));
  app.use(express.static(publicDir, { index: 'index.html', maxAge: config.nodeEnv === 'production' ? '1h' : 0 }));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

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
