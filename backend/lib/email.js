'use strict';

async function sendEmail({ to, subject, htmlContent }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Consulta', email: process.env.EMAIL_FROM },
      to: [{ email: to }],
      subject,
      htmlContent,
    }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(`Brevo ${res.status}: ${JSON.stringify(errBody)}`);
  }
}

function fmt12(t) {
  if (!t) return '';
  const [hh, mm] = t.slice(0, 5).split(':').map(Number);
  const ampm = hh < 12 ? 'AM' : 'PM';
  const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
}

function fmtFullDate(d) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function detailRow(label, value) {
  return `<tr>
    <td style="padding:9px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;width:140px;vertical-align:top;">${label}</td>
    <td style="padding:9px 0;border-bottom:1px solid #f3f4f6;color:#111827;font-size:13px;font-weight:500;">${value}</td>
  </tr>`;
}

function baseHtml({ accentBg, title, subtitle, bodyRows, footer }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:${accentBg};padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">Consulta</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Mapúa School of Information Technology</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <h2 style="margin:0 0 6px;color:#111827;font-size:18px;font-weight:600;">${title}</h2>
            <p style="margin:0 0 24px;color:#4b5563;font-size:14px;line-height:1.6;">${subtitle}</p>
            <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
              ${bodyRows}
            </table>
            <p style="margin:0;color:#4b5563;font-size:13px;line-height:1.6;">${footer}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #f3f4f6;text-align:center;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">&copy; ${new Date().getFullYear()} Consulta &mdash; Mapúa SOIT. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function modeLabel(mode) {
  if (mode === 'OL') return 'Online';
  if (mode === 'BOTH') return 'Face-to-Face & Online';
  return 'Face-to-Face'; // 'F2F', 'FF', or any fallback
}

async function sendBookingPendingEmail({ to, studentName, professorName, date, time, mode, location }) {
  const rows = [
    detailRow('Professor', professorName || '—'),
    detailRow('Date', fmtFullDate(date)),
    time ? detailRow('Time', fmt12(time)) : '',
    detailRow('Mode', modeLabel(mode)),
    (mode === 'F2F' || mode === 'FF' || mode === 'BOTH') && location ? detailRow('Location', location) : '',
  ].join('');
  await sendEmail({
    to,
    subject: 'Your consultation booking is pending – Consulta',
    htmlContent: baseHtml({
      accentBg: '#b91c1c',
      title: 'Booking Received',
      subtitle: `Hi ${studentName || 'there'}, your consultation booking has been submitted and is <strong>awaiting confirmation</strong> from the professor.`,
      bodyRows: rows,
      footer: 'You will receive another email once the professor confirms your session.',
    }),
  });
}

async function sendBookingConfirmedEmail({ to, studentName, professorName, date, time, mode, location, meetingLink, slotMode, slotMeetingLink }) {
  const effectiveMeetingLink = (mode === 'OL' || mode === 'BOTH')
    ? (meetingLink || slotMeetingLink || null)
    : null;
  const rows = [
    detailRow('Professor', professorName || '—'),
    detailRow('Date', fmtFullDate(date)),
    time ? detailRow('Time', fmt12(time)) : '',
    detailRow('Mode', modeLabel(mode)),
    (mode === 'F2F' || mode === 'FF' || mode === 'BOTH') && location ? detailRow('Location', location) : '',
    effectiveMeetingLink
      ? detailRow('Meeting Link', `<a href="${effectiveMeetingLink}" style="color:#b91c1c;word-break:break-all;">${effectiveMeetingLink}</a>`)
      : '',
  ].join('');
  await sendEmail({
    to,
    subject: 'Your consultation has been confirmed – Consulta',
    htmlContent: baseHtml({
      accentBg: '#15803d',
      title: 'Consultation Confirmed',
      subtitle: `Hi ${studentName || 'there'}, your consultation has been <strong>confirmed</strong>. Please be on time.`,
      bodyRows: rows,
      footer: 'If you need to cancel, please do so through the Consulta portal as early as possible.',
    }),
  });
}

async function sendBookingCompletedEmail({ to, studentName, professorName, date, time, actionTaken, referral, referralSpecify, remarks }) {
  const referralDisplay = referral
    ? (referralSpecify ? `${referral} — ${referralSpecify}` : referral)
    : null;
  const rows = [
    detailRow('Professor', professorName || '—'),
    detailRow('Date', fmtFullDate(date)),
    time ? detailRow('Time', fmt12(time)) : '',
    actionTaken ? detailRow('Action Taken', actionTaken) : '',
    referralDisplay ? detailRow('Referred To', referralDisplay) : '',
    remarks ? detailRow('Remarks', remarks) : '',
  ].join('');
  await sendEmail({
    to,
    subject: 'Your consultation is complete – Consulta',
    htmlContent: baseHtml({
      accentBg: '#1d4ed8',
      title: 'Consultation Complete',
      subtitle: `Hi ${studentName || 'there'}, your consultation session has been marked as <strong>completed</strong>. Thank you!`,
      bodyRows: rows,
      footer: 'You can view the details and download your advising slip from the Consulta portal.',
    }),
  });
}

