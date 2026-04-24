const express = require('express');
const router = express.Router();
const pool = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// Student books a consultation
router.post('/', authenticate, authorize('student'), async (req, res) => {
  const { professor_id, schedule_id, date, nature_of_advising, nature_of_advising_specify, mode } = req.body;

  try {
    const studentResult = await pool.query(
      `SELECT id FROM students WHERE user_id = $1`,
      [req.user.id]
    );

    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student profile not found.' });
    }

    const student_id = studentResult.rows[0].id;

    const scheduleCheck = await pool.query(
      `SELECT is_available FROM schedules WHERE id = $1`,
      [schedule_id]
    );

    if (!scheduleCheck.rows[0]?.is_available) {
      return res.status(400).json({ error: 'This schedule slot is no longer available.' });
    }

    const result = await pool.query(
      `INSERT INTO consultations
       (student_id, professor_id, schedule_id, date, nature_of_advising, nature_of_advising_specify, mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [student_id, professor_id, schedule_id, date, nature_of_advising, nature_of_advising_specify || null, mode]
    );

    await pool.query(
      `UPDATE schedules SET is_available = false WHERE id = $1`,
      [schedule_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get consultations (professors see their own, students see their own, admin sees all)
router.get('/', authenticate, async (req, res) => {
  try {
    let result;

    if (req.user.role === 'professor') {
      const prof = await pool.query(
        `SELECT id FROM professors WHERE user_id = $1`, [req.user.id]
      );
      result = await pool.query(
        `SELECT c.*, s.full_name AS student_name, s.student_number,
                s.program, sch.day, sch.time_start, sch.time_end
         FROM consultations c
         JOIN students s ON c.student_id = s.id
         JOIN schedules sch ON c.schedule_id = sch.id
         WHERE c.professor_id = $1
         ORDER BY c.date DESC`,
        [prof.rows[0].id]
      );
    } else if (req.user.role === 'student') {
      const student = await pool.query(
        `SELECT id FROM students WHERE user_id = $1`, [req.user.id]
      );
      result = await pool.query(
        `SELECT c.*, p.full_name AS professor_name,
                sch.day, sch.time_start, sch.time_end
         FROM consultations c
         JOIN professors p ON c.professor_id = p.id
         JOIN schedules sch ON c.schedule_id = sch.id
         WHERE c.student_id = $1
         ORDER BY c.date DESC`,
        [student.rows[0].id]
      );
    } else {
      result = await pool.query(
        `SELECT c.*, s.full_name AS student_name, p.full_name AS professor_name,
                sch.day, sch.time_start, sch.time_end
         FROM consultations c
         JOIN students s ON c.student_id = s.id
         JOIN professors p ON c.professor_id = p.id
         JOIN schedules sch ON c.schedule_id = sch.id
         ORDER BY c.date DESC`
      );
    }

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Professor confirms a pending consultation
router.patch('/:id/confirm', authenticate, authorize('professor'), async (req, res) => {
  const { id } = req.params;

  try {
    const prof = await pool.query(
      `SELECT id FROM professors WHERE user_id = $1`, [req.user.id]
    );

    if (prof.rows.length === 0) {
      return res.status(404).json({ error: 'Professor profile not found.' });
    }

    const consultation = await pool.query(
      `SELECT professor_id, status FROM consultations WHERE id = $1`, [id]
    );

    if (consultation.rows.length === 0) {
      return res.status(404).json({ error: 'Consultation not found.' });
    }

    if (consultation.rows[0].professor_id !== prof.rows[0].id) {
      return res.status(403).json({ error: 'You can only confirm your own consultations.' });
    }

    if (consultation.rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'Only pending consultations can be confirmed.' });
    }

    const result = await pool.query(
      `UPDATE consultations SET status = 'confirmed' WHERE id = $1 RETURNING *`,
      [id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Professor or student cancels a consultation
router.patch('/:id/cancel', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const consultation = await pool.query(
      `SELECT c.professor_id, c.student_id, c.status, c.schedule_id
       FROM consultations c WHERE c.id = $1`, [id]
    );

    if (consultation.rows.length === 0) {
      return res.status(404).json({ error: 'Consultation not found.' });
    }

    const c = consultation.rows[0];

    // Verify ownership based on role
    if (req.user.role === 'professor') {
      const prof = await pool.query(
        `SELECT id FROM professors WHERE user_id = $1`, [req.user.id]
      );
      if (prof.rows.length === 0 || c.professor_id !== prof.rows[0].id) {
        return res.status(403).json({ error: 'You can only cancel your own consultations.' });
      }
    } else if (req.user.role === 'student') {
      const student = await pool.query(
        `SELECT id FROM students WHERE user_id = $1`, [req.user.id]
      );
      if (student.rows.length === 0 || c.student_id !== student.rows[0].id) {
        return res.status(403).json({ error: 'You can only cancel your own consultations.' });
      }
    } else {
      return res.status(403).json({ error: 'Admins cannot cancel consultations.' });
    }

    if (c.status === 'completed' || c.status === 'cancelled') {
      return res.status(400).json({ error: `Cannot cancel a ${c.status} consultation.` });
    }

    await pool.query(
      `UPDATE consultations SET status = 'cancelled' WHERE id = $1`,
      [id]
    );

    // Free the schedule slot
    await pool.query(
      `UPDATE schedules SET is_available = true WHERE id = $1`,
      [c.schedule_id]
    );

    res.json({ message: 'Consultation cancelled.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Professor marks consultation as completed and adds details
router.patch('/:id/complete', authenticate, authorize('professor'), async (req, res) => {
  const { id } = req.params;
  const { action_taken, referral, referral_specify, remarks } = req.body;

  try {
    const prof = await pool.query(
      `SELECT id FROM professors WHERE user_id = $1`, [req.user.id]
    );

    if (prof.rows.length === 0) {
      return res.status(404).json({ error: 'Professor profile not found.' });
    }

    const consultation = await pool.query(
      `SELECT professor_id, status FROM consultations WHERE id = $1`, [id]
    );

    if (consultation.rows.length === 0) {
      return res.status(404).json({ error: 'Consultation not found.' });
    }

    if (consultation.rows[0].professor_id !== prof.rows[0].id) {
      return res.status(403).json({ error: 'You can only complete your own consultations.' });
    }

    if (consultation.rows[0].status === 'completed') {
      return res.status(400).json({ error: 'Consultation is already completed.' });
    }

    if (consultation.rows[0].status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot complete a cancelled consultation.' });
    }

    await pool.query(
      `UPDATE consultations SET status = 'completed' WHERE id = $1`,
      [id]
    );

    const result = await pool.query(
      `INSERT INTO consultation_details
       (consultation_id, action_taken, referral, referral_specify, remarks)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, action_taken, referral || null, referral_specify || null, remarks || null]
    );

    res.json({ message: 'Consultation completed', details: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
