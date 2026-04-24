const express = require('express');
const router = express.Router();
const pool = require('../db/db');
const { authenticate } = require('../middleware/auth.middleware');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../uploads/forms');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `consultation-${req.params.id}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Only PDF, JPG, and PNG files are allowed.'));
  },
});

// ── PDF Slip Drawing ──────────────────────────────────────────────────────────

const LEFT_NATURE = [
  'Thesis/Design Subject concerns',
  'Mentoring/Clarification on the Topic of the Subjects Enrolled',
  'Requirements in Courses Enrolled',
];

const RIGHT_NATURE = [
  'Concerns about Electives/Tracks in the Curriculum',
  'Concerns on Internship/OJT Matters',
  'Concerns regarding Placement/Employment Opportunities',
  'Concerns regarding Personal/Family, etc.',
  'Others (Please Specify)',
];

function drawCheckbox(doc, x, y, checked) {
  doc.rect(x, y, 8, 8).stroke('#000000');
  if (checked) {
    doc.save()
      .moveTo(x + 1, y + 4).lineTo(x + 3, y + 7).lineTo(x + 7, y + 1)
      .stroke('#000000')
      .restore();
  }
}

function drawSlip(doc, startY, data) {
  const lx = 28;
  const W = 539;

  const box = (x, y, w, h) => doc.rect(x, y, w, h).stroke('#000000');
  const line = (x1, y1, x2, y2) => doc.save().moveTo(x1, y1).lineTo(x2, y2).stroke('#555555').restore();

  // ── Header (50pt) ──
  box(lx, startY, W, 50);
  box(lx, startY, 80, 50);
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#CC0000')
    .text('MAPÚA', lx, startY + 10, { width: 80, align: 'center' });
  doc.fontSize(6.5).font('Helvetica').fillColor('#CC0000')
    .text('UNIVERSITY', lx, startY + 22, { width: 80, align: 'center' });

  doc.fontSize(11).font('Helvetica-Bold').fillColor('black')
    .text('COURSE/PROGRAM ADVISING SLIP', lx + 85, startY + 17, { width: 290, align: 'center' });

  doc.fontSize(7).font('Helvetica').fillColor('black')
    .text('Document No. : FM-AS-11-02', lx + 383, startY + 10, { width: 180 });
  doc.text('Effective Date: September 24, 2020', lx + 383, startY + 23, { width: 180 });

  // ── Sub-header (40pt) ──
  const subY = startY + 50;
  box(lx, subY, W, 40);
  box(lx, subY, 270, 40);
  doc.fontSize(9.5).font('Helvetica-Bold').fillColor('black')
    .text('Center for Student Advising', lx + 10, subY + 7, { width: 250 });
  doc.fontSize(9).text('(Academic Advising)', lx + 10, subY + 22, { width: 250 });

  doc.fontSize(9).font('Helvetica-Bold')
    .text('MAPÚA UNIVERSITY', lx + 285, subY + 5, { width: 275 });
  doc.fontSize(7).font('Helvetica')
    .text('Muralla Street, Intramuros, Manila', lx + 285, subY + 19, { width: 275 });
  doc.text('www.mapua.edu.ph', lx + 285, subY + 30, { width: 275 });

  // ── Student info (55pt) ──
  const siY = subY + 40;
  box(lx, siY, W, 55);

  const mid = lx + W / 2;
  const dateStr = data.date
    ? new Date(data.date).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  doc.fontSize(8).font('Helvetica').fillColor('black');
  doc.text("Student's Name:", lx + 5, siY + 7);
  doc.text(data.student_name || '', lx + 90, siY + 7, { width: 155 });
  line(lx + 88, siY + 17, lx + 260, siY + 17);

  doc.text('Date:', mid + 5, siY + 7);
  doc.text(dateStr, mid + 33, siY + 7, { width: 220 });
  line(mid + 31, siY + 17, lx + W - 5, siY + 17);

  doc.text('Student Number:', lx + 5, siY + 24);
  doc.text(data.student_number || '', lx + 96, siY + 24, { width: 150 });
  line(lx + 94, siY + 34, lx + 260, siY + 34);

  doc.text('Program/Year:', lx + 5, siY + 41);
  const py = [data.program, data.year_level].filter(Boolean).join(' / ');
  doc.text(py, lx + 83, siY + 41, { width: 175 });
  line(lx + 81, siY + 51, lx + 260, siY + 51);

  // ── Nature of Advising (95pt) ──
  const natY = siY + 55;
  box(lx, natY, W, 95);

  doc.fontSize(8).font('Helvetica-Bold').text('Nature of Advising:', lx + 5, natY + 5);

  const sel = data.nature_of_advising || '';
  const specify = data.nature_of_advising_specify || 'N/A';
  const rx = mid + 5;

  let ly = natY + 18;
  LEFT_NATURE.forEach((opt, i) => {
    drawCheckbox(doc, lx + 5, ly, sel === opt);
    doc.fontSize(7).font('Helvetica').fillColor('black');
    if (i === 1) {
      doc.text('Mentoring/Clarification on the Topic', lx + 17, ly, { width: 245 });
      doc.text('of the Subjects Enrolled', lx + 17, ly + 10, { width: 245 });
      ly += 22;
    } else {
      doc.text(opt, lx + 17, ly, { width: 245 });
      ly += 15;
    }
  });

  let ry2 = natY + 18;
  RIGHT_NATURE.forEach((opt, i) => {
    const isOthers = i === 4;
    drawCheckbox(doc, rx, ry2, sel === opt);
    const label = isOthers ? `Others: (Please Specify) ${specify}` : opt;
    doc.fontSize(7).font('Helvetica').fillColor('black')
      .text(label, rx + 12, ry2, { width: 255 });
    ry2 += 15;
  });

  // ── Action Taken (75pt) ──
  const actY = natY + 95;
  box(lx, actY, W, 75);

  doc.fontSize(8).font('Helvetica-Bold').fillColor('black').text('Action Taken:', lx + 5, actY + 5);

  drawCheckbox(doc, lx + 5, actY + 20, false);
  doc.fontSize(7.5).font('Helvetica').text('Resolved', lx + 17, actY + 22);

  drawCheckbox(doc, lx + 5, actY + 40, false);
  doc.text('For Follow-up', lx + 17, actY + 42);

  drawCheckbox(doc, lx + 120, actY + 20, false);
  doc.font('Helvetica-Bold').text('Referred to:', lx + 132, actY + 22);

  const refOpts = [
    'Peer Advising at W501-Intramuros/R203-Makati',
    'Counseling of Personal Concerns at Center for Guidance and Counseling',
    'Career Advising at Center for Career Services',
    'Other Office: (Please Specify)',
  ];
  let rfY = actY + 15;
  refOpts.forEach(opt => {
    drawCheckbox(doc, rx, rfY, false);
    doc.fontSize(7).font('Helvetica').fillColor('black').text(opt, rx + 12, rfY, { width: 255 });
    rfY += 14;
  });

  // ── Signatures (45pt) ──
  const sigY = actY + 75;
  box(lx, sigY, W, 45);

  line(lx + 10, sigY + 28, mid - 10, sigY + 28);
  doc.fontSize(7).font('Helvetica').fillColor('black')
    .text("Student's Signature", lx + 10, sigY + 31, { width: mid - lx - 20, align: 'center' });

  line(mid + 10, sigY + 28, lx + W - 10, sigY + 28);
  doc.text("Academic Adviser's Signature over Printed Name", mid + 10, sigY + 31, { width: W / 2 - 20, align: 'center' });

  // ── Privacy notice (20pt) ──
  const privY = sigY + 45;
  box(lx, privY, W, 20);
  doc.fontSize(5.5).font('Helvetica').fillColor('#444444')
    .text(
      'In accordance with the Data Privacy Policies of the University, all personal information shall be used by the center for legitimate purposes specifically for Student Advising Services and shall be processed by authorized personnel.',
      lx + 5, privY + 5, { width: W - 10, align: 'center' }
    );
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Generate pre-filled advising slip PDF
router.get('/advising-slip/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT c.id, c.date, c.nature_of_advising, c.nature_of_advising_specify, c.student_id,
              s.full_name AS student_name, s.student_number, s.program, s.year_level,
              p.full_name AS professor_name
       FROM consultations c
       JOIN students s ON c.student_id = s.id
       JOIN professors p ON c.professor_id = p.id
       WHERE c.id = $1`,
      [id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Consultation not found.' });
    const data = result.rows[0];

    if (req.user.role === 'student') {
      const student = await pool.query('SELECT id FROM students WHERE user_id = $1', [req.user.id]);
      if (!student.rows[0] || student.rows[0].id !== data.student_id) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    }

    const doc = new PDFDocument({ margin: 0, size: 'A4', layout: 'portrait' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=advising-slip-${data.student_number || id}.pdf`);
    doc.pipe(res);

    drawSlip(doc, 25, data);
    drawSlip(doc, 415, data);

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Student uploads signed form
router.post('/upload/:id', authenticate, upload.single('form'), async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== 'student') return res.status(403).json({ error: 'Only students can upload forms.' });

    const student = await pool.query('SELECT id FROM students WHERE user_id = $1', [req.user.id]);
    if (!student.rows[0]) return res.status(403).json({ error: 'Student profile not found.' });

    const consult = await pool.query(
      'SELECT student_id, status, uploaded_form_path FROM consultations WHERE id = $1', [id]
    );
    if (!consult.rows[0]) return res.status(404).json({ error: 'Consultation not found.' });
    if (consult.rows[0].student_id !== student.rows[0].id) return res.status(403).json({ error: 'Access denied.' });
    if (!['pending', 'confirmed'].includes(consult.rows[0].status)) {
      return res.status(400).json({ error: 'Can only upload form for pending or confirmed consultations.' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    // Remove previous upload if it exists
    const old = consult.rows[0].uploaded_form_path;
    if (old) {
      const oldPath = path.join(uploadDir, path.basename(old));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    await pool.query('UPDATE consultations SET uploaded_form_path = $1 WHERE id = $2', [req.file.filename, id]);
    res.json({ message: 'Form uploaded successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Download student's uploaded form (professor / admin / student who owns it)
router.get('/download/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const consult = await pool.query(
      'SELECT student_id, professor_id, uploaded_form_path FROM consultations WHERE id = $1', [id]
    );
    if (!consult.rows[0]) return res.status(404).json({ error: 'Consultation not found.' });
    const c = consult.rows[0];

    if (!c.uploaded_form_path) return res.status(404).json({ error: 'No form uploaded for this consultation.' });

    if (req.user.role === 'student') {
      const student = await pool.query('SELECT id FROM students WHERE user_id = $1', [req.user.id]);
      if (!student.rows[0] || student.rows[0].id !== c.student_id) return res.status(403).json({ error: 'Access denied.' });
    } else if (req.user.role === 'professor') {
      const prof = await pool.query('SELECT id FROM professors WHERE user_id = $1', [req.user.id]);
      if (!prof.rows[0] || prof.rows[0].id !== c.professor_id) return res.status(403).json({ error: 'Access denied.' });
    }

    const filePath = path.join(uploadDir, path.basename(c.uploaded_form_path));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on server.' });

    res.download(filePath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
