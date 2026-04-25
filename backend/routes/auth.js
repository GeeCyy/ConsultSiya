const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/db');

// Register
router.post('/register', async (req, res) => {
  const { email, password, role, full_name, student_number, program, year_level, department } = req.body;

  try {
    // Hash the password
    const password_hash = await bcrypt.hash(password, 10);

    // Create user
    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, role) 
       VALUES ($1, $2, $3) RETURNING id`,
      [email, password_hash, role]
    );

    const userId = userResult.rows[0].id;

    // Create profile based on role
    if (role === 'student') {
      await pool.query(
        `INSERT INTO students (user_id, full_name, student_number, program, year_level)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, full_name, student_number, program, parseInt(year_level) || null]
      );
    } else if (role === 'professor') {
      await pool.query(
        `INSERT INTO professors (user_id, full_name, department) 
         VALUES ($1, $2, $3)`,
        [userId, full_name, department]
      );
    }

    res.status(201).json({ message: 'User registered successfully' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find user
    const result = await pool.query(
      `SELECT * FROM users WHERE email = $1`, 
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Create token
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