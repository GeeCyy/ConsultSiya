const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// List all non-admin users with profiles
router.get('/users', authenticate, authorize('admin'), async (req, res) => {
  const { role } = req.query;
  try {
    let query = `
      SELECT u.id, u.email, u.role, u.is_approved, u.created_at,
        COALESCE(s.full_name, p.full_name) AS full_name,
        s.student_number, s.program, s.year_level,
        p.department
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
  if (!email || !full_name) {
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
      if (!student_number) return res.status(400).json({ error: 'Student number is required.' });
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

// Reject (unapprove) an account
router.patch('/users/:id/reject', authenticate, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE users SET is_approved = false WHERE id = $1 AND role != 'admin' RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: 'Account rejected.' });
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

module.exports = router;
