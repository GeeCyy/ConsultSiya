-- Settings migration: profile pictures, notification preferences, system config
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT guards throughout)

-- Avatar URL stored on the users row (accessible for all roles)
-- Also added automatically at server startup — this file is for manual runs.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;

-- Per-user notification preferences (one row per user, upserted on save)
CREATE TABLE IF NOT EXISTS user_settings (
  id                      SERIAL PRIMARY KEY,
  user_id                 INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  email_booking_confirmed BOOLEAN DEFAULT TRUE,
  email_booking_cancelled BOOLEAN DEFAULT TRUE,
  email_upcoming_reminder BOOLEAN DEFAULT TRUE,
  inapp_booking_confirmed BOOLEAN DEFAULT TRUE,
  inapp_booking_cancelled BOOLEAN DEFAULT TRUE,
  inapp_upcoming_reminder BOOLEAN DEFAULT TRUE,
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Admin-managed system configuration (key-value store)
CREATE TABLE IF NOT EXISTS system_settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default system settings (skip if already exist)
INSERT INTO system_settings (key, value) VALUES
  ('maintenance_mode',         'false'),
  ('max_bookings_per_student', '5'),
  ('academic_year',            '2025-2026'),
  ('current_semester',         '2nd Semester')
ON CONFLICT (key) DO NOTHING;
