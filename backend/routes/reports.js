const express = require('express');
const router = express.Router();
const pool = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// Build a date-range WHERE clause fragment based on ?period=week|year|semester
function periodClause(period) {
  switch (period) {
    case 'week':
      return `AND c.date >= date_trunc('week', CURRENT_DATE) AND c.date < date_trunc('week', CURRENT_DATE) + interval '7 days'`;
    case 'year':
      return `AND c.date >= date_trunc('year', CURRENT_DATE) AND c.date < date_trunc('year', CURRENT_DATE) + interval '1 year'`;
    case 'semester': {
      // Semester 1: Aug–Jan, Semester 2: Feb–Jul (adjust to institution calendar)
      return `AND (
        (EXTRACT(MONTH FROM c.date) >= 8 AND EXTRACT(MONTH FROM c.date) <= 12)
        OR
        (EXTRACT(MONTH FROM c.date) >= 1 AND EXTRACT(MONTH FROM c.date) <= 1)
      )`;
    }
    default:
      return '';
  }
}

const getReportData = async (professorId, period) => {
  const clause = periodClause(period);
  const result = await pool.query(
    `SELECT
      c.id, c.date, c.nature_of_advising, c.mode, c.status,
      s.full_name AS student_name, s.student_number, s.program,
      p.full_name AS professor_name, p.department,
      sch.day, sch.time_start, sch.time_end,
      cd.action_taken, cd.referral, cd.remarks
     FROM consultations c
     JOIN students s ON c.student_id = s.id
     JOIN professors p ON c.professor_id = p.id
     JOIN schedules sch ON c.schedule_id = sch.id
     LEFT JOIN consultation_details cd ON cd.consultation_id = c.id
     WHERE c.professor_id = $1 ${clause}
     ORDER BY c.date ASC`,
    [professorId]
  );
  return result.rows;
};

