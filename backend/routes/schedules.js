const express = require('express');
const router = express.Router();
const pool = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const notifModule = require('./notifications');

const MEETING_LINK_PREFIXES = [
  'https://zoom.us/',
  'https://us02web.zoom.us/',
  'https://meet.google.com/',
  'https://teams.microsoft.com/',
];
const isValidMeetingLink = (url) => MEETING_LINK_PREFIXES.some(p => url.startsWith(p));

// Professor sets their available schedules
router.post('/', authenticate, authorize('professor'), async (req, res) => {
  const { day, time_start, time_end, location, date, time_ranges, announcement, meeting_link, mode } = req.body;

  // Normalize date
  const dateValue = (typeof date === 'string' && date.trim().length >= 8)
    ? date.trim().slice(0, 10)
    : null;

  // Server-side past-date guard
  if (dateValue) {
    const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }));
    if (new Date(dateValue) < today) {
      return res.status(400).json({ error: 'Cannot create a slot in the past.' });
    }
  }
  // Derive effective time_start/time_end from first/last range for backward compat
  const trArray = Array.isArray(time_ranges) && time_ranges.length > 0 ? time_ranges : null;
  const effectiveStart = trArray ? trArray[0].time_start : time_start;
  const effectiveEnd   = trArray ? trArray[trArray.length - 1].time_end : time_end;
  const trJson = trArray ? JSON.stringify(trArray) : null;
  const announcementValue = typeof announcement === 'string' && announcement.trim() ? announcement.trim().slice(0, 300) : null;
  const slotMode = ['FF', 'OL', 'BOTH'].includes(mode) ? mode : 'FF';
  const locationValue = slotMode === 'OL' ? null : (typeof location === 'string' && location.trim() ? location.trim() : null);
  const meetingLinkValue = (slotMode === 'OL' || slotMode === 'BOTH') ? (typeof meeting_link === 'string' && meeting_link.trim() ? meeting_link.trim() : null) : null;

  if (meetingLinkValue && !isValidMeetingLink(meetingLinkValue)) {
    return res.status(400).json({ error: 'Meeting link must start with https://zoom.us/, https://meet.google.com/, or https://teams.microsoft.com/.' });
  }

  try {
    const profResult = await pool.query(
      `SELECT id FROM professors WHERE user_id = $1`,
      [req.user.id]
    );
    if (profResult.rows.length === 0) {
      return res.status(404).json({ error: 'Professor profile not found.' });
    }
    const professor_id = profResult.rows[0].id;

    const result = await pool.query(
      `INSERT INTO schedules (professor_id, day, time_start, time_end, location, date, time_ranges, announcement, meeting_link, mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
       RETURNING id, day, time_start, time_end, location, date::text AS date, time_ranges, announcement, meeting_link, mode`,
      [professor_id, day, effectiveStart, effectiveEnd, locationValue, dateValue, trJson, announcementValue, meetingLinkValue, slotMode]
    );

    // Notify all students (fire-and-forget — may be many users)
    pool.query(`SELECT full_name FROM professors WHERE id = $1`, [professor_id]).then(profRow => {
      const professorName = profRow.rows[0]?.full_name || 'A professor';
      return pool.query(`SELECT id FROM users WHERE role = 'student'`).then(students => {
        students.rows.forEach(s => notifModule.insertAndPush(
          s.id, 'new_slot',
          `${professorName} has a new available consultation slot`,
          { schedule_id: result.rows[0].id, professor_name: professorName, route: 'book' }
        ));
      });
    }).catch(() => {});

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get all schedules visible to students (only today or future dated slots)
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.day, s.time_start, s.time_end, s.is_available, s.location, s.date::text AS date,
              s.time_ranges, s.announcement, s.mode,
              p.id AS professor_id, p.full_name AS professor_name, p.department,
              u.avatar AS professor_avatar
       FROM schedules s
       JOIN professors p ON s.professor_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE (s.date IS NULL OR s.date >= CURRENT_DATE)
         AND COALESCE(p.is_available, true) = true
       ORDER BY s.date NULLS LAST, s.day, s.time_start`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Admin: view all schedules across all professors
router.get('/all', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.day, s.time_start, s.time_end, s.is_available, s.location, s.date::text AS date,
              s.time_ranges, s.announcement, s.mode,
              p.id AS professor_id, p.full_name AS professor_name, p.department
       FROM schedules s
       JOIN professors p ON s.professor_id = p.id
       ORDER BY p.full_name, s.date NULLS LAST, s.day, s.time_start`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Professor views their own schedules with upcoming booking count
router.get('/mine', authenticate, authorize('professor'), async (req, res) => {
  try {
    const profResult = await pool.query(
      `SELECT id FROM professors WHERE user_id = $1`,
      [req.user.id]
    );
    if (profResult.rows.length === 0) {
      return res.status(404).json({ error: 'Professor profile not found.' });
    }
    const professor_id = profResult.rows[0].id;

    const result = await pool.query(
      `SELECT s.id, s.professor_id, s.day, s.time_start, s.time_end, s.is_available, s.location,
              s.date::text AS date, s.time_ranges, s.announcement, s.meeting_link, s.mode,
         (SELECT COUNT(*)::int FROM consultations c
          WHERE c.schedule_id = s.id AND c.status NOT IN ('cancelled', 'rescheduled') AND c.date >= CURRENT_DATE) AS upcoming_count
       FROM schedules s
       WHERE s.professor_id = $1
       ORDER BY s.date NULLS LAST, s.time_start`,
      [professor_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Professor blocked times (class schedule) ────────────────────────────────

// Get blocked times for the logged-in professor
router.get('/blocked', authenticate, authorize('professor'), async (req, res) => {
  try {
    const profResult = await pool.query(`SELECT id FROM professors WHERE user_id = $1`, [req.user.id]);
    if (profResult.rows.length === 0) return res.status(404).json({ error: 'Professor not found.' });
    const professor_id = profResult.rows[0].id;
    const result = await pool.query(
      `SELECT id, day_of_week, specific_date::text AS specific_date,
              start_time, end_time, label
       FROM professor_blocked_times
       WHERE professor_id = $1
       ORDER BY day_of_week NULLS LAST, specific_date NULLS LAST, start_time`,
      [professor_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Add a blocked time
router.post('/blocked', authenticate, authorize('professor'), async (req, res) => {
  const { day_of_week, specific_date, start_time, end_time, label } = req.body;
  if (!start_time || !end_time) return res.status(400).json({ error: 'start_time and end_time are required.' });
  if (start_time >= end_time) return res.status(400).json({ error: 'end_time must be after start_time.' });
  if (!day_of_week && !specific_date) return res.status(400).json({ error: 'day_of_week or specific_date is required.' });
  try {
    const profResult = await pool.query(`SELECT id FROM professors WHERE user_id = $1`, [req.user.id]);
    if (profResult.rows.length === 0) return res.status(404).json({ error: 'Professor not found.' });
    const professor_id = profResult.rows[0].id;
    const result = await pool.query(
      `INSERT INTO professor_blocked_times (professor_id, day_of_week, specific_date, start_time, end_time, label)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, day_of_week, specific_date::text AS specific_date, start_time, end_time, label`,
      [professor_id, day_of_week || null, specific_date || null, start_time, end_time, label || 'Class']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Remove a blocked time
router.delete('/blocked/:id', authenticate, authorize('professor'), async (req, res) => {
  const { id } = req.params;
  try {
    const profResult = await pool.query(`SELECT id FROM professors WHERE user_id = $1`, [req.user.id]);
    if (profResult.rows.length === 0) return res.status(404).json({ error: 'Professor not found.' });
    const professor_id = profResult.rows[0].id;
    const check = await pool.query(`SELECT professor_id FROM professor_blocked_times WHERE id = $1`, [id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Blocked time not found.' });
    if (check.rows[0].professor_id !== professor_id) return res.status(403).json({ error: 'Not your blocked time.' });
    await pool.query(`DELETE FROM professor_blocked_times WHERE id = $1`, [id]);
    res.json({ message: 'Removed.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Booked + blocked times for a schedule slot on a given date ───────────────

// Return booked slot info and professor-blocked times for a schedule on a given date.
// Response: { booked: { "HH:MM": { booked_count, first_topic } }, blocked: ["HH:MM", ...] }
// Booked slots are joinable; blocked slots are hard-unavailable (professor class schedule).
router.get('/:id/booked-times', authenticate, async (req, res) => {
  const { id } = req.params;
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date is required.' });
  try {
    // Aggregate bookings per time slot — count and all topics
    const bookedResult = await pool.query(
      `SELECT
         time,
         COUNT(*)::int AS booked_count,
         array_agg(nature_of_advising ORDER BY id ASC) AS all_topics
       FROM consultations
       WHERE schedule_id = $1 AND date = $2 AND status IN ('pending', 'confirmed') AND time IS NOT NULL
       GROUP BY time`,
      [id, date]
    );

    const booked = {};
    for (const row of bookedResult.rows) {
      const t = (row.time || '').slice(0, 5);
      // Flatten: each nature_of_advising may be a JSON array string — extract all items
      const topics = [];
      for (const raw of (row.all_topics || [])) {
        if (typeof raw === 'string' && raw.startsWith('[')) {
          try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) arr.forEach(v => v && topics.push(String(v)));
          } catch {}
        } else if (raw) {
          topics.push(String(raw));
        }
      }
      booked[t] = { booked_count: row.booked_count, topics };
    }

    // Get professor for this schedule
    const schedResult = await pool.query(`SELECT professor_id FROM schedules WHERE id = $1`, [id]);
    if (schedResult.rows.length === 0) return res.json({ booked, blocked: [] });
    const professor_id = schedResult.rows[0].professor_id;

    // Determine day of week for the date
    const d = new Date(date + 'T12:00:00');
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dayOfWeek = days[d.getDay()];

    // Get professor-blocked ranges for that day or specific date
    const blockedResult = await pool.query(
      `SELECT start_time, end_time FROM professor_blocked_times
       WHERE professor_id = $1 AND (day_of_week = $2 OR specific_date::text = $3)`,
      [professor_id, dayOfWeek, date]
    );

    // Expand blocked ranges into 30-min slots
    const toMins = t => { const [h, m] = t.slice(0, 5).split(':').map(Number); return h * 60 + m; };
    const blockedSet = new Set();
    for (const b of blockedResult.rows) {
      for (let t = toMins(b.start_time); t < toMins(b.end_time); t += 30) {
        blockedSet.add(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
      }
    }

    res.json({ booked, blocked: [...blockedSet] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Professor edits their own schedule slot
router.patch('/:id', authenticate, authorize('professor'), async (req, res) => {
  const { id } = req.params;
  const { day, time_start, time_end, location, date, time_ranges, announcement, meeting_link, mode } = req.body;

  const dateValue = (typeof date === 'string' && date.trim().length >= 8)
    ? date.trim().slice(0, 10)
    : null;
  const trArray = Array.isArray(time_ranges) && time_ranges.length > 0 ? time_ranges : null;
  const effectiveStart = trArray ? trArray[0].time_start : time_start;
  const effectiveEnd   = trArray ? trArray[trArray.length - 1].time_end : time_end;
  const trJson = trArray ? JSON.stringify(trArray) : null;
  const announcementValue = typeof announcement === 'string' && announcement.trim() ? announcement.trim().slice(0, 300) : null;
  const slotMode = ['FF', 'OL', 'BOTH'].includes(mode) ? mode : 'FF';
  const locationValue = slotMode === 'OL' ? null : (typeof location === 'string' && location.trim() ? location.trim() : null);
  const meetingLinkValue = (slotMode === 'OL' || slotMode === 'BOTH') ? (typeof meeting_link === 'string' && meeting_link.trim() ? meeting_link.trim() : null) : null;

  if (meetingLinkValue && !isValidMeetingLink(meetingLinkValue)) {
    return res.status(400).json({ error: 'Meeting link must start with https://zoom.us/, https://meet.google.com/, or https://teams.microsoft.com/.' });
  }

  if (!day || !effectiveStart || !effectiveEnd) {
    return res.status(400).json({ error: 'day and at least one time range are required.' });
  }

  // Server-side past-date guard
  if (dateValue) {
    const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }));
    if (new Date(dateValue) < today) {
      return res.status(400).json({ error: 'Cannot move a slot to a date in the past.' });
    }
  }

  try {
    const profResult = await pool.query(
      `SELECT id FROM professors WHERE user_id = $1`, [req.user.id]
    );
    if (profResult.rows.length === 0) {
      return res.status(404).json({ error: 'Professor profile not found.' });
    }
    const professor_id = profResult.rows[0].id;

    const schedResult = await pool.query(
      `SELECT professor_id FROM schedules WHERE id = $1`, [id]
    );
    if (schedResult.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found.' });
    }
    if (schedResult.rows[0].professor_id !== professor_id) {
      return res.status(403).json({ error: 'You can only edit your own schedules.' });
    }

    // Check active bookings whose dates no longer match the new day
    const bookings = await pool.query(
      `SELECT c.date FROM consultations c
       WHERE c.schedule_id = $1 AND c.status NOT IN ('cancelled', 'rescheduled') AND c.date >= CURRENT_DATE`,
      [id]
    );

    const DAY_MAP = {
      Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
      Thursday: 4, Friday: 5, Saturday: 6,
    };
    const newDayNum = DAY_MAP[day];
    for (const row of bookings.rows) {
      const d = new Date(row.date);
      if (d.getDay() !== newDayNum) {
        return res.status(400).json({
          error: `Cannot change day to ${day} — existing booking on ${new Date(row.date).toLocaleDateString()} would conflict.`,
        });
      }
    }

    const result = await pool.query(
      `UPDATE schedules
       SET day = $1, time_start = $2, time_end = $3, location = $4, date = $5, time_ranges = $6::jsonb, announcement = $8, meeting_link = $9, mode = $10
       WHERE id = $7
       RETURNING id, day, time_start, time_end, location, date::text AS date, time_ranges, announcement, meeting_link, mode`,
      [day, effectiveStart, effectiveEnd, locationValue, dateValue, trJson, id, announcementValue, meetingLinkValue, slotMode]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Professor deletes their own schedule slot
router.delete('/:id', authenticate, authorize('professor'), async (req, res) => {
  const { id } = req.params;
  try {
    const profResult = await pool.query(
      `SELECT id FROM professors WHERE user_id = $1`, [req.user.id]
    );
    if (profResult.rows.length === 0) {
      return res.status(404).json({ error: 'Professor profile not found.' });
    }
    const professor_id = profResult.rows[0].id;

    const schedResult = await pool.query(
      `SELECT professor_id FROM schedules WHERE id = $1`, [id]
    );
    if (schedResult.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found.' });
    }
    if (schedResult.rows[0].professor_id !== professor_id) {
      return res.status(403).json({ error: 'You can only delete your own schedules.' });
    }

    await pool.query(`DELETE FROM schedules WHERE id = $1`, [id]);
    res.json({ message: 'Schedule deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
