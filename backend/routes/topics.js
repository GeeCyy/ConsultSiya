const express = require('express');
const router = express.Router();
const pool = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// GET /api/topics — all active topics ordered by display_order (public)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, label, duration_minutes, display_order
       FROM topics WHERE is_active = true
       ORDER BY display_order ASC, id ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/topics — admin: create topic
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { label, duration_minutes, display_order } = req.body;
  if (!label?.trim()) return res.status(400).json({ error: 'Label is required.' });
  const dur = Number(duration_minutes);
  if (isNaN(dur) || dur < 5 || dur > 480) {
    return res.status(400).json({ error: 'Duration must be between 5 and 480 minutes.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO topics (label, duration_minutes, display_order)
       VALUES ($1, $2, $3) RETURNING *`,
      [label.trim(), dur, display_order ?? 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A topic with this label already exists.' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/topics/:id — admin: update topic
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  const { label, duration_minutes, display_order, is_active } = req.body;
  if (duration_minutes !== undefined) {
    const dur = Number(duration_minutes);
    if (isNaN(dur) || dur < 5 || dur > 480) {
      return res.status(400).json({ error: 'Duration must be between 5 and 480 minutes.' });
    }
  }
  try {
    const result = await pool.query(
      `UPDATE topics
       SET label            = COALESCE($1, label),
           duration_minutes = COALESCE($2, duration_minutes),
           display_order    = COALESCE($3, display_order),
           is_active        = COALESCE($4, is_active)
       WHERE id = $5
       RETURNING *`,
      [
        label?.trim() || null,
        duration_minutes !== undefined ? Number(duration_minutes) : null,
        display_order !== undefined ? Number(display_order) : null,
        is_active !== undefined ? Boolean(is_active) : null,
        req.params.id,
      ]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Topic not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A topic with this label already exists.' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/topics/:id — admin: soft-delete (deactivate)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE topics SET is_active = false WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Topic not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
