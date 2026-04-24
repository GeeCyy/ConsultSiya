const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const pool = require('./db/db');
const { authenticate } = require('./middleware/auth.middleware');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Static uploads (serve uploaded forms)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/schedules', require('./routes/schedules'));
app.use('/api/consultations', require('./routes/consultations'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/forms', require('./routes/forms'));

// Health check routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'ConsultSiya API is running!' });
});

app.get('/db-health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Protected test route
app.get('/api/protected', authenticate, (req, res) => {
  res.json({ message: `Hello ${req.user.role}!`, user: req.user });
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});