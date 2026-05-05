const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const pool = require('../db/db');
const { authenticate } = require('../middleware/auth.middleware');

// ── Auth-specific rate limiter: max 10 requests per 15 min per IP ─────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth requests from this IP. Please try again in 15 minutes.' },
  skipSuccessfulRequests: true,
});

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// ── Register ─────────────────────────────────────────────────────────────────
router.post(
  '/register',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('A valid email address is required.'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
    body('role').isIn(['student', 'professor']).withMessage('Role must be student or professor.'),
    body('full_name').trim().notEmpty().withMessage('Full name is required.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { email, password, role, full_name, student_number, program, year_level, department } = req.body;

    try {
      const password_hash = await bcrypt.hash(password, 12);

      const userResult = await pool.query(
        `INSERT INTO users (email, password_hash, role, is_approved)
         VALUES ($1, $2, $3, false) RETURNING id`,
        [email, password_hash, role]
      );

      const userId = userResult.rows[0].id;

      if (role === 'student') {
        if (!student_number) return res.status(400).json({ error: 'Student number is required.' });
        await pool.query(
          `INSERT INTO students (user_id, full_name, student_number, program, year_level)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, full_name, student_number, program || null, year_level ? parseInt(year_level) : null]
        );
      } else {
        await pool.query(
          `INSERT INTO professors (user_id, full_name, department)
           VALUES ($1, $2, $3)`,
          [userId, full_name, department || null]
        );
      }

      res.status(201).json({ message: 'Registration successful. Your account is pending admin approval.' });
    } catch (err) {
      console.error('[Register]', err.code, err.message);
      if (err.code === '23505') return res.status(400).json({ error: 'Email or student number already registered.' });
      res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
  }
);

// ── Login ─────────────────────────────────────────────────────────────────────
router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('A valid email address is required.'),
    body('password').notEmpty().withMessage('Password is required.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { email, password } = req.body;

    try {
      const result = await pool.query(`SELECT * FROM users WHERE LOWER(email) = $1`, [email]);

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const user = result.rows[0];

      // ── Lockout check ─────────────────────────────────────────────────────
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        const remainingMs = new Date(user.locked_until) - new Date();
        const remainingMin = Math.ceil(remainingMs / 60000);
        return res.status(429).json({
          error: `Account locked due to too many failed attempts. Try again in ${remainingMin} minute(s).`,
          locked: true,
          locked_until: user.locked_until,
        });
      }

      const validPassword = await bcrypt.compare(password, user.password_hash);

      if (!validPassword) {
        // Increment failed attempts
        const newAttempts = (user.failed_attempts || 0) + 1;
        if (newAttempts >= MAX_FAILED_ATTEMPTS) {
          const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
          await pool.query(
            `UPDATE users SET failed_attempts = $1, locked_until = $2 WHERE id = $3`,
            [newAttempts, lockedUntil, user.id]
          );
          return res.status(429).json({
            error: `Account locked after ${MAX_FAILED_ATTEMPTS} failed attempts. Try again in 15 minutes.`,
            locked: true,
            locked_until: lockedUntil,
          });
        }
        await pool.query(
          `UPDATE users SET failed_attempts = $1 WHERE id = $2`,
          [newAttempts, user.id]
        );
        const remaining = MAX_FAILED_ATTEMPTS - newAttempts;
        return res.status(401).json({
          error: `Invalid email or password. ${remaining} attempt(s) remaining before lockout.`,
        });
      }

      // ── Approval check ────────────────────────────────────────────────────
      if (!user.is_approved) {
        return res.status(403).json({
          error: 'Your account is pending admin approval. Please wait for approval before logging in.',
        });
      }

      // ── Success: reset lockout counters ───────────────────────────────────
      await pool.query(
        `UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1`,
        [user.id]
      );

      const token = jwt.sign(
        { id: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Secure httpOnly cookie (primary) + token in body (fallback for SPA)
      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/',
      });

      res.json({ token, role: user.role, message: 'Login successful' });
    } catch (err) {
      console.error('[Login]', err.message);
      res.status(500).json({ error: 'Login failed. Please try again.' });
    }
  }
);

// ── GET /api/auth/profile ────────────────────────────────────────────────────
router.get('/profile', authenticate, async (req, res) => {
  const { id, role } = req.user;
  try {
    if (role === 'student') {
      const result = await pool.query(
        `SELECT s.full_name, s.student_number, s.program, s.year_level,
                COALESCE(s.email, u.email) AS email, COALESCE(s.phone, '') AS phone
         FROM students s JOIN users u ON s.user_id = u.id
         WHERE s.user_id = $1`,
        [id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Profile not found.' });
      return res.json({ role, ...result.rows[0] });
    }
    if (role === 'professor') {
      const result = await pool.query(
        `SELECT p.full_name, p.department,
                COALESCE(p.email, u.email) AS email, COALESCE(p.phone, '') AS phone
         FROM professors p JOIN users u ON p.user_id = u.id
         WHERE p.user_id = $1`,
        [id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Profile not found.' });
      return res.json({ role, ...result.rows[0] });
    }
    return res.status(400).json({ error: 'Profile not available for this role.' });
  } catch (err) {
    console.error('[Profile GET]', err.message);
    res.status(500).json({ error: 'Failed to fetch profile.' });
  }
});

// ── PATCH /api/auth/profile ──────────────────────────────────────────────────
router.patch(
  '/profile',
  authenticate,
  [
    body('full_name').trim().notEmpty().withMessage('Full name is required.'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email format.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { id, role } = req.user;
    try {
      if (role === 'student') {
        const { full_name, student_number, program, year_level, email, phone } = req.body;
        if (!student_number) return res.status(400).json({ error: 'Student number is required.' });
        await pool.query(
          `UPDATE students SET full_name = $1, student_number = $2, program = $3,
                  year_level = $4, email = $5, phone = $6
           WHERE user_id = $7`,
          [full_name, student_number, program || null,
           year_level ? parseInt(year_level) : null, email || null, phone || null, id]
        );
        return res.json({ message: 'Profile updated.' });
      }
      if (role === 'professor') {
        const { full_name, department, email, phone } = req.body;
        await pool.query(
          `UPDATE professors SET full_name = $1, department = $2, email = $3, phone = $4
           WHERE user_id = $5`,
          [full_name, department || null, email || null, phone || null, id]
        );
        return res.json({ message: 'Profile updated.' });
      }
      return res.status(400).json({ error: 'Profile update not available for this role.' });
    } catch (err) {
      console.error('[Profile PATCH]', err.message);
      res.status(500).json({ error: 'Failed to update profile.' });
    }
  }
);

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
  res.json({ message: 'Logged out successfully.' });
});

module.exports = router;
