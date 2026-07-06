const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const pool = require('../db/db');
const { authenticate } = require('../middleware/auth.middleware');

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
console.log('[AI] Using GROQ model:', GROQ_MODEL);

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
          reply: "Hello! I'm the Consulta assistant. You can ask me things like:\n• \"Who handles thesis concerns?\"\n• \"Who is responsible for OJT matters?\"\n• \"Show me all professors\"\n• \"How do I book a consultation?\"",
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
        // Only professors actually assigned this concern's specialization topic
        const mapped = await pool.query(
          `SELECT p.full_name, p.department FROM professors p
           JOIN users u ON p.user_id = u.id
           JOIN professor_specializations ps ON ps.professor_id = p.id
           JOIN topics t ON t.id = ps.topic_id AND t.is_active = true
           WHERE t.label = $1 AND u.is_approved = true
           ORDER BY p.full_name`,
          [concern]
        );

        if (mapped.rows.length > 0) {
          const list = mapped.rows.map(r => `• **${r.full_name}** (${r.department || 'N/A'})`).join('\n');
          return res.json({
            reply: `For **${concern}**, the following professor(s) are assigned:\n${list}\n\nYou can book a consultation with them from your dashboard.`,
          });
        }

        return res.json({
          reply: `No professor is currently assigned to **${concern}**. Please contact the SOIT admin, or check "Show me all professors" to browse everyone.`,
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

// ── AI-powered FAQ assistant ───────────────────────────────────────────────────

const faqLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many AI chat requests. Please slow down.' },
});

