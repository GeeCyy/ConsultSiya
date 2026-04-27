-- Migration: add missing columns to existing databases
-- Safe to run multiple times (IF NOT EXISTS guards)

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS nature_of_advising_specify TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS uploaded_form_path VARCHAR(255);
ALTER TABLE consultation_details ADD COLUMN IF NOT EXISTS referral_specify TEXT;

-- Add rescheduled status to consultations
ALTER TABLE consultations DROP CONSTRAINT IF EXISTS consultations_status_check;
ALTER TABLE consultations ADD CONSTRAINT consultations_status_check
  CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'rescheduled'));

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
