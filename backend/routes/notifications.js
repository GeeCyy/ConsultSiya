const express = require('express');
const router = express.Router();
const pool = require('../db/db');
const { authenticate } = require('../middleware/auth.middleware');
const jwt = require('jsonwebtoken');

// userId (number) → Set<Response>  (supports multiple browser tabs per user)
const clients = new Map();

function pushNotification(userId, data) {
  const conns = clients.get(Number(userId));
  if (!conns || conns.size === 0) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of conns) {
    try { res.write(payload); } catch { conns.delete(res); }
  }
}

async function insertAndPush(userId, type, message, metadata = null) {
  try {
    const result = await pool.query(
      `INSERT INTO notifications (user_id, type, message, metadata) VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, type, message, metadata ? JSON.stringify(metadata) : null]
    );
    pushNotification(userId, result.rows[0]);
    return result.rows[0];
  } catch (err) {
    console.error('[notifications] insertAndPush error:', err.message);
    return null;
  }
}

// SSE stream — EventSource can't send custom headers, so accept token in query param
router.get('/stream', (req, res) => {
  const token = req.cookies?.auth_token || req.query.token;
  if (!token) return res.status(401).end();

  let user;
  try { user = jwt.verify(token, process.env.JWT_SECRET); }
  catch { return res.status(403).end(); }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  const userId = Number(user.id);
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);

  // Heartbeat every 25s to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 25000);

  // Confirm connection to client
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  req.on('close', () => {
    clearInterval(heartbeat);
    const conns = clients.get(userId);
    if (conns) {
      conns.delete(res);
      if (conns.size === 0) clients.delete(userId);
    }
  });
});

// Get notifications (latest 50, newest first)
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Mark all read
router.patch('/read-all', authenticate, async (req, res) => {
  try {
    await pool.query(`UPDATE notifications SET is_read = true WHERE user_id = $1`, [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Mark single notification read
router.patch('/:id/read', authenticate, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.pushNotification = pushNotification;
router.insertAndPush = insertAndPush;
module.exports = router;
