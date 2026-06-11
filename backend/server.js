const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const cron = require('node-cron');
require('dotenv').config();

const pool = require('./db/db');
const { authenticate } = require('./middleware/auth.middleware');
const { autoMarkMissed } = require('./routes/consultations');

const app = express();

// ── Trust Railway/Vercel proxy so rate-limiter sees real client IPs ───────────
app.set('trust proxy', 1);

// ── CORS — allow all origins ──────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

// ── Body parser + cookies ─────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ── Static uploads ─────────────────────────────────────────────────────────────
// Avatars are public-facing (profile pictures in UI) so served as static assets.
// Form uploads stay gated — authenticated access only via /api/forms/download/:id.
// Proof files are served statically; filenames include consultation ID + timestamp.
app.use('/uploads/avatars', express.static(path.join(__dirname, 'uploads/avatars')));
app.use('/uploads/proofs', express.static(path.join(__dirname, 'uploads/proofs')));

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/schedules', require('./routes/schedules'));
app.use('/api/consultations', require('./routes/consultations'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/forms', require('./routes/forms'));
app.use('/api/calendar', require('./routes/calendar'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/leaderboard', require('./routes/leaderboard'));

// ── Health checks ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Consulta API is running!' });
});

app.get('/db-health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Database unavailable' });
  }
});

// ── Protected test route ───────────────────────────────────────────────────────
app.get('/api/protected', authenticate, (req, res) => {
  res.json({ message: `Hello ${req.user.role}!`, user: req.user });
});

