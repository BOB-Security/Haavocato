'use strict';

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const publicDir = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: isProduction ? [] : null
    }
  }
}));
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(express.static(publicDir, { extensions: ['html'], maxAge: isProduction ? '1h' : 0 }));

const consultationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'محاولات كثيرة. حاول مرة أخرى بعد قليل.' }
});

let pool = null;
let databaseReady = false;

async function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL is not configured; consultation submission is disabled.');
    return;
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : undefined,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS consultation_requests (
      id BIGSERIAL PRIMARY KEY,
      full_name VARCHAR(120) NOT NULL,
      email VARCHAR(254) NOT NULL,
      phone VARCHAR(40) NOT NULL,
      service VARCHAR(120) NOT NULL,
      details TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'reviewing', 'contacted', 'closed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  databaseReady = true;
  console.log('PostgreSQL initialized.');
}

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'haavocato',
    database: databaseReady ? 'ready' : 'not-configured'
  });
});

app.post('/api/consultations', consultationLimiter, async (req, res) => {
  const fullName = String(req.body.fullName || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const phone = String(req.body.phone || '').trim();
  const service = String(req.body.service || '').trim();
  const details = String(req.body.details || '').trim();

  if (!fullName || fullName.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      !phone || phone.length > 40 ||
      !service || service.length > 120 ||
      !details || details.length > 4000) {
    return res.status(400).json({ error: 'راجع البيانات المطلوبة وحاول مرة أخرى.' });
  }

  if (!databaseReady || !pool) {
    return res.status(503).json({
      error: 'استقبال الطلبات غير متاح مؤقتًا حتى يتم إعداد قاعدة البيانات.'
    });
  }

  try {
    const result = await pool.query(
      'INSERT INTO consultation_requests (full_name, email, phone, service, details) VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at',
      [fullName, email, phone, service, details]
    );
    return res.status(201).json({
      message: 'تم استلام طلبك بنجاح. سيتواصل معك فريقنا.',
      reference: String(result.rows[0].id)
    });
  } catch (error) {
    console.error('Consultation request could not be saved:', error.message);
    return res.status(500).json({ error: 'تعذر حفظ الطلب حاليًا. حاول لاحقًا.' });
  }
});

app.get('*splat', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

async function start() {
  try {
    await initializeDatabase();
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    process.exitCode = 1;
    return;
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Haavocato listening on port ${port}`);
  });
}

start();

process.on('SIGTERM', async () => {
  if (pool) await pool.end();
  process.exit(0);
});
