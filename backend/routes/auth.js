const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/db');

// Register — students and professors start unapproved
router.post('/register', async (req, res) => {
  const { email, password, role, full_name, student_number, program, year_level, department } = req.body;

  if (!['student', 'professor'].includes(role)) {
    return res.status(400).json({ error: 'Self-registration is only available for students and professors.' });
  }

  try {
    const password_hash = await bcrypt.hash(password, 10);

    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, role, is_approved)
       VALUES ($1, $2, $3, false) RETURNING id`,
      [email, password_hash, role]
    );

    const userId = userResult.rows[0].id;

    if (role === 'student') {
      await pool.query(
        `INSERT INTO students (user_id, full_name, student_number, program, year_level)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, full_name, student_number, program, year_level]
      );
    } else if (role === 'professor') {
      await pool.query(
        `INSERT INTO professors (user_id, full_name, department)
         VALUES ($1, $2, $3)`,
        [userId, full_name, department]
      );
    }

    res.status(201).json({ message: 'Registration successful. Your account is pending admin approval.' });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') return res.status(400).json({ error: 'Email or student number already registered.' });
    res.status(500).json({ error: err.message });
  }
});

// Login — blocks unapproved accounts
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.is_approved) {
      return res.status(403).json({ error: 'Your account is pending admin approval. Please wait for approval before logging in.' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, role: user.role, message: 'Login successful' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