const FAQ_SYSTEM_PROMPT = `You are the ConsultSiya assistant — an AI helper built into the FAQ panel of ConsultSiya, an academic consultation booking system for Mapúa University's School of Information Technology (SOIT).

RESPONSE FORMAT:
Always respond with a valid JSON object in this exact format:
{
  "message": "Your answer here.",
  "action": {
    "label": "Friendly button text",
    "route": "/exact/path"
  }
}
Rules for the format:
- "message" is required. Write a warm, conversational answer — no jargon, no raw paths, no parenthetical URLs.
- "action" is optional. Include it only when you can direct the user to a specific page from NAVIGATION PATHS below.
- "route" must be an exact value from NAVIGATION PATHS — never invent, guess, or modify a path.
- If no navigation is needed, omit the "action" field entirely.
- Output exactly ONE JSON object. No markdown code fences. No extra text before or after the JSON object.
- NEVER put any URL, route path, or text like "(/dashboard/...)" inside the "message" field. Navigation belongs only in "action.route". The user sees the action as a clickable button — repeating the path in the message is redundant and confusing.

STRICT RULES:
- If a student shares an academic concern — thesis, grades, OJT, internship, subject mentoring, billing, curriculum, personal matters, or any issue they want to discuss with a professor — treat it as a consultation-related query. Acknowledge their concern, suggest which type of professor handles it, and guide them to book a consultation through ConsultSiya.
- If a professor asks about exporting, generating reports, downloading records, PDF, Excel, or consultation history/summary — help them. This is a core ConsultSiya feature. Direct them to the Export Report tab using /dashboard/professor?view=export.
- If a professor asks about managing their schedule, slots, availability, adding or removing time slots — help them. Direct them to /dashboard/professor?view=schedules.
- If a professor asks about pending requests, confirming bookings, or managing consultations — help them. Direct them to /dashboard/professor?view=consultations.
- Only refuse and say "I can only answer questions about ConsultSiya" for questions that are completely unrelated to academic life or the system — e.g. general trivia, math problems, coding homework, or casual off-topic chat.
- Never make up features or pages that don't exist in ConsultSiya.
- Never answer general knowledge questions, math, coding help, or anything completely outside academic consultation context.
- For navigation, use only the "action" field — never embed links, URLs, route paths, or tab names with slashes inside the "message" text.
- ANTI-HALLUCINATION RULE: When REAL-TIME DATA is injected at the end of this prompt, you MUST only report information that appears verbatim in that data section — student names, student numbers, dates, statuses, and concerns. NEVER invent, generate, or guess names or booking records. If the real-time data is empty or says "none", explicitly say there are no results. This rule overrides any tendency to fill in helpful-sounding examples.
- When you have REAL-TIME DATA with today's consultations, your "message" MUST include the full numbered list — never just say "Here are your consultations:" and stop. Write every entry with \\n between lines. Example format: "Here's what's on your plate today:\\n\\n1. 08:00 — Maria Santos | Confirmed | Online\\n   Concern: Thesis concerns\\n\\n2. 10:00 — Juan dela Cruz | Pending | F2F\\n   Concern: OJT matters\\n\\nHeads up on any pending ones!"
- PLACEHOLDER RULE: Never output bracket-style placeholders like [profName], [Student Name], [X], or any similar template token in your response. The [profId=N] tags in injected data are internal routing tokens — never repeat them in the "message" field. If you don't have a real name or value from the provided data, say you don't have that information rather than using a placeholder.
- When you have REAL-TIME DATA with weekly counts, your "message" MUST include the full breakdown — write out every status with its count, then add an encouraging remark. Example: "Here's your week at a glance:\\n\\n• 3 Pending — waiting on your confirmation\\n• 2 Confirmed — upcoming sessions\\n• 5 Completed — great work!\\n• 1 Cancelled\\n• 0 Missed\\n\\nLooks like a busy week — stay on top of those pending requests!"
- Write every response with warmth, personality, and helpful context. Avoid robotic one-liners like "You can do X by tapping the button below." Lead with useful info, then invite them to tap. Example: instead of "You can export your report by tapping the button below", write "Your consultation records are ready to export as a PDF or Excel file — perfect for keeping your advising records up to date. Tap below to head to the Export page!"
- Never end a response with just "tap the button below" as the entire message — always give helpful context first.

ABOUT CONSULTSIYA:
- ConsultSiya is a web-based academic consultation booking system for Mapúa University SOIT students, professors, and admins.
- Students can book consultations with professors, view their booking history, and receive real-time notifications.
- Professors can manage their availability, set class schedule blockers, approve or reject bookings, and mark consultations as completed or missed.
- Admins can manage users, view reports, export data, and oversee all consultations.

SYSTEM FEATURES:
- Booking: Students go to "Book a Slot" in the sidebar, select a professor, choose an available time slot, select mode (Face-to-Face or Online), fill in the concern, and submit.
- Consultation statuses: Pending, Confirmed, Completed, Cancelled, Missed.
- Missed consultations are auto-marked by the system if not acted on after the scheduled time.
- Notifications: Real-time via SSE (server-sent events). Bell icon in the navbar shows unread count.
- Leaderboard: Shows top professors and students by consultation count.
- Reports: Admins and professors can export consultation reports in PDF or Excel format following Mapúa FM-AS-19-00 format.
- Calendar: Shows all consultations color-coded by status. Professors can block dates using class schedule blockers.
- Profile: Users can update their avatar (stored on Cloudinary), bio, phone, and preferred consultation mode.
- Dark mode: Toggle available in the sidebar.

LIVE SCHEDULE DATA:
- When a "LIVE SCHEDULE DATA" section is appended at the end of this prompt, it contains real-time slot availability fetched directly from the database.
- Use it to answer schedule and availability questions accurately. Present the slots clearly in the "message" field.
- When LIVE SCHEDULE DATA is present, lead with the specific slot information immediately — do not open with generic advice like "you can browse the Book a Slot tab." Give the data first, then optionally add a brief follow-up.
- When showing schedule data for a specific professor, include an action pointing to /dashboard/student/book/prof/{id} using that professor's [profId=N] from the data. If showing multiple professors, use /dashboard/student?view=book.
- If no LIVE SCHEDULE DATA is present and a user asks about availability, tell them to go to the Book a Slot tab and browse there.
- When LIVE SCHEDULE DATA lists professor availability for today, this week, or this month: list every professor by name with their time slot(s) and location. Group multiple slots under the same professor. If the data says no slots exist for that period, say so clearly and suggest the Book a Slot tab for any updates.

NAVIGATION PATHS (only use these exact values for "action.route" — no others exist):

Student dashboard (use when helping a student navigate):
- /dashboard/student — Student dashboard home tab
- /dashboard/student?view=book — Book a Slot tab (to start booking a consultation)
- /dashboard/student?view=my — My Consultations tab (active, pending, confirmed bookings)
- /dashboard/student?view=history — History tab (past completed/cancelled consultations)

Professor dashboard (use when helping a professor navigate):
- /dashboard/professor — Professor dashboard home tab
- /dashboard/professor?view=consultations — Consultations tab (manage bookings)
- /dashboard/professor?view=schedules — Manage Schedules tab (add/edit availability slots)
- /dashboard/professor?view=calendar — Calendar tab
- /dashboard/professor?view=export — Reports / Export tab (PDF and Excel reports)
- /dashboard/professor?view=history — History tab

Other pages:
- /dashboard/admin — Admin dashboard
- /dashboard/help — Help & FAQ page
- /dashboard/home — Shared home page

Rules:
- /dashboard/student/book/prof/{id} — Direct booking page for a specific professor. ONLY use this route in "action.route" when LIVE SCHEDULE DATA is present and contains [profId=N] for the professor being discussed. Replace {id} with the exact number from [profId=N]. Example: if data shows [profId=3], use /dashboard/student/book/prof/3.
- If no specific professor is identified from LIVE SCHEDULE DATA, use /dashboard/student?view=book instead.
- Notifications are the bell icon in the top navbar — no separate page, never include an action for this.

Always be concise, friendly, and specific to ConsultSiya. If unsure, suggest contacting the SOIT admin.`;

