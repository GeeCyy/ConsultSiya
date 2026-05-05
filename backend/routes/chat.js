const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const pool = require('../db/db');
const { authenticate } = require('../middleware/auth.middleware');

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many chatbot requests. Please slow down.' },
});

// Keyword buckets that map to concern types stored in professor_responsibilities.
// When no DB match exists, we fall back to listing all professors.
const KEYWORD_MAP = [
  { keywords: ['thesis', 'design subject', 'capstone'], concern: 'Thesis/Design Subject concerns' },
  { keywords: ['topic', 'subject', 'mentoring', 'clarification', 'enrolled'], concern: 'Mentoring/Clarification on the Topic of the Subjects Enrolled' },
  { keywords: ['requirement', 'course', 'grade'], concern: 'Requirements in Courses Enrolled' },
  { keywords: ['elective', 'track', 'curriculum'], concern: 'Concerns about Electives/Tracks in the Curriculum' },
  { keywords: ['internship', 'ojt', 'on-the-job'], concern: 'Concerns on Internship/OJT Matters' },
  { keywords: ['placement', 'employment', 'job', 'career'], concern: 'Concerns regarding Placement/Employment Opportunities' },
  { keywords: ['personal', 'family', 'mental', 'health', 'counseling'], concern: 'Concerns regarding Personal/Family, etc.' },
  { keywords: ['schedule', 'consultation', 'appointment', 'booking', 'book', 'consult'], concern: null },
  { keywords: ['professor', 'faculty', 'adviser', 'advisor', 'responsible', 'concern'], concern: null },
];

function detectConcern(message) {
  const lower = message.toLowerCase();
  for (const entry of KEYWORD_MAP) {
    if (entry.keywords.some(k => lower.includes(k))) return entry.concern;
  }
  return null;
}

// POST /api/chat — authenticated users only
router.post(
  '/',
  authenticate,
  chatLimiter,
  [body('message').trim().isLength({ min: 1, max: 500 }).withMessage('Message must be 1–500 characters.')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { message } = req.body;
    const lower = message.toLowerCase();

    try {
      // ── Greeting ──────────────────────────────────────────────────────────
      if (/^(hi|hello|hey|good\s*(morning|afternoon|evening))\b/.test(lower)) {
        return res.json({
          reply: "Hello! I'm the ConsultSiya assistant. You can ask me things like:\n• \"Who handles thesis concerns?\"\n• \"Who is responsible for OJT matters?\"\n• \"Show me all professors\"\n• \"How do I book a consultation?\"",
        });
      }

      // ── Booking help ──────────────────────────────────────────────────────
      if (lower.includes('book') || lower.includes('how to') || lower.includes('appointment')) {
        return res.json({
          reply: "To book a consultation:\n1. Go to your Student Dashboard\n2. Click **Book a Consultation**\n3. Select a professor and an available time slot\n4. Choose your preferred mode (Face-to-Face or Online)\n5. Fill in the nature of your concern and submit\n\nYour booking will be pending until the professor confirms it.",
        });
      }

      // ── List all professors ───────────────────────────────────────────────
      if (lower.includes('all professor') || lower.includes('list professor') || lower.includes('show professor')) {
        const result = await pool.query(
          `SELECT p.full_name, p.department FROM professors p
           JOIN users u ON p.user_id = u.id
           WHERE u.is_approved = true
           ORDER BY p.full_name`
        );
        if (result.rows.length === 0) {
          return res.json({ reply: 'No professors are currently listed in the system.' });
        }
        const list = result.rows.map(r => `• **${r.full_name}** — ${r.department || 'N/A'}`).join('\n');
        return res.json({ reply: `Here are the available professors:\n${list}` });
      }

      // ── Professor responsible for a concern ───────────────────────────────
      const concern = detectConcern(message);

      if (concern) {
        // Try DB responsibility mapping first
        const mapped = await pool.query(
          `SELECT p.full_name, p.department FROM professor_responsibilities pr
           JOIN professors p ON pr.professor_id = p.id
           JOIN users u ON p.user_id = u.id
           WHERE pr.concern_type = $1 AND u.is_approved = true
           ORDER BY p.full_name`,
          [concern]
        );

        if (mapped.rows.length > 0) {
          const list = mapped.rows.map(r => `• **${r.full_name}** (${r.department || 'N/A'})`).join('\n');
          return res.json({
            reply: `For **${concern}**, the following professor(s) are assigned:\n${list}\n\nYou can book a consultation with them from your dashboard.`,
          });
        }

        // Fallback: show all professors available for that concern type
        const allProfs = await pool.query(
          `SELECT p.full_name, p.department FROM professors p
           JOIN users u ON p.user_id = u.id
           WHERE u.is_approved = true ORDER BY p.full_name`
        );

        if (allProfs.rows.length === 0) {
          return res.json({ reply: 'No professors are currently available. Please check back later.' });
        }

        const list = allProfs.rows.map(r => `• **${r.full_name}** — ${r.department || 'N/A'}`).join('\n');
        return res.json({
          reply: `For concerns about **${concern}**, you may consult any of the following professors:\n${list}\n\nBook a slot from your dashboard.`,
        });
      }

      // ── Default fallback ──────────────────────────────────────────────────
      return res.json({
        reply: "I'm not sure I understood that. Try asking:\n• \"Who handles thesis concerns?\"\n• \"Who is responsible for OJT matters?\"\n• \"How do I book a consultation?\"\n• \"Show me all professors\"",
      });
    } catch (err) {
      console.error('[Chat]', err.message);
      res.status(500).json({ error: 'Chatbot error. Please try again.' });
    }
  }
);

module.exports = router;
