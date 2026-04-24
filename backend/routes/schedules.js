const express = require('express');
const router = express.Router();
const pool = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// Professor sets their available schedules
router.post('/', authenticate, authorize('professor'), async (req, res) => {
  const { day, time_start, time_end } = req.body;

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
      `INSERT INTO schedules (professor_id, day, time_start, time_end)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [professor_id, day, time_start, time_end]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get all available schedules (students can view this)
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.day, s.time_start, s.time_end, s.is_available,
              p.id AS professor_id, p.full_name AS professor_name, p.department
       FROM schedules s
       JOIN professors p ON s.professor_id = p.id
       WHERE s.is_available = true
       ORDER BY s.day, s.time_start`
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
      `SELECT s.id, s.day, s.time_start, s.time_end, s.is_available,
              p.id AS professor_id, p.full_name AS professor_name, p.department
       FROM schedules s
       JOIN professors p ON s.professor_id = p.id
       ORDER BY p.full_name, s.day, s.time_start`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Professor views their own schedules (all, including booked)
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
      `SELECT * FROM schedules WHERE professor_id = $1 ORDER BY day, time_start`,
      [professor_id]
    );

    res.json(result.rows);
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
      `SELECT id FROM professors WHERE user_id = $1`,
      [req.user.id]
    );

    if (profResult.rows.length === 0) {
      return res.status(404).json({ error: 'Professor profile not found.' });
    }

    const professor_id = profResult.rows[0].id;

    const schedResult = await pool.query(
      `SELECT professor_id FROM schedules WHERE id = $1`,
      [id]
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
