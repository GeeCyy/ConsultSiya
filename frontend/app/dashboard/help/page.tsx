'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';

const FAQS = [
  {
    q: 'How do I book a consultation?',
    a: 'Go to your Student Dashboard → Book a Consultation. Select an available professor, pick a date and time slot, choose your mode (Face-to-Face or Online), fill in your concern details, and submit.',
  },
  {
    q: 'What happens after I submit a booking?',
    a: 'Your booking is set to Pending. The professor will review and either confirm it (possibly adding a meeting link for online sessions) or mark it for rescheduling.',
  },
  {
    q: 'What is an Advising Slip?',
    a: 'An Advising Slip is an official SOIT form documenting your consultation. You can download a blank template from the system, get it signed during/after your session, and upload the signed copy within 48 hours.',
  },
  {
    q: 'Can I cancel a booking?',
    a: 'Yes. Open the consultation in your dashboard and click Cancel before the scheduled session. Cancellations are tracked, so only cancel if necessary.',
  },
  {
    q: 'What is the difference between F2F and Online mode?',
    a: 'F2F (Face-to-Face) means you meet in person at the professor\'s indicated location (e.g. room number). Online means the professor will provide a meeting link (e.g. Google Meet or Zoom) after confirming.',
  },
  {
    q: 'My account says "Pending Approval" — what do I do?',
    a: 'After registering, your account must be approved by an administrator. Wait for the admin to approve your account before logging in. You will not receive an email notification — check back in a day.',
  },
  {
    q: 'I forgot my password. How do I reset it?',
    a: 'Contact your system administrator to reset your password. Password self-reset via email is not currently available. Temporary passwords are set to Welcome@123 for admin-created accounts.',
  },
  {
    q: 'How do I update my profile?',
    a: 'In your dashboard, click the Profile tab. You can update your full name, contact number, email, program/year level (students) or department (professors).',
  },
  {
    q: 'Who can see my consultation details?',
    a: 'Your consultation details are visible to you, the professor you booked with, and system administrators. Other students cannot see your consultations.',
  },
  {
    q: 'My account is locked. What do I do?',
    a: 'Accounts are locked for 15 minutes after 5 consecutive failed login attempts. Wait for the lockout to expire and try again with the correct credentials. If problems persist, contact your administrator.',
  },
];

const SECTIONS = [
  {
    id: 'about',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    label: 'About the System',
  },
  {
    id: 'howto',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    label: 'How to Use',
  },
  {
    id: 'guidelines',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    label: 'Submission Guidelines',
  },
  {
    id: 'faq',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    label: 'FAQs',
  },
  {
    id: 'contact',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    label: 'Contact & Support',
  },
];

const CONTACT_ICONS: Record<string, React.ReactNode> = {
  admin: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.286z" />
    </svg>
  ),
  bug: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  key: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  ),
  chat: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
    </svg>
  ),
};

