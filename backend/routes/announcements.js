const express = require('express');
const router = express.Router();
const pool = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// GET /api/announcements — public, no auth required (shown on login page)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, body, version, pinned, created_at
       FROM announcements
       ORDER BY pinned DESC, created_at DESC
       LIMIT 20`
    );
    res.json(result.rows);
  } catch (err) {
    // Table may not exist yet — return empty array gracefully
    if (err.code === '42P01') return res.json([]);
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/announcements — admin only
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { title, body, version, pinned } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'title and body are required.' });
  try {
    const result = await pool.query(
      `INSERT INTO announcements (title, body, version, pinned, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, body, version, pinned, created_at`,
      [title, body, version || null, pinned || false, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/announcements/:id — admin only
router.patch('/:id', authenticate, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  const { title, body, version, pinned } = req.body;
  try {
    const result = await pool.query(
      `UPDATE announcements
       SET title = COALESCE($2, title),
           body = COALESCE($3, body),
           version = COALESCE($4, version),
           pinned = COALESCE($5, pinned),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, title, body, version, pinned, created_at, updated_at`,
      [id, title || null, body || null, version || null, pinned ?? null]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Announcement not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/announcements/:id — admin only
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM announcements WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Announcement not found.' });
    res.json({ message: 'Announcement deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