// Keywords that suggest the user is asking which professor handles a concern/topic.
// Use stems where possible so a single entry covers all inflections
// (e.g. 'specializ' matches specializes/specialized/specialization/specializing).
const PROF_REC_KEYWORDS = [
  // Who-handles / responsibility
  'who handles', 'who is responsible', 'who can help', 'who should i',
  'who to consult', 'who do i consult', 'who do i go to', 'who can i ask',
  // Recommendation / suggestion
  'recommend', 'suggest a prof', 'suggest a professor', 'suggest me a prof',
  // Best / expert
  'best professor', 'best prof', "who's the best", 'whos the best',
  'expert in', 'expert on', 'good at',
  // Specialization stem (covers specializes/specialized/specialization/specializing)
  'specializ',
  // Generic topic/concern shortcuts
  'professor for', 'prof for', 'responsible for', 'best for',
  // Topic-specific shortcuts
  'handles thesis', 'handles ojt', 'handles internship', 'handles elective',
  'handles requirement', 'handles personal', 'handles placement',
  'responsible for thesis', 'responsible for ojt',
];

async function buildProfSpecContext(latestMsg) {
  if (!PROF_REC_KEYWORDS.some(k => latestMsg.includes(k))) return '';

  // If the message maps to one of the system's canonical concern types (same
  // mapping the plain /api/chat endpoint uses), filter at the DB level so the
  // model only ever sees professors actually assigned to that concern — it
  // can't recommend an irrelevant professor if one is never in its context.
  const concern = detectConcern(latestMsg);

  if (concern) {
    const matched = await pool.query(
      `SELECT p.full_name, p.id AS professor_id
       FROM professors p
       JOIN users u ON p.user_id = u.id
       JOIN professor_specializations ps ON ps.professor_id = p.id
       JOIN topics t ON t.id = ps.topic_id AND t.is_active = true
       WHERE u.is_approved = true AND t.label = $1
       ORDER BY p.full_name`,
      [concern]
    );

    if (matched.rows.length === 0) {
      return `\n\nPROFESSOR SPECIALIZATIONS DATA (live from the database): No professor is currently assigned to handle "${concern}". Tell the student plainly that no one is assigned to this yet and suggest contacting the SOIT admin — do NOT invent or guess a name.`;
    }

    const lines = matched.rows.map(r => `• ${r.full_name} [profId=${r.professor_id}]: ${concern}`);
    return `\n\nPROFESSOR SPECIALIZATIONS DATA (live from the database — these are the ONLY professors relevant to "${concern}"):\n` +
      lines.join('\n') +
      `\n\nIMPORTANT: Only recommend professors from this list — they are the professors actually assigned to handle "${concern}". Never recommend or invent any professor not listed here.`;
  }

  // No canonical concern matched (e.g. a free-form specialization like "who's
  // good at databases") — fall back to the full roster and let the model do
  // semantic matching against each professor's listed topics.
  const rows = await pool.query(
    `SELECT p.full_name, p.id AS professor_id, p.department,
            array_agg(t.label ORDER BY t.display_order) FILTER (WHERE t.id IS NOT NULL) AS topics
     FROM professors p
     JOIN users u ON p.user_id = u.id
     LEFT JOIN professor_specializations ps ON ps.professor_id = p.id
     LEFT JOIN topics t ON t.id = ps.topic_id AND t.is_active = true
     WHERE u.is_approved = true
     GROUP BY p.id, p.full_name, p.department
     ORDER BY p.full_name`
  );

  if (rows.rows.length === 0) return '';

  const lines = rows.rows.map(r => {
    // Prefer admin-assigned specialization topics; fall back to department when none are set
    const topics = r.topics && r.topics.length > 0
      ? r.topics.join('; ')
      : (r.department && r.department.toLowerCase() !== 'others' ? r.department : null);
    if (!topics) return `• ${r.full_name} [profId=${r.professor_id}]: No specializations assigned`;
    return `• ${r.full_name} [profId=${r.professor_id}]: ${topics}`;
  });

  return '\n\nPROFESSOR SPECIALIZATIONS DATA (live from the database — use ONLY this to answer who handles what):\n' +
    lines.join('\n') +
    '\n\nIMPORTANT: When this data is present, you MUST only recommend professors whose entry above lists the relevant expertise or concern type. Use reasonable semantic matching (e.g. "programming" matches a professor listed as "Programming"). Never recommend a professor not in this list, and never invent specializations not shown here. If no professor has a matching area, say so explicitly and suggest the student contact the SOIT admin.';
}

