const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const pool = require('../db/db');
const cloudinary = require('../lib/cloudinary');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// List all non-admin users with profiles
router.get('/users', authenticate, authorize('admin'), async (req, res) => {
  const { role } = req.query;
  try {
    let query = `
      SELECT u.id, u.email, u.role, u.is_approved, u.is_active, u.created_at, u.avatar,
        u.locked_until, u.failed_attempts,
        COALESCE(s.full_name, p.full_name) AS full_name,
        s.student_number, s.program, s.year_level,
        p.department,
        COALESCE(s.id, p.id) AS profile_id
      FROM users u
      LEFT JOIN students s ON s.user_id = u.id
      LEFT JOIN professors p ON p.user_id = u.id
      WHERE u.role != 'admin'
    `;
    const params = [];
    if (role && ['student', 'professor'].includes(role)) {
      query += ` AND u.role = $1`;
      params.push(role);
    }
    query += ' ORDER BY u.is_approved ASC, u.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// List admin users
router.get('/admins', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.role, u.created_at FROM users u WHERE u.role = 'admin' ORDER BY u.created_at ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Create a new account (student or professor), auto-approved
router.post('/users', authenticate, authorize('admin'), async (req, res) => {
  const { email, password, role, full_name, student_number, program, year_level, department } = req.body;
  if (!['student', 'professor'].includes(role)) {
    return res.status(400).json({ error: 'Role must be student or professor.' });
  }
  if (!email || !full_name || !full_name.trim()) {
    return res.status(400).json({ error: 'Email and full name are required.' });
  }
  try {
    const password_hash = await bcrypt.hash(password || 'Welcome@123', 10);
    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, role, is_approved) VALUES ($1, $2, $3, true) RETURNING id`,
      [email, password_hash, role]
    );
    const userId = userResult.rows[0].id;
    if (role === 'student') {
      if (!student_number || !/^\d{10}$/.test(student_number)) return res.status(400).json({ error: 'Student number must be exactly 10 digits.' });
      await pool.query(
        `INSERT INTO students (user_id, full_name, student_number, program, year_level) VALUES ($1, $2, $3, $4, $5)`,
        [userId, full_name, student_number, program || null, year_level ? parseInt(year_level) : null]
      );
    } else {
      await pool.query(
        `INSERT INTO professors (user_id, full_name, department) VALUES ($1, $2, $3)`,
        [userId, full_name, department || null]
      );
    }
    res.status(201).json({ message: 'Account created successfully.' });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') return res.status(400).json({ error: 'Email or student number already registered.' });
    res.status(500).json({ error: err.message });
  }
});

// Delete an account (student or professor only)
router.delete('/users/:id', authenticate, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const user = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
    if (user.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    if (user.rows[0].role === 'admin') return res.status(403).json({ error: 'Cannot delete admin accounts.' });
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: 'Account deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Approve an account
router.patch('/users/:id/approve', authenticate, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE users SET is_approved = true WHERE id = $1 AND role != 'admin' RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: 'Account approved.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Deactivate an account (soft-disable — prevents login without deleting)
router.patch('/users/:id/deactivate', authenticate, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const user = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
    if (user.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    if (user.rows[0].role === 'admin') return res.status(403).json({ error: 'Cannot deactivate admin accounts.' });
    const result = await pool.query(
      `UPDATE users SET is_active = false WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: 'Account deactivated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Reactivate a deactivated account
router.patch('/users/:id/activate', authenticate, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE users SET is_active = true WHERE id = $1 AND role != 'admin' RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: 'Account activated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Unlock a locked account — resets failed_attempts and clears locked_until
router.patch('/users/:id/unlock', authenticate, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1 AND role != 'admin' RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: 'Account unlocked.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Reject a pending account — deletes it so the user must re-register
router.patch('/users/:id/reject', authenticate, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const user = await pool.query(`SELECT role, is_approved FROM users WHERE id = $1`, [id]);
    if (user.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    if (user.rows[0].role === 'admin') return res.status(403).json({ error: 'Cannot reject admin accounts.' });
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: 'Account rejected and removed.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Transfer (promote) a user to admin — enforces 2-admin maximum
router.patch('/transfer-admin', authenticate, authorize('admin'), async (req, res) => {
  const { target_user_id } = req.body;
  if (!target_user_id) return res.status(400).json({ error: 'target_user_id is required.' });
  try {
    const adminCount = await pool.query(`SELECT COUNT(*) FROM users WHERE role = 'admin'`);
    if (parseInt(adminCount.rows[0].count) >= 2) {
      return res.status(400).json({ error: 'Maximum of 2 admins allowed. Remove an existing admin first.' });
    }
    const target = await pool.query('SELECT id, role FROM users WHERE id = $1', [target_user_id]);
    if (target.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    if (target.rows[0].role === 'admin') return res.status(400).json({ error: 'User is already an admin.' });
    await pool.query(
      `UPDATE users SET role = 'admin', is_approved = true WHERE id = $1`,
      [target_user_id]
    );
    res.json({ message: 'User promoted to admin successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Demote admin back to professor (to free up admin slot)
router.patch('/demote-admin/:id', authenticate, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  const myId = req.user.id;
  if (parseInt(id) === myId) return res.status(400).json({ error: 'You cannot demote yourself.' });
  try {
    const target = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
    if (target.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    if (target.rows[0].role !== 'admin') return res.status(400).json({ error: 'User is not an admin.' });
    // Ensure they have a professor profile before demoting
    const prof = await pool.query('SELECT id FROM professors WHERE user_id = $1', [id]);
    if (prof.rows.length === 0) return res.status(400).json({ error: 'Cannot demote: no professor profile found for this admin.' });
    await pool.query(`UPDATE users SET role = 'professor' WHERE id = $1`, [id]);
    res.json({ message: 'Admin demoted to professor.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Calendar management ────────────────────────────────────────────────────────

// POST /api/admin/exam-weeks — upsert exam week override
router.post('/exam-weeks', authenticate, authorize('admin'), async (req, res) => {
  const { week_number, value } = req.body;
  if (!week_number || !['exam', 'normal'].includes(value)) {
    return res.status(400).json({ error: 'week_number and value (exam|normal) required.' });
  }
  try {
    await pool.query(
      `DELETE FROM calendar_overrides WHERE type = 'exam_week' AND week_number = $1`,
      [week_number]
    );
    const result = await pool.query(
      `INSERT INTO calendar_overrides (type, week_number, value, created_by)
       VALUES ('exam_week', $1, $2, $3)
       RETURNING id, type, date::text AS date, week_number, value, label, created_at`,
      [week_number, value, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/exam-weeks/:weekNumber — reset week to static default
router.delete('/exam-weeks/:weekNumber', authenticate, authorize('admin'), async (req, res) => {
  const { weekNumber } = req.params;
  try {
    await pool.query(
      `DELETE FROM calendar_overrides WHERE type = 'exam_week' AND week_number = $1`,
      [weekNumber]
    );
    res.json({ message: 'Exam week override removed.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/blocked-dates — add a blocked/special date
router.post('/blocked-dates', authenticate, authorize('admin'), async (req, res) => {
  const { date, label } = req.body;
  if (!date) return res.status(400).json({ error: 'date is required.' });
  try {
    const result = await pool.query(
      `INSERT INTO calendar_overrides (type, date, label, created_by)
       VALUES ('blocked_date', $1, $2, $3)
       ON CONFLICT (date) WHERE date IS NOT NULL
       DO UPDATE SET
         type = EXCLUDED.type,
         label = EXCLUDED.label,
         created_by = EXCLUDED.created_by
       RETURNING id, type, date::text AS date, week_number, value, label, created_at`,
      [date, label || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/blocked-dates/:id — remove a blocked date
router.delete('/blocked-dates/:id', authenticate, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM calendar_overrides WHERE id = $1 AND type = 'blocked_date' RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Blocked date not found.' });
    res.json({ message: 'Blocked date removed.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/calendar-overrides — generic override create
router.post('/calendar-overrides', authenticate, authorize('admin'), async (req, res) => {
  const { type, date, week_number, value, label, color } = req.body;
  if (!type || !['exam_week', 'mode_override', 'blocked_date', 'date_label'].includes(type)) {
    return res.status(400).json({ error: 'Invalid override type.' });
  }
  try {
    let result;
    if (type === 'mode_override' && week_number) {
      // Mode overrides key on week_number
      result = await pool.query(
        `INSERT INTO calendar_overrides (type, week_number, value, created_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (week_number) WHERE week_number IS NOT NULL AND type = 'mode_override'
         DO UPDATE SET value = EXCLUDED.value, created_by = EXCLUDED.created_by
         RETURNING id, type, date::text AS date, week_number, value, label, color, created_at`,
        [type, week_number, value || null, req.user.id]
      );
    } else {
      // All other types key on date
      result = await pool.query(
        `INSERT INTO calendar_overrides (type, date, week_number, value, label, color, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (date) WHERE date IS NOT NULL
         DO UPDATE SET
           type = EXCLUDED.type,
           week_number = EXCLUDED.week_number,
           value = EXCLUDED.value,
           label = EXCLUDED.label,
           color = EXCLUDED.color,
           created_by = EXCLUDED.created_by
         RETURNING id, type, date::text AS date, week_number, value, label, color, created_at`,
        [type, date || null, week_number || null, value || null, label || null, color || null, req.user.id]
      );
    }
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/calendar-overrides/:id — update override value/color
router.patch('/calendar-overrides/:id', authenticate, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  const { value, color } = req.body;
  try {
    let result;
    if ('color' in req.body) {
      result = await pool.query(
        `UPDATE calendar_overrides SET value = $1, color = $2 WHERE id = $3
         RETURNING id, type, date::text AS date, week_number, value, label, color, created_at`,
        [value ?? null, color ?? null, id]
      );
    } else {
      result = await pool.query(
        `UPDATE calendar_overrides SET value = $1 WHERE id = $2
         RETURNING id, type, date::text AS date, week_number, value, label, color, created_at`,
        [value ?? null, id]
      );
    }
    if (result.rows.length === 0) return res.status(404).json({ error: 'Override not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/calendar-overrides/:id — generic override delete
router.delete('/calendar-overrides/:id', authenticate, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM calendar_overrides WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Override not found.' });
    res.json({ message: 'Override deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Term Archive ──────────────────────────────────────────────────────────────

// SQL fragment (aliased to c) — computes term label, using stored columns when present
// or falling back to date-based heuristic (Mapúa trimester calendar).
const TERM_LABEL_SQL = `COALESCE(
    CASE WHEN c.academic_term IS NOT NULL AND c.academic_year IS NOT NULL
      THEN c.academic_term || ' A.Y. ' || c.academic_year
      ELSE NULL END,
    CASE
      WHEN EXTRACT(MONTH FROM c.date) BETWEEN 8 AND 11
        THEN '1st Trimester A.Y. ' || EXTRACT(YEAR FROM c.date)::int || '-' || (EXTRACT(YEAR FROM c.date)::int + 1)
      WHEN EXTRACT(MONTH FROM c.date) = 12
        THEN '2nd Trimester A.Y. ' || EXTRACT(YEAR FROM c.date)::int || '-' || (EXTRACT(YEAR FROM c.date)::int + 1)
      WHEN EXTRACT(MONTH FROM c.date) BETWEEN 1 AND 2
        THEN '2nd Trimester A.Y. ' || (EXTRACT(YEAR FROM c.date)::int - 1) || '-' || EXTRACT(YEAR FROM c.date)::int
      ELSE '3rd Trimester A.Y. ' || (EXTRACT(YEAR FROM c.date)::int - 1) || '-' || EXTRACT(YEAR FROM c.date)::int
    END)`;

// Same fragment without table alias — used in DELETE (no JOIN context)
const TERM_LABEL_RAW = `COALESCE(
    CASE WHEN academic_term IS NOT NULL AND academic_year IS NOT NULL
      THEN academic_term || ' A.Y. ' || academic_year
      ELSE NULL END,
    CASE
      WHEN EXTRACT(MONTH FROM date) BETWEEN 8 AND 11
        THEN '1st Trimester A.Y. ' || EXTRACT(YEAR FROM date)::int || '-' || (EXTRACT(YEAR FROM date)::int + 1)
      WHEN EXTRACT(MONTH FROM date) = 12
        THEN '2nd Trimester A.Y. ' || EXTRACT(YEAR FROM date)::int || '-' || (EXTRACT(YEAR FROM date)::int + 1)
      WHEN EXTRACT(MONTH FROM date) BETWEEN 1 AND 2
        THEN '2nd Trimester A.Y. ' || (EXTRACT(YEAR FROM date)::int - 1) || '-' || EXTRACT(YEAR FROM date)::int
      ELSE '3rd Trimester A.Y. ' || (EXTRACT(YEAR FROM date)::int - 1) || '-' || EXTRACT(YEAR FROM date)::int
    END)`;

// GET /api/admin/archive — list of distinct terms with consultation counts
router.get('/archive', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ${TERM_LABEL_SQL} AS term_label,
        COUNT(*)::int AS total,
        MIN(c.date)::text AS earliest_date,
        MAX(c.date)::text AS latest_date
      FROM consultations c
      GROUP BY term_label
      ORDER BY MIN(c.date) DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('[archive list]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/archive/:term — all consultations for a given term label
router.get('/archive/:term', authenticate, authorize('admin'), async (req, res) => {
  const termLabel = decodeURIComponent(req.params.term);
  try {
    const result = await pool.query(`
      SELECT
        c.id, c.date::text AS date, c.status, c.mode,
        c.nature_of_advising, c.nature_of_advising_specify,
        c.notes, c.is_archived,
        s.full_name AS student_name, s.student_number, s.program,
        p.full_name AS professor_name, p.department,
        sch.day, sch.time_start, sch.time_end,
        cd.action_taken, cd.referral, cd.referral_specify, cd.remarks,
        ${TERM_LABEL_SQL} AS term_label
      FROM consultations c
      JOIN students s ON c.student_id = s.id
      JOIN professors p ON c.professor_id = p.id
      JOIN schedules sch ON c.schedule_id = sch.id
      LEFT JOIN consultation_details cd ON cd.consultation_id = c.id
      WHERE ${TERM_LABEL_SQL} = $1
      ORDER BY c.date ASC, sch.time_start ASC
    `, [termLabel]);
    res.json(result.rows);
  } catch (err) {
    console.error('[archive term]', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/archive/:term — permanently delete all consultations for a term (admin only)
// Body must include { confirmed: true } to prevent accidental calls.
router.delete('/archive/:term', authenticate, authorize('admin'), async (req, res) => {
  const termLabel = decodeURIComponent(req.params.term);
  const { confirmed } = req.body;
  if (!confirmed) {
    return res.status(400).json({ error: 'Must include confirmed: true in the request body to delete an archive.' });
  }
  try {
    const result = await pool.query(
      `DELETE FROM consultations WHERE ${TERM_LABEL_RAW} = $1`,
      [termLabel]
    );
    res.json({ message: `Deleted ${result.rowCount} consultation record${result.rowCount !== 1 ? 's' : ''} for "${termLabel}".`, deleted: result.rowCount });
  } catch (err) {
    console.error('[archive delete]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/fix-proof/:consultationId
// Inspects and optionally re-uploads a local proof file to Cloudinary.
// Pass ?dry=true to only inspect without uploading.
router.get('/fix-proof/:consultationId', authenticate, authorize('admin'), async (req, res) => {
  const { consultationId } = req.params;
  const dry = req.query.dry === 'true';

  try {
    const result = await pool.query(
      `SELECT c.id, c.date::text AS date, c.mode, c.uploaded_form_path, c.proof_of_evidence, c.proof_type,
              s.full_name AS student_name, p.full_name AS professor_name
       FROM consultations c
       JOIN students s ON c.student_id = s.id
       JOIN professors p ON c.professor_id = p.id
       WHERE c.id = $1`,
      [consultationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Consultation not found.' });
    }

    const row = result.rows[0];
    const info = {
      id: row.id,
      student: row.student_name,
      professor: row.professor_name,
      date: row.date,
      mode: row.mode,
      uploaded_form_path: row.uploaded_form_path,
      proof_of_evidence: row.proof_of_evidence,
      proof_type: row.proof_type,
    };

    const results = [];

    const migrateFile = async (localPath, uploadsDir, folder, dbColumn) => {
      if (!localPath) return { status: 'no_file', action: 'none' };
      if (localPath.startsWith('https://')) return { status: 'already_cloudinary', action: 'none' };
      const filename = path.basename(localPath);
      const filePath = path.join(uploadsDir, filename);
      if (!fs.existsSync(filePath)) {
        const dirContents = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
        return { status: 'file_not_found', stored_filename: filename, uploads_dir_contents: dirContents, action: 'none' };
      }
      if (dry) return { status: 'file_found', stored_filename: filename, action: 'dry_run_no_upload' };
      const buffer = fs.readFileSync(filePath);
      const mimetype = filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
      const resourceType = mimetype === 'application/pdf' ? 'raw' : 'image';
      const secureUrl = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder, public_id: `consultation-${consultationId}-${dbColumn}-migrated-${Date.now()}`, resource_type: resourceType },
          (err, result) => { if (err) return reject(err); resolve(result.secure_url); }
        );
        stream.end(buffer);
      });
      await pool.query(`UPDATE consultations SET ${dbColumn} = $1 WHERE id = $2`, [secureUrl, consultationId]);
      return { status: 'migrated', stored_filename: filename, new_cloudinary_url: secureUrl, action: 'uploaded_and_updated' };
    };

    const formResult = await migrateFile(row.uploaded_form_path, path.join(__dirname, '../uploads/forms'), 'consultsiya/forms', 'uploaded_form_path');
    results.push({ field: 'uploaded_form_path', ...formResult });

    if (row.proof_type === 'file' && row.proof_of_evidence) {
      const proofResult = await migrateFile(row.proof_of_evidence, path.join(__dirname, '../uploads/proofs'), 'consultsiya/proofs', 'proof_of_evidence');
      results.push({ field: 'proof_of_evidence', ...proofResult });
    }

    res.json({ ...info, results });
  } catch (err) {
    console.error('[fix-proof]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