const addExcelSheet = (workbook, professor, rows) => {
  const safeName = professor.full_name.replace(/[\\/*?[\]:]/g, '').slice(0, 31);
  const sheet = workbook.addWorksheet(safeName);

  sheet.mergeCells('A1:K1');
  sheet.getCell('A1').value = 'MAPÚA UNIVERSITY — FACULTY ACADEMIC ADVISING REPORT';
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.getCell('A1').alignment = { horizontal: 'center' };

  sheet.mergeCells('A2:K2');
  sheet.getCell('A2').value = `Professor: ${professor.full_name} | Department: ${professor.department}`;
  sheet.getCell('A2').alignment = { horizontal: 'center' };

  sheet.addRow([]);

  const headerRow = sheet.addRow([
    '#', 'Student Name', 'Student No.', 'Program',
    'Date', 'Day & Time', 'Nature of Advising',
    'Mode', 'Action Taken', 'Referral', 'Remarks',
  ]);

  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCC0000' } };
    cell.alignment = { horizontal: 'center' };
  });

  sheet.columns = [
    { width: 5 }, { width: 25 }, { width: 15 }, { width: 10 },
    { width: 12 }, { width: 20 }, { width: 30 },
    { width: 8 }, { width: 20 }, { width: 20 }, { width: 25 },
  ];

  rows.forEach((row, index) => {
    let nature = row.nature_of_advising || '';
    try {
      const parsed = JSON.parse(nature);
      if (Array.isArray(parsed)) nature = parsed.join('; ');
    } catch {}

    sheet.addRow([
      index + 1,
      row.student_name,
      row.student_number,
      row.program,
      new Date(row.date).toLocaleDateString(),
      `${row.day} ${row.time_start?.slice(0, 5)}-${row.time_end?.slice(0, 5)}`,
      nature,
      row.mode,
      row.action_taken || '',
      row.referral || '',
      row.remarks || '',
    ]);
  });
};

const addPdfSection = (doc, professor, rows, isFirst) => {
  if (!isFirst) doc.addPage();

  doc.fontSize(14).font('Helvetica-Bold').text('MAPÚA UNIVERSITY', { align: 'center' });
  doc.fontSize(12).text('FACULTY ACADEMIC ADVISING REPORT', { align: 'center' });
  doc.fontSize(10).font('Helvetica')
    .text(`Professor: ${professor.full_name} | Department: ${professor.department}`, { align: 'center' });
  doc.moveDown();

  const headers = ['#', 'Student Name', 'Student No.', 'Program', 'Date', 'Day & Time', 'Nature', 'Mode', 'Action Taken'];
  const colWidths = [25, 110, 80, 55, 65, 90, 100, 40, 100];
  let x = 40;
  const headerY = doc.y;

  doc.font('Helvetica-Bold').fontSize(9);
  headers.forEach((h, i) => {
    doc.rect(x, headerY, colWidths[i], 20).fillAndStroke('#CC0000', '#CC0000');
    doc.fillColor('white').text(h, x + 3, headerY + 6, { width: colWidths[i] - 6 });
    x += colWidths[i];
  });

  doc.font('Helvetica').fontSize(8).fillColor('black');
  let y = headerY + 20;

  rows.forEach((row, index) => {
    x = 40;
    let nature = row.nature_of_advising || '';
    try {
      const parsed = JSON.parse(nature);
      if (Array.isArray(parsed)) nature = parsed.join('; ');
    } catch {}

    const rowData = [
      index + 1,
      row.student_name,
      row.student_number,
      row.program,
      new Date(row.date).toLocaleDateString(),
      `${row.day} ${row.time_start?.slice(0, 5)}`,
      nature,
      row.mode,
      row.action_taken || 'N/A',
    ];
    const bgColor = index % 2 === 0 ? '#f9f9f9' : '#ffffff';
    rowData.forEach((cell, i) => {
      doc.rect(x, y, colWidths[i], 20).fillAndStroke(bgColor, '#cccccc');
      doc.fillColor('black').text(String(cell), x + 3, y + 6, { width: colWidths[i] - 6 });
      x += colWidths[i];
    });
    y += 20;
  });
};

const resolveProfessor = async (req) => {
  if (req.user.role === 'admin' && req.query.professor_id) {
    const r = await pool.query(
      'SELECT id, full_name, department FROM professors WHERE id = $1',
      [req.query.professor_id]
    );
    if (r.rows.length === 0) return null;
    return r.rows[0];
  }
  const r = await pool.query(
    'SELECT id, full_name, department FROM professors WHERE user_id = $1',
    [req.user.id]
  );
  return r.rows[0] ?? null;
};

// List all professors with consultation counts (admin)
router.get('/professors', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.full_name, p.department,
              COUNT(c.id) AS consultation_count
       FROM professors p
       LEFT JOIN consultations c ON c.professor_id = p.id
       GROUP BY p.id
       ORDER BY p.full_name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Export as Excel — supports ?period=week|year|semester
router.get('/excel', authenticate, authorize('professor', 'admin'), async (req, res) => {
  const period = req.query.period || '';
  try {
    const workbook = new ExcelJS.Workbook();

    if (req.user.role === 'admin' && req.query.professor_id === 'all') {
      const profs = await pool.query('SELECT id, full_name, department FROM professors ORDER BY full_name');
      for (const prof of profs.rows) {
        const rows = await getReportData(prof.id, period);
        addExcelSheet(workbook, prof, rows);
      }
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=advising-report-all.xlsx');
      await workbook.xlsx.write(res);
      return res.end();
    }

    const professor = await resolveProfessor(req);
    if (!professor) return res.status(404).json({ error: 'Professor profile not found.' });

    const rows = await getReportData(professor.id, period);
    addExcelSheet(workbook, professor, rows);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=advising-report-${professor.full_name}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Export as PDF — supports ?period=week|year|semester
router.get('/pdf', authenticate, authorize('professor', 'admin'), async (req, res) => {
  const period = req.query.period || '';
  try {
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });

    if (req.user.role === 'admin' && req.query.professor_id === 'all') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=advising-report-all.pdf');
      doc.pipe(res);
      const profs = await pool.query('SELECT id, full_name, department FROM professors ORDER BY full_name');
      for (let i = 0; i < profs.rows.length; i++) {
        const rows = await getReportData(profs.rows[i].id, period);
        addPdfSection(doc, profs.rows[i], rows, i === 0);
      }
      doc.end();
      return;
    }

    const professor = await resolveProfessor(req);
    if (!professor) return res.status(404).json({ error: 'Professor profile not found.' });

    const rows = await getReportData(professor.id, period);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=advising-report-${professor.full_name}.pdf`);
    doc.pipe(res);
    addPdfSection(doc, professor, rows, true);
    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
