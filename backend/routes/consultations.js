const express = require('express');
const router = express.Router();
const pool = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const notifModule = require('./notifications');
const { sendBookingPendingEmail, sendBookingConfirmedEmail, sendBookingCompletedEmail, sendBookingCancelledEmail, sendBookingRescheduledEmail, sendNewBookingProfessorEmail, sendBookingCancelledProfessorEmail } = require('../lib/email');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ── Proof-of-evidence upload setup ───────────────────────────────────────────
const proofUploadDir = path.join(__dirname, '../uploads/proofs');
if (!fs.existsSync(proofUploadDir)) fs.mkdirSync(proofUploadDir, { recursive: true });

const proofStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, proofUploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `proof-${req.params.id}-${Date.now()}${ext}`);
  },
});

const proofUpload = multer({
  storage: proofStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Only PDF, JPG, and PNG files are allowed.'));
  },
});

const DAY_MAP = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

// Shared helper: marks overdue consultations as missed for a given professor (or all if null).
// Uses date+time so same-day past slots are caught immediately, not just next-day.
async function autoMarkMissed(professorId = null) {
  try {
    const sql = `
      UPDATE consultations
      SET status = 'missed'
      WHERE status IN ('pending', 'confirmed')
        AND (date + COALESCE(time, '23:59:00'::time)) < (NOW() AT TIME ZONE 'Asia/Manila')
        ${professorId ? 'AND professor_id = $1' : ''}
      RETURNING id
    `;
    const result = professorId
      ? await pool.query(sql, [professorId])
      : await pool.query(sql);
    return result.rows.length;
  } catch (err) {
    console.error('[autoMarkMissed] error:', err.message);
    return 0;
  }
}

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
        return sum + Math.max(0, Math.ceil((end - start) / 30));
      }, 0);

      if (totalSlots === 0) return res.json([]);

      const result = await pool.query(
        `SELECT date::text FROM consultations
         WHERE schedule_id = $1 AND status IN ('pending', 'confirmed') AND date >= CURRENT_DATE
         GROUP BY date
         HAVING COUNT(DISTINCT time) >= $2`,
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

// Triggers auto-mark for the calling user's consultations (professor or student)
router.post('/mark-missed', authenticate, async (req, res) => {
  try {
    let professorId = null;
    if (req.user.role === 'professor') {
      const prof = await pool.query(`SELECT id FROM professors WHERE user_id = $1`, [req.user.id]);
      if (prof.rows.length === 0) return res.status(404).json({ error: 'Professor profile not found.' });
      professorId = prof.rows[0].id;
    }
    const marked = await autoMarkMissed(professorId);
    res.json({ marked });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Student books a consultation
router.post('/', authenticate, authorize('student'), async (req, res) => {
  const { professor_id, schedule_id, date, time, nature_of_advising, nature_of_advising_specify, mode, preferred_mode, notes } = req.body;

  try {
    const studentResult = await pool.query(
      `SELECT id FROM students WHERE user_id = $1`,
      [req.user.id]
    );
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student profile not found.' });
    }
    const student_id = studentResult.rows[0].id;

    const profAvailResult = await pool.query(
      `SELECT is_available FROM professors WHERE id = $1`,
      [professor_id]
    );
    if (profAvailResult.rows.length === 0) {
      return res.status(404).json({ error: 'Professor not found.' });
    }
    if (profAvailResult.rows[0].is_available === false) {
      return res.status(403).json({ error: 'This professor is not currently accepting new bookings.' });
    }

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

    // Reject bookings for a date/time that has already passed — the frontend only
    // hides past slots visually, so this must be enforced server-side too.
    const pastCheck = await pool.query(
      `SELECT ($1::date + COALESCE($2::time, '23:59:59'::time)) < (NOW() AT TIME ZONE 'Asia/Manila') AS is_past`,
      [date, time || null]
    );
    if (pastCheck.rows[0].is_past) {
      return res.status(400).json({ error: 'This time slot has already passed. Please select an upcoming time.' });
    }

    const natureValue = Array.isArray(nature_of_advising)
      ? JSON.stringify(nature_of_advising)
      : (nature_of_advising || null);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Prevent same student from double-booking same professor/date/time
      const dupCheck = await client.query(
        `SELECT id FROM consultations
         WHERE student_id = $1 AND professor_id = $2 AND date = $3 AND time IS NOT DISTINCT FROM $4
           AND status IN ('pending', 'confirmed', 'rescheduled')`,
        [student_id, professor_id, date, time || null]
      );
      if (dupCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'You already have a booking with this professor at this time.' });
      }

      // Use a savepoint so a failed INSERT (e.g. missing column) doesn't abort the
      // whole transaction — we can roll back to the savepoint and retry without it.
      // preferred_mode: student's preference when slot mode is BOTH ('F2F' or 'OL')
      const preferredModeValue = mode === 'BOTH' ? (preferred_mode || null) : null;

      await client.query('SAVEPOINT before_insert');
      let result;
      try {
        result = await client.query(
          `INSERT INTO consultations
           (student_id, professor_id, schedule_id, date, time, nature_of_advising, nature_of_advising_specify, mode, meeting_link, notes, preferred_mode)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
          [student_id, professor_id, schedule_id, date, time || null, natureValue, nature_of_advising_specify || null, mode, null, notes || null, preferredModeValue]
        );
        await client.query('RELEASE SAVEPOINT before_insert');
      } catch (colErr) {
        // Roll back the failed statement so the transaction stays healthy
        await client.query('ROLLBACK TO SAVEPOINT before_insert');
        if (colErr.code !== '42703') throw colErr; // re-raise anything that isn't "column does not exist"
        result = await client.query(
          `INSERT INTO consultations
           (student_id, professor_id, schedule_id, date, time, nature_of_advising, nature_of_advising_specify, mode, meeting_link, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
          [student_id, professor_id, schedule_id, date, time || null, natureValue, nature_of_advising_specify || null, mode, null, notes || null]
        );
      }

      await client.query('COMMIT');

      // Notifications — best-effort, outside transaction
      try {
        const [profUserRow, studentNameRow] = await Promise.all([
          pool.query(`SELECT user_id FROM professors WHERE id = $1`, [professor_id]),
          pool.query(`SELECT full_name FROM students WHERE id = $1`, [student_id]),
        ]);
        const studentName = studentNameRow.rows[0]?.full_name || 'A student';
        const fmtDate = new Date(date + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

        if (profUserRow.rows[0]) {
          await notifModule.insertAndPush(
            profUserRow.rows[0].user_id, 'new_booking',
            `${studentName} booked a consultation on ${fmtDate}`,
            { consultation_id: result.rows[0].id, student_name: studentName, date, route: 'consultations' }
          );
        }

        // Notify all admins (fire-and-forget)
        pool.query(`SELECT id FROM users WHERE role = 'admin'`).then(admins => {
          admins.rows.forEach(a => notifModule.insertAndPush(
            a.id, 'new_request',
            `New consultation request from ${studentName}`,
            { consultation_id: result.rows[0].id, student_name: studentName, date, route: 'consultations' }
          ));
        }).catch(() => {});
      } catch { /* notifications are best-effort */ }

      // Email student — best-effort
      try {
        const eRow = await pool.query(`
          SELECT u.email, s.full_name AS student_name, p.full_name AS professor_name,
                 c.date::text AS date, c.time::text AS time, c.mode, sch.location,
                 sch.meeting_link AS slot_meeting_link,
                 pu.email AS professor_email
          FROM consultations c
          JOIN students s ON c.student_id = s.id
          JOIN users u ON s.user_id = u.id
          JOIN professors p ON c.professor_id = p.id
          JOIN users pu ON p.user_id = pu.id
          LEFT JOIN schedules sch ON c.schedule_id = sch.id
          WHERE c.id = $1
        `, [result.rows[0].id]);
        if (eRow.rows[0]) {
          const { email, student_name, professor_name, date: eDate, time: eTime, mode, location, slot_meeting_link, professor_email } = eRow.rows[0];
          await sendBookingPendingEmail({ to: email, studentName: student_name, professorName: professor_name, date: eDate, time: eTime, mode, location });
          if (professor_email) {
            await sendNewBookingProfessorEmail({ to: professor_email, professorName: professor_name, studentName: student_name, date: eDate, time: eTime, mode, location, meetingLink: null, slotMeetingLink: slot_meeting_link });
          }
        }
      } catch { /* emails are best-effort */ }

      res.status(201).json(result.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Global: most consulted topics across ALL consultations (all students, all statuses, all time)
router.get('/my-topics', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        topic AS label,
        COUNT(*)::int AS count
      FROM (
        SELECT jsonb_array_elements_text(nature_of_advising::jsonb) AS topic
        FROM consultations
        WHERE nature_of_advising IS NOT NULL
          AND nature_of_advising LIKE '[%'
        UNION ALL
        SELECT nature_of_advising AS topic
        FROM consultations
        WHERE nature_of_advising IS NOT NULL
          AND nature_of_advising <> ''
          AND nature_of_advising NOT LIKE '[%'
      ) t
      WHERE topic IS NOT NULL AND topic <> ''
      GROUP BY topic
      ORDER BY count DESC
      LIMIT 3
    `);

    res.json(result.rows);
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
      if (!prof.rows[0]) {
        return res.status(404).json({ error: 'Professor profile not found' });
      }
      result = await pool.query(
        `SELECT c.*, c.date::text AS date, s.full_name AS student_name, s.student_number,
                s.program, sch.day, sch.time_start, sch.time_end, sch.location, sch.mode AS slot_mode,
                cd.action_taken, cd.referral, cd.referral_specify, cd.remarks,
                u.avatar AS student_avatar
         FROM consultations c
         JOIN students s ON c.student_id = s.id
         JOIN users u ON s.user_id = u.id
         JOIN schedules sch ON c.schedule_id = sch.id
         LEFT JOIN LATERAL (
           SELECT action_taken, referral, referral_specify, remarks
           FROM consultation_details
           WHERE consultation_id = c.id
           ORDER BY id DESC LIMIT 1
         ) cd ON true
         WHERE c.professor_id = $1 AND c.status != 'cancelled'
         ORDER BY c.date DESC`,
        [prof.rows[0].id]
      );
    } else if (req.user.role === 'student') {
      const student = await pool.query(
        `SELECT id FROM students WHERE user_id = $1`, [req.user.id]
      );
      result = await pool.query(
        `SELECT c.*, c.date::text AS date, p.full_name AS professor_name,
                sch.day, sch.time_start, sch.time_end, sch.location, sch.mode AS slot_mode,
                cd.action_taken, cd.referral, cd.referral_specify, cd.remarks,
                pu.avatar AS professor_avatar
         FROM consultations c
         JOIN professors p ON c.professor_id = p.id
         JOIN users pu ON p.user_id = pu.id
         JOIN schedules sch ON c.schedule_id = sch.id
         LEFT JOIN LATERAL (
           SELECT action_taken, referral, referral_specify, remarks
           FROM consultation_details
           WHERE consultation_id = c.id
           ORDER BY id DESC LIMIT 1
         ) cd ON true
         WHERE c.student_id = $1
         ORDER BY c.date DESC`,
        [student.rows[0].id]
      );
    } else {
      // Admin — optional role filter via ?role=student|professor
      const { role } = req.query;
      let adminQuery = `
        SELECT c.*, c.date::text AS date, s.full_name AS student_name, p.full_name AS professor_name,
               s.student_number, s.program,
               sch.day, sch.time_start, sch.time_end, sch.location, sch.mode AS slot_mode,
               cd.action_taken, cd.referral, cd.referral_specify, cd.remarks
        FROM consultations c
        JOIN students s ON c.student_id = s.id
        JOIN professors p ON c.professor_id = p.id
        JOIN schedules sch ON c.schedule_id = sch.id
        LEFT JOIN LATERAL (
          SELECT action_taken, referral, referral_specify, remarks
          FROM consultation_details
          WHERE consultation_id = c.id
          ORDER BY id DESC LIMIT 1
        ) cd ON true
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
    const link = (consultation.rows[0].mode === 'OL' || consultation.rows[0].mode === 'BOTH') ? (meeting_link || null) : null;
    const result = await pool.query(
      `UPDATE consultations SET status = 'confirmed', meeting_link = $2 WHERE id = $1 RETURNING *`,
      [id, link]
    );

    // Email student — best-effort
    try {
      const eRow = await pool.query(`
        SELECT u.email, s.full_name AS student_name, p.full_name AS professor_name,
               c.date::text AS date, c.time::text AS time, c.mode, c.meeting_link, sch.location,
               sch.mode AS slot_mode, sch.meeting_link AS slot_meeting_link
        FROM consultations c
        JOIN students s ON c.student_id = s.id
        JOIN users u ON s.user_id = u.id
        JOIN professors p ON c.professor_id = p.id
        LEFT JOIN schedules sch ON c.schedule_id = sch.id
        WHERE c.id = $1
      `, [id]);
      if (eRow.rows[0]) {
        const { email, student_name, professor_name, date: eDate, time: eTime, mode, meeting_link: eLink, location, slot_mode, slot_meeting_link } = eRow.rows[0];
        await sendBookingConfirmedEmail({ to: email, studentName: student_name, professorName: professor_name, date: eDate, time: eTime, mode, location, meetingLink: eLink, slotMode: slot_mode, slotMeetingLink: slot_meeting_link });
      }
    } catch { /* emails are best-effort */ }

    // Notify student
    try {
      const row = await pool.query(`
        SELECT s.user_id AS student_user_id, p.full_name AS professor_name, c.date::text AS date
        FROM consultations c
        JOIN students s ON c.student_id = s.id
        JOIN professors p ON c.professor_id = p.id
        WHERE c.id = $1
      `, [id]);
      if (row.rows[0]) {
        const { student_user_id, professor_name, date } = row.rows[0];
        const fmtDate = new Date(date + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
        await notifModule.insertAndPush(
          student_user_id, 'status_update',
          `Your consultation with ${professor_name} on ${fmtDate} was confirmed`,
          { consultation_id: Number(id), professor_name, date, route: 'my' }
        );
      }
    } catch { /* best-effort */ }

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
    if (consultation.rows[0].mode !== 'OL' && consultation.rows[0].mode !== 'BOTH') {
      return res.status(400).json({ error: 'Meeting link only applies to online or hybrid consultations.' });
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
  const { cancel_reason } = req.body;
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

    await pool.query(
      `UPDATE consultations SET status = 'cancelled', cancel_reason = $1 WHERE id = $2`,
      [cancel_reason?.trim() || null, id]
    );

    // Notify the other party
    try {
      const row = await pool.query(`
        SELECT s.user_id AS student_user_id, p.user_id AS prof_user_id,
               s.full_name AS student_name, p.full_name AS professor_name, c.date::text AS date
        FROM consultations c
        JOIN students s ON c.student_id = s.id
        JOIN professors p ON c.professor_id = p.id
        WHERE c.id = $1
      `, [id]);
      if (row.rows[0]) {
        const { student_user_id, prof_user_id, student_name, professor_name, date } = row.rows[0];
        const fmtDate = new Date(date + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
        if (req.user.role === 'professor') {
          await notifModule.insertAndPush(
            student_user_id, 'cancelled',
            `Your consultation with ${professor_name} on ${fmtDate} was cancelled`,
            { consultation_id: Number(id), professor_name, date, route: 'my' }
          );
        } else {
          await notifModule.insertAndPush(
            prof_user_id, 'cancelled',
            `${student_name} cancelled their consultation on ${fmtDate}`,
            { consultation_id: Number(id), student_name, date, route: 'consultations' }
          );
        }
      }
    } catch { /* best-effort */ }

    // Emails — best-effort
    try {
      const eRow = await pool.query(`
        SELECT u.email, s.full_name AS student_name, p.full_name AS professor_name,
               c.date::text AS date, c.time::text AS time, c.cancel_reason AS reason,
               pu.email AS professor_email
        FROM consultations c
        JOIN students s ON c.student_id = s.id
        JOIN users u ON s.user_id = u.id
        JOIN professors p ON c.professor_id = p.id
        JOIN users pu ON p.user_id = pu.id
        WHERE c.id = $1
      `, [id]);
      if (eRow.rows[0]) {
        const { email, student_name, professor_name, date: eDate, time: eTime, reason, professor_email } = eRow.rows[0];
        if (req.user.role === 'student') {
          // Student cancelled → email student confirmation + email professor
          await sendBookingCancelledEmail({ to: email, studentName: student_name, professorName: professor_name, date: eDate, time: eTime, reason });
          if (professor_email) {
            await sendBookingCancelledProfessorEmail({ to: professor_email, professorName: professor_name, studentName: student_name, date: eDate, time: eTime, reason });
          }
        } else {
          // Professor cancelled → email student only
          await sendBookingCancelledEmail({ to: email, studentName: student_name, professorName: professor_name, date: eDate, time: eTime, reason });
        }
      }
    } catch (e) { console.error('[email:cancelled]', e.message); }

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

    // Email student — best-effort
    try {
      const eRow = await pool.query(`
        SELECT u.email, s.full_name AS student_name, p.full_name AS professor_name,
               c.date::text AS date, c.time::text AS time
        FROM consultations c
        JOIN students s ON c.student_id = s.id
        JOIN users u ON s.user_id = u.id
        JOIN professors p ON c.professor_id = p.id
        WHERE c.id = $1
      `, [id]);
      if (eRow.rows[0]) {
        const { email, student_name, professor_name, date: eDate, time: eTime } = eRow.rows[0];
        await sendBookingCompletedEmail({ to: email, studentName: student_name, professorName: professor_name, date: eDate, time: eTime, actionTaken: action_taken, referral, referralSpecify: referral_specify, remarks });
      }
    } catch (e) { console.error('[email:completed]', e.message); }

    const result = await pool.query(
      `INSERT INTO consultation_details
       (consultation_id, action_taken, referral, referral_specify, remarks)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, action_taken, referral || null, referral_specify || null, remarks || null]
    );

    // Notify student
    try {
      const row = await pool.query(`
        SELECT s.user_id AS student_user_id, p.full_name AS professor_name, c.date::text AS date
        FROM consultations c
        JOIN students s ON c.student_id = s.id
        JOIN professors p ON c.professor_id = p.id
        WHERE c.id = $1
      `, [id]);
      if (row.rows[0]) {
        const { student_user_id, professor_name, date } = row.rows[0];
        const fmtDate = new Date(date + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
        await notifModule.insertAndPush(
          student_user_id, 'status_update',
          `Your consultation with ${professor_name} on ${fmtDate} was completed`,
          { consultation_id: Number(id), professor_name, date, route: 'my' }
        );
      }
    } catch { /* best-effort */ }

    res.json({ message: 'Consultation completed', details: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Professor updates notes on a completed consultation
router.patch('/:id/notes', authenticate, authorize('professor'), async (req, res) => {
  const { id } = req.params;
  const { action_taken, referral, referral_specify, remarks } = req.body;

  try {
    const prof = await pool.query(`SELECT id FROM professors WHERE user_id = $1`, [req.user.id]);
    if (prof.rows.length === 0) return res.status(404).json({ error: 'Professor profile not found.' });

    const consultation = await pool.query(
      `SELECT professor_id, status FROM consultations WHERE id = $1`, [id]
    );
    if (consultation.rows.length === 0) return res.status(404).json({ error: 'Consultation not found.' });
    if (consultation.rows[0].professor_id !== prof.rows[0].id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Upsert consultation_details
    const existing = await pool.query(
      `SELECT id FROM consultation_details WHERE consultation_id = $1`, [id]
    );
    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE consultation_details
         SET action_taken = $1, referral = $2, referral_specify = $3, remarks = $4
         WHERE consultation_id = $5`,
        [action_taken || null, referral || null, referral_specify || null, remarks || null, id]
      );
    } else {
      await pool.query(
        `INSERT INTO consultation_details (consultation_id, action_taken, referral, referral_specify, remarks)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, action_taken || null, referral || null, referral_specify || null, remarks || null]
      );
    }

    res.json({ message: 'Notes updated.' });
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

    // Email student — best-effort
    try {
      const eRow = await pool.query(`
        SELECT u.email, s.full_name AS student_name, p.full_name AS professor_name,
               c.date::text AS date, c.time::text AS time, c.mode, sch.location
        FROM consultations c
        JOIN students s ON c.student_id = s.id
        JOIN users u ON s.user_id = u.id
        JOIN professors p ON c.professor_id = p.id
        LEFT JOIN schedules sch ON c.schedule_id = sch.id
        WHERE c.id = $1
      `, [id]);
      if (eRow.rows[0]) {
        const { email, student_name, professor_name, date: eDate, time: eTime, mode, location } = eRow.rows[0];
        await sendBookingRescheduledEmail({ to: email, studentName: student_name, professorName: professor_name, date: eDate, time: eTime, mode, location });
      }
    } catch (e) { console.error('[email:rescheduled]', e.message); }

    res.json({ message: 'Consultation marked as rescheduled.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Student submits proof of evidence (file upload OR external link)
router.post('/:id/proof', authenticate, authorize('student'), (req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (ct.includes('multipart/form-data')) {
    proofUpload.single('proof')(req, res, next);
  } else {
    next();
  }
}, async (req, res) => {
  const { id } = req.params;
  try {
    const row = await pool.query(
      `SELECT c.student_id, c.status, c.proof_of_evidence, c.proof_type
       FROM consultations c WHERE c.id = $1`, [id]
    );
    if (!row.rows[0]) return res.status(404).json({ error: 'Consultation not found.' });
    const c = row.rows[0];

    if (c.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot submit proof for a cancelled consultation.' });
    }

    const student = await pool.query(`SELECT id FROM students WHERE user_id = $1`, [req.user.id]);
    if (!student.rows[0] || student.rows[0].id !== c.student_id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    if (req.file) {
      // Remove old file proof if it exists
      if (c.proof_type === 'file' && c.proof_of_evidence) {
        const oldPath = path.join(proofUploadDir, path.basename(c.proof_of_evidence));
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      await pool.query(
        `UPDATE consultations SET proof_of_evidence = $1, proof_type = 'file' WHERE id = $2`,
        [req.file.filename, id]
      );
      return res.json({ proof_of_evidence: req.file.filename, proof_type: 'file' });
    }

    const link = (req.body?.link || '').trim();
    if (!link) return res.status(400).json({ error: 'A file or link is required.' });

    await pool.query(
      `UPDATE consultations SET proof_of_evidence = $1, proof_type = 'link' WHERE id = $2`,
      [link, id]
    );
    res.json({ proof_of_evidence: link, proof_type: 'link' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Professor / student / admin downloads a file proof
router.get('/:id/proof', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const row = await pool.query(
      `SELECT student_id, professor_id, proof_of_evidence, proof_type FROM consultations WHERE id = $1`, [id]
    );
    if (!row.rows[0]) return res.status(404).json({ error: 'Consultation not found.' });
    const c = row.rows[0];

    if (c.proof_type !== 'file' || !c.proof_of_evidence) {
      return res.status(404).json({ error: 'No file proof for this consultation.' });
    }

    if (req.user.role === 'student') {
      const student = await pool.query(`SELECT id FROM students WHERE user_id = $1`, [req.user.id]);
      if (!student.rows[0] || student.rows[0].id !== c.student_id) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    } else if (req.user.role === 'professor') {
      const prof = await pool.query(`SELECT id FROM professors WHERE user_id = $1`, [req.user.id]);
      if (!prof.rows[0] || prof.rows[0].id !== c.professor_id) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    }

    const filePath = path.join(proofUploadDir, path.basename(c.proof_of_evidence));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on server.' });
    res.download(filePath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.autoMarkMissed = autoMarkMissed;
module.exports = router;