// Keywords that suggest the user is asking about schedules or availability
const SCHEDULE_KEYWORDS = [
  'schedule', 'available', 'availability', 'slot', 'when', 'free', 'open', 'time',
  'consult', 'today', 'tomorrow', 'professor', 'prof', 'sir', 'ma\'am', 'maam',
  'consultation', 'book', 'appointment',
];

// Clean up concern text — handles PostgreSQL array strings like ['item1','item2']
function cleanConcern(val) {
  if (!val) return 'No concern specified';
  if (Array.isArray(val)) return val.join(', ');
  const str = String(val).trim();
  if (str.startsWith('[')) {
    try {
      const arr = JSON.parse(str);
      if (Array.isArray(arr)) return arr.join(', ');
    } catch {
      try {
        const arr = JSON.parse(str.replace(/'/g, '"'));
        if (Array.isArray(arr)) return arr.join(', ');
      } catch {}
      return str.slice(1, -1).replace(/['"]/g, '').split(',').map(s => s.trim()).join(', ');
    }
  }
  return str;
}

// Correct a route that is wrong for the user's role
function fixRouteForRole(route, role) {
  if (role === 'professor' && route.startsWith('/dashboard/student')) {
    const view = new URLSearchParams(route.split('?')[1] || '').get('view');
    const map = { book: 'schedules', my: 'consultations', history: 'history' };
    return `/dashboard/professor?view=${map[view] || 'consultations'}`;
  }
  if (role === 'student' && route.startsWith('/dashboard/professor')) {
    const view = new URLSearchParams(route.split('?')[1] || '').get('view');
    const map = { schedules: 'book', consultations: 'my', history: 'history', export: 'my', calendar: 'book' };
    return `/dashboard/student?view=${map[view] || 'my'}`;
  }
  return route;
}

async function buildScheduleContext(latestMsg) {
  if (!SCHEDULE_KEYWORDS.some(k => latestMsg.includes(k))) return '';

  // Fetch all approved professors
  const profRows = await pool.query(
    `SELECT p.id, p.full_name FROM professors p
     JOIN users u ON p.user_id = u.id
     WHERE u.is_approved = true`
  );
  if (profRows.rows.length === 0) return '';

  // Narrow to professors whose name appears in the message
  const matched = profRows.rows.filter(p =>
    p.full_name.toLowerCase().split(/\s+/).some(part => part.length > 2 && latestMsg.includes(part))
  );
  const targetIds = (matched.length > 0 ? matched : profRows.rows).map(p => p.id);

  const slots = await pool.query(
    `SELECT s.date::text AS date, s.day, s.time_start, s.time_end,
            s.time_ranges, s.location, p.id AS professor_id, p.full_name AS professor_name
     FROM schedules s
     JOIN professors p ON s.professor_id = p.id
     JOIN users u ON p.user_id = u.id
     WHERE s.professor_id = ANY($1::int[])
       AND s.is_available = true
       AND (s.date IS NULL OR s.date >= CURRENT_DATE)
       AND u.is_approved = true
     ORDER BY p.full_name, s.date NULLS LAST, s.time_start
     LIMIT 40`,
    [targetIds]
  );

  if (slots.rows.length === 0) return '';

  const lines = slots.rows.map(s => {
    const ranges = Array.isArray(s.time_ranges) && s.time_ranges.length > 0
      ? s.time_ranges.map(tr => `${tr.time_start}–${tr.time_end}`).join(', ')
      : `${s.time_start}–${s.time_end}`;
    const when = s.date ? s.date : `Every ${s.day}`;
    return `• ${s.professor_name} [profId=${s.professor_id}]: ${when}, ${ranges}${s.location ? ` at ${s.location}` : ''}`;
  });

  return '\n\nLIVE SCHEDULE DATA (real-time from the database — use this to answer the question accurately):\n' + lines.join('\n');
}

function to12h(t) {
  if (!t) return '?';
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr || '00';
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return m === '00' ? `${hour}:00 ${suffix}` : `${hour}:${m} ${suffix}`;
}

async function buildProfAvailContext(latestMsg) {
  const isWeek  = ['this week', 'whole week', 'for the week'].some(k => latestMsg.includes(k));
  const isMonth = ['this month', 'whole month', 'for the month'].some(k => latestMsg.includes(k));

  let periodLabel, slots;

  if (isMonth) {
    periodLabel = 'this month';
    slots = await pool.query(
      `SELECT p.id AS professor_id, p.full_name AS professor_name,
              s.date::text AS date, s.day, s.time_start, s.time_end, s.time_ranges, s.location
       FROM schedules s
       JOIN professors p ON s.professor_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE s.is_available = true AND u.is_approved = true
         AND (
           (s.date IS NOT NULL AND s.date >= date_trunc('month', CURRENT_DATE)
            AND s.date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')
           OR s.date IS NULL
         )
       ORDER BY p.full_name, s.date NULLS LAST, s.time_start
       LIMIT 60`
    );
  } else if (isWeek) {
    periodLabel = 'this week';
    slots = await pool.query(
      `SELECT p.id AS professor_id, p.full_name AS professor_name,
              s.date::text AS date, s.day, s.time_start, s.time_end, s.time_ranges, s.location
       FROM schedules s
       JOIN professors p ON s.professor_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE s.is_available = true AND u.is_approved = true
         AND (
           (s.date IS NOT NULL AND s.date >= CURRENT_DATE AND s.date < CURRENT_DATE + INTERVAL '7 days')
           OR s.date IS NULL
         )
       ORDER BY p.full_name, s.date NULLS LAST, s.time_start
       LIMIT 60`
    );
  } else {
    periodLabel = 'today';
    slots = await pool.query(
      `SELECT p.id AS professor_id, p.full_name AS professor_name,
              s.date::text AS date, s.day, s.time_start, s.time_end, s.time_ranges, s.location
       FROM schedules s
       JOIN professors p ON s.professor_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE s.is_available = true AND u.is_approved = true
         AND (
           s.date = CURRENT_DATE
           OR (s.date IS NULL AND LOWER(TRIM(s.day)) = LOWER(TO_CHAR(CURRENT_DATE, 'FMDay')))
         )
       ORDER BY p.full_name, s.time_start
       LIMIT 40`
    );
  }

  if (slots.rows.length === 0) {
    return `\n\nLIVE SCHEDULE DATA: No professors have available slots ${periodLabel}.`;
  }

  const lines = slots.rows.map(s => {
    const ranges = Array.isArray(s.time_ranges) && s.time_ranges.length > 0
      ? s.time_ranges.map(tr => `${to12h(tr.time_start)}–${to12h(tr.time_end)}`).join(', ')
      : `${to12h(s.time_start)}–${to12h(s.time_end)}`;
    const when = s.date ? s.date : `Every ${s.day}`;
    return `• ${s.professor_name} [profId=${s.professor_id}]: ${when}, ${ranges}${s.location ? ` at ${s.location}` : ''}`;
  });

  const recurringNote = (isWeek || isMonth)
    ? '\n(Entries marked "Every [Day]" are recurring weekly slots available every week on that day.)'
    : '';

  return `\n\nLIVE SCHEDULE DATA — professors with available slots ${periodLabel} (real-time from database):${recurringNote}\n${lines.join('\n')}`;
}

// POST /api/chat/faq — AI FAQ assistant (authenticated users only)
router.post(
  '/faq',
  authenticate,
  faqLimiter,
  [
    body('messages')
      .isArray({ min: 1, max: 50 })
      .withMessage('messages must be an array with 1–50 entries.'),
    body('messages.*.role')
      .isIn(['user', 'assistant'])
      .withMessage('Each message role must be "user" or "assistant".'),
    body('messages.*.content')
      .isString()
      .trim()
      .isLength({ min: 1, max: 2000 })
      .withMessage('Each message content must be 1–2000 characters.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { messages } = req.body;

    if (!process.env.GROQ_API_KEY) {
      return res.json({ reply: "I'm currently unavailable. Please contact the SOIT admin for assistance." });
    }

    try {
      const latestMsg = (messages[messages.length - 1]?.content || '').toLowerCase();

      // ── Detect question type ─────────────────────────────────────────────────
      const SUMMARY_KEYWORDS = [
        'summary', 'this week', 'my booking', 'my consultation', 'how many',
        'total', 'pending', 'confirmed', 'completed', 'cancelled', 'status',
      ];
      const TODAY_KEYWORDS = [
        'today', "today's", 'this afternoon', 'this morning', 'this evening', 'scheduled today',
      ];
      const isSummaryQuestion = SUMMARY_KEYWORDS.some(k => latestMsg.includes(k));
      const isTodayQuestion   = TODAY_KEYWORDS.some(k => latestMsg.includes(k));
      // Detects "who booked", "which students", "list students", etc. — needs individual records, not just counts
      const isAskingStudentList = (
        latestMsg.includes('who') ||
        (latestMsg.includes('student') && (latestMsg.includes('book') || latestMsg.includes('consult') || latestMsg.includes('appoint')))
      );

      // "Who are the available professors for today/this week/this month?"
      const isProfAvailQuestion = (
        (latestMsg.includes('professor') || latestMsg.includes('prof') || latestMsg.includes('faculty')) &&
        (latestMsg.includes('available') || latestMsg.includes('who can i consult'))
      ) || latestMsg.includes('available professor') || latestMsg.includes('professors available');

      // "Who handles thesis / who is responsible for OJT / who specializes in ..."
      const isProfRecQuestion = PROF_REC_KEYWORDS.some(k => latestMsg.includes(k));

      let dbContext = '';

      // Route to the right context builder:
      // - Prof recommendation questions get specialization data (highest priority)
      // - Prof availability questions get the per-period slot data
      // - Summary/today personal questions get consultation records
      // - All others get the general slot search
      const profSpecContext = isProfRecQuestion ? await buildProfSpecContext(latestMsg) : '';

      const scheduleContext = (!isProfRecQuestion && isProfAvailQuestion)
        ? await buildProfAvailContext(latestMsg)
        : (!isProfRecQuestion && !isSummaryQuestion && !isTodayQuestion)
          ? await buildScheduleContext(latestMsg)
          : '';

      // ── Today's consultation details ─────────────────────────────────────────
      if (isTodayQuestion && !isProfAvailQuestion && req.user.role === 'student') {
        const rows = await pool.query(
          `SELECT c.time::text, c.status, c.mode, c.nature_of_advising,
                  c.nature_of_advising_specify, p.full_name AS professor_name
           FROM consultations c
           JOIN professors p ON c.professor_id = p.id
           JOIN students   s ON c.student_id   = s.id
           WHERE s.user_id = $1 AND c.date = CURRENT_DATE
           ORDER BY c.time NULLS LAST`,
          [req.user.id]
        );
        if (rows.rows.length === 0) {
          dbContext = '\n\nREAL-TIME DATA (speak directly to the student using "you"): You have no consultations scheduled for today.';
        } else {
          const lines = rows.rows.map((r, idx) => {
            const time    = r.time ? r.time.slice(0, 5) : 'TBD';
            const mode    = r.mode === 'BOTH' ? 'Face-to-Face & Online' : r.mode === 'F2F' ? 'Face-to-Face' : 'Online';
            const concern = cleanConcern(r.nature_of_advising_specify || r.nature_of_advising);
            const status  = r.status.charAt(0).toUpperCase() + r.status.slice(1);
            return `${idx + 1}. ${time} — Prof. ${r.professor_name} | ${status} | ${mode} | Concern: ${concern}`;
          });
          dbContext = `\n\nREAL-TIME DATA — list EACH entry on its own line, never in one paragraph:\nConsultations today (${rows.rows.length}):\n${lines.join('\n')}`;
        }
      }

      if (isTodayQuestion && !isProfAvailQuestion && req.user.role === 'professor') {
        const rows = await pool.query(
          `SELECT c.time::text, c.status, c.mode, c.nature_of_advising,
                  c.nature_of_advising_specify, s.full_name AS student_name, s.student_number
           FROM consultations c
           JOIN students   s ON c.student_id   = s.id
           JOIN professors p ON c.professor_id = p.id
           WHERE p.user_id = $1 AND c.date = CURRENT_DATE
           ORDER BY c.time NULLS LAST`,
          [req.user.id]
        );
        if (rows.rows.length === 0) {
          dbContext = '\n\nREAL-TIME DATA (speak directly to the professor using "you"): You have no consultations scheduled for today.';
        } else {
          const lines = rows.rows.map((r, idx) => {
            const time    = r.time ? r.time.slice(0, 5) : 'TBD';
            const mode    = r.mode === 'BOTH' ? 'Face-to-Face & Online' : r.mode === 'F2F' ? 'Face-to-Face' : 'Online';
            const concern = cleanConcern(r.nature_of_advising_specify || r.nature_of_advising);
            const status  = r.status.charAt(0).toUpperCase() + r.status.slice(1);
            return `${idx + 1}. ${time} — ${r.student_name} (${r.student_number || 'N/A'}) | ${status} | ${mode} | Concern: ${concern}`;
          });
          dbContext = `\n\nREAL-TIME DATA — list EACH entry on its own line, never in one paragraph:\nConsultations today (${rows.rows.length}):\n${lines.join('\n')}`;
        }
      }

      // ── Weekly summary counts (only when not a today-specific question) ───────
      if (isSummaryQuestion && !isTodayQuestion && req.user.role === 'student') {
        const summary = await pool.query(
          `SELECT
            COUNT(*) FILTER (WHERE status = 'pending')   AS pending,
            COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed,
            COUNT(*) FILTER (WHERE status = 'completed') AS completed,
            COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
            COUNT(*) FILTER (WHERE status = 'missed')    AS missed,
            COUNT(*) FILTER (WHERE
              c.date >= date_trunc('week', CURRENT_DATE)
              AND c.date < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'
            ) AS this_week
           FROM consultations c
           JOIN students s ON c.student_id = s.id
           WHERE s.user_id = $1`,
          [req.user.id]
        );
        const r = summary.rows[0];
        dbContext = `\n\nREAL-TIME CONSULTATION DATA (speak directly to the student using "you"):
- Consultations this week: ${r.this_week}
- Pending (awaiting professor confirmation): ${r.pending}
- Confirmed (upcoming): ${r.confirmed}
- Completed: ${r.completed}
- Cancelled: ${r.cancelled}
- Missed: ${r.missed}`;
      }

      if (isSummaryQuestion && !isTodayQuestion && req.user.role === 'professor') {
        if (isAskingStudentList) {
          // Professor asked "who booked this week?" — fetch individual student records
          const rows = await pool.query(
            `SELECT c.date::text, c.time::text, c.status, c.mode,
                    c.nature_of_advising, c.nature_of_advising_specify,
                    s.full_name AS student_name, s.student_number
             FROM consultations c
             JOIN students   s ON c.student_id   = s.id
             JOIN professors p ON c.professor_id = p.id
             WHERE p.user_id = $1
               AND c.date >= date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
               AND c.date <  (date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila') + INTERVAL '7 days')::date
             ORDER BY c.date, c.time NULLS LAST`,
            [req.user.id]
          );
          if (rows.rows.length === 0) {
            dbContext = '\n\nREAL-TIME DATA: No students have booked consultations with you this week (Monday–Sunday). Do NOT invent or guess any student names.';
          } else {
            const lines = rows.rows.map((r, idx) => {
              const time    = r.time ? r.time.slice(0, 5) : 'TBD';
              const mode    = r.mode === 'BOTH' ? 'F2F & Online' : r.mode === 'F2F' ? 'Face-to-Face' : 'Online';
              const concern = cleanConcern(r.nature_of_advising_specify || r.nature_of_advising);
              const status  = r.status.charAt(0).toUpperCase() + r.status.slice(1);
              return `${idx + 1}. ${r.date} ${time} — ${r.student_name} (${r.student_number || 'N/A'}) | ${status} | ${mode} | Concern: ${concern}`;
            });
            dbContext = `\n\nREAL-TIME DATA — ONLY use the names and details listed here. NEVER invent or add any name not present in this list:\nThis week's student consultations (${rows.rows.length} total):\n${lines.join('\n')}`;
          }
        } else {
          // General summary — counts only, no individual names needed
          const summary = await pool.query(
            `SELECT
              COUNT(*) FILTER (WHERE status = 'pending')   AS pending,
              COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed,
              COUNT(*) FILTER (WHERE status = 'completed') AS completed,
              COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
              COUNT(*) FILTER (WHERE status = 'missed')    AS missed,
              COUNT(*) FILTER (WHERE
                c.date >= date_trunc('week', CURRENT_DATE)
                AND c.date < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'
              ) AS this_week,
              COUNT(DISTINCT c.student_id) AS unique_students
             FROM consultations c
             JOIN professors p ON c.professor_id = p.id
             WHERE p.user_id = $1`,
            [req.user.id]
          );
          const r = summary.rows[0];
          dbContext = `\n\nREAL-TIME CONSULTATION DATA (speak directly to the professor using "you"):
- Consultations this week: ${r.this_week}
- Pending (need your confirmation): ${r.pending}
- Confirmed (upcoming): ${r.confirmed}
- Completed: ${r.completed}
- Cancelled: ${r.cancelled}
- Missed: ${r.missed}
- Total unique students advised: ${r.unique_students}`;
        }
      }

      const roleInstruction = req.user.role === 'professor'
        ? 'CURRENT USER ROLE: Professor. Use ONLY routes from the "Professor dashboard" section of NAVIGATION PATHS. Never suggest student dashboard routes (/dashboard/student/...) to a professor.\n\n'
        : req.user.role === 'student'
        ? 'CURRENT USER ROLE: Student. Use ONLY routes from the "Student dashboard" section of NAVIGATION PATHS. Never suggest professor dashboard routes (/dashboard/professor/...) to a student.\n\n'
        : '';

      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: 'system', content: roleInstruction + FAQ_SYSTEM_PROMPT + profSpecContext + scheduleContext + dbContext }, ...messages],
          max_tokens: 1024,
          temperature: 0,
        }),
      });

      const data = await groqRes.json();
      const reply = data.choices[0].message.content;

      // Correct any wrong-role route the model may have generated
      let finalReply = reply;
      try {
        let depth = 0, start = -1;
        for (let i = 0; i < reply.length; i++) {
          if (reply[i] === '{') { if (depth === 0) start = i; depth++; }
          else if (reply[i] === '}') {
            depth--;
            if (depth === 0 && start !== -1) {
              const parsed = JSON.parse(reply.slice(start, i + 1));
              if (parsed?.action?.route) {
                parsed.action.route = fixRouteForRole(parsed.action.route, req.user.role);
                finalReply = JSON.stringify(parsed);
              }
              break;
            }
          }
        }
      } catch { /* leave finalReply as-is if JSON parse fails */ }

      return res.json({ reply: finalReply });
    } catch (err) {
      console.error('[Chat/FAQ] Groq failed:', err.message);
      res.status(500).json({ error: 'AI assistant is unavailable. Please try again later.' });
    }
  }
);

module.exports = router;
