'use client';

import { useEffect, useRef, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import UserProfileCard from '@/components/UserProfileCard';
import LeftSidebar from '@/components/LeftSidebar';
import ChatbotWidget from '@/components/ChatbotWidget';
import NavigationTour from '@/components/NavigationTour';
import { type LeaderboardItem } from '@/components/LeaderboardCard';
import { ToastContainer, useToast } from '@/components/Toast';
import { ConfirmModal } from '@/components/ConfirmModal';
import CustomSelect from '@/components/CustomSelect';
import {
  CURRENT_TERM, buildTermFromConfig, getAcademicWeek, getWeekMode,
  daysUntil, getTermDates, getTermProgress,
  type CalendarOverride, type TermConfig, type RawTermConfig,
} from '@/lib/academicCalendar';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const STUDENT_NAV_ITEMS = [
  { key: 'home',    label: 'Home' },
  { key: 'book',    label: 'Book a Slot' },
  { key: 'my',      label: 'My Consultations' },
  { key: 'history', label: 'History' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function parseNature(natureStr: string | null): string[] {
  if (!natureStr) return [];
  try {
    const parsed = JSON.parse(natureStr);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch { return [natureStr]; }
}

function getQuarterLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const m = d.getMonth(); // 0 = Jan
  const y = d.getFullYear();
  // Mapúa trimester: 1st=Aug–Nov, 2nd=Dec–Mar, 3rd=Apr–Jul
  let term: string;
  let ay: string;
  if (m >= 7 && m <= 10) {
    term = '1st Trimester'; ay = `A.Y. ${y}–${y + 1}`;
  } else if (m === 11) {
    term = '2nd Trimester'; ay = `A.Y. ${y}–${y + 1}`;
  } else if (m <= 2) {
    term = '2nd Trimester'; ay = `A.Y. ${y - 1}–${y}`;
  } else {
    term = '3rd Trimester'; ay = `A.Y. ${y - 1}–${y}`;
  }
  return `${term}, ${ay}`;
}

function groupByQuarter<T extends { date: string }>(items: T[]): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = getQuarterLabel(item.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries());
}

function actionLabel(
  action_taken: string | null,
  referral: string | null,
  referral_specify: string | null,
): string {
  if (!action_taken) return '—';
  if (action_taken === 'Referred to' && referral) {
    if (referral === 'Other Office (Please Specify)' && referral_specify) return `Referred to: ${referral_specify}`;
    return `Referred to: ${referral.split(' (')[0]}`;
  }
  return action_taken;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type TimeRange = { time_start: string; time_end: string };

type Schedule = {
  id: number;
  professor_id: number;
  professor_name: string;
  department: string;
  day: string;
  time_start: string;
  time_end: string;
  time_ranges?: TimeRange[];
  is_available: boolean;
  location?: string;
  date?: string;
  professor_avatar?: string | null;
  announcement?: string | null;
};

type Consultation = {
  id: number;
  professor_id: number;
  professor_name: string;
  date: string;
  day: string;
  time_start: string;
  time_end: string;
  nature_of_advising: string;
  nature_of_advising_specify: string | null;
  mode: string;
  slot_mode?: string | null;
  preferred_mode?: string | null;
  status: string;
  uploaded_form_path: string | null;
  action_taken: string | null;
  referral: string | null;
  referral_specify: string | null;
  remarks: string | null;
  time?: string | null;
  location?: string;
  meeting_link?: string | null;
  proof_of_evidence: string | null;
  proof_type: 'file' | 'link' | null;
  professor_avatar?: string | null;
};

type StudentProfile = {
  full_name: string;
  student_number: string;
  program: string;
  year_level: string;
  email: string;
  phone: string;
  avatar: string | null;
};

type AnnItem = {
  id: number;
  title: string;
  body: string;
  type: 'info' | 'warning';
  created_at: string;
};

type StudentTab = 'home' | 'book' | 'my' | 'history';

// ── Sub-components ────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { darkBg: string; lightBg: string; darkText: string; lightText: string; dot: string; label: string }> = {
  pending:     { darkBg: 'bg-amber-500/15',   lightBg: 'bg-amber-50',    darkText: 'text-amber-400',    lightText: 'text-amber-700',    dot: 'bg-amber-400',    label: 'Pending' },
  confirmed:   { darkBg: 'bg-blue-500/15',    lightBg: 'bg-blue-50',     darkText: 'text-blue-400',     lightText: 'text-blue-700',     dot: 'bg-blue-500',     label: 'Confirmed' },
  completed:   { darkBg: 'bg-emerald-500/15', lightBg: 'bg-emerald-50',  darkText: 'text-emerald-400',  lightText: 'text-emerald-700',  dot: 'bg-emerald-500',  label: 'Completed' },
  cancelled:   { darkBg: 'bg-red-500/15',     lightBg: 'bg-red-50',      darkText: 'text-red-400',      lightText: 'text-red-700',      dot: 'bg-red-500',      label: 'Cancelled' },
  rescheduled: { darkBg: 'bg-orange-500/15',  lightBg: 'bg-orange-50',   darkText: 'text-orange-400',   lightText: 'text-orange-700',   dot: 'bg-orange-500',   label: 'Rescheduled' },
  missed:      { darkBg: 'bg-purple-500/15',  lightBg: 'bg-purple-50',   darkText: 'text-purple-400',   lightText: 'text-purple-700',   dot: 'bg-purple-500',   label: 'Missed' },
};

function StatusBadge({ status, isDark }: { status: string; isDark?: boolean }) {
  const s = STATUS_STYLES[status] ?? { darkBg: 'bg-gray-500/15', lightBg: 'bg-gray-100', darkText: 'text-gray-400', lightText: 'text-gray-600', dot: 'bg-gray-400', label: status };
  const bg   = isDark ? s.darkBg   : s.lightBg;
  const text = isDark ? s.darkText : s.lightText;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${bg} ${text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function Avatar({ name, avatarUrl, size = 'md' }: { name: string; avatarUrl?: string | null; size?: 'sm' | 'md' }) {
  const initials = name.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const validUrl = avatarUrl?.startsWith('https://') ? avatarUrl : null;
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  return (
    <div className={`rounded-full bg-red-950 border border-red-900/50 flex items-center justify-center text-red-300 font-semibold flex-shrink-0 overflow-hidden ${sz}`}>
      {validUrl ? <img src={validUrl} alt={name} className="w-full h-full object-cover" /> : initials}
    </div>
  );
}

const MONTH_NAMES_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── Full-width Academic Calendar ─────────────────────────────────────────────

function FullCalendar({
  consultations, schedules, dateLabelMap, dateColorMap, isDark, calOverrides, onBook, studentKey,
}: {
  consultations: Consultation[];
  schedules:    Schedule[];
  dateLabelMap: Map<string, string>;
  dateColorMap: Map<string, string>;
  isDark:       boolean;
  calOverrides: CalendarOverride[];
  onBook:       () => void;
  studentKey:   string;
}) {
  const [viewYear, setViewYear]   = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [selected, setSelected]   = useState<string | null>(null);
  const [todayStr]                = useState(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
  });
  const detailRef   = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const calColRef   = useRef<HTMLDivElement>(null);
  const [panelMaxH, setPanelMaxH] = useState(0);

  useEffect(() => {
    const el = calColRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPanelMaxH(el.offsetHeight));
    ro.observe(el);
    setPanelMaxH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (selected) {
      requestAnimationFrame(() =>
        calendarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      );
    }
  }, [selected]);

  const storageKey = `consulta_notes_${studentKey}`;
  const [notes, setNotes]           = useState<Record<string, string>>({});
  const [noteDraft, setNoteDraft]   = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setNotes(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [storageKey]);

  useEffect(() => {
    setNoteDraft(selected ? (notes[selected] ?? '') : '');
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveNote = () => {
    if (!selected) return;
    const updated = { ...notes, [selected]: noteDraft };
    if (!noteDraft.trim()) delete updated[selected];
    setNotes(updated);
    try { localStorage.setItem(storageKey, JSON.stringify(updated)); } catch { /* ignore */ }
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  };

  const prevMonth = () => viewMonth === 0 ? (setViewMonth(11), setViewYear(y => y-1)) : setViewMonth(m => m-1);
  const nextMonth = () => viewMonth === 11 ? (setViewMonth(0), setViewYear(y => y+1)) : setViewMonth(m => m+1);
  const goToday   = () => { const n = new Date(); setViewYear(n.getFullYear()); setViewMonth(n.getMonth()); setSelected(todayStr); };

  const firstDow    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();

  const DOW_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  const consultByDate = new Map<string, Consultation[]>();
  for (const c of consultations) {
    const d = c.date?.slice(0,10);
    if (!d) continue;
    if (!consultByDate.has(d)) consultByDate.set(d, []);
    consultByDate.get(d)!.push(c);
  }

  const schedulesForDate = (dateStr: string): Schedule[] => {
    const dow = DOW_NAMES[new Date(dateStr + 'T12:00:00').getDay()];
    return schedules.filter(s => {
      if (!s.is_available) return false;
      if (s.date) return s.date.slice(0,10) === dateStr;
      return s.day === dow;
    });
  };

  const blockedMap = new Map(
    calOverrides.filter(o => o.type === 'blocked_date' && o.date)
      .map(o => [o.date!, o.label ?? o.value ?? 'No Class'])
  );

  const statusDotCls: Record<string, string> = {
    pending:     'bg-amber-400',
    confirmed:   'bg-blue-400',
    completed:   'bg-emerald-400',
    cancelled:   'bg-red-400',
    rescheduled: 'bg-orange-400',
  };
  const evDotCls: Record<string, string> = {
    red: 'bg-red-400', orange: 'bg-orange-400', blue: 'bg-blue-400',
    green: 'bg-emerald-400', yellow: 'bg-yellow-400', purple: 'bg-purple-400',
  };

  const cardCls = isDark
    ? 'bg-[#1e1f22] border-white/[0.06] shadow-[0_24px_80px_rgba(0,0,0,0.90),0_8px_32px_rgba(0,0,0,0.70),0_2px_8px_rgba(0,0,0,0.50)]'
    : 'bg-white border-gray-200/80 shadow-[0_24px_80px_rgba(0,0,0,0.22),0_8px_32px_rgba(0,0,0,0.14),0_2px_8px_rgba(0,0,0,0.08)]';
  const tp = isDark ? 'text-white'    : 'text-gray-900';
  const tm = isDark ? 'text-gray-400' : 'text-gray-500';

  const selConsults     = selected ? (consultByDate.get(selected) ?? []) : [];
  const selSlots        = selected ? schedulesForDate(selected) : [];
  const selLabel        = selected ? dateLabelMap.get(selected) : undefined;
  const selIsBlocked    = selected ? blockedMap.has(selected) : false;
  const selBlockedLabel = selected ? blockedMap.get(selected) : undefined;
  const selDateObj      = selected ? new Date(selected + 'T12:00:00') : null;

  return (
    <div ref={calendarRef} className={`rounded-2xl border overflow-hidden ${cardCls}`}>

      {/* ── Header ── */}
      <div className={`flex items-center justify-between px-5 py-3.5 border-b
        ${isDark
          ? 'border-white/[0.06] bg-gradient-to-r from-[#252628] to-[#1e1f22]'
          : 'border-gray-200/70 bg-gradient-to-r from-white to-gray-50/80'
        }`}>
        <div className="flex items-center gap-3">
          <div>
            <span className={`text-lg font-bold tracking-tight ${tp}`}>{MONTH_NAMES_FULL[viewMonth]}</span>
            <span className={`text-lg font-light ml-1.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{viewYear}</span>
          </div>
          <button onClick={goToday} className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors ${
            isDark
              ? 'bg-sky-500/10 text-sky-400 border-sky-500/20 hover:bg-sky-500/20'
              : 'bg-sky-50 text-sky-600 border-sky-200 hover:bg-sky-100'
          }`}>Today</button>
        </div>
        <div className="flex items-center gap-4">
          <div className={`hidden md:flex items-center gap-3 text-[10px] font-medium ${tm}`}>
            {([
              { label: 'Pending',   cls: 'bg-amber-400',   shadow: 'shadow-amber-400/60'   },
              { label: 'Confirmed', cls: 'bg-blue-400',    shadow: 'shadow-blue-400/60'    },
              { label: 'Completed', cls: 'bg-emerald-400', shadow: 'shadow-emerald-400/60' },
              { label: 'Cancelled', cls: 'bg-red-400',     shadow: 'shadow-red-400/60'     },
              { label: 'Available', cls: 'bg-sky-400',     shadow: 'shadow-sky-400/60'     },
              { label: 'Note',      cls: 'bg-violet-400',  shadow: 'shadow-violet-400/60'  },
            ] as const).map(l => (
              <span key={l.label} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full shadow-sm ${l.cls} ${l.shadow}`} />
                {l.label}
              </span>
            ))}
          </div>
          <div className={`flex gap-0.5 p-0.5 rounded-lg ${isDark ? 'bg-white/[0.05]' : 'bg-gray-100'}`}>
            <button onClick={prevMonth} className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${isDark ? 'hover:bg-white/10 text-gray-400 hover:text-white' : 'hover:bg-white text-gray-500 hover:text-gray-800 hover:shadow-sm'}`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <button onClick={nextMonth} className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${isDark ? 'hover:bg-white/10 text-gray-400 hover:text-white' : 'hover:bg-white text-gray-500 hover:text-gray-800 hover:shadow-sm'}`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-col lg:flex-row">

        {/* Calendar grid */}
        <div ref={calColRef} className="flex-1 min-w-0">
          <div className={`grid grid-cols-7 border-b-2 ${isDark ? 'border-white/[0.08] bg-[#17181a]' : 'border-gray-300 bg-gray-50/70'}`}>
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
              <div key={d} className={`text-center text-[10px] font-bold tracking-widest uppercase py-2.5 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>{d}</div>
            ))}
          </div>

          <div className={`grid grid-cols-7 divide-x divide-y ${isDark ? 'divide-white/[0.08]' : 'divide-gray-300'}`}>
            {Array.from({ length: firstDow }, (_, i) => (
              <div key={`e${i}`} className={`min-h-[88px] ${isDark ? 'bg-[#17181a]/60' : 'bg-gray-50/50'}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const ds  = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
              const isT            = ds === todayStr;
              const isSel          = ds === selected;
              const isBlocked      = blockedMap.has(ds);
              const dayConsults    = consultByDate.get(ds) ?? [];
              const hasSlots       = schedulesForDate(ds).length > 0;
              const evColor        = dateColorMap.get(ds);
              const evLabel        = dateLabelMap.get(ds);
              const uniqueStatuses = [...new Set(dayConsults.map(c => c.status))];
              const hasNote        = !!notes[ds];

              return (
                <button key={ds} onClick={() => setSelected(isSel ? null : ds)}
                  className={`min-h-[88px] p-2 text-left flex flex-col transition-all duration-150 focus:outline-none group ${
                    isBlocked
                      ? isDark ? 'bg-red-950/30 hover:bg-red-950/40' : 'bg-red-50/70 hover:bg-red-50'
                      : isSel
                      ? isDark ? 'bg-sky-500/[0.15] ring-1 ring-inset ring-sky-500/40' : 'bg-sky-50/90 ring-1 ring-inset ring-sky-300/60'
                      : isT
                      ? isDark ? 'bg-sky-500/[0.07] hover:bg-sky-500/[0.12]' : 'bg-sky-50/60 hover:bg-sky-50/90'
                      : isDark ? 'hover:bg-white/[0.025]' : 'hover:bg-blue-50/30'
                  }`}>
                  <div className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold transition-all ${
                    isT
                      ? 'bg-gradient-to-br from-sky-400 to-blue-500 text-white shadow-lg shadow-sky-500/40'
                      : isBlocked
                      ? isDark ? 'text-red-400' : 'text-red-500'
                      : isSel
                      ? isDark ? 'text-sky-300' : 'text-sky-700'
                      : isDark ? 'text-gray-300 group-hover:text-white' : 'text-gray-600 group-hover:text-gray-900'
                  }`}>{day}</div>

                  {(evLabel || (isBlocked && !evLabel)) && (
                    <p className={`text-[9px] font-semibold leading-tight truncate w-full mt-1 ${
                      isBlocked ? isDark ? 'text-red-400' : 'text-red-500'
                      : evColor === 'blue'   ? 'text-blue-400'
                      : evColor === 'green'  ? 'text-emerald-400'
                      : evColor === 'yellow' ? 'text-amber-400'
                      : isDark ? 'text-red-400' : 'text-red-500'
                    }`}>{evLabel ?? blockedMap.get(ds)}</p>
                  )}

                  <div className="flex flex-wrap gap-[3px] mt-auto pt-1">
                    {uniqueStatuses.map(st => (
                      <span key={st} title={st} className={`w-[7px] h-[7px] rounded-full shadow-sm ${statusDotCls[st] ?? 'bg-gray-400'}`} />
                    ))}
                    {hasSlots  && <span title="Professor available" className="w-[7px] h-[7px] rounded-full shadow-sm bg-sky-400 shadow-sky-400/50" />}
                    {!isBlocked && evColor && <span className={`w-[7px] h-[7px] rounded-full shadow-sm ${evDotCls[evColor] ?? 'bg-red-400'}`} />}
                    {hasNote   && <span title="Has note" className="w-[7px] h-[7px] rounded-full shadow-sm bg-violet-400 shadow-violet-400/50" />}
                  </div>
                </button>
              );
            })}
            {Array.from({ length: (7 - ((firstDow + daysInMonth) % 7)) % 7 }, (_, i) => (
              <div key={`t${i}`} className={`min-h-[88px] ${isDark ? 'bg-[#17181a]/60' : 'bg-gray-50/50'}`} />
            ))}
          </div>
        </div>

        {/* ── Detail panel ── */}
        {selected && (
          <div ref={detailRef}
            style={panelMaxH > 0 ? { height: `${panelMaxH}px` } : undefined}
            className={`w-full lg:w-[380px] xl:w-[420px] flex-shrink-0 border-t lg:border-t-0 lg:border-l flex flex-col overflow-y-auto scroll-smooth
            ${isDark
              ? 'border-white/[0.06] bg-[#17181a]'
              : 'border-gray-100 bg-gray-50/60'
            }`}>

              <div className={`sticky top-0 z-10 relative px-4 pt-4 pb-3 border-b
                ${isDark ? 'border-white/[0.06] bg-[#17181a]' : 'border-gray-100/80 bg-gray-50 backdrop-blur-sm'}`}>
                <div className={`absolute top-0 left-0 right-0 h-[3px] ${
                  selIsBlocked
                    ? 'bg-gradient-to-r from-red-500 to-red-400'
                    : 'bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500'
                }`} />
                <div className="flex items-start justify-between gap-2 mt-1">
                  <div className="min-w-0">
                    <p className={`text-[11px] font-bold uppercase tracking-widest ${isDark ? 'text-sky-400' : 'text-sky-600'} ${selIsBlocked ? (isDark ? '!text-red-400' : '!text-red-500') : ''}`}>
                      {selDateObj?.toLocaleDateString('en-PH', { weekday: 'long' })}
                    </p>
                    <p className={`text-xl font-extrabold leading-tight mt-0.5 ${tp}`}>
                      {selDateObj?.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                      <span className={`text-sm font-normal ml-1.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        {selDateObj?.getFullYear()}
                      </span>
                    </p>
                    {(selLabel || selBlockedLabel) && (
                      <span className={`inline-flex items-center gap-1 mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        selIsBlocked
                          ? isDark ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-red-50 text-red-600 border-red-200'
                          : isDark ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {selIsBlocked ? '🚫' : '🗓'} {selLabel ?? selBlockedLabel}
                      </span>
                    )}
                  </div>
                  <button onClick={() => setSelected(null)}
                    className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-lg transition-colors text-[11px] font-bold ${isDark ? 'hover:bg-white/10 text-gray-500 hover:text-gray-300' : 'hover:bg-gray-200 text-gray-400 hover:text-gray-600'}`}>
                    ✕
                  </button>
                </div>
              </div>

              <div className="px-4 pt-3.5 pb-2">
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="w-1.5 h-3.5 rounded-full bg-blue-500 flex-shrink-0" />
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    My Consultations{selConsults.length > 0 ? <span className={`ml-1.5 font-bold px-1.5 py-0.5 rounded-full text-[9px] ${isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>{selConsults.length}</span> : ''}
                  </p>
                </div>
                {selConsults.length === 0 ? (
                  <p className={`text-[11px] ${tm} py-1 pl-3.5`}>No consultations.</p>
                ) : (
                  <div className={`rounded-xl overflow-hidden divide-y ${isDark ? 'divide-white/[0.05] bg-white/[0.03] border border-white/[0.05]' : 'divide-gray-100 bg-white border border-gray-200/80 shadow-sm'}`}>
                    {selConsults.map(c => (
                      <div key={c.id} className={`flex items-center gap-2.5 px-3 py-2.5 transition-colors ${isDark ? 'hover:bg-white/[0.03]' : 'hover:bg-gray-50'}`}>
                        <Avatar name={c.professor_name} avatarUrl={c.professor_avatar} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className={`text-[11px] font-semibold truncate ${tp}`}>{c.professor_name}</p>
                          <p className={`text-[10px] ${tm}`}>
                            {formatTime12((c.time || c.time_start)?.slice(0,5) ?? '')} · {(() => { const m = c.slot_mode === 'BOTH' ? 'BOTH' : c.mode; return m === 'F2F' ? 'In-Person' : m === 'BOTH' ? 'F2F & Online' : 'Online'; })()}
                          </p>
                        </div>
                        <StatusBadge status={c.status} isDark={isDark} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-4 pt-2 pb-3">
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="w-1.5 h-3.5 rounded-full bg-sky-400 flex-shrink-0" />
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Prof. Availability{selSlots.length > 0 ? <span className={`ml-1.5 font-bold px-1.5 py-0.5 rounded-full text-[9px] ${isDark ? 'bg-sky-500/15 text-sky-400' : 'bg-sky-100 text-sky-600'}`}>{selSlots.length}</span> : ''}
                  </p>
                </div>
                {selSlots.length === 0 ? (
                  <p className={`text-[11px] ${tm} py-1 pl-3.5`}>No available slots.</p>
                ) : (
                  <div className={`rounded-xl overflow-hidden divide-y ${isDark ? 'divide-white/[0.05] bg-white/[0.03] border border-white/[0.05]' : 'divide-gray-100 bg-white border border-gray-200/80 shadow-sm'}`}>
                    {selSlots.map(s => {
                      const times = (s.time_ranges?.length ? s.time_ranges : [{ time_start: s.time_start, time_end: s.time_end }])
                        .map(r => `${formatTime12(r.time_start.slice(0,5))} – ${formatTime12(r.time_end.slice(0,5))}`)
                        .join(', ');
                      return (
                        <div key={s.id} className={`flex items-center gap-2.5 px-3 py-2.5 transition-colors ${isDark ? 'hover:bg-white/[0.03]' : 'hover:bg-gray-50'}`}>
                          <Avatar name={s.professor_name} avatarUrl={s.professor_avatar} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className={`text-[11px] font-semibold truncate ${tp}`}>{s.professor_name}</p>
                            <p className={`text-[10px] ${tm} truncate`}>{times}{s.location ? ` · ${s.location}` : ''}</p>
                          </div>
                          <button onClick={onBook}
                            className="flex-shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-gradient-to-br from-sky-400 to-blue-500 text-white hover:from-sky-500 hover:to-blue-600 transition-all shadow-md shadow-sky-500/30 hover:shadow-sky-500/50">
                            Book
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className={`px-4 pt-3 pb-4 mt-auto border-t ${isDark ? 'border-white/[0.06]' : 'border-gray-100'}`}>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-3.5 rounded-full bg-violet-500 flex-shrink-0" />
                    <p className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Notes</p>
                  </div>
                  {savedFlash && (
                    <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1 animate-pulse">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                      Saved
                    </span>
                  )}
                </div>
                <textarea
                  value={noteDraft}
                  onChange={e => setNoteDraft(e.target.value)}
                  onBlur={saveNote}
                  placeholder="Add a note for this date…"
                  rows={4}
                  className={`w-full resize-none text-[11px] rounded-xl px-3 py-2.5 outline-none transition-all leading-relaxed
                    ${isDark
                      ? 'bg-white/[0.04] border border-white/[0.08] text-gray-200 placeholder-white/20 focus:border-violet-500/50 focus:bg-white/[0.07] focus:shadow-[0_0_0_3px_rgba(139,92,246,0.12)]'
                      : 'bg-white border border-gray-200 text-gray-700 placeholder-gray-300 shadow-sm focus:border-violet-400 focus:shadow-[0_0_0_3px_rgba(139,92,246,0.10)]'
                    }`}
                />
                <div className="flex justify-end mt-2">
                  <button
                    onMouseDown={e => { e.preventDefault(); saveNote(); }}
                    className={`text-[11px] font-bold px-4 py-1.5 rounded-lg transition-all flex items-center gap-1.5
                      ${isDark
                        ? 'bg-gradient-to-br from-violet-500/20 to-purple-500/20 text-violet-300 hover:from-violet-500/30 hover:to-purple-500/30 border border-violet-500/25 shadow-md shadow-violet-900/30'
                        : 'bg-gradient-to-br from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700 shadow-md shadow-violet-500/30 hover:shadow-violet-500/50'
                      }`}>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/>
                    </svg>
                    Save Note
                  </button>
                </div>
              </div>

          </div>
        )}

      </div>{/* /body */}
    </div>
  );
}

function AnnouncementBubble({ ann, slotLabel, isDark }: { ann: string; slotLabel?: string | null; isDark: boolean }) {
  const isLong = ann.length > 50;
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border ${isDark ? 'bg-violet-500/10 border-violet-500/20' : 'bg-violet-50 border-violet-200'}`}>
      <Megaphone className={`flex-shrink-0 mt-0.5 ${isDark ? 'text-violet-400' : 'text-violet-500'}`} size={14} strokeWidth={2} />
      <div className="min-w-0">
        {slotLabel && <p className={`text-[10px] font-semibold mb-0.5 ${isDark ? 'text-violet-400' : 'text-violet-600'}`}>{slotLabel}</p>}
        <p className={`text-xs leading-relaxed ${isDark ? 'text-violet-200' : 'text-violet-800'}`}>
          {isLong && !expanded ? ann.slice(0, 50) + '...' : ann}
          {isLong && (
            <>{' '}<button
              type="button"
              onClick={() => setExpanded(e => !e)}
              className={`font-semibold underline underline-offset-2 transition-colors ${isDark ? 'text-violet-400 hover:text-violet-300' : 'text-violet-600 hover:text-violet-800'}`}
            >{expanded ? 'See less' : 'See more'}</button></>
          )}
        </p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StudentDashboard() {
  const router = useRouter();

  // Auth
  const [authReady, setAuthReady] = useState(false);
  const [token, setToken]         = useState<string | null>(null);

  // Navigation
  const [tab, setTab]             = useState<StudentTab>('home');
  const [consultTab, setConsultTab] = useState<'active' | 'past'>('active');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Quick Stats donut chart
  const [statsAnimated, setStatsAnimated] = useState(false);
  const [hoveredSeg, setHoveredSeg] = useState<number | null>(null);
  const [segTooltip, setSegTooltip] = useState<{ x: number; y: number; label: string; value: number; pct: number } | null>(null);
  const donutRef = useRef<HTMLDivElement>(null);

  // Book tab filters
  const [bookSearch, setBookSearch]       = useState('');
  const [bookDeptFilter, setBookDeptFilter] = useState<'all' | 'IT' | 'CS' | 'Other'>('all');
  const [bookSortBy, setBookSortBy]       = useState<'slots' | 'date'>('slots');
  const [bookExpandedId, setBookExpandedId] = useState<number | null>(null);

  // Data
  const [schedules, setSchedules]         = useState<Schedule[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading]             = useState(true);
  const [announcements, setAnnouncements] = useState<AnnItem[]>([]);
  const [calOverrides, setCalOverrides]   = useState<CalendarOverride[]>([]);
  const [term, setTerm]                   = useState<TermConfig>(CURRENT_TERM);

  // File upload / download
  const [uploadingId, setUploadingId]               = useState<number | null>(null);
  const [downloadingSlip, setDownloadingSlip]       = useState<number | null>(null);
  const [downloadingReceipt, setDownloadingReceipt] = useState<number | null>(null);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const uploadForId   = useRef<number | null>(null);

  // Proof of evidence
  const [proofPanelId, setProofPanelId]         = useState<number | null>(null);
  const [proofMode, setProofMode]               = useState<'file' | 'link'>('file');
  const [proofLinkValue, setProofLinkValue]     = useState('');
  const [submittingProofId, setSubmittingProofId] = useState<number | null>(null);
  const [viewingFile, setViewingFile]           = useState<number | null>(null);
  const [proofSelectedFile, setProofSelectedFile] = useState<File | null>(null);
  const [proofDragActive, setProofDragActive]     = useState(false);
  const proofFileRef   = useRef<HTMLInputElement>(null);

  // Profile card popup
  const [profileCard, setProfileCard] = useState<{ id: number; role: 'professor' | 'student' } | null>(null);

  // Student profile
  const [profile, setProfile] = useState<StudentProfile>({
    full_name: '', student_number: '', program: '', year_level: '', email: '', phone: '', avatar: null,
  });

  // Leaderboards
  const [lbStudents, setLbStudents] = useState<LeaderboardItem[]>([]);
  const [lbProfs, setLbProfs]       = useState<LeaderboardItem[]>([]);
  const [lbView, setLbView]         = useState<'rankings' | 'consulted'>('rankings');
  const [myTopics, setMyTopics]     = useState<{ label: string; count: number }[]>([]);

  // Theme — mounted guard prevents server/client mismatch
  const [mounted, setMounted] = useState(false);
  const [_isDark, setIsDark] = useState(false);
  const isDark = mounted ? _isDark : false;

  const { toasts, toast, removeToast } = useToast();
  const [confirmState, setConfirmState] = useState<{
    open: boolean; title: string; message: string; confirmLabel: string; onConfirm: () => void;
  }>({ open: false, title: '', message: '', confirmLabel: 'Confirm', onConfirm: () => {} });
  const openConfirm = (title: string, message: string, onConfirm: () => void) =>
    setConfirmState({ open: true, title, message, confirmLabel: 'Confirm', onConfirm });
  const closeConfirm = () => setConfirmState(s => ({ ...s, open: false }));

  // ── Effects ──

  useEffect(() => {
    setMounted(true);
    if (!localStorage.getItem('consulta-theme-v2')) {
      localStorage.setItem('consulta-theme-v2', '1');
      localStorage.setItem('consulta-theme', 'light');
    }
    const dark = localStorage.getItem('consulta-theme') === 'dark';
    setIsDark(dark);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const handler = (e: Event) => setIsDark((e as CustomEvent<{ dark: boolean }>).detail.dark);
    window.addEventListener('consulta-theme-change', handler);
    return () => window.removeEventListener('consulta-theme-change', handler);
  }, []);

  useEffect(() => {
    const tok  = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    if (!tok)               { router.push('/login');           return; }
    if (role !== 'student') { router.push('/dashboard/home');  return; }
    setToken(tok);
    const params = new URLSearchParams(window.location.search);
    const v = params.get('view');
    if (v && (['home', 'book', 'my', 'history'] as string[]).includes(v)) setTab(v as StudentTab);
    const f = params.get('filter');
    if (f) {
      setStatusFilter(f);
      if (['pending', 'confirmed'].includes(f)) setConsultTab('active');
      else if (['completed', 'cancelled', 'missed'].includes(f) && v === 'my') setConsultTab('past');
    }
    setAuthReady(true);

    const onTabChange = (e: Event) => setTab((e as CustomEvent<string>).detail as StudentTab);
    window.addEventListener('consulta-tab-change', onTabChange);
    return () => window.removeEventListener('consulta-tab-change', onTabChange);
  }, []);

  useEffect(() => {
    if (!authReady) return;
    const t = setTimeout(() => setStatsAnimated(true), 50);
    return () => clearTimeout(t);
  }, [authReady]);

  useEffect(() => {
    if (!authReady || !token) return;
    fetchData();
  }, [authReady]);

  const fetchData = async () => {
    const [sched, consult, prof, ann, cal, termData, lbS, lbP, notifSettings, topicsData] = await Promise.all([
      api.get('/api/schedules', token!),
      api.get('/api/consultations', token!),
      api.get('/api/auth/profile', token!),
      fetch(`${API_URL}/api/announcements`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_URL}/api/calendar`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_URL}/api/settings/term`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null).catch(() => null),
      api.get('/api/leaderboard/students', token!),
      api.get('/api/leaderboard/professors', token!),
      fetch(`${API_URL}/api/settings/notifications`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null).catch(() => null),
      api.get('/api/consultations/my-topics', token!),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    setSchedules((Array.isArray(sched) ? sched : []).filter(s => !s.date || s.date >= today));
    const freshConsults: Consultation[] = Array.isArray(consult) ? consult : [];
    setConsultations(freshConsults);

    // In-app notification toasts based on user preferences
    const prefs = {
      inapp_booking_confirmed: true, inapp_booking_cancelled: true, inapp_upcoming_reminder: true,
      ...(notifSettings && !notifSettings.error ? notifSettings : {}),
    };
    const userEmail = !prof.error ? (prof.email || 'default') : 'default';
    const statusKey = `consulta-seen-statuses-${userEmail}`;
    try {
      const prevRaw = localStorage.getItem(statusKey);
      const prevMap: Record<string, string> | null = prevRaw ? JSON.parse(prevRaw) : null;
      if (prevMap) {
        for (const c of freshConsults) {
          const prev = prevMap[String(c.id)];
          if (!prev || prev === c.status) continue;
          const dateStr = c.date ? new Date(c.date.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '';
          if (c.status === 'confirmed' && prefs.inapp_booking_confirmed)
            toast.success(`Consultation confirmed! Your session with ${c.professor_name}${dateStr ? ` on ${dateStr}` : ''} is confirmed.`);
          else if (c.status === 'cancelled' && prefs.inapp_booking_cancelled)
            toast.error(`Consultation cancelled. Your session with ${c.professor_name} has been cancelled.`);
          else if (c.status === 'rescheduled' && prefs.inapp_booking_cancelled)
            toast.warning(`Consultation rescheduled. Your session with ${c.professor_name} was rescheduled.`);
        }
      }
      const newMap: Record<string, string> = {};
      freshConsults.forEach(c => { newMap[String(c.id)] = c.status; });
      localStorage.setItem(statusKey, JSON.stringify(newMap));
    } catch { /* */ }
    // Upcoming reminder — once per day
    if (prefs.inapp_upcoming_reminder) {
      const reminderKey = `consulta-reminder-${today}-${userEmail}`;
      if (!localStorage.getItem(reminderKey)) {
        const todayConfirmed = freshConsults.filter(c => c.date === today && c.status === 'confirmed');
        if (todayConfirmed.length > 0) {
          todayConfirmed.forEach(c => {
            const t = (c.time || c.time_start || '').slice(0, 5);
            toast.info(`Reminder: Consultation with ${c.professor_name} today${t ? ` at ${t}` : ''}.`);
          });
          localStorage.setItem(reminderKey, '1');
        }
      }
    }
    if (Array.isArray(ann)) setAnnouncements(ann);
    if (Array.isArray(cal)) setCalOverrides(cal);
    if (termData && !termData.error) setTerm(buildTermFromConfig(termData as RawTermConfig));
    if (!prof.error) {
      const avatarVal = prof.avatar || null;
      setProfile({
        full_name: prof.full_name || '',
        student_number: prof.student_number || '',
        program: prof.program || '',
        year_level: prof.year_level?.toString() || '',
        email: prof.email || '',
        phone: prof.phone || '',
        avatar: avatarVal,
      });
      const fullAvatarUrl = avatarVal && !avatarVal.startsWith('/uploads/') ? avatarVal : null;
      if (fullAvatarUrl) localStorage.setItem('consulta-avatar', fullAvatarUrl);
      else localStorage.removeItem('consulta-avatar');
      window.dispatchEvent(new CustomEvent('consulta-avatar-change', { detail: { url: fullAvatarUrl } }));
      const name = prof.full_name || '';
      localStorage.setItem('consulta-name', name);
      window.dispatchEvent(new CustomEvent('consulta-name-change', { detail: { name } }));
    }
    setLbStudents(Array.isArray(lbS) ? lbS.map((r: any) => ({ rank: r.rank, label: r.name, count: r.count })) : []);
    setLbProfs(Array.isArray(lbP) ? lbP.map((r: any) => ({ rank: r.rank, label: r.name, count: r.count })) : []);
    setMyTopics(Array.isArray(topicsData) ? topicsData : []);
    setLoading(false);
  };

  const handleCancel = (id: number) => {
    openConfirm(
      'Cancel Consultation',
      'Are you sure you want to cancel this consultation?',
      async () => {
        closeConfirm();
        const data = await api.patch(`/api/consultations/${id}/cancel`, {}, token!);
        if (data.error) { toast.error(data.error); return; }
        fetchData();
      }
    );
  };

  const handleDownloadSlip = async () => {
    setDownloadingSlip(-1);
    try {
      const res = await fetch(`${API_URL}/api/forms/blank-slip`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { toast.error('Failed to download form template.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'advising-slip-FM-AS-11-02.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally { setDownloadingSlip(null); }
  };

  const handleDownloadReceipt = async (c: Consultation) => {
    setDownloadingReceipt(c.id);
    try {
      const res = await fetch(`${API_URL}/api/forms/advising-slip/${c.id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { toast.error('Failed to generate receipt.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-consultation-${c.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally { setDownloadingReceipt(null); }
  };

  const triggerUpload = (id: number) => { uploadForId.current = id; fileInputRef.current?.click(); };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadForId.current) return;
    const id = uploadForId.current;
    setUploadingId(id);
    e.target.value = '';
    const formData = new FormData();
    formData.append('form', file);
    try {
      const res = await fetch(`${API_URL}/api/forms/upload/${id}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
      });
      const data = await res.json();
      if (data.error) { toast.error(data.error); return; }
      await fetchData();
    } finally { setUploadingId(null); uploadForId.current = null; }
  };

  const validateProofFile = (file: File): boolean => {
    const allowedExt = ['.pdf', '.jpg', '.jpeg', '.png'];
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!allowedExt.includes(ext)) { toast.error('Only PDF, JPG, and PNG files are allowed.'); return false; }
    if (file.size > 10 * 1024 * 1024) { toast.error('File must be 10 MB or smaller.'); return false; }
    return true;
  };

  const handleProofFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !validateProofFile(file)) return;
    setProofSelectedFile(file);
  };

  const handleProofDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setProofDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !validateProofFile(file)) return;
    setProofSelectedFile(file);
  };

  const handleProofSubmitFile = async (id: number) => {
    const file = proofSelectedFile;
    if (!file) return;
    setSubmittingProofId(id);
    const formData = new FormData();
    formData.append('proof', file);
    try {
      const res = await fetch(`${API_URL}/api/consultations/${id}/proof`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
      });
      const data = await res.json();
      if (data.error) { toast.error(data.error); return; }
      toast.success('Proof of evidence submitted!');
      setProofPanelId(null);
      setProofSelectedFile(null);
      await fetchData();
    } finally { setSubmittingProofId(null); }
  };

  const handleProofLinkSubmit = async (id: number) => {
    const link = proofLinkValue.trim();
    if (!link) { toast.error('Please enter a valid link.'); return; }
    setSubmittingProofId(id);
    try {
      const data = await api.post(`/api/consultations/${id}/proof`, { link }, token!);
      if (data.error) { toast.error(data.error); return; }
      toast.success('Proof link submitted!');
      setProofPanelId(null);
      setProofLinkValue('');
      await fetchData();
    } finally { setSubmittingProofId(null); }
  };

  const handleViewFile = async (id: number) => {
    setViewingFile(id);
    try {
      const res = await fetch(`${API_URL}/api/consultations/${id}/proof`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const e = await res.json(); toast.error(e.error || 'Could not open file.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } finally { setViewingFile(null); }
  };

  // ── Theme ──

  const toggleTheme = () => {
    const next = !isDark;
    localStorage.setItem('consulta-theme', next ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    window.dispatchEvent(new CustomEvent('consulta-theme-change', { detail: { dark: next } }));
    setIsDark(next);
  };

  // ── Computed values ──

  const now      = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const currentWeek = getAcademicWeek(term, now);
  const { finalsDate, endDate } = getTermDates(term);
  const daysToFinals  = daysUntil(finalsDate, now);
  const daysToEnd     = daysUntil(endDate, now);
  const termProgress  = getTermProgress(term, now);

  // All-time consultation counts
  const allConsultsTotal     = consultations.length;
  const allConsultsCompleted = consultations.filter(c => c.status === 'completed').length;
  const allConsultsPending   = consultations.filter(c => c.status === 'pending').length;
  const allConsultsCancelled = consultations.filter(c => c.status === 'cancelled').length;

  // Greeting
  const greetingHour = now.getHours();
  const greetingWord = greetingHour < 12 ? 'Good morning' : greetingHour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName    = profile.full_name.trim().split(/\s+/)[0] ?? '';

  // Upcoming consultations
  const upcomingConsultations = consultations.filter(c => c.date >= todayStr && (c.status === 'pending' || c.status === 'confirmed'));
  const todayConsultations    = consultations
    .filter(c => c.date === todayStr && (c.status === 'pending' || c.status === 'confirmed'))
    .sort((a, b) => (a.time || a.time_start).localeCompare(b.time || b.time_start));

  // My Consultations tab grouping
  const activeTabConsultations = consultations.filter(c => ['pending', 'confirmed', 'rescheduled'].includes(c.status));
  const pastTabConsultations   = consultations.filter(c => ['completed', 'cancelled', 'missed'].includes(c.status));

  const recentConsultations = [...consultations]
    .sort((a, b) => {
      const da = (a.date || '') + (a.time || a.time_start || '');
      const db = (b.date || '') + (b.time || b.time_start || '');
      return db.localeCompare(da);
    })
    .slice(0, 3);

  // Notification bell: status-update consultations (confirmed/rescheduled/cancelled) for the bell
  const statusNotifConsults = consultations
    .filter(c => ['confirmed', 'rescheduled', 'cancelled'].includes(c.status) && !!c.date)
    .map(c => ({
      id: c.id,
      student_name: '',
      professor_name: c.professor_name,
      date: c.date,
      time: c.time || null,
      time_start: c.time_start,
      status: c.status,
    }));

  // My Consultations nav badge: only genuinely pending bookings awaiting professor confirmation
  const pendingOnlyConsults = consultations
    .filter(c => c.status === 'pending' && !!c.date)
    .map(c => ({
      id: c.id,
      student_name: '',
      professor_name: c.professor_name,
      date: c.date,
      time: c.time || null,
      time_start: c.time_start,
      status: c.status,
    }));

  // Calendar event maps
  const dateLabelMap = new Map(calOverrides.filter(o => o.type === 'date_label' && o.date && o.value).map(o => [o.date!, o.value!]));
  const dateColorMap = new Map(calOverrides.filter(o => o.type === 'date_label' && o.date).map(o => [o.date!, o.color ?? 'red']));

  // Most consulted topics — sourced from /api/consultations/my-topics (all statuses, all time)
  const mostConsultedTopics = myTopics;

  // Style tokens
  const card      = isDark ? 'bg-[#252525] border border-white/5 shadow-[0_10px_40px_rgba(0,0,0,0.60),0_4px_12px_rgba(0,0,0,0.40)] hover:shadow-[0_20px_60px_rgba(0,0,0,0.75),0_8px_20px_rgba(0,0,0,0.50)] hover:-translate-y-0.5 transition-all duration-200' : 'bg-white border border-gray-200 shadow-[0_10px_40px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_20px_60px_rgba(0,0,0,0.16),0_8px_20px_rgba(0,0,0,0.10)] hover:-translate-y-0.5 transition-all duration-200';
  const tp        = isDark ? 'text-white'    : 'text-gray-900';
  const ts        = isDark ? 'text-gray-400' : 'text-gray-500';
  const tm        = isDark ? 'text-gray-400' : 'text-gray-500';
  const innerCard = isDark ? 'bg-white/[0.03] border-white/5' : 'bg-sky-50/40 border-sky-100/70';
  const hoverBg   = isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-sky-50/60';

  const activeConsults = consultations.filter(c => c.status === 'pending' || c.status === 'confirmed').length;

  const natureLabel = (c: Consultation) => {
    const items = parseNature(c.nature_of_advising);
    return items.map(i =>
      i === 'Others (Please Specify)' && c.nature_of_advising_specify
        ? `Others: ${c.nature_of_advising_specify}` : i
    ).join(', ') || '—';
  };

  const handleTabChange = (next: string) => {
    setTab(next as StudentTab);
    router.replace(`?view=${next}`, { scroll: false });
  };

  const goToStatus = (status: string) => {
    const target: StudentTab = status === 'completed' || status === 'cancelled' ? 'history' : 'my';
    if (target === 'my') setConsultTab('active');
    setStatusFilter(status);
    setTab(target);
    router.replace(`?view=${target}&filter=${status}`, { scroll: false });
  };

  const clearStatusFilter = () => {
    setStatusFilter(null);
    router.replace(`?view=${tab}`, { scroll: false });
  };

  // ── Auth guard splash ──

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: isDark ? '#1a1a1a' : '#EEF2FF' }}>
        <div className="w-8 h-8 border-2 border-[#0EA5E9] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={`h-screen flex overflow-hidden ${isDark ? 'bg-[#1e2235]' : 'bg-[#EEF2FF]'}`}>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />

      <LeftSidebar
        role="student"
        navItems={STUDENT_NAV_ITEMS}
        activeTab={tab}
        onTabChange={handleTabChange}
        profileName={profile.full_name}
        profileAvatar={profile.avatar}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        announcements={announcements}
        pendingConsultations={pendingOnlyConsults}
        storageKey={`student_notifs_${profile.email || 'default'}`}
      />

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="lg:hidden h-14 flex-shrink-0" />
        <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileSelected} />
        <input ref={proofFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleProofFileSelected} />

        <main className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
            <div className="w-8 h-8 border-2 border-[#0EA5E9] border-t-transparent rounded-full animate-spin" />
            <p className={`text-sm ${ts}`}>Loading...</p>
          </div>

        ) : tab === 'home' ? (() => {
          const confirmedCount = consultations.filter(c => c.status === 'confirmed').length;
          const studentInitials = profile.full_name.split(' ').filter(Boolean).map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
          const completionPct = allConsultsTotal > 0 ? Math.round((allConsultsCompleted / allConsultsTotal) * 100) : 0;

          return (
          <div className="p-4 sm:p-6 space-y-4">

            {/* ── Section 1: Welcome header ── */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <p className={`text-[11px] font-bold uppercase tracking-[0.15em] mb-1 ${tm}`}>
                  MAPUA UNIVERSITY · SOIT ADVISING PORTAL
                </p>
                <h1 className={`text-2xl sm:text-3xl font-extrabold leading-tight ${tp}`}>
                  {greetingWord}{firstName ? `, ${firstName}` : ''} 👋
                </h1>
                <p className={`text-sm mt-1 ${ts}`}>
                  {upcomingConsultations.length > 0
                    ? `You have ${upcomingConsultations.length} upcoming consultation${upcomingConsultations.length !== 1 ? 's' : ''}.`
                    : 'No upcoming consultations scheduled.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0 sm:mt-1">
                {currentWeek && (
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${isDark ? 'bg-sky-500/15 text-sky-300' : 'bg-sky-100 text-sky-800'}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0EA5E9]" />
                    Week {currentWeek} of {term.totalWeeks}
                  </span>
                )}
                {allConsultsPending > 0 && (
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    {allConsultsPending} pending
                  </span>
                )}
                {confirmedCount > 0 && (
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${isDark ? 'bg-sky-500/15 text-sky-400' : 'bg-sky-100 text-sky-700'}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                    {confirmedCount} confirmed
                  </span>
                )}
              </div>
            </div>

            {/* ── Section 2: Stat cards + Leaderboard ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">

              {/* 4 stat cards */}
              <div className="lg:col-span-12 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([
                  {
                    value: allConsultsTotal,
                    label: 'Total Requests',
                    sub: 'all time',
                    numColor: '#0EA5E9',
                    darkNumColor: '#7DD3FC',
                    lightBg: 'linear-gradient(135deg, #EEF2FF, #DBEAFE)',
                    lightBorder: '#BFDBFE',
                    darkBg: 'linear-gradient(135deg, rgba(14,165,233,0.25), rgba(14,165,233,0.12))',
                    darkBorder: 'rgba(56,189,248,0.2)',
                    shadow: '0 10px 40px rgba(14,165,233,0.20), 0 4px 12px rgba(14,165,233,0.12)',
                    hoverShadow: '0 20px 60px rgba(14,165,233,0.30), 0 8px 20px rgba(14,165,233,0.18)',
                  },
                  {
                    value: confirmedCount,
                    label: 'Confirmed',
                    sub: 'approved',
                    numColor: '#7C3AED',
                    darkNumColor: '#C4B5FD',
                    lightBg: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)',
                    lightBorder: '#DDD6FE',
                    darkBg: 'linear-gradient(135deg, rgba(124,58,237,0.25), rgba(124,58,237,0.12))',
                    darkBorder: 'rgba(167,139,250,0.2)',
                    shadow: '0 10px 40px rgba(124,58,237,0.20), 0 4px 12px rgba(124,58,237,0.12)',
                    hoverShadow: '0 20px 60px rgba(124,58,237,0.30), 0 8px 20px rgba(124,58,237,0.18)',
                  },
                  {
                    value: allConsultsCompleted,
                    label: 'Completed',
                    sub: 'sessions done',
                    numColor: '#059669',
                    darkNumColor: '#6EE7B7',
                    lightBg: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)',
                    lightBorder: '#A7F3D0',
                    darkBg: 'linear-gradient(135deg, rgba(5,150,105,0.25), rgba(5,150,105,0.12))',
                    darkBorder: 'rgba(52,211,153,0.2)',
                    shadow: '0 10px 40px rgba(5,150,105,0.20), 0 4px 12px rgba(5,150,105,0.12)',
                    hoverShadow: '0 20px 60px rgba(5,150,105,0.30), 0 8px 20px rgba(5,150,105,0.18)',
                  },
                  {
                    value: daysToFinals,
                    label: 'Days to Finals',
                    sub: finalsDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
                    numColor: '#EA580C',
                    darkNumColor: '#FDBA74',
                    lightBg: 'linear-gradient(135deg, #FFF7ED, #FFEDD5)',
                    lightBorder: '#FED7AA',
                    darkBg: 'linear-gradient(135deg, rgba(234,88,12,0.25), rgba(234,88,12,0.12))',
                    darkBorder: 'rgba(251,146,60,0.2)',
                    shadow: '0 10px 40px rgba(234,88,12,0.20), 0 4px 12px rgba(234,88,12,0.12)',
                    hoverShadow: '0 20px 60px rgba(234,88,12,0.30), 0 8px 20px rgba(234,88,12,0.18)',
                  },
                ] as const).map(s => (
                  <div
                    key={s.label}
                    className="rounded-2xl p-3 border transition-all duration-200 hover:-translate-y-0.5 group"
                    style={{
                      background: isDark ? s.darkBg : s.lightBg,
                      borderColor: isDark ? s.darkBorder : s.lightBorder,
                      boxShadow: s.shadow,
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = s.hoverShadow; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = s.shadow; }}
                  >
                    <p
                      className="text-2xl sm:text-3xl font-black leading-none tracking-tight"
                      style={{ color: isDark ? s.darkNumColor : s.numColor }}
                    >
                      {s.value}
                    </p>
                    <p className={`text-sm font-semibold mt-1.5 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{s.label}</p>
                    <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{s.sub}</p>
                  </div>
                ))}
              </div>

            </div>

            {/* ── Section 3: Widget grid ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

              {/* Profile + term card */}
              <div className={`lg:col-span-3 rounded-2xl overflow-hidden border ${card}`}>
                <div className={`px-5 pt-5 pb-4 ${isDark ? 'bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent' : 'bg-gradient-to-br from-blue-50 to-indigo-50/40'}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0 ring-2 ring-[#0EA5E9]/30" style={{ background: 'linear-gradient(135deg, #0369A1, #0EA5E9)' }}>
                      {profile.avatar && !profile.avatar.startsWith('/uploads/')
                        ? <img src={profile.avatar} alt={profile.full_name} className="w-full h-full object-cover" />
                        : <span className="text-lg font-bold" style={{ color: '#fff' }}>{studentInitials}</span>}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-bold truncate ${tp}`}>{profile.full_name}</p>
                      <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{profile.program || 'Student'}</p>
                      <p className={`text-[10px] mt-0.5 font-medium text-[#0EA5E9]`}>
                        {profile.year_level ? `Year ${profile.year_level}` : ''}{profile.student_number ? ` · ${profile.student_number}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-[#0EA5E9] flex flex-col items-center justify-center flex-shrink-0 shadow-lg shadow-sky-500/30">
                      <span className="text-white text-2xl font-black leading-none">{currentWeek ?? '–'}</span>
                      <span className="text-blue-200 text-[8px] font-bold uppercase tracking-wide">WK</span>
                    </div>
                    <div>
                      <p className={`text-base font-bold ${tp}`}>{currentWeek ? `Week ${currentWeek} of ${term.totalWeeks}` : 'Not active'}</p>
                      <p className={`text-[10px] ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{term.label}</p>
                    </div>
                  </div>
                </div>
                <div className={`px-5 pt-4 pb-5 border-t space-y-3 ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-xs font-medium ${ts}`}>Term Progress</span>
                      <span className="text-xs font-bold text-emerald-500">{Math.round(termProgress)}%</span>
                    </div>
                    <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-white/8' : 'bg-gray-100'}`}>
                      <div className="h-full bg-gradient-to-r from-[#0EA5E9] to-sky-300 rounded-full transition-all duration-700" style={{ width: `${termProgress}%` }} />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className={`text-[9px] ${tm}`}>Start</span>
                      <span className={`text-[9px] ${tm}`}>Finals W{term.finalsWeek}</span>
                      <span className={`text-[9px] ${tm}`}>End</span>
                    </div>
                  </div>
                  {([
                    { label: 'Days to Finals', value: daysToFinals,  color: 'text-orange-400', dot: 'bg-orange-400' },
                    { label: 'Days to End',     value: daysToEnd,     color: 'text-pink-400',   dot: 'bg-pink-400'   },
                    { label: 'Weeks Left',      value: currentWeek ? Math.max(0, term.totalWeeks - currentWeek) : term.totalWeeks, color: 'text-sky-400', dot: 'bg-sky-400' },
                  ] as const).map(m => (
                    <div key={m.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                        <span className={`text-xs ${ts}`}>{m.label}</span>
                      </div>
                      <span className={`text-sm font-bold ${m.color}`}>{m.value}</span>
                    </div>
                  ))}
                  <button
                    onClick={() => handleTabChange('book')}
                    className="w-full mt-1 py-2 rounded-xl text-xs font-semibold bg-[#0EA5E9] text-white hover:bg-[#0284C7] shadow-sm hover:shadow-md hover:shadow-sky-500/30 transition-all duration-200"
                  >
                    Book a Consultation
                  </button>
                </div>
              </div>

              {/* My consultations breakdown */}
              <div className={`lg:col-span-5 rounded-2xl border p-4 ${card}`}>
                <div className="flex items-center justify-between mb-1">
                  <h3 className={`text-sm font-semibold ${tp}`}>My Consultations</h3>
                  <button onClick={() => handleTabChange('my')} className="text-xs text-[#0EA5E9] hover:text-sky-600 font-medium transition-colors">
                    View all →
                  </button>
                </div>
                <p className={`text-xs ${tm} mb-4`}>{allConsultsTotal} total · {allConsultsCompleted} completed · {allConsultsPending} pending</p>

                {/* Completion progress */}
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs font-medium ${ts}`}>Completion Rate</span>
                    <span className={`text-xs font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>{completionPct}%</span>
                  </div>
                  <div className={`h-3 rounded-full overflow-hidden ${isDark ? 'bg-white/8' : 'bg-gray-100'}`}>
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-700" style={{ width: `${completionPct}%` }} />
                  </div>
                </div>

                {/* 2x2 stat grid */}
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { label: 'Total',     value: allConsultsTotal,     bg: isDark ? 'bg-sky-500/10'    : 'bg-sky-50',    color: isDark ? 'text-sky-400'    : 'text-sky-600'    },
                    { label: 'Completed', value: allConsultsCompleted, bg: isDark ? 'bg-emerald-500/10' : 'bg-emerald-50', color: isDark ? 'text-emerald-400' : 'text-emerald-600' },
                    { label: 'Pending',   value: allConsultsPending,   bg: isDark ? 'bg-amber-500/10'   : 'bg-amber-50',   color: isDark ? 'text-amber-400'   : 'text-amber-600'   },
                    { label: 'Cancelled', value: allConsultsCancelled, bg: isDark ? 'bg-red-500/10'     : 'bg-red-50',     color: isDark ? 'text-red-400'     : 'text-red-600'     },
                  ] as const).map(s => (
                    <div key={s.label} className={`rounded-xl p-3 ${s.bg}`}>
                      <p className={`text-2xl font-black leading-none ${s.color}`}>{s.value}</p>
                      <p className={`text-[11px] font-medium mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Recent consultations */}
                {recentConsultations.length > 0 && (
                  <div className={`mt-4 pt-3.5 border-t ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                    <p className={`text-[11px] font-semibold uppercase tracking-wider mb-2.5 ${tm}`}>Recent</p>
                    <div className={`rounded-xl overflow-hidden divide-y ${isDark ? 'divide-white/[0.05] border border-white/[0.05]' : 'divide-gray-100 border border-gray-100'}`}>
                      {recentConsultations.map(c => (
                        <div key={c.id} className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${isDark ? 'hover:bg-white/[0.03]' : 'hover:bg-gray-50'}`}>
                          <Avatar name={c.professor_name} avatarUrl={c.professor_avatar} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-semibold truncate ${tp}`}>{c.professor_name}</p>
                            <p className={`text-[10px] ${tm}`}>
                              {c.date ? new Date(c.date.slice(0,10) + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—'}
                              {' · '}{formatTime12((c.time || c.time_start)?.slice(0,5) ?? '')}
                            </p>
                          </div>
                          <StatusBadge status={c.status} isDark={isDark} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>

              {/* Right: Combined Rankings + Quick Stats */}
              <div className={`lg:col-span-4 rounded-2xl border p-4 flex flex-col ${card}`}>

                {/* ── Rankings / Most Consulted tabs ── */}
                <div className={`flex-shrink-0 flex gap-1.5 mb-3`}>
                  {(['rankings', 'consulted'] as const).map(v => (
                    <button key={v} onClick={() => setLbView(v)}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all border ${
                        lbView === v
                          ? isDark
                            ? 'bg-sky-500/15 text-sky-300 border-sky-500/40'
                            : 'bg-sky-50 text-sky-700 border-sky-300'
                          : isDark
                            ? 'bg-transparent text-gray-400 border-white/15 hover:text-gray-300 hover:border-white/25'
                            : 'bg-transparent text-gray-500 border-gray-300 hover:text-gray-700 hover:border-gray-400'
                      }`}>
                      {v === 'rankings' ? 'Rankings' : 'Most Consulted'}
                    </button>
                  ))}
                </div>

                {/* ── Tab content — fixed height so card doesn't resize on tab switch ── */}
                <div className="flex-shrink-0 relative" style={{ minHeight: '148px' }}>

                  {/* Rankings */}
                  {lbView === 'rankings' && (
                    <div className="absolute inset-0 grid grid-cols-2 gap-3 content-start">
                      <div>
                        <p className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${tm}`}>Top Students</p>
                        <div className="space-y-0.5">
                          {lbStudents.slice(0, 3).map((item, i) => {
                            const isMe = item.label === profile.full_name;
                            return (
                              <div key={item.rank} className={`flex items-center gap-1.5 py-1 px-1 rounded-lg ${isMe ? (isDark ? 'bg-amber-500/10' : 'bg-amber-50') : ''}`}>
                                <span className="w-4 text-center text-sm leading-none flex-shrink-0">{['🥇','🥈','🥉'][i]}</span>
                                <span className={`flex-1 text-[11px] truncate font-bold ${isMe ? (isDark ? 'text-amber-300' : 'text-amber-700') : ts}`}>
                                  {item.label}{isMe && <span className="ml-1 text-[10px] font-semibold opacity-70">(you)</span>}
                                </span>
                                <span className={`text-[11px] font-black tabular-nums flex-shrink-0 ${isMe ? (isDark ? 'text-amber-300' : 'text-amber-700') : tp}`}>{item.count}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <p className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${tm}`}>Top Professors</p>
                        <div className="space-y-0.5">
                          {lbProfs.slice(0, 3).map((item, i) => (
                            <div key={item.rank} className="flex items-center gap-1.5 py-1 px-1 rounded-lg">
                              <span className="w-4 text-center text-sm leading-none flex-shrink-0">{['🥇','🥈','🥉'][i]}</span>
                              <span className={`flex-1 text-[11px] truncate font-bold ${ts}`}>{item.label}</span>
                              <span className={`text-[11px] font-black tabular-nums flex-shrink-0 ${tp}`}>{item.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Most Consulted */}
                  {lbView === 'consulted' && (() => {
                    const RANK_CFG = [
                      {
                        medal: '🥇',
                        border:  'border-amber-400',
                        rowBg:   isDark ? 'bg-amber-400/[0.10]' : 'bg-amber-50',
                        fill:    'from-amber-400 to-yellow-300',
                        track:   isDark ? 'bg-white/[0.07]' : 'bg-amber-200/60',
                      },
                      {
                        medal: '🥈',
                        border:  'border-slate-400',
                        rowBg:   isDark ? 'bg-slate-400/[0.10]' : 'bg-slate-50',
                        fill:    'from-slate-400 to-slate-300',
                        track:   isDark ? 'bg-white/[0.07]' : 'bg-slate-200/60',
                      },
                      {
                        medal: '🥉',
                        border:  'border-orange-400',
                        rowBg:   isDark ? 'bg-orange-400/[0.10]' : 'bg-orange-50',
                        fill:    'from-orange-500 to-amber-400',
                        track:   isDark ? 'bg-white/[0.07]' : 'bg-orange-200/60',
                      },
                    ];
                    const top3 = mostConsultedTopics.slice(0, 3);
                    const top = top3[0]?.count || 1;
                    return (
                      <div className="absolute inset-0">
                        {/* Header */}
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-xs leading-none">🔥</span>
                          <p className={`text-[10px] font-bold uppercase tracking-wider ${tm}`}>Trending across all students</p>
                        </div>
                        {top3.length === 0 ? (
                          <p className={`text-xs ${tm} py-1`}>No consultation data yet.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {top3.map((t, i) => {
                              const cfg = RANK_CFG[i];
                              const pct = Math.max(8, Math.round((t.count / top) * 100));
                              return (
                                <div key={t.label}
                                  className={`rounded-lg border-l-[3px] overflow-hidden cursor-default transition-colors ${cfg.border} ${isDark ? 'hover:brightness-110' : 'hover:brightness-95'}`}>
                                  <div className={`px-2 py-1.5 ${cfg.rowBg}`}>
                                    {/* Top row: medal + topic + count */}
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-sm leading-none w-4 text-center flex-shrink-0">{cfg.medal}</span>
                                      <span className={`flex-1 text-[11px] font-semibold truncate ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{t.label}</span>
                                      <span className={`text-sm font-black tabular-nums flex-shrink-0 ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.count}</span>
                                    </div>
                                    {/* Progress bar */}
                                    <div className={`mt-1.5 ml-5 h-1 rounded-full overflow-hidden ${cfg.track}`}>
                                      <div className={`h-full rounded-full bg-gradient-to-r ${cfg.fill} transition-all duration-500`}
                                        style={{ width: `${pct}%` }} />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                </div>

                {/* ── Divider ── */}
                <div className={`my-3 border-t ${isDark ? 'border-white/[0.08]' : 'border-gray-100'}`} />

                {/* ── Quick Stats ── */}
                <h3 className={`text-sm font-semibold mb-3 ${tp}`}>Quick Stats</h3>

                {(() => {
                  const allSegs = [
                    { label: 'Completed', status: 'completed', value: allConsultsCompleted, color: '#10B981', darkColor: '#34D399' },
                    { label: 'Confirmed', status: 'confirmed', value: confirmedCount,       color: '#0EA5E9', darkColor: '#38BDF8' },
                    { label: 'Pending',   status: 'pending',   value: allConsultsPending,   color: '#F59E0B', darkColor: '#FCD34D' },
                    { label: 'Cancelled', status: 'cancelled', value: allConsultsCancelled, color: '#EF4444', darkColor: '#F87171' },
                  ];
                  const total = allConsultsTotal;
                  const r = 34, cx = 50, cy = 50;
                  const circ = 2 * Math.PI * r;
                  const activeSegs = allSegs.filter(s => s.value > 0);
                  const segGap = activeSegs.length > 1 ? 3 : 0;
                  let acc = 0;
                  const arcs = activeSegs.map(seg => {
                    const full = (seg.value / total) * circ;
                    const dash = Math.max(0, full - segGap);
                    const offset = -acc;
                    acc += full;
                    const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0;
                    return { ...seg, dash, offset, pct };
                  });

                  const showTooltipFor = (arc: typeof arcs[number], e: React.MouseEvent) => {
                    const rect = donutRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    setSegTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, label: arc.label, value: arc.value, pct: arc.pct });
                  };

                  return (
                    <>
                      <div className="flex items-center justify-center mb-3">
                        <div ref={donutRef} className="relative w-28 h-28">
                          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                            <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth="13"
                              stroke={isDark ? 'rgba(255,255,255,0.06)' : '#EFF6FF'} />
                            {arcs.map((arc, i) => (
                              <circle key={arc.label} cx={cx} cy={cy} r={r} fill="none" strokeWidth="13"
                                stroke={isDark ? arc.darkColor : arc.color}
                                strokeDasharray={`${statsAnimated ? arc.dash : 0} ${circ}`}
                                strokeDashoffset={arc.offset}
                                strokeLinecap="butt"
                                onMouseEnter={(e) => { setHoveredSeg(i); showTooltipFor(arc, e); }}
                                onMouseMove={(e) => showTooltipFor(arc, e)}
                                onMouseLeave={() => { setHoveredSeg(null); setSegTooltip(null); }}
                                onClick={() => goToStatus(arc.status)}
                                style={{
                                  cursor: 'pointer',
                                  pointerEvents: 'stroke',
                                  transformOrigin: '50% 50%',
                                  transformBox: 'fill-box',
                                  transform: hoveredSeg === i ? 'scale(1.07)' : 'scale(1)',
                                  opacity: hoveredSeg === null || hoveredSeg === i ? 1 : 0.6,
                                  transition: 'stroke-dasharray 1s ease-out, transform 0.2s ease-out, opacity 0.2s ease-out',
                                }}
                              />
                            ))}
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className={`text-2xl font-black leading-none ${tp}`}>{total}</span>
                            <span className={`text-[10px] font-medium mt-0.5 ${tm}`}>sessions</span>
                          </div>
                          {segTooltip && (
                            <div
                              className={`absolute z-50 px-2.5 py-1.5 rounded-lg shadow-lg pointer-events-none whitespace-nowrap text-center ${isDark ? 'bg-[#2a2a2a] border border-white/10' : 'bg-white border border-gray-200'}`}
                              style={{ left: segTooltip.x, top: segTooltip.y, transform: 'translate(-50%, -120%)' }}
                            >
                              <p className={`text-[11px] font-semibold ${tp}`}>{segTooltip.label}</p>
                              <p className={`text-[10px] ${tm}`}>{segTooltip.value} session{segTooltip.value !== 1 ? 's' : ''} · {segTooltip.pct}%</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        {allSegs.map(seg => {
                          const arcIdx = arcs.findIndex(a => a.label === seg.label);
                          const disabled = seg.value === 0;
                          return (
                            <button key={seg.label} type="button" disabled={disabled}
                              onClick={() => goToStatus(seg.status)}
                              onMouseEnter={() => arcIdx >= 0 && setHoveredSeg(arcIdx)}
                              onMouseLeave={() => setHoveredSeg(null)}
                              className={`flex items-center gap-2.5 w-full text-left rounded-md px-1 py-0.5 -mx-1 transition-all duration-200 ${disabled ? 'cursor-default' : 'cursor-pointer'} ${
                                !disabled && hoveredSeg === arcIdx ? (isDark ? 'bg-white/5' : 'bg-gray-50') : ''
                              }`}
                              style={{ opacity: hoveredSeg !== null && arcIdx >= 0 && hoveredSeg !== arcIdx ? 0.6 : 1 }}
                            >
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: isDark ? seg.darkColor : seg.color }} />
                              <span className={`flex-1 text-xs ${ts}`}>{seg.label}</span>
                              <span className={`text-xs font-bold tabular-nums ${tp}`}>{seg.value}</span>
                              <span className={`text-[10px] tabular-nums w-7 text-right ${tm}`}>
                                {total > 0 ? Math.round((seg.value / total) * 100) : 0}%
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}

                {todayConsultations.length > 0 && (
                  <div className={`mt-3 pt-3 border-t ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                    <p className={`text-[11px] font-semibold uppercase tracking-wider mb-2 ${tm}`}>Today</p>
                    <div className="space-y-2">
                      {todayConsultations.slice(0, 3).map(c => (
                        <div key={c.id} className="flex items-center gap-2">
                          <span className={`text-[10px] font-mono flex-shrink-0 ${tm}`}>{(c.time || c.time_start)?.slice(0, 5)}</span>
                          <div className={`flex-1 min-w-0 pl-2 border-l-2 ${c.status === 'confirmed' ? 'border-sky-400' : 'border-amber-400'}`}>
                            <p className={`text-xs font-medium truncate ${tp}`}>{c.professor_name.split(' ').slice(-1)[0]}</p>
                            <p className={`text-[10px] ${tm}`}>{(() => { const m = c.slot_mode === 'BOTH' ? 'BOTH' : c.mode; return m === 'F2F' ? 'In-Person' : m === 'BOTH' ? 'F2F & Online' : 'Online'; })()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>

            </div>{/* /widget grid */}

            {/* ── Section 4: Full Calendar ── */}
            <FullCalendar
              consultations={consultations}
              schedules={schedules}
              dateLabelMap={dateLabelMap}
              dateColorMap={dateColorMap}
              isDark={isDark}
              calOverrides={calOverrides}
              onBook={() => handleTabChange('book')}
              studentKey={profile.student_number || 'student'}
            />

          </div>
          );
        })()

        : tab === 'book' ? (
          <div className="px-3 sm:px-8 py-5 sm:py-8">
            {(() => {
              const profMap = new Map<number, {
                professor_id: number; professor_name: string; department: string;
                professor_avatar?: string | null; slots: Schedule[];
              }>();
              for (const s of schedules) {
                if (!profMap.has(s.professor_id)) {
                  profMap.set(s.professor_id, {
                    professor_id: s.professor_id,
                    professor_name: s.professor_name,
                    department: s.department,
                    professor_avatar: s.professor_avatar,
                    slots: [],
                  });
                }
                profMap.get(s.professor_id)!.slots.push(s);
              }
              const allProfessors = Array.from(profMap.values());
              const DAY_ORDER = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

              // Booked professor IDs (for "Already consulted" badge)
              const bookedProfIds = new Set<number>(consultations.map(c => c.professor_id));

              // Department categorisation
              const deptCat = (dept: string | null): 'IT' | 'CS' | 'Other' => {
                if (!dept) return 'Other';
                const d = dept.toLowerCase();
                if (d.includes('information technology')) return 'IT';
                if (d.includes('computer science')) return 'CS';
                return 'Other';
              };
              const hasIT    = allProfessors.some(p => deptCat(p.department) === 'IT');
              const hasCS    = allProfessors.some(p => deptCat(p.department) === 'CS');
              const hasOther = allProfessors.some(p => deptCat(p.department) === 'Other');
              const deptOptions = [
                { key: 'all',   label: 'All' },
                ...(hasIT    ? [{ key: 'IT',    label: 'Inf. Technology' }] : []),
                ...(hasCS    ? [{ key: 'CS',    label: 'Comp. Science'   }] : []),
                ...(hasOther ? [{ key: 'Other', label: 'Other'           }] : []),
              ] as { key: string; label: string }[];

              // Filter + sort
              const q = bookSearch.trim().toLowerCase();
              const filtered = allProfessors.filter(p => {
                const matchQ    = !q || p.professor_name.toLowerCase().includes(q) || p.department.toLowerCase().includes(q);
                const matchDept = bookDeptFilter === 'all' || deptCat(p.department) === bookDeptFilter;
                return matchQ && matchDept;
              });
              const displayedProfessors = [...filtered].sort((a, b) => {
                if (bookSortBy === 'slots') return b.slots.length - a.slots.length;
                const aDate = a.slots.filter(s => s.date).sort((x, y) => x.date!.localeCompare(y.date!))[0]?.date || '9999';
                const bDate = b.slots.filter(s => s.date).sort((x, y) => x.date!.localeCompare(y.date!))[0]?.date || '9999';
                return aDate.localeCompare(bDate);
              });

              return (
                <>
                  {/* Header */}
                  <div className="mb-5 sm:mb-6">
                    <h1 className={`text-2xl sm:text-3xl font-bold ${tp}`}>Book a Consultation</h1>
                    <p className={`text-sm mt-1 ${ts}`}>{allProfessors.length} professor{allProfessors.length !== 1 ? 's' : ''} available</p>
                  </div>

                  {/* Search + Sort */}
                  <div className="flex flex-col sm:flex-row gap-2.5 mb-3">
                    <div className="relative flex-1">
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <input type="text" placeholder="Search by name or department…" value={bookSearch}
                        onChange={e => setBookSearch(e.target.value)}
                        className={`w-full pl-9 pr-8 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 transition-all ${isDark ? 'bg-[#252535] border border-white/8 text-gray-200 placeholder-gray-500' : 'bg-white border border-gray-200 text-gray-800 placeholder-gray-400'}`} />
                      {bookSearch && (
                        <button onClick={() => setBookSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                    <CustomSelect
                      value={bookSortBy}
                      onChange={v => setBookSortBy(v as typeof bookSortBy)}
                      isDark={isDark}
                      className="py-2 px-3 text-sm"
                      options={[
                        { value: 'slots', label: 'Most Available' },
                        { value: 'date', label: 'Soonest Slot' },
                      ]}
                    />
                  </div>

                  {/* Dept filter chips */}
                  {deptOptions.length > 2 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {deptOptions.map(opt => (
                        <button key={opt.key} type="button"
                          onClick={() => setBookDeptFilter(opt.key as typeof bookDeptFilter)}
                          className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                            bookDeptFilter === opt.key
                              ? 'bg-[#0EA5E9] border-[#0EA5E9] text-white shadow-sm shadow-sky-500/20'
                              : isDark ? 'border-white/10 text-gray-400 hover:border-sky-500/40 hover:text-sky-400' : 'border-gray-200 text-gray-600 hover:border-sky-300 hover:text-sky-600'
                          }`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Empty states */}
                  {allProfessors.length === 0 ? (
                    <div className={`flex flex-col items-center justify-center py-20 rounded-2xl gap-2 ${card}`}>
                      <svg className="w-10 h-10 text-gray-600 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                      <p className={`font-semibold text-sm ${ts}`}>No consultations available</p>
                      <p className={`text-xs text-center max-w-xs ${tm}`}>Professors haven&apos;t posted any open slots yet. Check back later or message your adviser directly.</p>
                    </div>
                  ) : displayedProfessors.length === 0 ? (
                    <div className={`flex flex-col items-center justify-center py-14 rounded-2xl gap-1.5 ${card}`}>
                      <p className={`font-medium text-sm ${ts}`}>No professors match your search</p>
                      <button onClick={() => { setBookSearch(''); setBookDeptFilter('all'); }}
                        className="text-xs text-sky-400 hover:text-sky-300 transition-colors mt-0.5">Clear filters</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                      {[displayedProfessors.filter((_, i) => i % 2 === 0), displayedProfessors.filter((_, i) => i % 2 !== 0)].map((col, colIdx) => (
                        <div key={colIdx} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, minWidth: 0 }}>
                          {col.map(prof => {
                        const slotsSorted = [...prof.slots].sort((a, b) => {
                          if (a.date && b.date) return a.date.localeCompare(b.date);
                          if (a.date) return -1; if (b.date) return 1;
                          return DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
                        });
                        const isExpanded    = bookExpandedId === prof.professor_id;
                        const alreadyBooked = bookedProfIds.has(prof.professor_id);

                        return (
                          <div key={prof.professor_id} className={`rounded-2xl overflow-hidden transition-all ${card} ${isDark ? 'hover:border-white/10' : 'hover:border-sky-200'}`}>
                            <div className="p-4">
                              {/* Prof header */}
                              <div className="flex items-start gap-3">
                                <button type="button" onClick={() => setProfileCard({ id: prof.professor_id, role: 'professor' })}
                                  className="flex-shrink-0 hover:opacity-75 transition-opacity rounded-full focus:outline-none">
                                  <Avatar name={prof.professor_name} avatarUrl={prof.professor_avatar} />
                                </button>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <button type="button" onClick={() => setProfileCard({ id: prof.professor_id, role: 'professor' })}
                                      className={`font-bold text-sm sm:text-base hover:opacity-75 transition-opacity text-left leading-snug ${tp}`}>
                                      {prof.professor_name}
                                    </button>
                                    {alreadyBooked && (
                                      <span className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${isDark ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
                                        Consulted
                                      </span>
                                    )}
                                  </div>
                                  <p className={`text-xs mt-0.5 truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{prof.department}</p>
                                  <span className="inline-flex items-center gap-1 text-xs text-emerald-500 mt-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    {prof.slots.length} slot{prof.slots.length !== 1 ? 's' : ''} open
                                  </span>
                                </div>
                              </div>

                              {/* Date chips */}
                              <div className="flex flex-wrap gap-1.5 mt-3">
                                {slotsSorted.slice(0, isExpanded ? undefined : 3).map(s => {
                                  const dateObj  = s.date ? new Date(s.date + 'T12:00:00') : null;
                                  const dayAbbr  = dateObj ? dateObj.toLocaleDateString('en-PH', { weekday: 'short' }) : s.day.slice(0, 3);
                                  const dateShort = dateObj ? dateObj.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '';
                                  const chipLabel = dateObj ? `${dayAbbr} ${dateShort}` : dayAbbr;
                                  const times = (s.time_ranges?.length ? s.time_ranges : [{ time_start: s.time_start, time_end: s.time_end }])
                                    .map(r => `${formatTime12(r.time_start.slice(0, 5))}–${formatTime12(r.time_end.slice(0, 5))}`).join(', ');
                                  return (
                                    <span key={s.id} title={times}
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${isDark ? 'bg-sky-500/15 text-sky-400 border border-sky-500/25' : 'bg-sky-50 text-sky-600 border border-sky-200'}`}>
                                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
                                      </svg>
                                      {chipLabel}
                                    </span>
                                  );
                                })}
                                {!isExpanded && slotsSorted.length > 3 && (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${isDark ? 'bg-white/5 text-gray-500' : 'bg-gray-100 text-gray-500'}`}>
                                    +{slotsSorted.length - 3} more
                                  </span>
                                )}
                              </div>

                              {/* Announcements — always visible, one per slot that has one */}
                              {(() => {
                                const withAnn = slotsSorted.filter(s => s.announcement);
                                if (withAnn.length === 0) return null;
                                const multiSlot = slotsSorted.length > 1;
                                return (
                                  <div className="mt-3 space-y-2">
                                    {withAnn.map(s => {
                                      const dateObj = s.date ? new Date(s.date + 'T12:00:00') : null;
                                      const slotLabel = multiSlot
                                        ? (dateObj ? dateObj.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }) : s.day)
                                        : null;
                                      return (
                                        <AnnouncementBubble key={s.id} ann={s.announcement!} slotLabel={slotLabel} isDark={isDark} />
                                      );
                                    })}
                                  </div>
                                );
                              })()}

                              {/* Slot detail panel */}
                              {isExpanded && (
                                <div className={`mt-3 rounded-xl overflow-hidden divide-y ${isDark ? 'bg-[#1a1f35] border border-white/5 divide-white/5' : 'bg-gray-50 border border-gray-200 divide-gray-100'}`}>
                                  {slotsSorted.map(s => {
                                    const dateObj = s.date ? new Date(s.date + 'T12:00:00') : null;
                                    const dateLabel = dateObj
                                      ? dateObj.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
                                      : s.day;
                                    const times = (s.time_ranges?.length ? s.time_ranges : [{ time_start: s.time_start, time_end: s.time_end }])
                                      .map(r => `${formatTime12(r.time_start.slice(0, 5))}–${formatTime12(r.time_end.slice(0, 5))}`).join(' · ');
                                    return (
                                      <div key={s.id} className="px-3 py-2">
                                        <div className="min-w-0">
                                          <p className={`text-xs font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{dateLabel}</p>
                                          <p className={`text-[11px] mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{times}</p>
                                          {s.location && <p className={`text-[11px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>{s.location}</p>}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Actions */}
                              <div className="mt-3 flex items-center justify-between gap-2">
                                <button type="button"
                                  onClick={() => setBookExpandedId(isExpanded ? null : prof.professor_id)}
                                  className={`flex items-center gap-1 text-xs font-medium transition-colors ${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}>
                                  {isExpanded ? (
                                    <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>Hide slots</>
                                  ) : (
                                    <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>Preview slots</>
                                  )}
                                </button>
                                <button onClick={() => router.push(`/dashboard/student/book/prof/${prof.professor_id}`)}
                                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#0EA5E9] text-white hover:bg-[#0284C7] transition-colors shadow-sm shadow-sky-500/20">
                                  Book
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

        ) : tab === 'history' ? (
          <div className="px-3 sm:px-8 py-5 sm:py-8">
            <div className="mb-5 sm:mb-7 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h1 className={`text-2xl font-bold ${tp}`}>History</h1>
                <p className={`text-sm mt-1 ${ts}`}>Past consultations grouped by term</p>
              </div>
              {statusFilter && ['completed', 'cancelled', 'rescheduled', 'missed'].includes(statusFilter) && (
                <button onClick={clearStatusFilter}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${isDark ? 'bg-white/5 text-gray-300 hover:bg-white/10' : 'bg-sky-50 text-sky-700 hover:bg-sky-100'}`}>
                  Filtered: {statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
            {(() => {
              const historyStatuses = ['completed', 'cancelled', 'rescheduled', 'missed'];
              const historyItems = consultations.filter(c => historyStatuses.includes(c.status) && (!statusFilter || !historyStatuses.includes(statusFilter) || c.status === statusFilter));
              if (historyItems.length === 0) {
                return (
                  <div className={`flex flex-col items-center justify-center py-16 sm:py-24 rounded-2xl ${card}`}>
                    <p className={`font-medium text-sm ${ts}`}>No history yet</p>
                    <p className={`text-xs mt-1 ${tm}`}>Completed consultations will appear here</p>
                  </div>
                );
              }
              return (
                <div className="space-y-8">
                  {groupByQuarter(historyItems).map(([quarter, items]) => (
                    <div key={quarter}>
                      <div className="flex items-center gap-3 mb-3">
                        <p className={`text-[10px] font-semibold uppercase tracking-widest ${ts}`}>{quarter}</p>
                        <span className={`text-xs ${tm}`}>{items.length} consultation{items.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className={`rounded-2xl overflow-hidden ${card}`}>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[600px] table-fixed">
                            <thead>
                              <tr className={`border-b ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                                {['Date','Purpose','Adviser','Action Taken','Status','Receipt'].map((h, hi) => (
                                  <th key={h} className={`text-left text-[10px] font-semibold uppercase tracking-wide px-4 py-3 ${tm} ${
                                    hi === 0 ? 'w-[110px]' : hi === 2 ? 'w-[150px]' : hi === 3 ? 'w-[155px]' : hi === 4 ? 'w-[100px]' : hi === 5 ? 'w-[80px]' : ''
                                  }`}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
                              {items.map(c => (
                                <tr key={c.id} className={`transition-colors ${hoverBg}`}>
                                  <td className={`px-4 py-3 text-xs whitespace-nowrap ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                    {new Date((c.date || '').slice(0, 10) + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </td>
                                  <td className={`px-4 py-3 text-xs ${ts}`}><span className="line-clamp-2">{natureLabel(c)}</span></td>
                                  <td className={`px-4 py-3 text-xs truncate ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{c.professor_name}</td>
                                  <td className={`px-4 py-3 text-xs ${ts}`}><span className="line-clamp-2">{actionLabel(c.action_taken, c.referral, c.referral_specify)}</span></td>
                                  <td className="px-4 py-3"><StatusBadge status={c.status} isDark={isDark} /></td>
                                  <td className="px-4 py-3">
                                    {c.status === 'completed' && (
                                      <button onClick={() => handleDownloadReceipt(c)} disabled={downloadingReceipt === c.id}
                                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${isDark ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}>
                                        {downloadingReceipt === c.id
                                          ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                                          : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0-3-3m3 3 3-3M3 17V7a2 2 0 0 1 2-2h6l2 2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>}
                                        PDF
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

        ) : (
          /* My Consultations */
          <div className="px-3 sm:px-8 py-5 sm:py-8">
            <div className="mb-5 sm:mb-6 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h1 className={`text-2xl font-bold ${tp}`}>My Consultations</h1>
                <p className={`text-sm mt-1 ${ts}`}>{upcomingConsultations.length} upcoming · {activeConsults} active</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {statusFilter && ['pending', 'confirmed', 'rescheduled', 'completed', 'cancelled', 'missed'].includes(statusFilter) && (
                  <button onClick={clearStatusFilter}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${isDark ? 'bg-white/5 text-gray-300 hover:bg-white/10' : 'bg-sky-50 text-sky-700 hover:bg-sky-100'}`}>
                    Filtered: {statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
                <button onClick={handleDownloadSlip} disabled={downloadingSlip === -1}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${isDark ? 'bg-white/5 text-gray-300 hover:bg-white/10 ring-1 ring-white/10' : 'bg-white text-gray-600 hover:bg-gray-50 ring-1 ring-gray-200 shadow-sm'}`}>
                  {downloadingSlip === -1
                    ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                    : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0-3-3m3 3 3-3M3 17V7a2 2 0 0 1 2-2h6l2 2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>}
                  Download Consultation Form Template
                </button>
              </div>
            </div>

            {/* Tab switcher */}
            <div className={`flex gap-1 p-1 rounded-xl mb-4 sm:mb-6 w-full sm:w-fit overflow-x-auto ${isDark ? 'bg-[#1e1e1e] border border-white/5' : 'bg-gray-100 border border-gray-200'}`}>
              {([
                { key: 'active', label: 'Active & Upcoming', count: activeTabConsultations.length },
                { key: 'past',   label: 'Past',              count: pastTabConsultations.length  },
              ] as const).map(t => (
                <button key={t.key} onClick={() => setConsultTab(t.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                    consultTab === t.key ? 'bg-[#0EA5E9] text-white shadow-sm' : `${ts} ${isDark ? 'hover:text-gray-200 hover:bg-white/5' : 'hover:text-gray-800 hover:bg-white'}`
                  }`}>
                  {t.label}
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${consultTab === t.key ? 'bg-white/20 text-white' : isDark ? 'bg-white/8 text-gray-500' : 'bg-gray-200 text-gray-500'}`}>
                    {t.count}
                  </span>
                </button>
              ))}
            </div>

            {(() => {
              const displayActive = statusFilter && ['pending', 'confirmed', 'rescheduled'].includes(statusFilter)
                ? activeTabConsultations.filter(c => c.status === statusFilter) : activeTabConsultations;
              const displayPast = statusFilter && ['completed', 'cancelled', 'missed'].includes(statusFilter)
                ? pastTabConsultations.filter(c => c.status === statusFilter) : pastTabConsultations;
              const shownConsultations = consultTab === 'active' ? displayActive : displayPast;
              return shownConsultations.length === 0 ? (
              <div className={`flex flex-col items-center justify-center py-24 rounded-2xl ${card}`}>
                {consultTab === 'active' ? (
                  <>
                    <p className={`font-medium text-sm ${ts}`}>No active consultations</p>
                    <p className={`text-xs mt-1 ${tm}`}>Book a slot to get started</p>
                  </>
                ) : (
                  <>
                    <p className={`font-medium text-sm ${ts}`}>No past consultations yet</p>
                    <p className={`text-xs mt-1 ${tm}`}>Completed and cancelled consultations will appear here</p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {shownConsultations.map(c => (
                  <div key={c.id} className={`rounded-2xl p-5 ${card} ${isDark ? 'hover:border-white/10' : 'hover:border-gray-300'}`}>
                    <div className="flex items-start gap-4">
                      <button type="button" onClick={() => setProfileCard({ id: c.professor_id, role: 'professor' })}
                        className="flex-shrink-0 hover:opacity-75 transition-opacity rounded-full focus:outline-none" title="View profile">
                        <Avatar name={c.professor_name} avatarUrl={c.professor_avatar} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <button type="button" onClick={() => setProfileCard({ id: c.professor_id, role: 'professor' })}
                            className={`font-semibold text-sm hover:opacity-75 transition-opacity text-left ${tp}`}>
                            {c.professor_name}
                          </button>
                          <StatusBadge status={c.status} isDark={isDark} />
                        </div>
                        <p className={`text-xs mt-0.5 line-clamp-1 ${ts}`}>{natureLabel(c)}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className={`rounded-lg border px-3 py-2.5 ${innerCard}`}>
                        <p className={`text-[10px] uppercase tracking-wide mb-1 ${tm}`}>Date & Time</p>
                        <p className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                          {new Date((c.date || '').slice(0, 10) + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                        <p className={`text-xs mt-0.5 ${ts}`}>{c.day} · {(() => {
                          if (c.time) {
                            const [h, m] = c.time.slice(0, 5).split(':').map(Number);
                            const endMins = h * 60 + m + 30;
                            const endStr = `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`;
                            return `${formatTime12(c.time.slice(0, 5))}–${formatTime12(endStr)}`;
                          }
                          return `${c.time_start?.slice(0, 5)}–${c.time_end?.slice(0, 5)}`;
                        })()}</p>
                      </div>
                      <div className={`rounded-lg border px-3 py-2.5 ${innerCard}`}>
                        <p className={`text-[10px] uppercase tracking-wide mb-1 ${tm}`}>Meeting</p>
                        {(() => {
                          const effMode = c.slot_mode === 'BOTH' ? 'BOTH' : c.mode;
                          return (
                            <>
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${effMode === 'F2F' ? 'bg-purple-400' : effMode === 'BOTH' ? 'bg-teal-400' : 'bg-cyan-400'}`} />
                                <span className={`text-sm font-medium ${effMode === 'F2F' ? (isDark ? 'text-purple-300' : 'text-purple-600') : effMode === 'BOTH' ? (isDark ? 'text-teal-300' : 'text-teal-600') : (isDark ? 'text-cyan-300' : 'text-cyan-600')}`}>
                                  {effMode === 'F2F' ? 'Face-to-Face' : effMode === 'BOTH' ? 'Face-to-Face & Online' : 'Online'}
                                </span>
                              </div>
                              {(effMode === 'F2F' || effMode === 'BOTH') && c.location && (
                                <p className={`text-xs mt-0.5 ${ts}`}>{c.location}</p>
                              )}
                              {(effMode === 'OL' || effMode === 'BOTH') && c.status === 'confirmed' && (
                                c.meeting_link
                                  ? <a href={c.meeting_link} target="_blank" rel="noopener noreferrer" className={`text-xs mt-0.5 block hover:underline truncate ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>Join Meeting →</a>
                                  : <p className={`text-xs mt-0.5 italic ${tm}`}>No meeting link added yet</p>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    <div className={`mt-3.5 pt-3.5 border-t ${isDark ? 'border-white/5' : 'border-gray-100'} flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2`}>
                      <div className="flex flex-wrap items-center gap-2">
                        {c.status === 'completed' && (
                          <button onClick={() => handleDownloadReceipt(c)} disabled={downloadingReceipt === c.id}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${isDark ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 hover:bg-emerald-500/20' : 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-200'}`}>
                            {downloadingReceipt === c.id
                              ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                              : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>}
                            Download Receipt
                          </button>
                        )}

                      </div>

                      {(c.status === 'pending' || c.status === 'confirmed') && (
                        <button onClick={() => handleCancel(c.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isDark ? 'text-red-400 hover:bg-red-500/10' : 'text-red-600 hover:bg-red-50'}`}>
                          Cancel
                        </button>
                      )}
                    </div>

                    {/* ── Proof of Evidence ─────────────────────────────── */}
                    {c.status !== 'cancelled' && (
                      <div className={`mt-3 pt-3 border-t ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                        {c.proof_of_evidence ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`flex items-center gap-1.5 text-xs font-medium ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Proof Submitted
                            </span>
                            {c.proof_type === 'link' ? (
                              <a href={c.proof_of_evidence} target="_blank" rel="noopener noreferrer"
                                className={`text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${isDark ? 'bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20 hover:bg-sky-500/20' : 'bg-sky-50 text-sky-600 ring-1 ring-sky-200 hover:bg-sky-100'}`}>
                                View Link →
                              </a>
                            ) : (
                              <button
                                onClick={() => handleViewFile(c.id)}
                                disabled={viewingFile === c.id}
                                className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 ${isDark ? 'bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20 hover:bg-sky-500/20' : 'bg-sky-50 text-sky-600 ring-1 ring-sky-200 hover:bg-sky-100'}`}>
                                {viewingFile === c.id
                                  ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                                  : 'View File →'}
                              </button>
                            )}
                            <button
                              onClick={() => { setProofPanelId(proofPanelId === c.id ? null : c.id); setProofLinkValue(''); }}
                              className={`text-xs px-2 py-1 rounded-lg transition-colors ${isDark ? 'text-[#c0392b] hover:text-[#e74c3c] hover:bg-red-900/20' : 'text-[#8B0000] hover:text-[#a00000] hover:bg-red-50'}`}>
                              Replace
                            </button>
                          </div>
                        ) : (
                          <>
                            <p className={`text-xs mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                              💡 You may save your consultation form to Google Drive or OneDrive and submit it as a shareable link.
                            </p>
                            <button
                              onClick={() => { setProofPanelId(proofPanelId === c.id ? null : c.id); setProofLinkValue(''); }}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                isDark
                                  ? 'bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20 hover:bg-violet-500/20'
                                  : 'bg-violet-50 text-violet-600 ring-1 ring-violet-200 hover:bg-violet-100'
                              }`}>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                              </svg>
                              Submit Proof of Evidence
                            </button>
                          </>
                        )}

                        {/* Expandable proof submission panel */}
                        {proofPanelId === c.id && (
                          <div className={`mt-3 rounded-xl p-4 ${isDark ? 'bg-white/[0.03] border border-white/5' : 'bg-gray-50 border border-gray-200'}`}>
                            <p className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                              Proof of Evidence
                            </p>
                            <div className="flex gap-2">
                              <input
                                type="url"
                                value={proofLinkValue}
                                onChange={e => setProofLinkValue(e.target.value)}
                                placeholder="https://drive.google.com/…"
                                className={`flex-1 px-3 py-2 rounded-lg text-xs transition-all ${
                                  isDark
                                    ? 'bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/20 focus:border-violet-500/50 focus:bg-white/[0.07] outline-none'
                                    : 'bg-white border border-gray-300 text-gray-800 placeholder-gray-400 focus:border-violet-400 focus:ring-1 focus:ring-violet-200 outline-none'
                                }`}
                              />
                              <button
                                onClick={() => handleProofLinkSubmit(c.id)}
                                disabled={submittingProofId === c.id || !proofLinkValue.trim()}
                                className="px-3 py-2 rounded-lg text-xs font-semibold bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50 transition-colors">
                                {submittingProofId === c.id
                                  ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                                  : 'Submit'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
            })()}
          </div>
        )}
      </main>

      {/* Profile card popup */}
      {profileCard && token && (
        <UserProfileCard
          profileId={profileCard.id}
          profileRole={profileCard.role}
          token={token}
          onClose={() => setProfileCard(null)}
        />
      )}

      </div>{/* /content area */}

      <ChatbotWidget token={token ?? ''} role="student" />
      <NavigationTour isDark={isDark} />
    </div>
  );
}
