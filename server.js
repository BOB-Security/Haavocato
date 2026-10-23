'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const publicDir = path.join(__dirname, 'public');
const ADMIN_COOKIE = 'haavocato_admin';
const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000;

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
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'محاولات دخول كثيرة. انتظر 15 دقيقة ثم حاول مرة أخرى.' }
});

let pool = null;
let databaseReady = false;

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function adminConfigReady() {
  return Boolean(
    process.env.ADMIN_USERNAME &&
    process.env.ADMIN_PASSWORD &&
    process.env.ADMIN_SESSION_SECRET &&
    process.env.ADMIN_SESSION_SECRET.length >= 32
  );
}

function signSession(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET)
    .update(encoded).digest('base64url');
  return encoded + '.' + signature;
}

function verifySession(token) {
  if (!adminConfigReady() || typeof token !== 'string' || token.length > 2048) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const expected = crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET)
    .update(parts[0]).digest('base64url');
  if (!safeEqual(parts[1], expected)) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return payload.user === process.env.ADMIN_USERNAME &&
      Number.isFinite(payload.exp) && payload.exp > Date.now();
  } catch {
    return false;
  }
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const entry of header.split(';')) {
    const index = entry.indexOf('=');
    if (index < 0) continue;
    if (entry.slice(0, index).trim() === name) return entry.slice(index + 1).trim();
  }
  return '';
}

function setAdminCookie(res, token) {
  res.setHeader('Set-Cookie',
    ADMIN_COOKIE + '=' + token +
    '; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=28800' +
    (isProduction ? '; Secure' : '')
  );
}

function clearAdminCookie(res) {
  res.setHeader('Set-Cookie',
    ADMIN_COOKIE + '=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0' +
    (isProduction ? '; Secure' : '')
  );
}

function requireAdmin(req, res, next) {
  if (!verifySession(readCookie(req, ADMIN_COOKIE))) {
    return res.status(401).json({ error: 'انتهت الجلسة أو يلزم تسجيل الدخول مرة أخرى.' });
  }
  next();
}

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'haavocato',
    database: databaseReady ? 'ready' : 'not-configured'
  });
});

app.post('/api/admin/login', adminLoginLimiter, (req, res) => {
  if (!adminConfigReady()) {
    return res.status(503).json({
      error: 'إعدادات لوحة الإدارة غير مكتملة. أضف ADMIN_USERNAME وADMIN_PASSWORD وADMIN_SESSION_SECRET في إعدادات Azure.'
    });
  }
  const username = String(req.body.username || '');
  const password = String(req.body.password || '');
  if (!safeEqual(username, process.env.ADMIN_USERNAME) ||
      !safeEqual(password, process.env.ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
  }
  const token = signSession({
    user: process.env.ADMIN_USERNAME,
    exp: Date.now() + ADMIN_SESSION_MS
  });
  setAdminCookie(res, token);
  return res.json({ ok: true, message: 'تم تسجيل الدخول.' });
});

app.post('/api/admin/logout', (_req, res) => {
  clearAdminCookie(res);
  res.json({ ok: true });
});

app.get('/api/admin/consultations', requireAdmin, async (_req, res) => {
  if (!databaseReady || !pool) {
    return res.status(503).json({
      error: 'قاعدة البيانات غير متصلة. أضف DATABASE_URL في إعدادات Azure قبل عرض الطلبات.'
    });
  }
  try {
    const result = await pool.query(
      'SELECT id, full_name, email, phone, service, details, status, created_at FROM consultation_requests ORDER BY created_at DESC LIMIT 500'
    );
    return res.json({ requests: result.rows });
  } catch (error) {
    console.error('Admin consultation list failed:', error.message);
    return res.status(500).json({ error: 'تعذر تحميل الطلبات حاليًا.' });
  }
});

app.patch('/api/admin/consultations/:id/status', requireAdmin, async (req, res) => {
  if (!databaseReady || !pool) {
    return res.status(503).json({ error: 'قاعدة البيانات غير متصلة.' });
  }
  const id = String(req.params.id || '');
  const status = String(req.body.status || '');
  if (!/^\\d{1,18}$/.test(id) || !['new', 'reviewing', 'contacted', 'closed'].includes(status)) {
    return res.status(400).json({ error: 'رقم الطلب أو الحالة غير صالحين.' });
  }
  try {
    const result = await pool.query(
      'UPDATE consultation_requests SET status = $1 WHERE id = $2 RETURNING id, status',
      [status, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'الطلب غير موجود.' });
    return res.json({ ok: true, request: result.rows[0] });
  } catch (error) {
    console.error('Admin consultation status update failed:', error.message);
    return res.status(500).json({ error: 'تعذر تحديث حالة الطلب.' });
  }
});

app.post('/api/consultations', consultationLimiter, async (req, res) => {
  const fullName = String(req.body.fullName || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const phone = String(req.body.phone || '').trim();
  const service = String(req.body.service || '').trim();
  const details = String(req.body.details || '').trim();

  if (!fullName || fullName.length > 120 ||
      !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || email.length > 254 ||
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

start();

process.on('SIGTERM', async () => {
  if (pool) await pool.end();
  process.exit(0);
});
