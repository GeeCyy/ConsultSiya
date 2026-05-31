const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
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

      // ── Deactivation check ────────────────────────────────────────────────
      if (user.is_active === false) {
        return res.status(403).json({
          error: 'Your account has been deactivated. Please contact an administrator.',
          deactivated: true,
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
// Only columns guaranteed to exist in the base schema are used in the main JOIN.
// phone is fetched separately so a missing column never blocks profile data.
router.get('/profile', authenticate, async (req, res) => {
  const { id, role } = req.user;
  try {
    if (role === 'student') {
      const result = await pool.query(
        `SELECT u.email,
                s.full_name, s.student_number, s.program, s.year_level
         FROM users u
         LEFT JOIN students s ON s.user_id = u.id
         WHERE u.id = $1`,
        [id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Profile not found.' });

      let phone = '';
      try {
        const r = await pool.query(`SELECT phone FROM students WHERE user_id = $1`, [id]);
        phone = r.rows[0]?.phone || '';
      } catch { /* 42703 — phone column not yet added */ }

      let avatar = null;
      try {
        const r = await pool.query(`SELECT avatar FROM users WHERE id = $1`, [id]);
        avatar = r.rows[0]?.avatar ?? null;
      } catch { /* column not yet ready */ }

      return res.json({ role, ...result.rows[0], phone, avatar });
    }
    if (role === 'professor') {
      const result = await pool.query(
        `SELECT u.email,
                p.full_name, p.department
         FROM users u
         LEFT JOIN professors p ON p.user_id = u.id
         WHERE u.id = $1`,
        [id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Profile not found.' });

      let phone = '';
      try {
        const r = await pool.query(`SELECT phone FROM professors WHERE user_id = $1`, [id]);
        phone = r.rows[0]?.phone || '';
      } catch { /* 42703 — phone column not yet added */ }

      let avatar = null;
      try {
        const r = await pool.query(`SELECT avatar FROM users WHERE id = $1`, [id]);
        avatar = r.rows[0]?.avatar ?? null;
      } catch { /* column not yet ready */ }

      return res.json({ role, ...result.rows[0], phone, avatar });
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

        try {
          await pool.query(
            `UPDATE students SET full_name = $1, student_number = $2, program = $3,
                    year_level = $4, email = $5, phone = $6
             WHERE user_id = $7`,
            [full_name, student_number, program || null,
             year_level ? parseInt(year_level) : null, email || null, phone || null, id]
          );
        } catch (colErr) {
          if (colErr.code !== '42703') throw colErr;
          // phone/email columns not yet added — update base columns only
          await pool.query(
            `UPDATE students SET full_name = $1, student_number = $2, program = $3, year_level = $4
             WHERE user_id = $5`,
            [full_name, student_number, program || null,
             year_level ? parseInt(year_level) : null, id]
          );
        }
        if (email) {
          await pool.query(`UPDATE users SET email = $1 WHERE id = $2`, [email, id]);
        }
        return res.json({ message: 'Profile updated.' });
      }
      if (role === 'professor') {
        const { full_name, department, email, phone } = req.body;
        try {
          await pool.query(
            `UPDATE professors SET full_name = $1, department = $2, email = $3, phone = $4
             WHERE user_id = $5`,
            [full_name, department || null, email || null, phone || null, id]
          );
        } catch (colErr) {
          if (colErr.code !== '42703') throw colErr;
          await pool.query(
            `UPDATE professors SET full_name = $1, department = $2 WHERE user_id = $3`,
            [full_name, department || null, id]
          );
        }
        if (email) {
          await pool.query(`UPDATE users SET email = $1 WHERE id = $2`, [email, id]);
        }
        return res.json({ message: 'Profile updated.' });
      }
      return res.status(400).json({ error: 'Profile update not available for this role.' });
    } catch (err) {
      console.error('[Profile PATCH]', err.message);
      res.status(500).json({ error: 'Failed to update profile.' });
    }
  }
);

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
router.post(
  '/forgot-password',
  authLimiter,
  [body('email').isEmail().withMessage('A valid email address is required.')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const email = req.body.email.trim().toLowerCase();
    console.log(`[Forgot Password] Received request for email: "${email}"`);
    try {
      const result = await pool.query(`SELECT id, email FROM users WHERE LOWER(email) = $1`, [email]);
      console.log(`[Forgot Password] DB rows found: ${result.rows.length}`, result.rows.map(r => r.email));

      // Always return success to avoid leaking which emails are registered
      if (result.rows.length === 0) {
        console.log(`[Forgot Password] No user found for "${email}" — no link generated`);
        return res.json({ message: 'If that email is registered, a reset link has been sent.' });
      }

      const userId = result.rows[0].id;
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await pool.query(
        `UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3`,
        [token, expires, userId]
      );

      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
      console.log(`[Password Reset] Link for ${email}: ${resetUrl}`);

      res.json({ message: 'If that email is registered, a reset link has been sent.' });
    } catch (err) {
      console.error('[Forgot Password]', err.message);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  }
);

// ── POST /api/auth/reset-password ────────────────────────────────────────────
router.post(
  '/reset-password',
  authLimiter,
  [
    body('token').notEmpty().withMessage('Reset token is required.'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { token, password } = req.body;
    try {
      const result = await pool.query(
        `SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW()`,
        [token]
      );

      if (result.rows.length === 0) {
        return res.status(400).json({ error: 'Reset link is invalid or has expired.' });
      }

      const userId = result.rows[0].id;
      const password_hash = await bcrypt.hash(password, 12);

      await pool.query(
        `UPDATE users
         SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL,
             failed_attempts = 0, locked_until = NULL
         WHERE id = $2`,
        [password_hash, userId]
      );

      res.json({ message: 'Password reset successfully. You can now log in.' });
    } catch (err) {
      console.error('[Reset Password]', err.message);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
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
