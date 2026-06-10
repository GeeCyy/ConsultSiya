const express = require('express');
const router = express.Router();
const pool = require('../db/db');
const { authenticate } = require('../middleware/auth.middleware');

// Top 5 professors by completed consultations
router.get('/professors', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC)::int AS rank,
        p.full_name AS name,
        COUNT(*)::int AS count
      FROM consultations c
      JOIN professors p ON c.professor_id = p.id
      WHERE c.status = 'completed'
      GROUP BY p.id, p.full_name
      ORDER BY count DESC
      LIMIT 5
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Top 5 students by completed consultations
router.get('/students', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC)::int AS rank,
        s.full_name AS name,
        COUNT(*)::int AS count
      FROM consultations c
      JOIN students s ON c.student_id = s.id
      WHERE c.status = 'completed'
      GROUP BY s.id, s.full_name
      ORDER BY count DESC
      LIMIT 5
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Top 5 most frequent nature_of_advising topics from completed consultations
router.get('/topics', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC)::int AS rank,
        topic AS label,
        COUNT(*)::int AS count
      FROM (
        SELECT jsonb_array_elements_text(nature_of_advising::jsonb) AS topic
        FROM consultations
        WHERE status = 'completed'
          AND nature_of_advising IS NOT NULL
          AND nature_of_advising LIKE '[%'
        UNION ALL
        SELECT nature_of_advising AS topic
        FROM consultations
        WHERE status = 'completed'
          AND nature_of_advising IS NOT NULL
          AND nature_of_advising <> ''
          AND nature_of_advising NOT LIKE '[%'
      ) t
      WHERE topic IS NOT NULL AND topic <> ''
      GROUP BY topic
      ORDER BY count DESC
      LIMIT 5
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
