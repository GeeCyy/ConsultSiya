'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const QUICK_CHIPS = [
  'How do I book a consultation?',
  'What is an Advising Slip?',
  'How do I reset my password?',
  'What happens after I submit a booking?',
];

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

function FaqItem({ q, a, isDark }: { q: string; a: string; isDark: boolean }) {
  const [open, setOpen] = useState(false);
  const cardBg = isDark ? '#2b2d31' : '#ffffff';
  const innerBg = isDark ? '#383a40' : '#f0f0f0';
  const borderColor = isDark ? 'border-white/10' : 'border-gray-200';
  const headingCls = isDark ? 'text-white' : 'text-gray-900';
  const bodyCls = isDark ? 'text-gray-400' : 'text-gray-600';
  return (
    <div className={`border ${borderColor} rounded-xl overflow-hidden`} style={{ backgroundColor: cardBg }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left gap-4 hover:bg-white/5 transition-colors"
      >
        <span className={`text-sm font-medium ${headingCls}`}>{q}</span>
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className={`px-5 pb-4 text-sm ${bodyCls} leading-relaxed border-t ${borderColor}`} style={{ backgroundColor: innerBg }}>
          <p className="pt-4">{a}</p>
        </div>
      )}
    </div>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: '#CC0000' }}>
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

  // Chat widget state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || chatLoading) return;

    const newMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: trimmed }];
    setChatMessages(newMessages);
    setChatInput('');
    setChatLoading(true);
    setChatError('');

    try {
      const token = localStorage.getItem('token');
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiBase}/api/chat/faq`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Something went wrong.');
      }

      const data = await res.json();
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err: unknown) {
      setChatError(err instanceof Error ? err.message : 'Failed to reach the assistant.');
    } finally {
      setChatLoading(false);
    }
  }

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
  const navActiveCls   = isDark ? 'bg-white/10 text-white font-medium' : 'bg-gray-100 text-gray-900 font-medium';
  const navIdleCls     = isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100';

  return (
    <DashboardShell>
      <div style={{ backgroundColor: bg }}>
        {/* Top bar */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${borderCls}`} style={{ backgroundColor: topBarBg }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(dashPath)}
              className={`flex items-center gap-2 ${mutedCls} hover:text-white transition-colors text-sm`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Dashboard
            </button>
            <span className={isDark ? 'text-gray-700' : 'text-gray-300'}>/</span>
            <span className={`${headingCls} font-semibold text-sm`}>Help Center</span>
          </div>
          <p className={`text-xs ${mutedCls}`}>Consulta Documentation</p>
        </div>

        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex gap-8">
            {/* Sidebar nav */}
            <aside className="w-56 flex-shrink-0 hidden md:block">
              <div className="sticky top-8 space-y-1">
                <p className={`text-[10px] font-semibold ${isDark ? 'text-gray-600' : 'text-gray-400'} uppercase tracking-wider px-3 mb-3`}>Sections</p>
                {SECTIONS.map(s => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setActiveSection(s.id);
                      document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
                      activeSection === s.id ? navActiveCls : navIdleCls
                    }`}
                  >
                    {s.icon}
                    {s.label}
                  </button>
                ))}
              </div>
            </aside>

            {/* Content */}
            <main className="flex-1 space-y-12 min-w-0 pb-12">

              {/* ── About ────────────────────────────────────────────────── */}
              <section id="about">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: '#CC0000' }}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className={`text-lg font-bold ${headingCls}`}>About the System</h2>
                    <p className={`text-xs ${mutedCls}`}>Consulta — SOIT Academic Consultation System</p>
                  </div>
                </div>
                <div className={`rounded-2xl p-6 border ${borderCls} space-y-4`} style={{ backgroundColor: cardBg }}>
                  <p className={`text-sm ${bodyCls} leading-relaxed`}>
                    <span className="font-semibold text-[#CC0000]">Consulta</span> is the official academic consultation management system of the School of Industrial Engineering and Information Technology (SOIT) at Mapúa University. It streamlines the process of scheduling, managing, and documenting student-professor consultations.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                    {[
                      { label: 'Students', desc: 'Browse professor schedules, book slots, track consultation history, and submit advising slips.' },
                      { label: 'Professors', desc: 'Set availability, confirm or reschedule bookings, mark completions, and export reports.' },
                      { label: 'Administrators', desc: 'Manage accounts, approve registrations, monitor consultations, and access analytics.' },
                    ].map(({ label, desc }) => (
                      <div key={label} className={`rounded-xl p-4 border ${innerBorderCls}`} style={{ backgroundColor: innerBg }}>
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
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: '#CC0000' }}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <h2 className={`text-lg font-bold ${headingCls}`}>How to Use</h2>
                </div>

                <div className="space-y-6">
                  {/* Students */}
                  <div className={`rounded-2xl p-6 border ${borderCls}`} style={{ backgroundColor: cardBg }}>
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
                  <div className={`rounded-2xl p-6 border ${borderCls}`} style={{ backgroundColor: cardBg }}>
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
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: '#CC0000' }}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h2 className={`text-lg font-bold ${headingCls}`}>Submission Guidelines</h2>
                </div>
                <div className={`rounded-2xl p-6 border ${borderCls} space-y-4`} style={{ backgroundColor: cardBg }}>
                  {[
                    { title: 'Advising Slip', body: 'Download the blank advising slip template from the system. Print, complete, and have it signed by the professor during or after your session. Upload the signed copy (PDF, JPG, or PNG, max 10 MB) within 48 hours.' },
                    { title: 'Accepted File Types', body: 'Uploaded forms must be in PDF, JPG, or PNG format. Files over 10 MB will be rejected. Ensure the document is clearly legible.' },
                    { title: 'Booking Etiquette', body: 'Only book a slot you genuinely intend to attend. Cancel as early as possible if you cannot make it. Repeated no-shows may result in restrictions on future bookings.' },
                    { title: 'Nature of Concern', body: 'Select the most accurate category for your concern. Use "Others (Please Specify)" only when no other category applies, and provide a clear description.' },
                    { title: 'Online Sessions', body: 'Join the meeting link provided by your professor at least 2 minutes before your scheduled time. Ensure your audio and video are working before the session.' },
                  ].map(({ title, body }) => (
                    <div key={title} className="flex gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0 mt-2" />
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
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: '#CC0000' }}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h2 className={`text-lg font-bold ${headingCls}`}>Frequently Asked Questions</h2>
                </div>
                <div className="space-y-2">
                  {FAQS.map((faq, i) => <FaqItem key={i} q={faq.q} a={faq.a} isDark={isDark} />)}
                </div>
              </section>

              {/* ── Contact ───────────────────────────────────────────────── */}
              <section id="contact">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: '#CC0000' }}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h2 className={`text-lg font-bold ${headingCls}`}>Contact & Support</h2>
                </div>
                <div className={`rounded-2xl p-6 border ${borderCls} grid grid-cols-1 sm:grid-cols-2 gap-6`} style={{ backgroundColor: cardBg }}>
                  {[
                    { label: 'System Administrator', value: 'Contact via your SOIT admin office or department secretary.', icon: '🛡️' },
                    { label: 'Technical Issues', value: 'If you encounter bugs or errors, describe the issue and contact your system administrator.', icon: '🔧' },
                    { label: 'Account Problems', value: 'For locked/pending accounts, reach out to the SOIT admin or your department office.', icon: '🔑' },
                    { label: 'General Inquiries', value: 'For questions about consultations, schedules, or advising slips, contact your professor directly.', icon: '💬' },
                  ].map(({ label, value, icon }) => (
                    <div key={label} className={`flex gap-4 p-4 rounded-xl border ${innerBorderCls}`} style={{ backgroundColor: innerBg }}>
                      <span className="text-2xl flex-shrink-0">{icon}</span>
                      <div>
                        <p className={`text-sm font-semibold ${headingCls}`}>{label}</p>
                        <p className={`text-xs ${subCls} leading-relaxed mt-1`}>{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className={`mt-4 rounded-xl px-5 py-4 border ${innerBorderCls} flex items-center gap-3`} style={{ backgroundColor: cardBg }}>
                  <svg className="w-4 h-4 text-[#CC0000] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className={`text-xs ${subCls}`}>
                    You can also use the <span className={`font-semibold ${headingCls}`}>Consulta Assistant</span> chatbot (bottom-right corner) to get quick answers about professors and how to book.
                  </p>
                </div>
              </section>
            </main>
          </div>
        </div>
      </div>
      {/* ── Floating AI chat widget ──────────────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">

        {/* Chat panel */}
        {chatOpen && (
          <div
            className={`flex flex-col rounded-2xl shadow-2xl overflow-hidden border ${isDark ? 'border-white/10' : 'border-gray-200'}`}
            style={{ width: 360, height: 520, backgroundColor: isDark ? '#2b2d31' : '#ffffff' }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ backgroundColor: '#4F6BED' }}>
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 001.357 2.059l.046.02A2.25 2.25 0 0118 13.137V15M15 3.186A24.32 24.32 0 0119.5 3.5m0 0V15m0 0a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 15V9.75" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm leading-tight">ConsultSiya Assistant</p>
                <p className="text-white/70 text-xs">AI-powered</p>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="text-white/70 hover:text-white transition-colors ml-1 flex-shrink-0"
                aria-label="Close chat"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {chatMessages.length === 0 && (
                <div className="space-y-4">
                  <p className={`text-sm text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Ask me anything about the Consulta system.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {QUICK_CHIPS.map(chip => (
                      <button
                        key={chip}
                        onClick={() => sendMessage(chip)}
                        className="text-xs px-3 py-1.5 rounded-full border transition-colors"
                        style={{
                          borderColor: '#4F6BED',
                          color: '#4F6BED',
                          backgroundColor: isDark ? 'rgba(79,107,237,0.1)' : 'rgba(79,107,237,0.05)',
                        }}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mr-2 mt-0.5" style={{ backgroundColor: '#4F6BED' }}>
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 001.357 2.059l.046.02A2.25 2.25 0 0118 13.137V15M15 3.186A24.32 24.32 0 0119.5 3.5m0 0V15m0 0a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 15V9.75" />
                      </svg>
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'text-white rounded-br-sm'
                        : `rounded-bl-sm ${isDark ? 'text-gray-200' : 'text-gray-800'}`
                    }`}
                    style={
                      msg.role === 'user'
                        ? { backgroundColor: '#4F6BED' }
                        : { backgroundColor: isDark ? '#383a40' : '#f0f0f0' }
                    }
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {chatLoading && (
                <div className="flex justify-start items-center gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#4F6BED' }}>
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 001.357 2.059l.046.02A2.25 2.25 0 0118 13.137V15M15 3.186A24.32 24.32 0 0119.5 3.5m0 0V15m0 0a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 15V9.75" />
                    </svg>
                  </div>
                  <div className="px-3 py-2.5 rounded-2xl rounded-bl-sm" style={{ backgroundColor: isDark ? '#383a40' : '#f0f0f0' }}>
                    <span className="flex gap-1 items-center h-4">
                      {[0, 1, 2].map(d => (
                        <span
                          key={d}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            backgroundColor: '#4F6BED',
                            animation: 'chat-bounce 1.2s ease-in-out infinite',
                            animationDelay: `${d * 0.2}s`,
                          }}
                        />
                      ))}
                    </span>
                  </div>
                </div>
              )}

              {chatError && (
                <p className="text-xs text-red-400 text-center px-2">{chatError}</p>
              )}

              <div ref={chatBottomRef} />
            </div>

            {/* Input bar */}
            <div className={`flex items-center gap-2 px-3 py-3 border-t flex-shrink-0 ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(chatInput); } }}
                placeholder="Ask a question…"
                disabled={chatLoading}
                className={`flex-1 text-sm px-3 py-2 rounded-xl outline-none border transition-colors disabled:opacity-50 ${
                  isDark
                    ? 'bg-[#383a40] text-white placeholder-gray-500 border-white/10 focus:border-[#4F6BED]'
                    : 'bg-gray-100 text-gray-900 placeholder-gray-400 border-gray-200 focus:border-[#4F6BED]'
                }`}
              />
              <button
                onClick={() => sendMessage(chatInput)}
                disabled={chatLoading || !chatInput.trim()}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white transition-opacity disabled:opacity-40 flex-shrink-0"
                style={{ backgroundColor: '#4F6BED' }}
                aria-label="Send"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Toggle button */}
        <button
          onClick={() => setChatOpen(v => !v)}
          className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white transition-transform hover:scale-105 active:scale-95"
          style={{ backgroundColor: '#4F6BED' }}
          aria-label="Toggle AI assistant"
        >
          {chatOpen ? (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
          )}
        </button>
      </div>

      {/* Bounce animation for typing indicator */}
      <style>{`
        @keyframes chat-bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
      `}</style>
    </DashboardShell>
  );
}
