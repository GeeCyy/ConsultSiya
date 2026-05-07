const express = require('express');
const router = express.Router();
const pool = require('../db/db');
const { authenticate } = require('../middleware/auth.middleware');

// GET /api/calendar
// Returns all active calendar overrides (blocked dates, exam weeks, mode overrides)
// Accessible to all authenticated users for display in booking UIs
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, type, date::text AS date, week_number, value, label, created_at
       FROM calendar_overrides
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/calendar/blocked-dates
// Returns only blocked dates (holidays, no-consultation days)
router.get('/blocked-dates', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, date::text AS date, label, created_at
       FROM calendar_overrides
       WHERE type = 'blocked_date'
       ORDER BY date ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/calendar/exam-weeks
// Returns all exam week overrides
router.get('/exam-weeks', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, week_number, value, label, created_at
       FROM calendar_overrides
       WHERE type = 'exam_week'
       ORDER BY week_number ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/calendar/consultations?month=YYYY-MM
// Returns all consultations for a given month, grouped by date
// Each role sees only what they're allowed to see
router.get('/consultations', authenticate, async (req, res) => {
  const { month } = req.query; // e.g. "2026-04"
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'month query param required in YYYY-MM format.' });
  }
  const [year, mon] = month.split('-');

  try {
    let result;

    if (req.user.role === 'professor') {
      const prof = await pool.query(`SELECT id FROM professors WHERE user_id = $1`, [req.user.id]);
      if (prof.rows.length === 0) return res.status(404).json({ error: 'Professor profile not found.' });
      result = await pool.query(
        `SELECT c.id, c.date::text AS date, c.status, c.mode,
                s.full_name AS student_name, s.student_number
         FROM consultations c
         JOIN students s ON c.student_id = s.id
         WHERE c.professor_id = $1
           AND EXTRACT(YEAR FROM c.date) = $2
           AND EXTRACT(MONTH FROM c.date) = $3
           AND c.status != 'cancelled'
         ORDER BY c.date ASC`,
        [prof.rows[0].id, year, mon]
      );
    } else if (req.user.role === 'student') {
      const student = await pool.query(`SELECT id FROM students WHERE user_id = $1`, [req.user.id]);
      if (student.rows.length === 0) return res.status(404).json({ error: 'Student profile not found.' });
      result = await pool.query(
        `SELECT c.id, c.date::text AS date, c.status, c.mode,
                p.full_name AS professor_name
         FROM consultations c
         JOIN professors p ON c.professor_id = p.id
         WHERE c.student_id = $1
           AND EXTRACT(YEAR FROM c.date) = $2
           AND EXTRACT(MONTH FROM c.date) = $3
         ORDER BY c.date ASC`,
        [student.rows[0].id, year, mon]
      );
    } else {
      // Admin sees all
      result = await pool.query(
        `SELECT c.id, c.date::text AS date, c.status, c.mode,
                s.full_name AS student_name, p.full_name AS professor_name
         FROM consultations c
         JOIN students s ON c.student_id = s.id
         JOIN professors p ON c.professor_id = p.id
         WHERE EXTRACT(YEAR FROM c.date) = $1
           AND EXTRACT(MONTH FROM c.date) = $2
           AND c.status != 'cancelled'
         ORDER BY c.date ASC`,
        [year, mon]
      );
    }

    // Group by date
    const grouped = {};
    for (const row of result.rows) {
      if (!grouped[row.date]) grouped[row.date] = [];
      grouped[row.date].push(row);
    }

    res.json(grouped);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
