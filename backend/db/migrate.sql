-- Migration: add missing columns to existing databases
-- Safe to run multiple times (IF NOT EXISTS guards)

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS nature_of_advising_specify TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS uploaded_form_path VARCHAR(255);
ALTER TABLE consultation_details ADD COLUMN IF NOT EXISTS referral_specify TEXT;

-- Add rescheduled + missed status to consultations
ALTER TABLE consultations DROP CONSTRAINT IF EXISTS consultations_status_check;
ALTER TABLE consultations ADD CONSTRAINT consultations_status_check
  CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'missed'));

-- Add location to schedules (for F2F meeting rooms)
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS location TEXT;

-- Add meeting_link to consultations (for online sessions)
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS meeting_link TEXT;

-- Add account approval system to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE;
-- Approve all pre-existing accounts (they existed before approval was introduced)
UPDATE users SET is_approved = TRUE WHERE is_approved IS NULL OR is_approved = FALSE;

-- Add profile fields to students
ALTER TABLE students ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE students ADD COLUMN IF NOT EXISTS phone VARCHAR(50);

-- Add profile fields to professors
ALTER TABLE professors ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE professors ADD COLUMN IF NOT EXISTS phone VARCHAR(50);

-- Add specific date to schedule slots (professor picks an exact date, not a recurring day)
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS date DATE;

-- Add student-chosen consultation time within the professor's availability window
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS time TIME;

-- Add multiple time ranges per schedule slot (JSONB array of {time_start, time_end})
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS time_ranges JSONB;

-- Admin-managed calendar overrides (exam weeks, mode overrides, blocked dates)
CREATE TABLE IF NOT EXISTS calendar_overrides (
  id          SERIAL PRIMARY KEY,
  type        VARCHAR(20) NOT NULL
                CHECK (type IN ('exam_week', 'mode_override', 'blocked_date')),
  date        DATE,
  week_number INTEGER,
  value       VARCHAR(50),
  label       TEXT,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Login lockout: track failed attempts and lockout expiry
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;

-- Password reset token (stored in DB, emailed to user, expires in 1 hour)
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;

-- Chatbot: store professor concern-ownership mappings
CREATE TABLE IF NOT EXISTS professor_responsibilities (
  id SERIAL PRIMARY KEY,
  professor_id INTEGER REFERENCES professors(id) ON DELETE CASCADE,
  concern_type VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add date_label type to calendar_overrides (per-date event notes)
ALTER TABLE calendar_overrides DROP CONSTRAINT IF EXISTS calendar_overrides_type_check;
ALTER TABLE calendar_overrides ADD CONSTRAINT calendar_overrides_type_check
  CHECK (type IN ('exam_week', 'mode_override', 'blocked_date', 'date_label'));

-- Add color to calendar_overrides (for date_label event color)
ALTER TABLE calendar_overrides ADD COLUMN IF NOT EXISTS color VARCHAR(20);

-- Account deactivation (soft-disable without deleting)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Professor cancel reason (why the professor cancelled the consultation)
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- Remove duplicate active bookings, keeping the earliest per (student, professor, date, time)
DELETE FROM consultations a
USING consultations b
WHERE a.id > b.id
  AND a.student_id = b.student_id
  AND a.professor_id = b.professor_id
  AND a.date = b.date
  AND a.time IS NOT DISTINCT FROM b.time
  AND a.status IN ('pending', 'confirmed', 'rescheduled');

-- Prevent a student from submitting the same booking twice (race condition / double-click)
CREATE UNIQUE INDEX IF NOT EXISTS uq_consultation_active
  ON consultations (student_id, professor_id, date, time)
  WHERE status IN ('pending', 'confirmed', 'rescheduled');


-- Student notes on consultation bookings
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS notes TEXT;

-- Student-expressed preferred mode for BOTH slots (F2F or OL; null for non-BOTH slots)
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS preferred_mode VARCHAR(3);

-- Announcement text on individual consultation slots (optional professor note to students)
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS announcement TEXT;

-- Meeting link on schedule slots (for online consultation slots, set at creation/edit time)
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS meeting_link TEXT;

-- Mode column on schedule slots (FF=Face-to-Face, OL=Online, BOTH=Both)
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS mode VARCHAR(10);
UPDATE schedules SET mode = 'OL' WHERE location = 'Online Only' AND mode IS NULL;
UPDATE schedules SET mode = 'FF' WHERE mode IS NULL;
UPDATE schedules SET location = NULL WHERE location = 'Online Only';

-- Term archive: track academic term context and soft-archive flag per consultation
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS academic_term TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS academic_year TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

-- In-session flag: professor marks consultation as actively in progress
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS in_session BOOLEAN DEFAULT FALSE;

-- Session start timestamp: survives page refreshes so the timer resumes from the correct elapsed time
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS session_started_at TIMESTAMPTZ;

-- Announcements: admin-managed notices shown on all dashboards
CREATE TABLE IF NOT EXISTS announcements (
  id         SERIAL PRIMARY KEY,
  title      VARCHAR(255) NOT NULL,
  body       TEXT NOT NULL,
  type       VARCHAR(20) DEFAULT 'info' CHECK (type IN ('info', 'warning')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