async function sendNewBookingProfessorEmail({ to, professorName, studentName, date, time, mode, location, meetingLink, slotMeetingLink }) {
  const effectiveMeetingLink = (mode === 'OL' || mode === 'BOTH') ? (meetingLink || slotMeetingLink || null) : null;
  const rows = [
    detailRow('Student', studentName || '—'),
    detailRow('Date', fmtFullDate(date)),
    time ? detailRow('Time', fmt12(time)) : '',
    detailRow('Mode', modeLabel(mode)),
    (mode === 'F2F' || mode === 'FF' || mode === 'BOTH') && location ? detailRow('Location', location) : '',
    effectiveMeetingLink
      ? detailRow('Meeting Link', `<a href="${effectiveMeetingLink}" style="color:#7c3aed;word-break:break-all;">${effectiveMeetingLink}</a>`)
      : '',
  ].join('');
  await sendEmail({
    to,
    subject: 'New consultation request – Consulta',
    htmlContent: baseHtml({
      accentBg: '#7c3aed',
      title: 'New Booking Request',
      subtitle: `Hi ${professorName || 'Professor'}, a student has requested a consultation with you and is <strong>awaiting your confirmation</strong>.`,
      bodyRows: rows,
      footer: 'Please log in to Consulta to confirm or manage this booking.',
    }),
  });
}

async function sendBookingCancelledProfessorEmail({ to, professorName, studentName, date, time, reason }) {
  const rows = [
    detailRow('Student', studentName || '—'),
    detailRow('Date', fmtFullDate(date)),
    time ? detailRow('Time', fmt12(time)) : '',
    reason ? detailRow('Reason', reason) : '',
  ].join('');
  await sendEmail({
    to,
    subject: 'Consultation booking cancelled by student – Consulta',
    htmlContent: baseHtml({
      accentBg: '#dc2626',
      title: 'Booking Cancelled',
      subtitle: `Hi ${professorName || 'Professor'}, a student has <strong>cancelled</strong> their consultation booking.`,
      bodyRows: rows,
      footer: 'The slot is now free. No further action is needed.',
    }),
  });
}

async function sendBookingCancelledEmail({ to, studentName, professorName, date, time, reason }) {
  const rows = [
    detailRow('Professor', professorName || '—'),
    detailRow('Date', fmtFullDate(date)),
    time ? detailRow('Time', fmt12(time)) : '',
    reason ? detailRow('Reason', reason) : '',
  ].join('');
  await sendEmail({
    to,
    subject: 'Your consultation booking has been cancelled – Consulta',
    htmlContent: baseHtml({
      accentBg: '#dc2626',
      title: 'Booking Cancelled',
      subtitle: `Hi ${studentName || 'there'}, your consultation booking has been <strong>cancelled</strong>.`,
      bodyRows: rows,
      footer: 'If you believe this was a mistake or would like to rebook, please visit the Consulta portal.',
    }),
  });
}

async function sendBookingRescheduledEmail({ to, studentName, professorName, date, time, mode, location }) {
  const rows = [
    detailRow('Professor', professorName || '—'),
    detailRow('Original Date', fmtFullDate(date)),
    time ? detailRow('Original Time', fmt12(time)) : '',
    detailRow('Mode', modeLabel(mode)),
    (mode === 'F2F' || mode === 'FF' || mode === 'BOTH') && location ? detailRow('Location', location) : '',
  ].join('');
  await sendEmail({
    to,
    subject: 'Your consultation has been rescheduled – Consulta',
    htmlContent: baseHtml({
      accentBg: '#d97706',
      title: 'Consultation Rescheduled',
      subtitle: `Hi ${studentName || 'there'}, your consultation has been <strong>rescheduled</strong>. Please check the Consulta portal to book a new slot.`,
      bodyRows: rows,
      footer: 'Please rebook through the Consulta portal at your earliest convenience.',
    }),
  });
}

module.exports = {
  sendBookingPendingEmail,
  sendBookingConfirmedEmail,
  sendBookingCompletedEmail,
  sendBookingCancelledEmail,
  sendBookingRescheduledEmail,
  sendNewBookingProfessorEmail,
  sendBookingCancelledProfessorEmail,
};
