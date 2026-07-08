const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const pool = require('../db/db');
const { authenticate } = require('../middleware/auth.middleware');
const notifModule = require('./notifications');


// ── Auth-specific rate limiter: max 100 requests per 15 min per IP ────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
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

    // Validate role-specific fields before touching the database
    if (role === 'student') {
      if (!student_number || !/^\d{10}$/.test(student_number)) {
        return res.status(400).json({ error: 'Student number must be exactly 10 digits.' });
      }
    }

    const client = await pool.connect();
    try {
      const password_hash = await bcrypt.hash(password, 12);

      // Check if admin approval is required (default: true)
      let requireApproval = true;
      try {
        const settingRes = await client.query(
          `SELECT value FROM system_settings WHERE key = 'require_admin_approval'`
        );
        if (settingRes.rows.length > 0) requireApproval = settingRes.rows[0].value !== 'false';
      } catch { /* system_settings table not yet created — keep default */ }

      await client.query('BEGIN');

      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, role, is_approved)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [email, password_hash, role, !requireApproval]
      );

      const userId = userResult.rows[0].id;

      if (role === 'student') {
        await client.query(
          `INSERT INTO students (user_id, full_name, student_number, program, year_level)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, full_name, student_number, program || null, year_level ? parseInt(year_level) : null]
        );
      } else {
        await client.query(
          `INSERT INTO professors (user_id, full_name, department)
           VALUES ($1, $2, $3)`,
          [userId, full_name, department || null]
        );
      }

      await client.query('COMMIT');

      res.status(201).json({
        message: requireApproval
          ? 'Registration successful. Your account is pending admin approval.'
          : 'Registration successful.',
        requires_approval: requireApproval,
      });

      // Notify all admins of the new pending registration (fire-and-forget)
      pool.query(`SELECT id FROM users WHERE role = 'admin'`).then(admins => {
        admins.rows.forEach(admin => notifModule.insertAndPush(
          admin.id,
          'new_registration',
          `New account pending approval: ${full_name} (${role})`,
          { userId, route: 'accounts' }
        ));
      }).catch(() => {});
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[Register]', err.code, err.message);
      if (err.code === '23505') return res.status(400).json({ error: 'Email or student number already registered.' });
      res.status(500).json({ error: 'Registration failed. Please try again.' });
    } finally {
      client.release();
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
        let requireApproval = true;
        try {
          const settingRes = await pool.query(
            `SELECT value FROM system_settings WHERE key = 'require_admin_approval'`
          );
          if (settingRes.rows.length > 0) requireApproval = settingRes.rows[0].value !== 'false';
        } catch { /* keep default */ }

        if (requireApproval) {
          return res.status(403).json({
            error: 'Your account is pending admin approval. Please wait for approval before logging in.',
          });
        }
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
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/',
      });

      res.json({ token, role: user.role, email: user.email, message: 'Login successful' });
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

      let saved_signature = null;
      try {
        const r = await pool.query(`SELECT saved_signature FROM students WHERE user_id = $1`, [id]);
        saved_signature = r.rows[0]?.saved_signature ?? null;
      } catch { /* column not yet ready */ }

      return res.json({ role, ...result.rows[0], phone, avatar, saved_signature });
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

// ── PUT /api/auth/signature — save/update a student's reusable signature ────
router.put('/signature', authenticate, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Only students can save a signature.' });

  const { signature } = req.body;
  const value = (typeof signature === 'string' && signature.startsWith('data:image/png;base64,') && signature.length <= 300_000)
    ? signature
    : null;

  try {
    await pool.query(`UPDATE students SET saved_signature = $1 WHERE user_id = $2`, [value, req.user.id]);
    res.json({ message: 'Signature saved.' });
  } catch (err) {
    console.error('[Signature PUT]', err.message);
    res.status(500).json({ error: 'Failed to save signature.' });
  }
});

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
router.post(
  '/forgot-password',
  authLimiter,
  [body('email').isEmail().withMessage('A valid email address is required.')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const email = req.body.email.trim().toLowerCase();
    try {
      const result = await pool.query(`SELECT id, email FROM users WHERE LOWER(email) = $1`, [email]);

      // Always return success to avoid leaking which emails are registered
      if (result.rows.length === 0) {
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

      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'ConsultSiya', email: process.env.EMAIL_FROM },
          to: [{ email: result.rows[0].email }],
          subject: 'ConsultSiya - Password Reset Request',
          htmlContent: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#b91c1c;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">ConsultSiya</h1>
              <p style="margin:6px 0 0;color:#fca5a5;font-size:13px;">Mapúa School of Information Technology</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h2 style="margin:0 0 12px;color:#111827;font-size:18px;font-weight:600;">Password Reset Request</h2>
              <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.6;">
                We received a request to reset the password for your ConsultSiya account. Click the button below to set a new password.
              </p>
              <p style="margin:0 0 28px;color:#4b5563;font-size:14px;line-height:1.6;">
                This link will expire in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email.
              </p>
              <!-- Button -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:8px;background:#b91c1c;">
                    <a href="${resetUrl}" target="_blank" style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                      Reset My Password
                    </a>
                  </td>
                </tr>
              </table>
              <!-- Fallback link -->
              <p style="margin:28px 0 0;color:#9ca3af;font-size:12px;line-height:1.6;">
                If the button doesn't work, copy and paste this link into your browser:<br />
                <a href="${resetUrl}" style="color:#b91c1c;word-break:break-all;">${resetUrl}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #f3f4f6;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                &copy; ${new Date().getFullYear()} ConsultSiya &mdash; Mapúa SOIT. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
        }),
      });

      if (!brevoRes.ok) {
        const errBody = await brevoRes.json().catch(() => ({}));
        console.error('[Password Reset] Brevo error:', brevoRes.status, errBody);
        return res.status(500).json({ error: 'Failed to send reset email. Please try again.' });
      }

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
