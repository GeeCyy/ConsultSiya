const express = require('express');
const router = express.Router();
const pool = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ExcelJS = require('exceljs');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Embed Mapúa logo as base64 for PDF (resolved once at startup)
const MAPUA_LOGO_PATH = path.join(__dirname, '../../frontend/public/mapua-banner.jpg');
const MAPUA_LOGO_B64 = fs.existsSync(MAPUA_LOGO_PATH)
  ? `data:image/jpeg;base64,${fs.readFileSync(MAPUA_LOGO_PATH).toString('base64')}`
  : '';

// Build a date-range WHERE clause fragment based on ?period=week|year|semester
function periodClause(period) {
  switch (period) {
    case 'week':
      return `AND c.date >= date_trunc('week', CURRENT_DATE) AND c.date < date_trunc('week', CURRENT_DATE) + interval '7 days'`;
    case 'year':
      return `AND c.date >= date_trunc('year', CURRENT_DATE) AND c.date < date_trunc('year', CURRENT_DATE) + interval '1 year'`;
    case 'semester': {
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

const getReportData = async (professorId, { period, dateFrom, dateTo, status } = {}) => {
  const conditions = ['c.professor_id = $1'];
  const params = [professorId];

  if (period) {
    const pc = periodClause(period);
    if (pc) conditions.push(pc.replace(/^AND /, ''));
  }
  if (dateFrom) { params.push(dateFrom); conditions.push(`c.date >= $${params.length}`); }
  if (dateTo)   { params.push(dateTo);   conditions.push(`c.date <= $${params.length}`); }
  if (status && status !== 'all') { params.push(status); conditions.push(`c.status = $${params.length}`); }

  const result = await pool.query(
    `SELECT
      c.id, c.date, c.nature_of_advising, c.mode, c.status, c.uploaded_form_path,
      s.full_name AS student_name, s.student_number, s.program,
      p.full_name AS professor_name, p.department,
      sch.day, sch.time_start, sch.time_end,
      cd.action_taken, cd.referral, cd.remarks
     FROM consultations c
     JOIN students s ON c.student_id = s.id
     JOIN professors p ON c.professor_id = p.id
     JOIN schedules sch ON c.schedule_id = sch.id
     LEFT JOIN consultation_details cd ON cd.consultation_id = c.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY c.date ASC`,
    params
  );
  return result.rows;
};

// ── Excel export (unchanged) ──────────────────────────────────────────────────

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

// ── PDF HTML template (FM-AS-19-00 exact format) ─────────────────────────────

function getCurrentTerm() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();
  // Mapúa QTR boundaries (approximate):
  // 1st QTR: Aug–Oct   AY year/(year+1)
  // 2nd QTR: Nov–Jan   AY year/(year+1) or (year-1)/year
  // 3rd QTR: Feb–Apr   AY (year-1)/year
  // 4th QTR: May–Jul   AY (year-1)/year
  if (month >= 8 && month <= 10) return { qtr: '1st', ay: `${year}-${year + 1}` };
  if (month >= 11)               return { qtr: '2nd', ay: `${year}-${year + 1}` };
  if (month === 1)               return { qtr: '2nd', ay: `${year - 1}-${year}` };
  if (month >= 2 && month <= 4)  return { qtr: '3rd', ay: `${year - 1}-${year}` };
  /* month 5–7 */                return { qtr: '4th', ay: `${year - 1}-${year}` };
}

function ordinal(n) {
  const s = { '1': 'st', '2': 'nd', '3': 'rd' };
  return n + (s[n] || 'th');
}

function formatAdvisingDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildReportHtml(sections) {
  const { qtr, ay } = getCurrentTerm();
  const termLabel   = `${ordinal(qtr.replace(/\D/g, ''))} QTR  Term, AY${ay}`;
  const baseUrl     = process.env.BASE_URL || 'http://localhost:5001';
  const logoTag     = MAPUA_LOGO_B64
    ? `<img src="${MAPUA_LOGO_B64}" style="max-width:80px;max-height:52px;object-fit:contain;">`
    : '';

  const pagesHtml = sections.map(({ professor, rows }, idx) => {
    const tableRows = rows.map((row, i) => {
      let modeDisplay = 'F2F';
      if (row.mode === 'OL')   modeDisplay = 'OL';
      if (row.mode === 'BOTH') modeDisplay = 'F2F/OL';

      const proofCell = row.uploaded_form_path
        ? `<a href="${baseUrl}/api/forms/download/${row.id}">Advising Slip</a>`
        : '';

      return `
        <tr>
          <td class="c">${i + 1}</td>
          <td>${escHtml(row.student_name || '')}</td>
          <td class="c">${escHtml(row.student_number || '')}</td>
          <td class="c">${escHtml(row.program || '')}</td>
          <td class="c">${row.date ? formatAdvisingDate(row.date) : ''}</td>
          <td class="c">${modeDisplay}</td>
          <td>${proofCell}</td>
        </tr>`;
    }).join('') || `<tr><td colspan="7" class="empty-row">No records for this period.</td></tr>`;

    return `
<div class="${idx > 0 ? 'page-break' : ''}">

  <!-- SECTION 1: Header (3-col bordered table, right cell internally divided) -->
  <table class="hdr-tbl">
    <tr>
      <td class="hdr-logo" rowspan="2">${logoTag}</td>
      <td class="hdr-title" rowspan="2">FACULTY ACADEMIC ADVISING REPORT</td>
      <td class="hdr-doc-top">Document No.: FM-AS-19-00</td>
    </tr>
    <tr>
      <td class="hdr-doc-bot">Effective Date: June 23, 2023</td>
    </tr>
  </table>

  <!-- SECTION 2: Metadata (centered, bold) -->
  <p class="meta-term">${termLabel}</p>
  <p class="meta-dept">School/Department:  SOIT</p>

  <!-- SECTION 3: Data table -->
  <table class="data-tbl">
    <thead>
      <tr>
        <th class="col-num">#</th>
        <th class="col-name">Name of Student<br>(Advisee)</th>
        <th class="col-snum">Student<br>Number</th>
        <th class="col-prog">Program</th>
        <th class="col-date">Date of<br>Advising</th>
        <th class="col-mode">Mode of<br>Delivery<br>(OL or F2F)</th>
        <th class="col-proof">Proof of Evidence<br>(Link for recordings of academic advising or a screenshot of the conversation with the Advisee, Course Advising Slip)</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>

  <!-- SECTION 4: Footer -->
  <p class="certify">This is to certify that I have conducted Academic Advising/Consultation with the above-mentioned students/advisees.</p>

  <table class="sig-tbl">
    <tr>
      <td class="sig-key">SIGNATURE</td>
      <td class="sig-sep">:</td>
      <td class="sig-val sig-blank">&nbsp;</td>
    </tr>
    <tr>
      <td class="sig-key">NAME OF ADVISER</td>
      <td class="sig-sep">:</td>
      <td class="sig-val">${escHtml(professor.full_name)}</td>
    </tr>
    <tr>
      <td class="sig-key">DATE</td>
      <td class="sig-sep">:</td>
      <td class="sig-val sig-blank">&nbsp;</td>
    </tr>
  </table>

</div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  *, *::before, *::after {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10pt;
    margin: 0; padding: 0;
    box-sizing: border-box;
  }
  body { background: #fff; color: #000; }

  .page-break { page-break-before: always; }

  /* ── Header table ── */
  .hdr-tbl {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 18pt;
  }
  .hdr-tbl td { border: 1px solid #000; }

  .hdr-logo {
    width: 16%;
    text-align: center;
    padding: 6pt;
    vertical-align: middle;
  }
  .hdr-title {
    width: 52%;
    text-align: center;
    vertical-align: middle;
    font-size: 13pt;
    font-weight: bold;
    padding: 10pt 8pt;
  }
  /* Right column: two rows split by internal border */
  .hdr-doc-top {
    width: 32%;
    font-size: 9pt;
    padding: 6pt 8pt 5pt 8pt;
    vertical-align: middle;
    border-bottom: 1px solid #000;
  }
  .hdr-doc-bot {
    font-size: 9pt;
    padding: 5pt 8pt 6pt 8pt;
    vertical-align: middle;
  }

  /* ── Metadata ── */
  .meta-term {
    text-align: center;
    font-size: 12pt;
    font-weight: bold;
    margin-bottom: 6pt;
  }
  .meta-dept {
    text-align: center;
    font-size: 12pt;
    font-weight: bold;
    margin-bottom: 14pt;
  }

  /* ── Data table ── */
  .data-tbl {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20pt;
  }
  .data-tbl th,
  .data-tbl td {
    border: 1px solid #000;
    padding: 5pt 5pt;
    vertical-align: middle;
    font-size: 9pt;
    line-height: 1.35;
  }
  .data-tbl th { font-weight: bold; text-align: center; }
  .data-tbl td.c { text-align: center; }
  .data-tbl a { color: #1155cc; text-decoration: underline; }
  .empty-row { text-align: center; color: #888; font-style: italic; }

  .col-num   { width: 5%; }
  .col-name  { width: 18%; }
  .col-snum  { width: 13%; }
  .col-prog  { width: 9%; }
  .col-date  { width: 11%; }
  .col-mode  { width: 12%; }
  .col-proof { width: 32%; }

  /* ── Footer ── */
  .certify {
    font-size: 10pt;
    text-align: justify;
    margin-bottom: 18pt;
    line-height: 1.5;
  }

  .sig-tbl { border-collapse: collapse; }
  .sig-tbl tr { height: 26pt; }
  .sig-key {
    font-size: 10pt;
    font-weight: bold;
    width: 155pt;
    vertical-align: bottom;
    padding-bottom: 2pt;
  }
  .sig-sep {
    font-size: 10pt;
    font-weight: bold;
    width: 18pt;
    text-align: center;
    vertical-align: bottom;
    padding-bottom: 2pt;
  }
  .sig-val {
    font-size: 10pt;
    vertical-align: bottom;
    padding-bottom: 2pt;
    padding-left: 6pt;
    min-width: 180pt;
  }
  /* blank lines rendered as underlined empty cells */
  .sig-blank {
    border-bottom: 1px solid #000;
    width: 180pt;
  }

  @page { size: A4 portrait; margin: 20mm 25mm; }
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Routes ────────────────────────────────────────────────────────────────────

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

// Export as Excel — supports ?period, ?date_from, ?date_to, ?status
router.get('/excel', authenticate, authorize('professor', 'admin'), async (req, res) => {
  const filters = {
    period:   req.query.period   || '',
    dateFrom: req.query.date_from || '',
    dateTo:   req.query.date_to   || '',
    status:   req.query.status    || 'all',
  };
  try {
    const workbook = new ExcelJS.Workbook();

    if (req.user.role === 'admin' && req.query.professor_id === 'all') {
      const profs = await pool.query('SELECT id, full_name, department FROM professors ORDER BY full_name');
      for (const prof of profs.rows) {
        const rows = await getReportData(prof.id, filters);
        addExcelSheet(workbook, prof, rows);
      }
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=advising-report-all.xlsx');
      await workbook.xlsx.write(res);
      return res.end();
    }

    const professor = await resolveProfessor(req);
    if (!professor) return res.status(404).json({ error: 'Professor profile not found.' });

    const rows = await getReportData(professor.id, filters);
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

// Export as PDF (FM-AS-19-00 format) — supports ?period, ?date_from, ?date_to, ?status
router.get('/pdf', authenticate, authorize('professor', 'admin'), async (req, res) => {
  const filters = {
    period:   req.query.period    || '',
    dateFrom: req.query.date_from || '',
    dateTo:   req.query.date_to   || '',
    status:   req.query.status    || 'all',
  };
  let browser;
  try {
    let sections = [];

    if (req.user.role === 'admin' && req.query.professor_id === 'all') {
      const profs = await pool.query('SELECT id, full_name, department FROM professors ORDER BY full_name');
      for (const prof of profs.rows) {
        const rows = await getReportData(prof.id, filters);
        sections.push({ professor: prof, rows });
      }
    } else {
      const professor = await resolveProfessor(req);
      if (!professor) return res.status(404).json({ error: 'Professor profile not found.' });
      const rows = await getReportData(professor.id, filters);
      sections.push({ professor, rows });
    }

    const html = buildReportHtml(sections);

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      landscape: false,
      printBackground: true,
    });

    const filename = sections.length === 1
      ? `advising-report-${sections[0].professor.full_name}.pdf`
      : 'advising-report-all.pdf';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.end(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

module.exports = router;