function FaqItem({ q, a, isDark, cardBg, innerBg, borderCls, shadowCls }: { q: string; a: string; isDark: boolean; cardBg: string; innerBg: string; borderCls: string; shadowCls: string }) {
  const [open, setOpen] = useState(false);
  const headingCls = isDark ? 'text-white' : 'text-gray-900';
  const bodyCls = isDark ? 'text-gray-400' : 'text-gray-600';
  return (
    <div className={`border ${borderCls} rounded-xl overflow-hidden transition-shadow ${shadowCls}`} style={{ backgroundColor: cardBg }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left gap-4 hover:bg-white/5 transition-colors"
      >
        <span className={`text-sm font-medium ${headingCls}`}>{q}</span>
        <svg
          className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180 text-[#0EA5E9]' : 'text-gray-400'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className={`px-5 pb-4 text-sm ${bodyCls} leading-relaxed border-t ${borderCls}`} style={{ backgroundColor: innerBg }}>
          <p className="pt-4">{a}</p>
        </div>
      )}
    </div>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 bg-gradient-to-br from-[#0EA5E9] to-[#0369a1] shadow-[0_2px_8px_rgba(14,165,233,0.4)]">
      {n}
    </div>
  );
}

export default function HelpPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState('about');
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const r = localStorage.getItem('role');
    if (!token) { router.push('/login'); return; }
    setRole(r);
    const saved = localStorage.getItem('consulta-theme');
    setIsDark(saved === 'dark');
    setMounted(true);

    const onThemeChange = (e: Event) => setIsDark((e as CustomEvent<{ dark: boolean }>).detail.dark);
    window.addEventListener('consulta-theme-change', onThemeChange);
    return () => window.removeEventListener('consulta-theme-change', onThemeChange);
  }, []);

  // Deep-link support: a link like /dashboard/help#contact (e.g. from the AI
  // chatbot's "contact admin" answer) should land directly on that section
  // instead of always opening at the top of the page.
  useEffect(() => {
    if (!mounted) return;
    const hash = window.location.hash.replace('#', '');
    if (hash && SECTIONS.some(s => s.id === hash)) {
      setActiveSection(hash);
      requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [mounted]);

  if (!mounted) return null;

  const dashPath = role === 'student' ? '/dashboard/student'
    : role === 'professor' ? '/dashboard/professor'
    : role === 'admin' ? '/dashboard/admin'
    : '/login';

  const bg      = isDark ? '#1e1f22' : '#f5f5f5';
  const cardBg  = isDark ? '#2b2d31' : '#ffffff';
  const innerBg = isDark ? '#383a40' : '#f0f0f0';
  const topBarBg = isDark ? '#2b2d31' : '#ffffff';

  const borderCls      = isDark ? 'border-white/10' : 'border-gray-200';
  const innerBorderCls = isDark ? 'border-white/5'  : 'border-gray-100';
  const headingCls     = isDark ? 'text-white'       : 'text-gray-900';
  const bodyCls        = isDark ? 'text-gray-300'    : 'text-gray-700';
  const subCls         = isDark ? 'text-gray-400'    : 'text-gray-600';
  const mutedCls       = isDark ? 'text-gray-500'    : 'text-gray-500';
  const navIdleCls     = isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100';
  const shadowCls      = isDark
    ? 'shadow-[0_10px_30px_rgba(0,0,0,0.45),0_2px_8px_rgba(0,0,0,0.3)]'
    : 'shadow-[0_4px_20px_rgba(0,0,0,0.06)]';

  const openAssistant = () => window.dispatchEvent(new CustomEvent('consulta-open-chatbot', { detail: { tab: 'ai' } }));

  return (
    <DashboardShell hideTopBar>
      <div className="relative" style={{ backgroundColor: bg, minHeight: '100%' }}>
        {/* Decorative background glow — dark mode only, purely cosmetic */}
        {isDark && (
          <>
            <div className="absolute top-0 right-0 w-[32rem] h-[32rem] rounded-full bg-sky-500/[0.07] blur-3xl pointer-events-none" />
            <div className="absolute top-[28rem] left-0 w-[28rem] h-[28rem] rounded-full bg-blue-600/[0.06] blur-3xl pointer-events-none" />
          </>
        )}

        {/* Top bar */}
        <div className={`sticky top-0 z-20 flex items-center justify-between px-6 py-4 border-b ${borderCls}`} style={{ backgroundColor: topBarBg }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(dashPath)}
              className={`flex items-center gap-2 ${mutedCls} hover:text-[#0EA5E9] transition-colors text-sm`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Dashboard
            </button>
            <span className={isDark ? 'text-gray-700' : 'text-gray-300'}>/</span>
            <span className={`${headingCls} font-semibold text-sm`}>Help Center</span>
          </div>
          <p className={`text-xs ${mutedCls} hidden sm:block`}>Consulta Documentation</p>
        </div>

        <div className="relative max-w-6xl mx-auto px-6 py-8">
          <div className="flex gap-8">
            {/* Sidebar nav */}
            <aside className="w-56 flex-shrink-0 hidden md:block">
              <div className={`sticky top-24 space-y-1 rounded-2xl p-2 border ${borderCls} ${shadowCls}`} style={{ backgroundColor: cardBg }}>
                <p className={`text-[10px] font-semibold ${isDark ? 'text-gray-600' : 'text-gray-400'} uppercase tracking-wider px-3 pt-2 pb-3`}>Sections</p>
                {SECTIONS.map(s => {
                  const active = activeSection === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        setActiveSection(s.id);
                        document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
                        active ? (isDark ? 'bg-[#0EA5E9]/10 text-white font-medium' : 'bg-sky-50 text-gray-900 font-medium') : navIdleCls
                      }`}
                    >
                      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[#0EA5E9]" />}
                      <span className={active ? 'text-[#0EA5E9]' : ''}>{s.icon}</span>
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Content */}
            <main className="flex-1 space-y-12 min-w-0 pb-12">

              {/* ── About ────────────────────────────────────────────────── */}
              <section id="about">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0 bg-gradient-to-br from-[#0EA5E9] to-[#0369a1] shadow-[0_4px_14px_rgba(14,165,233,0.35)]">
                    {SECTIONS[0].icon}
                  </div>
                  <div>
                    <h2 className={`text-lg font-bold ${headingCls}`}>About the System</h2>
                    <p className={`text-xs ${mutedCls}`}>Consulta — SOIT Academic Consultation System</p>
                  </div>
                </div>
                <div className={`rounded-2xl p-6 border ${borderCls} space-y-4 ${shadowCls}`} style={{ backgroundColor: cardBg }}>
                  <p className={`text-sm ${bodyCls} leading-relaxed`}>
                    <span className="font-semibold text-[#0EA5E9]">Consulta</span> is the official academic consultation management system of the School of Industrial Engineering and Information Technology (SOIT) at Mapúa University. It streamlines the process of scheduling, managing, and documenting student-professor consultations.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                    {[
                      { label: 'Students', desc: 'Browse professor schedules, book slots, track consultation history, and submit advising slips.' },
                      { label: 'Professors', desc: 'Set availability, confirm or reschedule bookings, mark completions, and export reports.' },
                      { label: 'Administrators', desc: 'Manage accounts, approve registrations, monitor consultations, and access analytics.' },
                    ].map(({ label, desc }) => (
                      <div key={label} className={`rounded-xl p-4 border ${innerBorderCls} transition-transform duration-200 hover:-translate-y-0.5`} style={{ backgroundColor: innerBg }}>
                        <p className={`text-sm font-semibold ${headingCls} mb-1`}>{label}</p>
                        <p className={`text-xs ${subCls} leading-relaxed`}>{desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* ── How to Use ───────────────────────────────────────────── */}
              <section id="howto">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0 bg-gradient-to-br from-[#0EA5E9] to-[#0369a1] shadow-[0_4px_14px_rgba(14,165,233,0.35)]">
                    {SECTIONS[1].icon}
                  </div>
                  <h2 className={`text-lg font-bold ${headingCls}`}>How to Use</h2>
                </div>

                <div className="space-y-6">
                  {/* Students */}
                  <div className={`rounded-2xl p-6 border ${borderCls} ${shadowCls}`} style={{ backgroundColor: cardBg }}>
                    <p className={`text-sm font-bold ${headingCls} mb-4`}>For Students</p>
                    <ol className="space-y-3">
                      {[
                        'Register with your university email and student number. Wait for admin approval.',
                        'Log in to your Student Dashboard once approved.',
                        'Go to Book a Consultation — browse available professor schedules.',
                        'Select a date, time slot, mode (F2F / Online), and nature of concern.',
                        'Submit your booking and wait for the professor to confirm.',
                        'Attend the session. Download and upload the signed advising slip after.',
                      ].map((step, i) => (
                        <li key={i} className={`flex items-start gap-3 text-sm ${bodyCls}`}>
                          <StepBadge n={i + 1} />
                          <span className="pt-0.5">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Professors */}
                  <div className={`rounded-2xl p-6 border ${borderCls} ${shadowCls}`} style={{ backgroundColor: cardBg }}>
                    <p className={`text-sm font-bold ${headingCls} mb-4`}>For Professors</p>
                    <ol className="space-y-3">
                      {[
                        'Register and wait for admin approval.',
                        'Go to Manage Schedules to add your available consultation slots (day, time range, location).',
                        'Under My Consultations, review incoming bookings and confirm or reschedule them.',
                        'For Online sessions, provide a meeting link when confirming.',
                        'After each session, mark it as Completed, log the action taken, and optionally add a referral.',
                        'Export consultation reports (PDF/Excel) from the Reports tab.',
                      ].map((step, i) => (
                        <li key={i} className={`flex items-start gap-3 text-sm ${bodyCls}`}>
                          <StepBadge n={i + 1} />
                          <span className="pt-0.5">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </section>

              {/* ── Submission Guidelines ────────────────────────────────── */}
              <section id="guidelines">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0 bg-gradient-to-br from-[#0EA5E9] to-[#0369a1] shadow-[0_4px_14px_rgba(14,165,233,0.35)]">
                    {SECTIONS[2].icon}
                  </div>
                  <h2 className={`text-lg font-bold ${headingCls}`}>Submission Guidelines</h2>
                </div>
                <div className={`rounded-2xl p-6 border ${borderCls} space-y-4 ${shadowCls}`} style={{ backgroundColor: cardBg }}>
                  {[
                    { title: 'Advising Slip', body: 'Download the blank advising slip template from the system. Print, complete, and have it signed by the professor during or after your session. Upload the signed copy (PDF, JPG, or PNG, max 10 MB) within 48 hours.' },
                    { title: 'Accepted File Types', body: 'Uploaded forms must be in PDF, JPG, or PNG format. Files over 10 MB will be rejected. Ensure the document is clearly legible.' },
                    { title: 'Booking Etiquette', body: 'Only book a slot you genuinely intend to attend. Cancel as early as possible if you cannot make it. Repeated no-shows may result in restrictions on future bookings.' },
                    { title: 'Nature of Concern', body: 'Select the most accurate category for your concern. Use "Others (Please Specify)" only when no other category applies, and provide a clear description.' },
                    { title: 'Online Sessions', body: 'Join the meeting link provided by your professor at least 2 minutes before your scheduled time. Ensure your audio and video are working before the session.' },
                  ].map(({ title, body }) => (
                    <div key={title} className="flex gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0EA5E9] flex-shrink-0 mt-2" />
                      <div>
                        <p className={`text-sm font-semibold ${headingCls}`}>{title}</p>
                        <p className={`text-sm ${subCls} leading-relaxed mt-0.5`}>{body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── FAQs ─────────────────────────────────────────────────── */}
              <section id="faq">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0 bg-gradient-to-br from-[#0EA5E9] to-[#0369a1] shadow-[0_4px_14px_rgba(14,165,233,0.35)]">
                    {SECTIONS[3].icon}
                  </div>
                  <h2 className={`text-lg font-bold ${headingCls}`}>Frequently Asked Questions</h2>
                </div>
                <div className="space-y-2">
                  {FAQS.map((faq, i) => (
                    <FaqItem key={i} q={faq.q} a={faq.a} isDark={isDark} cardBg={cardBg} innerBg={innerBg} borderCls={borderCls} shadowCls={shadowCls} />
                  ))}
                </div>
              </section>

              {/* ── Contact ───────────────────────────────────────────────── */}
              <section id="contact">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0 bg-gradient-to-br from-[#0EA5E9] to-[#0369a1] shadow-[0_4px_14px_rgba(14,165,233,0.35)]">
                    {SECTIONS[4].icon}
                  </div>
                  <h2 className={`text-lg font-bold ${headingCls}`}>Contact & Support</h2>
                </div>

                {/* Chat with Assistant CTA */}
                <button
                  onClick={openAssistant}
                  className="w-full flex items-center justify-between gap-4 rounded-2xl px-6 py-5 mb-4 text-left transition-transform duration-200 hover:-translate-y-0.5 bg-gradient-to-r from-[#0EA5E9] to-[#0369a1] shadow-[0_10px_30px_rgba(14,165,233,0.35)]"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
                      {CONTACT_ICONS.chat}
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">Chat with the Consulta Assistant</p>
                      <p className="text-white/75 text-xs mt-0.5">Fastest way to get an answer — available anytime, bottom-right corner.</p>
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </button>

                <div className={`rounded-2xl p-6 border ${borderCls} grid grid-cols-1 sm:grid-cols-2 gap-4 ${shadowCls}`} style={{ backgroundColor: cardBg }}>
                  {[
                    { label: 'System Administrator', value: 'Contact via your SOIT admin office or department secretary.', icon: 'admin' as const },
                    { label: 'Technical Issues', value: 'If you encounter bugs or errors, describe the issue and contact your system administrator.', icon: 'bug' as const },
                    { label: 'Account Problems', value: 'For locked/pending accounts, reach out to the SOIT admin or your department office.', icon: 'key' as const },
                    { label: 'General Inquiries', value: 'For questions about consultations, schedules, or advising slips, contact your professor directly.', icon: 'chat' as const },
                  ].map(({ label, value, icon }) => (
                    <div key={label} className={`flex gap-4 p-4 rounded-xl border ${innerBorderCls} transition-transform duration-200 hover:-translate-y-0.5`} style={{ backgroundColor: innerBg }}>
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-[#0EA5E9]/10 text-[#38bdf8]' : 'bg-sky-50 text-[#0EA5E9]'}`}>
                        {CONTACT_ICONS[icon]}
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${headingCls}`}>{label}</p>
                        <p className={`text-xs ${subCls} leading-relaxed mt-1`}>{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </main>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
