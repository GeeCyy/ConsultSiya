const express = require('express');
const router = express.Router();
const pool = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth.middleware');

const DAY_MAP = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

// Get fully-booked future dates for a schedule slot (all time slots taken) — for student date picker
router.get('/booked-dates', authenticate, async (req, res) => {
  const { professor_id, schedule_id } = req.query;

  if (schedule_id) {
    try {
      const schedResult = await pool.query(
        `SELECT time_start, time_end, time_ranges FROM schedules WHERE id = $1`,
        [schedule_id]
      );
      if (schedResult.rows.length === 0) return res.json([]);
      const sched = schedResult.rows[0];

      const ranges = Array.isArray(sched.time_ranges) && sched.time_ranges.length > 0
        ? sched.time_ranges
        : [{ time_start: sched.time_start, time_end: sched.time_end }];

      const timeToMins = t => {
        const [h, m] = (t || '00:00').slice(0, 5).split(':').map(Number);
        return h * 60 + (m || 0);
      };
      const totalSlots = ranges.reduce((sum, r) => {
        const start = timeToMins(r.time_start);
        const end = timeToMins(r.time_end);
        return sum + Math.max(0, Math.floor((end - start) / 30));
      }, 0);

      if (totalSlots === 0) return res.json([]);

      const result = await pool.query(
        `SELECT date::text FROM consultations
         WHERE schedule_id = $1 AND status IN ('pending', 'confirmed') AND date >= CURRENT_DATE
         GROUP BY date
         HAVING COUNT(*) >= $2`,
        [schedule_id, totalSlots]
      );
      return res.json(result.rows.map(r => r.date));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  // Legacy fallback by professor_id
  if (!professor_id) return res.status(400).json({ error: 'professor_id or schedule_id is required.' });
  try {
    const result = await pool.query(
      `SELECT DISTINCT date::text FROM consultations
       WHERE professor_id = $1 AND status IN ('pending', 'confirmed') AND date >= CURRENT_DATE`,
      [professor_id]
    );
    res.json(result.rows.map(r => r.date));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Student books a consultation
router.post('/', authenticate, authorize('student'), async (req, res) => {
  const { professor_id, schedule_id, date, time, nature_of_advising, nature_of_advising_specify, mode } = req.body;

  try {
    const studentResult = await pool.query(
      `SELECT id FROM students WHERE user_id = $1`,
      [req.user.id]
    );
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student profile not found.' });
    }
    const student_id = studentResult.rows[0].id;

    const scheduleResult = await pool.query(
      `SELECT id, day, date::text AS date, time_start, time_end, time_ranges FROM schedules WHERE id = $1`,
      [schedule_id]
    );
    if (scheduleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found.' });
    }
    const schedule = scheduleResult.rows[0];

    if (schedule.date) {
      // Slot has a specific saved date — enforce exact match
      if (date !== schedule.date) {
        return res.status(400).json({
          error: `This slot is only available on ${new Date(schedule.date + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.`,
        });
      }
    } else {
      // Legacy: validate by day-of-week
      const expectedDay = DAY_MAP[schedule.day];
      if (expectedDay !== undefined) {
        const [y, m, d] = date.split('-').map(Number);
        const selectedDate = new Date(y, m - 1, d);
        if (selectedDate.getDay() !== expectedDay) {
          return res.status(400).json({
            error: `This slot is only available on ${schedule.day}s. Please select a valid ${schedule.day}.`,
          });
        }
      }
    }

    // Validate chosen time falls within one of the schedule's time ranges
    if (time) {
      const ranges = Array.isArray(schedule.time_ranges) && schedule.time_ranges.length > 0
        ? schedule.time_ranges
        : [{ time_start: schedule.time_start, time_end: schedule.time_end }];
      const inRange = ranges.some(r => time >= r.time_start.slice(0, 5) && time < r.time_end.slice(0, 5));
      if (!inRange) {
        return res.status(400).json({ error: 'Selected time is not within the available time ranges for this slot.' });
      }
    }

    const conflictCheck = await pool.query(
      `SELECT id FROM consultations
       WHERE professor_id = $1 AND date = $2 AND time = $3 AND status IN ('pending', 'confirmed')`,
      [professor_id, date, time || null]
    );
    if (conflictCheck.rows.length > 0) {
      return res.status(400).json({ error: 'This time slot is already booked. Please choose a different time.' });
    }

    const natureValue = Array.isArray(nature_of_advising)
      ? JSON.stringify(nature_of_advising)
      : (nature_of_advising || null);

    const meeting_link = null;

    const result = await pool.query(
      `INSERT INTO consultations
       (student_id, professor_id, schedule_id, date, time, nature_of_advising, nature_of_advising_specify, mode, meeting_link)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [student_id, professor_id, schedule_id, date, time || null, natureValue, nature_of_advising_specify || null, mode, meeting_link]
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
                s.program, sch.day, sch.time_start, sch.time_end, sch.location,
                cd.action_taken, cd.referral, cd.referral_specify, cd.remarks
         FROM consultations c
         JOIN students s ON c.student_id = s.id
         JOIN schedules sch ON c.schedule_id = sch.id
         LEFT JOIN consultation_details cd ON c.id = cd.consultation_id
         WHERE c.professor_id = $1 AND c.status != 'cancelled'
         ORDER BY c.date DESC`,
        [prof.rows[0].id]
      );
    } else if (req.user.role === 'student') {
      const student = await pool.query(
        `SELECT id FROM students WHERE user_id = $1`, [req.user.id]
      );
      result = await pool.query(
        `SELECT c.*, p.full_name AS professor_name,
                sch.day, sch.time_start, sch.time_end, sch.location,
                cd.action_taken, cd.referral, cd.referral_specify, cd.remarks
         FROM consultations c
         JOIN professors p ON c.professor_id = p.id
         JOIN schedules sch ON c.schedule_id = sch.id
         LEFT JOIN consultation_details cd ON c.id = cd.consultation_id
         WHERE c.student_id = $1
         ORDER BY c.date DESC`,
        [student.rows[0].id]
      );
    } else {
      // Admin — optional role filter via ?role=student|professor
      const { role } = req.query;
      let adminQuery = `
        SELECT c.*, s.full_name AS student_name, p.full_name AS professor_name,
               s.student_number, s.program,
               sch.day, sch.time_start, sch.time_end, sch.location,
               cd.action_taken, cd.referral, cd.referral_specify, cd.remarks
        FROM consultations c
        JOIN students s ON c.student_id = s.id
        JOIN professors p ON c.professor_id = p.id
        JOIN schedules sch ON c.schedule_id = sch.id
        LEFT JOIN consultation_details cd ON c.id = cd.consultation_id
        WHERE c.status != 'cancelled'
        ORDER BY c.date DESC
      `;
      result = await pool.query(adminQuery);
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
    const prof = await pool.query(`SELECT id FROM professors WHERE user_id = $1`, [req.user.id]);
    if (prof.rows.length === 0) return res.status(404).json({ error: 'Professor profile not found.' });

    const consultation = await pool.query(`SELECT professor_id, status, mode FROM consultations WHERE id = $1`, [id]);
    if (consultation.rows.length === 0) return res.status(404).json({ error: 'Consultation not found.' });
    if (consultation.rows[0].professor_id !== prof.rows[0].id) {
      return res.status(403).json({ error: 'You can only confirm your own consultations.' });
    }
    if (consultation.rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'Only pending consultations can be confirmed.' });
    }

    const { meeting_link } = req.body;
    const link = consultation.rows[0].mode === 'OL' ? (meeting_link || null) : null;
    const result = await pool.query(
      `UPDATE consultations SET status = 'confirmed', meeting_link = $2 WHERE id = $1 RETURNING *`,
      [id, link]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Professor updates meeting link on a confirmed OL consultation
router.patch('/:id/meeting-link', authenticate, authorize('professor'), async (req, res) => {
  const { id } = req.params;
  try {
    const prof = await pool.query(`SELECT id FROM professors WHERE user_id = $1`, [req.user.id]);
    if (prof.rows.length === 0) return res.status(404).json({ error: 'Professor profile not found.' });

    const consultation = await pool.query(`SELECT professor_id, status, mode FROM consultations WHERE id = $1`, [id]);
    if (consultation.rows.length === 0) return res.status(404).json({ error: 'Consultation not found.' });
    if (consultation.rows[0].professor_id !== prof.rows[0].id) {
      return res.status(403).json({ error: 'You can only edit your own consultations.' });
    }
    if (consultation.rows[0].status !== 'confirmed') {
      return res.status(400).json({ error: 'Meeting link can only be updated on confirmed consultations.' });
    }
    if (consultation.rows[0].mode !== 'OL') {
      return res.status(400).json({ error: 'Meeting link only applies to online consultations.' });
    }

    const { meeting_link } = req.body;
    const result = await pool.query(
      `UPDATE consultations SET meeting_link = $2 WHERE id = $1 RETURNING *`,
      [id, meeting_link || null]
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
      `SELECT c.professor_id, c.student_id, c.status FROM consultations c WHERE c.id = $1`, [id]
    );
    if (consultation.rows.length === 0) return res.status(404).json({ error: 'Consultation not found.' });
    const c = consultation.rows[0];

    if (req.user.role === 'professor') {
      const prof = await pool.query(`SELECT id FROM professors WHERE user_id = $1`, [req.user.id]);
      if (prof.rows.length === 0 || c.professor_id !== prof.rows[0].id) {
        return res.status(403).json({ error: 'You can only cancel your own consultations.' });
      }
    } else if (req.user.role === 'student') {
      const student = await pool.query(`SELECT id FROM students WHERE user_id = $1`, [req.user.id]);
      if (student.rows.length === 0 || c.student_id !== student.rows[0].id) {
        return res.status(403).json({ error: 'You can only cancel your own consultations.' });
      }
    } else {
      return res.status(403).json({ error: 'Admins cannot cancel consultations.' });
    }

    if (c.status === 'completed' || c.status === 'cancelled') {
      return res.status(400).json({ error: `Cannot cancel a ${c.status} consultation.` });
    }

    await pool.query(`UPDATE consultations SET status = 'cancelled' WHERE id = $1`, [id]);
    res.json({ message: 'Consultation cancelled.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Professor marks consultation as completed with details
router.patch('/:id/complete', authenticate, authorize('professor'), async (req, res) => {
  const { id } = req.params;
  const { action_taken, referral, referral_specify, remarks } = req.body;

  try {
    const prof = await pool.query(`SELECT id FROM professors WHERE user_id = $1`, [req.user.id]);
    if (prof.rows.length === 0) return res.status(404).json({ error: 'Professor profile not found.' });

    const consultation = await pool.query(`SELECT professor_id, status FROM consultations WHERE id = $1`, [id]);
    if (consultation.rows.length === 0) return res.status(404).json({ error: 'Consultation not found.' });
    if (consultation.rows[0].professor_id !== prof.rows[0].id) {
      return res.status(403).json({ error: 'You can only complete your own consultations.' });
    }
    if (consultation.rows[0].status === 'completed') {
      return res.status(400).json({ error: 'Consultation is already completed.' });
    }
    if (consultation.rows[0].status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot complete a cancelled consultation.' });
    }

    await pool.query(`UPDATE consultations SET status = 'completed' WHERE id = $1`, [id]);

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

// Professor marks consultation as rescheduled (when referred/moved to another session)
router.patch('/:id/reschedule', authenticate, authorize('professor'), async (req, res) => {
  const { id } = req.params;
  const { referral, referral_specify, remarks } = req.body;

  try {
    const prof = await pool.query(`SELECT id FROM professors WHERE user_id = $1`, [req.user.id]);
    if (prof.rows.length === 0) return res.status(404).json({ error: 'Professor profile not found.' });

    const consultation = await pool.query(`SELECT professor_id, status FROM consultations WHERE id = $1`, [id]);
    if (consultation.rows.length === 0) return res.status(404).json({ error: 'Consultation not found.' });
    if (consultation.rows[0].professor_id !== prof.rows[0].id) {
      return res.status(403).json({ error: 'You can only reschedule your own consultations.' });
    }
    if (!['pending', 'confirmed'].includes(consultation.rows[0].status)) {
      return res.status(400).json({ error: 'Only pending or confirmed consultations can be rescheduled.' });
    }

    await pool.query(`UPDATE consultations SET status = 'rescheduled' WHERE id = $1`, [id]);

    await pool.query(
      `INSERT INTO consultation_details
       (consultation_id, action_taken, referral, referral_specify, remarks)
       VALUES ($1, 'Referred to', $2, $3, $4)`,
      [id, referral || null, referral_specify || null, remarks || null]
    );

    res.json({ message: 'Consultation marked as rescheduled.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