// ── Cron: mark missed consultations every 30 minutes (Asia/Manila) ────────────
cron.schedule('*/30 * * * *', async () => {
  const count = await autoMarkMissed();
  if (count > 0) console.log(`[cron] marked ${count} consultation(s) as missed`);
}, { timezone: 'Asia/Manila' });

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);

  // Idempotent startup migration — ensures the avatar column exists without
  // requiring a manual migration step. ALTER TABLE ADD COLUMN IF NOT EXISTS
  // is a no-op when the column already exists.
  pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT`)
    .then(() => console.log('[startup] users.avatar column ready'))
    .catch(err => console.error('[startup] users.avatar migration failed:', err.message));

  pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0`)
    .then(() => console.log('[startup] users.failed_attempts column ready'))
    .catch(err => console.error('[startup] users.failed_attempts migration failed:', err.message));

  pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ`)
    .then(() => console.log('[startup] users.locked_until column ready'))
    .catch(err => console.error('[startup] users.locked_until migration failed:', err.message));

  pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255)`)
    .then(() => console.log('[startup] users.password_reset_token column ready'))
    .catch(err => console.error('[startup] users.password_reset_token migration failed:', err.message));

  pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ`)
    .then(() => console.log('[startup] users.password_reset_expires column ready'))
    .catch(err => console.error('[startup] users.password_reset_expires migration failed:', err.message));

  pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`)
    .then(() => console.log('[startup] students.phone column ready'))
    .catch(err => console.error('[startup] students.phone migration failed:', err.message));

  pool.query(`ALTER TABLE professors ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`)
    .then(() => console.log('[startup] professors.phone column ready'))
    .catch(err => console.error('[startup] professors.phone migration failed:', err.message));

  pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS email VARCHAR(255)`)
    .then(() => console.log('[startup] students.email column ready'))
    .catch(err => console.error('[startup] students.email migration failed:', err.message));

  pool.query(`ALTER TABLE professors ADD COLUMN IF NOT EXISTS email VARCHAR(255)`)
    .then(() => console.log('[startup] professors.email column ready'))
    .catch(err => console.error('[startup] professors.email migration failed:', err.message));

  pool.query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id         SERIAL PRIMARY KEY,
      title      VARCHAR(255) NOT NULL,
      body       TEXT NOT NULL,
      type       VARCHAR(20) DEFAULT 'info' CHECK (type IN ('info', 'warning')),
      pinned     BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
    .then(() => console.log('[startup] announcements table ready'))
    .catch(err => console.error('[startup] announcements migration failed:', err.message));

  pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false`)
    .then(() => console.log('[startup] announcements.pinned column ready'))
    .catch(err => console.error('[startup] announcements.pinned migration failed:', err.message));

  pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`)
    .then(() => console.log('[startup] announcements.updated_at column ready'))
    .catch(err => console.error('[startup] announcements.updated_at migration failed:', err.message));

  pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS version VARCHAR(20)`)
    .then(() => console.log('[startup] announcements.version column ready'))
    .catch(err => console.error('[startup] announcements.version migration failed:', err.message));

  pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL`)
    .then(() => console.log('[startup] announcements.created_by column ready'))
    .catch(err => console.error('[startup] announcements.created_by migration failed:', err.message));

  pool.query(`
    CREATE TABLE IF NOT EXISTS user_calendar_notes (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date       DATE NOT NULL,
      note       TEXT NOT NULL,
      color      VARCHAR(20) NOT NULL DEFAULT 'indigo',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, date)
    )
  `)
    .then(() => console.log('[startup] user_calendar_notes table ready'))
    .catch(err => console.error('[startup] user_calendar_notes migration failed:', err.message));

  pool.query(`
    ALTER TABLE consultations DROP CONSTRAINT IF EXISTS consultations_status_check;
    ALTER TABLE consultations ADD CONSTRAINT consultations_status_check
      CHECK (status IN ('pending','confirmed','completed','cancelled','rescheduled','missed'))
  `)
    .then(() => console.log('[startup] consultations.status constraint updated (added missed)'))
    .catch(err => console.error('[startup] consultations status constraint migration failed:', err.message));

  pool.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key        VARCHAR(100) PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
    .then(() => console.log('[startup] system_settings table ready'))
    .catch(err => console.error('[startup] system_settings migration failed:', err.message));

  // Ensure calendar_overrides exists and supports ON CONFLICT (date) and (week_number) used in admin routes
  pool.query(`
    CREATE TABLE IF NOT EXISTS calendar_overrides (
      id          SERIAL PRIMARY KEY,
      type        VARCHAR(20) NOT NULL,
      date        DATE,
      week_number INTEGER,
      value       VARCHAR(50),
      label       TEXT,
      color       VARCHAR(20),
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE calendar_overrides DROP CONSTRAINT IF EXISTS calendar_overrides_type_check;
    ALTER TABLE calendar_overrides ADD CONSTRAINT calendar_overrides_type_check
      CHECK (type IN ('exam_week','mode_override','blocked_date','date_label'));
    ALTER TABLE calendar_overrides ADD COLUMN IF NOT EXISTS color VARCHAR(20);
  `)
    .then(() => console.log('[startup] calendar_overrides type/color columns ready'))
    .catch(err => console.error('[startup] calendar_overrides migration failed:', err.message));

  pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS calendar_overrides_date_unique
      ON calendar_overrides (date) WHERE date IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS calendar_overrides_week_unique
      ON calendar_overrides (week_number) WHERE week_number IS NOT NULL AND type = 'mode_override';
  `)
    .then(() => console.log('[startup] calendar_overrides unique indexes ready'))
    .catch(err => console.error('[startup] calendar_overrides index migration failed:', err.message));

  pool.query(`
    UPDATE students
    SET program = 'Others'
    WHERE program IS NOT NULL
      AND program NOT IN (
        'BS Computer Science',
        'BS Entertainment and Multimedia Computing',
        'BS Information Technology',
        'BS Information Systems',
        'BS Data Science',
        'BS Cybersecurity',
        'Others'
      )
  `)
    .then(r => r.rowCount > 0 && console.log(`[startup] migrated ${r.rowCount} student program(s) to Others`))
    .catch(err => console.error('[startup] student program migration failed:', err.message));

  pool.query(`
    UPDATE professors
    SET department = 'Others'
    WHERE department IS NOT NULL
      AND department NOT IN (
        'BS Computer Science',
        'BS Entertainment and Multimedia Computing',
        'BS Information Technology',
        'BS Information Systems',
        'BS Data Science',
        'BS Cybersecurity',
        'Others'
      )
  `)
    .then(r => r.rowCount > 0 && console.log(`[startup] migrated ${r.rowCount} professor department(s) to Others`))
    .catch(err => console.error('[startup] professor department migration failed:', err.message));

  pool.query(`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS proof_of_evidence TEXT`)
    .then(() => console.log('[startup] consultations.proof_of_evidence column ready'))
    .catch(err => console.error('[startup] consultations.proof_of_evidence migration failed:', err.message));

  pool.query(`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS proof_type TEXT`)
    .then(() => console.log('[startup] consultations.proof_type column ready'))
    .catch(err => console.error('[startup] consultations.proof_type migration failed:', err.message));

  pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type       VARCHAR(50) NOT NULL,
      message    TEXT NOT NULL,
      metadata   JSONB,
      is_read    BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications (user_id);
    CREATE INDEX IF NOT EXISTS notifications_created_idx ON notifications (created_at DESC);
  `)
    .then(() => console.log('[startup] notifications table ready'))
    .catch(err => console.error('[startup] notifications migration failed:', err.message));
});
