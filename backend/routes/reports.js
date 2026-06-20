const express = require('express');
const router = express.Router();
const pool = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ExcelJS = require('exceljs');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const MAPUA_LOGO_B64 = 'data:image/png;base64,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';

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
  const conditions = ["c.professor_id = $1", "c.status = 'completed'"];
  const params = [professorId];

  if (period) {
    const pc = periodClause(period);
    if (pc) conditions.push(pc.replace(/^AND /, ''));
  }
  if (dateFrom) { params.push(dateFrom); conditions.push(`c.date >= $${params.length}`); }
  if (dateTo)   { params.push(dateTo);   conditions.push(`c.date <= $${params.length}`); }

  const result = await pool.query(
    `SELECT
      c.id, c.date, c.nature_of_advising, c.mode, c.status, c.uploaded_form_path, c.proof_of_evidence, c.proof_type,
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
    ? `<img src="${MAPUA_LOGO_B64}" style="width:60px;height:auto;mix-blend-mode:multiply;">`
    : '';

  const pagesHtml = sections.map(({ professor, rows }, idx) => {
    const tableRows = rows.map((row, i) => {
      let modeDisplay = 'F2F';
      if (row.mode === 'OL')   modeDisplay = 'OL';
      if (row.mode === 'BOTH') modeDisplay = 'F2F/OL';

      let proofUrl = null;
      if (row.proof_type === 'link' && row.proof_of_evidence) {
        proofUrl = row.proof_of_evidence;
      } else if (row.proof_type === 'file' && row.proof_of_evidence?.startsWith('https://')) {
        proofUrl = row.proof_of_evidence;
      } else if (row.uploaded_form_path?.startsWith('https://')) {
        proofUrl = row.uploaded_form_path;
      } else if (row.uploaded_form_path) {
        proofUrl = `${baseUrl}/api/forms/download/${row.id}`;
      }
      const proofCell = proofUrl
        ? `<a href="${proofUrl}">Advising Slip</a>`
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
    margin-bottom: 12pt;
  }
  .hdr-tbl td { border: 1px solid #000; }

  .hdr-logo {
    width: 80px;
    text-align: center;
    padding: 4pt 6pt;
    vertical-align: middle;
  }
  .hdr-title {
    text-align: center;
    vertical-align: middle;
    font-size: 13px;
    font-weight: bold;
    padding: 6pt 8pt;
  }
  /* Right column: two rows split by internal border */
  .hdr-doc-top {
    width: 180px;
    font-size: 11px;
    padding: 4pt 6pt;
    vertical-align: middle;
    border-bottom: 1px solid #000;
  }
  .hdr-doc-bot {
    font-size: 11px;
    padding: 4pt 6pt;
    vertical-align: middle;
  }

  /* ── Metadata ── */
  .meta-term {
    text-align: center;
    font-size: 12pt;
    font-weight: bold;
    margin-bottom: 4pt;
  }
  .meta-dept {
    text-align: center;
    font-size: 12pt;
    font-weight: bold;
    margin-bottom: 10pt;
  }

  /* ── Data table ── */
  .data-tbl {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 14pt;
  }
  .data-tbl th,
  .data-tbl td {
    border: 1px solid #000;
    padding: 7pt 6pt;
    vertical-align: middle;
    font-size: 9pt;
    line-height: 1.4;
  }
  .data-tbl th { font-weight: bold; text-align: center; }
  .data-tbl td.c { text-align: center; }
  .data-tbl a { color: #1155cc; text-decoration: underline; }
  .empty-row { text-align: center; color: #888; font-style: italic; }

  .col-num   { width: 4%; }
  .col-name  { width: 20%; }
  .col-snum  { width: 14%; }
  .col-prog  { width: 10%; }
  .col-date  { width: 13%; }
  .col-mode  { width: 9%; }
  .col-proof { width: 30%; }

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

  @page { size: A4 portrait; margin: 0.5in; }
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
