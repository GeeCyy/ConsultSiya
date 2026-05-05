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
} from '@/lib/academicCalendar';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ── Announcements (static; replace with API call if needed) ──────────────────
const ANNOUNCEMENTS = [
  {
    id: 1,
    title: 'Finals Week Approaching',
    body: 'Finals examinations begin on Week 15. Prepare your requirements and schedule consultations early.',
    date: '2026-05-04',
    type: 'warning',
  },
  {
    id: 2,
    title: 'Consultation Slots Now Open',
    body: 'Professors have updated their schedules for the remaining weeks. Book your slot now.',
    date: '2026-05-01',
    type: 'info',
  },
  {
    id: 3,
    title: 'Advising Slip Reminder',
    body: 'All students with consultations must upload a signed advising slip within 48 hours of their session.',
    date: '2026-04-28',
    type: 'info',
  },
];

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

function CalendarView() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState<Date | null>(null);

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

  const getLabel = (d: Date) => {
    const w = getAcademicWeek(CURRENT_TERM, d);
    if (!w) return '';
    if (isExamWeek(CURRENT_TERM, d)) return '📝';
    if (!isSchoolDay(d)) return '';
    return '';
  };

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

          const isToday = date.getTime() === today.getTime();
          const isSelected = selected?.getTime() === date.getTime();
          const week = getAcademicWeek(CURRENT_TERM, date);
          const holiday = isHoliday(date);
          const exam = week ? isExamWeek(CURRENT_TERM, date) : false;
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          const mode = week ? getWeekMode(CURRENT_TERM, week) : null;
          const label = getLabel(date);

          return (
            <button
              key={date.toISOString()}
              onClick={() => setSelected(isSelected ? null : date)}
              className={`
                relative flex flex-col items-center justify-center rounded-lg h-9 text-xs transition-colors
                ${isToday ? 'ring-1 ring-[#CC0000] text-white font-bold' : ''}
                ${isSelected && !isToday ? 'bg-white/10 text-white' : ''}
                ${holiday ? 'text-red-400' : isWeekend ? 'text-gray-600' : week ? 'text-gray-200' : 'text-gray-700'}
                ${!isToday && !isSelected ? 'hover:bg-white/5' : ''}
              `}
            >
              <span>{date.getDate()}</span>
              {exam && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-amber-400" />}
              {!exam && mode === 'Online' && week && !isWeekend && (
                <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-blue-400" />
              )}
              {label && <span className="text-[8px] leading-none">{label}</span>}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 pt-3 border-t border-white/10">
        <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <span className="w-2 h-2 rounded-full bg-[#CC0000]" />Today
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Exam week
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Online
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-red-400">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />Holiday
        </span>
      </div>

      {/* Tooltip for selected date */}
      {selected && (() => {
        const w = getAcademicWeek(CURRENT_TERM, selected);
        const holiday = isHoliday(selected);
        const school = isSchoolDay(selected);
        const mode = w ? getWeekMode(CURRENT_TERM, w) : null;
        const exam = w ? isExamWeek(CURRENT_TERM, selected) : false;
        return (
          <div className="mt-3 p-3 rounded-xl bg-[#383a40] border border-white/10 text-sm">
            <p className="font-semibold text-white">
              {MONTH_NAMES[selected.getMonth()]} {selected.getDate()}, {selected.getFullYear()}
            </p>
            {holiday && <p className="text-red-400 text-xs mt-1">Holiday</p>}
            {!holiday && !school && <p className="text-gray-400 text-xs mt-1">Weekend / No class</p>}
            {school && w && (
              <p className="text-gray-300 text-xs mt-1">
                Week {w} of {CURRENT_TERM.totalWeeks} — {mode}{exam ? ' (Exam Week)' : ''}
              </p>
            )}
            {school && !w && <p className="text-gray-500 text-xs mt-1">Outside current term</p>}
          </div>
        );
      })()}
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const r = localStorage.getItem('role');
    if (!token) { router.push('/login'); return; }
    setRole(r);
    setMounted(true);
  }, []);

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

  const dashPath = role === 'student' ? '/dashboard/student'
    : role === 'professor' ? '/dashboard/professor'
    : role === 'admin' ? '/dashboard/admin'
    : '/login';

  return (
    <DashboardShell>
      <div className="min-h-screen" style={{ backgroundColor: '#1e1f22' }}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10" style={{ backgroundColor: '#2b2d31' }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(dashPath)}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Dashboard
            </button>
            <span className="text-gray-700">/</span>
            <span className="text-white font-semibold text-sm">Home</span>
          </div>
          <p className="text-xs text-gray-500">{CURRENT_TERM.label}</p>
        </div>

        <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
          {/* ── Hero: current week ────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Current week card */}
            <div className="md:col-span-2 rounded-2xl p-6 border border-white/10 flex items-center gap-6" style={{ backgroundColor: '#2b2d31' }}>
              <div className="flex-shrink-0 w-20 h-20 rounded-2xl flex flex-col items-center justify-center" style={{ backgroundColor: '#CC0000' }}>
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
            <div className="rounded-2xl p-5 border border-white/10 flex flex-col justify-between" style={{ backgroundColor: '#2b2d31' }}>
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
              { label: 'Days to Finals', value: daysToFinals, color: 'text-amber-400', bg: 'bg-amber-500/10', ring: 'ring-amber-500/20' },
              { label: 'Days to End of Term', value: daysToEnd, color: 'text-red-400', bg: 'bg-red-500/10', ring: 'ring-red-500/20' },
              { label: 'Weeks Remaining', value: currentWeek ? Math.max(0, CURRENT_TERM.totalWeeks - currentWeek) : '–', color: 'text-blue-400', bg: 'bg-blue-500/10', ring: 'ring-blue-500/20' },
              { label: 'Term Progress', value: `${Math.round(progress)}%`, color: 'text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20' },
            ].map(({ label, value, color, bg, ring }) => (
              <div key={label} className={`rounded-2xl p-5 border border-white/10 ${bg} ring-1 ${ring} flex flex-col items-center justify-center text-center`} style={{ backgroundColor: '#2b2d31' }}>
                <p className={`text-3xl font-black ${color}`}>{value}</p>
                <p className="text-xs text-gray-500 mt-1 font-medium">{label}</p>
              </div>
            ))}
          </div>

          {/* ── Progress bar ───────────────────────────────────────────────── */}
          <div className="rounded-2xl p-6 border border-white/10" style={{ backgroundColor: '#2b2d31' }}>
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
                className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
                style={{ width: `${progress}%`, backgroundColor: '#CC0000' }}
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
            <div className="lg:col-span-3 rounded-2xl p-6 border border-white/10" style={{ backgroundColor: '#2b2d31' }}>
              <p className="text-sm font-semibold text-white mb-4">Academic Calendar</p>
              <CalendarView />
            </div>

            {/* Announcements */}
            <div className="lg:col-span-2 rounded-2xl p-6 border border-white/10 flex flex-col" style={{ backgroundColor: '#2b2d31' }}>
              <p className="text-sm font-semibold text-white mb-4">Announcements</p>
              <div className="space-y-3 flex-1">
                {ANNOUNCEMENTS.map(a => (
                  <div key={a.id} className="flex gap-3 p-3 rounded-xl border border-white/5 hover:border-white/10 transition-colors" style={{ backgroundColor: '#383a40' }}>
                    <AnnouncementIcon type={a.type} />
                    <div>
                      <p className="text-sm font-semibold text-white leading-tight">{a.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{a.body}</p>
                      <p className="text-[10px] text-gray-600 mt-1">{a.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
