'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import {
  CURRENT_TERM,
  getAcademicWeek,
  getWeekMode,
  daysUntil,
  getTermDates,
  getTermProgress,
  isSchoolDay,
  isHoliday,
  isExamWeek,
  type CalendarOverride,
} from '@/lib/academicCalendar';
import { fetchPhHolidays, type PhHoliday } from '@/lib/phHolidays';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

type Announcement = {
  id: number;
  title: string;
  body: string;
  type: 'info' | 'warning';
  created_at: string;
};

function AnnouncementIcon({ type }: { type: string }) {
  if (type === 'warning') {
    return (
      <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
    </svg>
  );
}

function CalendarView({
  overrides = [],
  phHolidays = [],
}: {
  overrides?: CalendarOverride[];
  phHolidays?: PhHoliday[];
}) {
  const [today, setToday] = useState<Date | null>(null);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());

  useEffect(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    setToday(t);
  }, []);
  const [selected, setSelected] = useState<Date | null>(null);

  const examWeekSet     = new Set(overrides.filter(o => o.type === 'exam_week'     && o.value === 'exam'    && o.week_number).map(o => o.week_number!));
  const suppressExamSet = new Set(overrides.filter(o => o.type === 'exam_week'     && o.value === 'normal'  && o.week_number).map(o => o.week_number!));
  const modeMap         = new Map(overrides.filter(o => o.type === 'mode_override' && o.week_number && o.value).map(o => [o.week_number!, o.value as 'Online' | 'In-Person']));
  const blockedSet      = new Set(overrides.filter(o => o.type === 'blocked_date'  && o.date).map(o => o.date!));
  const phSet           = new Set(phHolidays.map(h => h.date));
  const phNames         = new Map(phHolidays.map(h => [h.date, h.name]));

  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const cells: (Date | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewYear, viewMonth, i + 1)),
  ];

  return (
    <div>
      {/* Nav */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className="text-white font-semibold">{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wider py-1">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} />;

          const isToday = today ? date.getTime() === today.getTime() : false;
          const isSelected = selected?.getTime() === date.getTime();
          const week = getAcademicWeek(CURRENT_TERM, date);
          const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          const holiday = isHoliday(date) || phSet.has(dateStr) || blockedSet.has(dateStr);
          const staticExam = week ? isExamWeek(CURRENT_TERM, date) : false;
          const exam = week
            ? (examWeekSet.has(week) || (staticExam && !suppressExamSet.has(week)))
            : false;
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          const mode = week ? (modeMap.get(week) ?? getWeekMode(CURRENT_TERM, week)) : null;

          const cellBg = isSelected && !isToday
            ? 'bg-white/10'
            : holiday
              ? 'bg-red-500/20'
              : exam
                ? 'bg-amber-400/20'
                : '';

          return (
            <button
              key={date.toISOString()}
              onClick={() => setSelected(isSelected ? null : date)}
              className={`
                relative flex flex-col items-center justify-center rounded-lg h-9 text-xs transition-colors
                ${isToday ? 'ring-1 ring-[#CC0000] font-bold' : ''}
                ${cellBg}
                ${holiday ? 'text-red-400' : isWeekend ? 'text-gray-600' : week ? 'text-gray-200' : 'text-gray-700'}
                ${!isToday && !isSelected ? 'hover:bg-white/5' : ''}
              `}
            >
              <span>{date.getDate()}</span>
              {mode === 'Online' && week && !isWeekend && !exam && (
                <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-blue-400" />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 pt-3 border-t border-white/10">
        <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <span className="w-3 h-3 rounded-sm ring-1 ring-[#CC0000] bg-transparent" />Today
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <span className="w-3 h-3 rounded-sm bg-amber-400/20" />Exam week
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Online
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <span className="w-3 h-3 rounded-sm bg-red-500/20" />Holiday
        </span>
      </div>

      {/* Tooltip for selected date */}
      {selected && (() => {
        const selStr = `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, '0')}-${String(selected.getDate()).padStart(2, '0')}`;
        const w = getAcademicWeek(CURRENT_TERM, selected);
        const isHol = isHoliday(selected) || phSet.has(selStr) || blockedSet.has(selStr);
        const school = isSchoolDay(selected) && !phSet.has(selStr) && !blockedSet.has(selStr);
        const staticExam = w ? isExamWeek(CURRENT_TERM, selected) : false;
        const effectiveExam = w ? (examWeekSet.has(w) || (staticExam && !suppressExamSet.has(w))) : false;
        const effectiveMode = w ? (modeMap.get(w) ?? getWeekMode(CURRENT_TERM, w)) : null;
        const holName = phNames.get(selStr)
          ?? overrides.find(o => o.type === 'blocked_date' && o.date === selStr)?.label
          ?? (isHoliday(selected) ? 'Public Holiday' : null)
          ?? (blockedSet.has(selStr) ? 'Blocked' : null);
        return (
          <div className="mt-3 p-3 rounded-xl bg-[#383a40] border border-white/10 text-sm">
            <p className="font-semibold text-white">
              {MONTH_NAMES[selected.getMonth()]} {selected.getDate()}, {selected.getFullYear()}
            </p>
            {isHol && <p className="text-red-400 text-xs mt-1">Holiday{holName ? ` — ${holName}` : ''}</p>}
            {!isHol && !school && <p className="text-gray-400 text-xs mt-1">Weekend / No class</p>}
            {school && w && (
              <p className="text-gray-300 text-xs mt-1">
                Week {w} of {CURRENT_TERM.totalWeeks} — {effectiveMode}{effectiveExam ? ' · Exam Week' : ''}
              </p>
            )}
            {school && !w && <p className="text-gray-500 text-xs mt-1">Outside current term</p>}
          </div>
        );
      })()}
    </div>
  );
}

const NAV_ITEMS: Record<string, { label: string; icon: React.ReactNode; path: string }[]> = {
  student: [
    { label: 'Book a Slot', path: '/dashboard/student?view=book', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg> },
    { label: 'My Consultations', path: '/dashboard/student?view=my', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" /></svg> },
    { label: 'History', path: '/dashboard/student?view=history', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg> },
    { label: 'Profile', path: '/dashboard/student?view=profile', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z" /></svg> },
  ],
  professor: [
    { label: 'Manage Schedules', path: '/dashboard/professor?view=schedules', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" /></svg> },
    { label: 'My Consultations', path: '/dashboard/professor?view=consultations', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" /></svg> },
    { label: 'Export Report', path: '/dashboard/professor?view=reports', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" /></svg> },
    { label: 'Profile', path: '/dashboard/professor?view=profile', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z" /></svg> },
  ],
  admin: [
    { label: 'Manage Users', path: '/dashboard/admin?view=users', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 1 1 0 5.292M15 21H3v-1a6 6 0 0 1 12 0v1zm0 0h6v-1a6 6 0 0 0-9-5.197M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" /></svg> },
    { label: 'Reports', path: '/dashboard/admin?view=reports', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" /></svg> },
    { label: 'Profile', path: '/dashboard/admin?view=profile', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z" /></svg> },
  ],
};

function NavItem({ icon, label, active, onClick }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
        active ? 'bg-[#CC0000] text-white shadow-lg shadow-red-900/30' : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'
      }`}>
      {icon}{label}
    </button>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [calOverrides, setCalOverrides] = useState<CalendarOverride[]>([]);
  const [phHolidays, setPhHolidays] = useState<PhHoliday[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('consultsiya-theme') !== 'light';
    return true;
  });

  useEffect(() => {
    const handler = (e: Event) => setIsDark((e as CustomEvent<{ dark: boolean }>).detail.dark);
    window.addEventListener('consultsiya-theme-change', handler);
    return () => window.removeEventListener('consultsiya-theme-change', handler);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const r = localStorage.getItem('role');
    if (!token) { router.push('/login'); return; }
    setRole(r);
    setMounted(true);

    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

    // Fetch calendar overrides — public endpoint, no auth required
    fetch(`${base}/api/calendar`)
      .then(res => res.ok ? res.json() : [])
      .then(data => { if (Array.isArray(data)) setCalOverrides(data); })
      .catch(() => {});

    // Fetch announcements — public endpoint
    fetch(`${base}/api/announcements`)
      .then(res => res.ok ? res.json() : [])
      .then(data => { if (Array.isArray(data)) setAnnouncements(data); })
      .catch(() => {});

    // Fetch PH public holidays for the current and next year (covers academic terms spanning year boundary)
    const year = new Date().getFullYear();
    Promise.all([fetchPhHolidays(year), fetchPhHolidays(year + 1)]).then(([a, b]) => {
      setPhHolidays([...a, ...b]);
    });
  }, [router]);

  if (!mounted) return null;

  const now = new Date();
  const currentWeek = getAcademicWeek(CURRENT_TERM, now);
  const mode = currentWeek ? getWeekMode(CURRENT_TERM, currentWeek) : null;
  const { finalsDate, endDate } = getTermDates(CURRENT_TERM);
  const daysToFinals = daysUntil(finalsDate, now);
  const daysToEnd = daysUntil(endDate, now);
  const progress = getTermProgress(CURRENT_TERM, now);
  const nextWeek = currentWeek ? currentWeek + 1 : null;
  const nextMode = nextWeek && nextWeek <= CURRENT_TERM.totalWeeks ? getWeekMode(CURRENT_TERM, nextWeek) : null;

  const navItems = NAV_ITEMS[role ?? ''] ?? [];
  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : '';

  return (
    <DashboardShell weekBadge={false}>
      <div className={`flex h-full overflow-hidden ${isDark ? 'bg-[#0c0c0c]' : 'bg-[#f2f3f5]'}`}>

        {/* ── Sidebar ───────────────────────────────────────────────────────── */}
        <aside className="w-60 flex-shrink-0 flex flex-col bg-[#111] border-r border-white/5 h-full">
          {/* Logo */}
          <div className="px-5 py-5 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#CC0000] flex items-center justify-center shadow-lg shadow-red-900/40">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
                </svg>
              </div>
              <div>
                <p className="text-white font-bold text-sm leading-none">ConsultSiya</p>
                <p className="text-gray-600 text-xs mt-0.5">Mapúa SOIT</p>
              </div>
            </div>
          </div>

          {/* Role badge */}
          <div className="px-5 py-3 border-b border-white/5">
            <span className="text-[10px] font-semibold text-[#CC0000] uppercase tracking-widest">{roleLabel}</span>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            <NavItem active icon={
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            } label="Home" onClick={() => {}} />

            {navItems.map(item => (
              <NavItem key={item.label} active={false} icon={item.icon} label={item.label} onClick={() => router.push(item.path)} />
            ))}
          </nav>
        </aside>

        {/* ── Main content ──────────────────────────────────────────────────── */}
        <main className={`flex-1 overflow-y-auto ${isDark ? '' : 'bg-[#f2f3f5]'}`}>

        <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
          {/* ── Hero: current week ────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Current week card */}
            <div className="md:col-span-2 rounded-2xl p-6 border border-white/10 flex items-center gap-6 bg-[#2b2d31]">
              <div className="flex-shrink-0 w-20 h-20 rounded-2xl flex flex-col items-center justify-center bg-[#CC0000]">
                <span className="text-white text-2xl font-black leading-none">{currentWeek ?? '–'}</span>
                <span className="text-red-200 text-[10px] font-semibold uppercase tracking-wider mt-0.5">Week</span>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Current Academic Week</p>
                <h1 className="text-2xl font-bold text-white">
                  {currentWeek ? `Week ${currentWeek} of ${CURRENT_TERM.totalWeeks}` : 'Term Not Active'}
                </h1>
                {mode && (
                  <span className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-semibold ${
                    mode === 'Online'
                      ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${mode === 'Online' ? 'bg-blue-400' : 'bg-emerald-400'}`} />
                    {mode}
                  </span>
                )}
              </div>
            </div>

            {/* Next week preview */}
            <div className="rounded-2xl p-5 border border-white/10 flex flex-col justify-between bg-[#2b2d31]">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Next Week</p>
              {nextWeek && nextMode ? (
                <>
                  <div className="mt-3">
                    <p className="text-xl font-bold text-white">Week {nextWeek}</p>
                    <span className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      nextMode === 'Online'
                        ? 'bg-blue-500/15 text-blue-400'
                        : 'bg-emerald-500/15 text-emerald-400'
                    }`}>
                      {nextMode}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 mt-3">Plan ahead for your upcoming consultations</p>
                </>
              ) : (
                <p className="text-gray-500 text-sm mt-3">End of term</p>
              )}
            </div>
          </div>

          {/* ── Countdown timers ───────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Days to Finals', value: daysToFinals, color: 'text-amber-400', ring: 'ring-amber-500/20' },
              { label: 'Days to End of Term', value: daysToEnd, color: 'text-red-400', ring: 'ring-red-500/20' },
              { label: 'Weeks Remaining', value: currentWeek ? Math.max(0, CURRENT_TERM.totalWeeks - currentWeek) : '–', color: 'text-blue-400', ring: 'ring-blue-500/20' },
              { label: 'Term Progress', value: `${Math.round(progress)}%`, color: 'text-emerald-400', ring: 'ring-emerald-500/20' },
            ].map(({ label, value, color, ring }) => (
              <div key={label} className={`rounded-2xl p-5 border border-white/10 bg-[#2b2d31] ring-1 ${ring} flex flex-col items-center justify-center text-center`}>
                <p className={`text-3xl font-black ${color}`}>{value}</p>
                <p className="text-xs text-gray-500 mt-1 font-medium">{label}</p>
              </div>
            ))}
          </div>

          {/* ── Progress bar ───────────────────────────────────────────────── */}
          <div className="rounded-2xl p-6 border border-white/10 bg-[#2b2d31]">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-white">Term Progress</p>
              <p className="text-xs text-gray-500">{CURRENT_TERM.label}</p>
            </div>

            {/* Milestone labels */}
            <div className="flex justify-between text-[10px] text-gray-600 mb-1">
              <span>Start</span>
              <span>Midterm (W{CURRENT_TERM.midtermWeek})</span>
              <span>Finals (W{CURRENT_TERM.finalsWeek})</span>
              <span>End</span>
            </div>

            {/* Bar */}
            <div className="relative h-3 rounded-full overflow-hidden bg-white/5">
              {/* Filled */}
              <div
                className="absolute left-0 top-0 h-full rounded-full transition-all duration-700 bg-[#CC0000]"
                style={{ width: `${progress}%` }}
              />
              {/* Midterm marker */}
              <div
                className="absolute top-0 h-full w-0.5 bg-amber-400/60"
                style={{ left: `${((CURRENT_TERM.midtermWeek - 1) / CURRENT_TERM.totalWeeks) * 100}%` }}
              />
              {/* Finals marker */}
              <div
                className="absolute top-0 h-full w-0.5 bg-orange-400/60"
                style={{ left: `${((CURRENT_TERM.finalsWeek - 1) / CURRENT_TERM.totalWeeks) * 100}%` }}
              />
            </div>

            {/* Week indicator */}
            {currentWeek && (
              <p className="text-xs text-gray-500 mt-2 text-center">
                Currently at <span className="text-white font-semibold">Week {currentWeek}</span> of {CURRENT_TERM.totalWeeks} weeks
              </p>
            )}
          </div>

          {/* ── Calendar + Announcements ───────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Calendar */}
            <div className="lg:col-span-3 rounded-2xl p-6 border border-white/10 bg-[#2b2d31]">
              <p className="text-sm font-semibold text-white mb-4">Academic Calendar</p>
              <CalendarView overrides={calOverrides} phHolidays={phHolidays} />
            </div>

            {/* Announcements */}
            <div className="lg:col-span-2 rounded-2xl p-6 border border-white/10 flex flex-col bg-[#2b2d31]">
              <p className="text-sm font-semibold text-white mb-4">Announcements</p>
              <div className="space-y-3 flex-1">
                {announcements.length === 0 ? (
                  <p className="text-gray-600 text-sm text-center py-8">No announcements</p>
                ) : announcements.map(a => (
                  <div key={a.id} className="flex gap-3 p-3 rounded-xl border border-white/5 hover:border-white/10 transition-colors bg-[#383a40]">
                    <AnnouncementIcon type={a.type} />
                    <div>
                      <p className="text-sm font-semibold text-white leading-tight">{a.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{a.body}</p>
                      <p className="text-[10px] text-gray-600 mt-1">
                        {new Date(a.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        </main>
      </div>
    </DashboardShell>
  );
}
