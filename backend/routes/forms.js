const express = require('express');
const router = express.Router();
const pool = require('../db/db');
const { authenticate } = require('../middleware/auth.middleware');
const PDFDocument = require('pdfkit');
const { PDFDocument: PDFLib, rgb, StandardFonts } = require('pdf-lib');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('../lib/cloudinary');

const uploadDir = path.join(__dirname, '../uploads/forms');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Only PDF, JPG, and PNG files are allowed.'));
  },
});

function uploadToCloudinary(buffer, consultationId, mimetype, originalname) {
  return new Promise((resolve, reject) => {
    const resourceType = mimetype === 'application/pdf' ? 'raw' : 'image';
    const ext = (originalname && path.extname(originalname).toLowerCase()) || (mimetype === 'application/pdf' ? '.pdf' : '.jpg');
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'consultsiya/forms',
        public_id: `consultation-${consultationId}-${Date.now()}${ext}`,
        resource_type: resourceType,
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

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

  // Parse nature_of_advising — stored as JSON array string for multi-select
  let natureArray = [];
  try {
    const parsed = JSON.parse(data.nature_of_advising || '[]');
    natureArray = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    natureArray = data.nature_of_advising ? [data.nature_of_advising] : [];
  }
  const specify = data.nature_of_advising_specify || 'N/A';
  const rx = mid + 5;

  let ly = natY + 18;
  LEFT_NATURE.forEach((opt, i) => {
    drawCheckbox(doc, lx + 5, ly, natureArray.includes(opt));
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
    drawCheckbox(doc, rx, ry2, natureArray.includes(opt));
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

// ── Template-based slip filler (pdf-lib) ─────────────────────────────────────

async function fillSlipOnTemplate(templateBytes, data) {
  const pdfDoc = await PDFLib.load(templateBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const page = pdfDoc.getPages()[0];

  let natureArray = [];
  try {
    const parsed = JSON.parse(data.nature_of_advising || '[]');
    natureArray = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    natureArray = data.nature_of_advising ? [data.nature_of_advising] : [];
  }
  const specify = data.nature_of_advising_specify || '';

  const dateStr = data.date
    ? new Date(data.date).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';
  const py = [data.program, data.year_level].filter(Boolean).join(' / ');

  // Direct pdf-lib y coordinates calibrated against the actual template.
  // pdf-lib origin is bottom-left (y increases upward).
  // TOP copy baseline values; bottom copy = top copy - 335.
  const TOP = {
    nameY:  612,  // "Student's Name: ___" text baseline
    dateY:  612,  // "Date: ___" same line
    numY:   598,  // "Student Number: ___"
    progY:  583,  // "Program/Year: ___"
    // Left nature column checkbox y (bottom of 8pt square)
    leftCb:  [550, 536, 519],        // Thesis, Mentoring, Requirements
    // Right nature column checkbox y
    rightCb: [550, 536, 526, 519, 508], // Electives, Internship, Placement, Personal, Others
  };
  const COPY_OFFSET = 335; // bottom copy is 335pt below top copy

  const lx  = 36;          // form left x (measured from calibration)
  const mid  = 297.5;       // page horizontal midpoint
  const cbLx = lx + 76;    // left-column checkbox x  ≈ 112
  const cbRx = mid + 40;   // right-column checkbox x ≈ 337

  const drawStr = (str, x, y) => {
    if (!str) return;
    page.drawText(String(str), { x, y, size: 8, font, color: rgb(0, 0, 0) });
  };

  const drawTick = (x, y) => {
    page.drawLine({ start: { x: x + 1, y: y + 4 }, end: { x: x + 3, y: y + 1 }, thickness: 1.5, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: x + 3, y: y + 1 }, end: { x: x + 7, y: y + 7 }, thickness: 1.5, color: rgb(0, 0, 0) });
  };

  const fillCopy = (dy) => {
    // Student info
    drawStr(data.student_name || '', lx + 84,  TOP.nameY + dy);
    drawStr(dateStr,                 mid + 33,  TOP.dateY + dy);
    drawStr(data.student_number || '', lx + 90, TOP.numY  + dy);
    drawStr(py,                        lx + 77, TOP.progY + dy);

    // Left nature column
    LEFT_NATURE.forEach((opt, i) => {
      if (natureArray.includes(opt)) drawTick(cbLx, TOP.leftCb[i] + dy);
    });

    // Right nature column
    RIGHT_NATURE.forEach((opt, i) => {
      if (natureArray.includes(opt)) {
        drawTick(cbRx, TOP.rightCb[i] + dy);
        if (i === 4 && specify) drawStr(specify, cbRx + 50, TOP.rightCb[i] + 2 + dy);
      }
    });
  };

  fillCopy(0);             // top copy
  fillCopy(-COPY_OFFSET);  // bottom copy

  return Buffer.from(await pdfDoc.save());
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/blank-slip', authenticate, (req, res) => {
  try {
    const templatePath = path.join(__dirname, '../templates/FM-AS-11-02-Course-Program-Advising-Slip.pdf');
    const pdfBuffer = fs.readFileSync(templatePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=advising-slip-FM-AS-11-02.pdf');
    res.end(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Generate pre-filled advising slip PDF (overlaid on the official template)
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

    const templatePath = path.join(__dirname, '../templates/FM-AS-11-02-Course-Program-Advising-Slip.pdf');
    const templateBytes = fs.readFileSync(templatePath);
    const pdfBytes = await fillSlipOnTemplate(templateBytes, data);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=advising-slip-${data.student_number || id}.pdf`);
    res.end(pdfBytes);
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

    // Delete previous Cloudinary asset if it was a Cloudinary URL
    const old = consult.rows[0].uploaded_form_path;
    if (old && old.startsWith('https://res.cloudinary.com/')) {
      try {
        const publicIdMatch = old.match(/\/consultsiya\/forms\/([^/.]+)/);
        if (publicIdMatch) {
          const isPdf = old.includes('/raw/');
          await cloudinary.uploader.destroy(`consultsiya/forms/${publicIdMatch[1]}`, {
            resource_type: isPdf ? 'raw' : 'image',
          });
        }
      } catch { /* ignore cleanup errors */ }
    }

    const secureUrl = await uploadToCloudinary(req.file.buffer, id, req.file.mimetype, req.file.originalname);
    await pool.query('UPDATE consultations SET uploaded_form_path = $1 WHERE id = $2', [secureUrl, id]);
    res.json({ message: 'Form uploaded successfully.', url: secureUrl });
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

    // New uploads are Cloudinary URLs — redirect directly
    if (c.uploaded_form_path.startsWith('https://')) {
      return res.redirect(c.uploaded_form_path);
    }

    // Legacy: file stored locally on disk
    const filePath = path.join(uploadDir, path.basename(c.uploaded_form_path));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on server.' });

    res.download(filePath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
