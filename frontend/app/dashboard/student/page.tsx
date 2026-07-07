'use client';

import { useEffect, useRef, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import UserProfileCard from '@/components/UserProfileCard';
import DashboardNavbar from '@/components/DashboardNavbar';
import ChatbotWidget from '@/components/ChatbotWidget';
import NavigationTour from '@/components/NavigationTour';
import { ToastContainer, useToast } from '@/components/Toast';
import { ConfirmModal } from '@/components/ConfirmModal';
import CustomSelect from '@/components/CustomSelect';
import RescheduleBookingPanel from '@/components/RescheduleBookingPanel';
import DocPreviewModal from '@/components/DocPreviewModal';
import ReplaceSlipModal from '@/components/ReplaceSlipModal';
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
  specializations?: string[];
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
  reschedule_remarks?: string | null;
  time?: string | null;
  location?: string;
  meeting_link?: string | null;
  proof_of_evidence: string | null;
  proof_type: 'file' | 'link' | null;
  proof_required?: boolean;
  cancelled_by?: string | null;
  professor_avatar?: string | null;
  in_session?: boolean;
  prof_in_session?: boolean;
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
  rescheduled:      { darkBg: 'bg-orange-500/15',  lightBg: 'bg-orange-50',   darkText: 'text-orange-400',   lightText: 'text-orange-700',   dot: 'bg-orange-500',   label: 'Rescheduled' },
  needs_reschedule: { darkBg: 'bg-amber-500/15',   lightBg: 'bg-amber-50',    darkText: 'text-amber-500',    lightText: 'text-amber-700',    dot: 'bg-amber-500',    label: 'Please select another schedule' },
  missed:           { darkBg: 'bg-purple-500/15',  lightBg: 'bg-purple-50',   darkText: 'text-purple-400',   lightText: 'text-purple-700',   dot: 'bg-purple-500',   label: 'Missed' },
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

          {/* Legend footer — visual border between calendar and detail panel */}
          <div className={`flex items-center gap-4 px-4 py-2.5 border-t text-xs font-medium flex-wrap ${isDark ? 'border-white/[0.08] text-gray-500 bg-[#17181a]' : 'border-gray-200 text-gray-400 bg-gray-50/70'}`}>
            {([
              { label: 'Pending',   cls: 'bg-amber-400',   shadow: 'shadow-amber-400/60'   },
              { label: 'Confirmed', cls: 'bg-blue-400',    shadow: 'shadow-blue-400/60'    },
              { label: 'Completed', cls: 'bg-emerald-400', shadow: 'shadow-emerald-400/60' },
              { label: 'Cancelled', cls: 'bg-red-400',     shadow: 'shadow-red-400/60'     },
              { label: 'Available', cls: 'bg-sky-400',     shadow: 'shadow-sky-400/60'     },
              { label: 'Note',      cls: 'bg-violet-400',  shadow: 'shadow-violet-400/60'  },
            ] as const).map(l => (
              <span key={l.label} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full shadow-sm flex-shrink-0 ${l.cls} ${l.shadow}`} />
                {l.label}
              </span>
            ))}
          </div>
        </div>

        {/* ── Detail panel ── */}
        {selected && (
          <div ref={detailRef}
            style={panelMaxH > 0
              ? { height: `${panelMaxH}px`, boxShadow: isDark ? '-6px 0 20px rgba(0,0,0,0.4)' : '-6px 0 24px rgba(0,0,0,0.07)' }
              : { boxShadow: isDark ? '-6px 0 20px rgba(0,0,0,0.4)' : '-6px 0 24px rgba(0,0,0,0.07)' }}
            className={`w-full lg:w-[440px] xl:w-[520px] flex-shrink-0 flex flex-col overflow-y-auto scroll-smooth
            ${isDark
              ? 'border-t lg:border-t-0 lg:border-l border-white/[0.10] bg-[#141518]'
              : 'bg-white border-l border-gray-200'
            }`}>

              <div className={`sticky top-0 z-10 relative px-5 pt-4 pb-3 border-b
                ${isDark ? 'border-white/[0.08] bg-[#141518]' : 'border-gray-100 bg-white'}`}>
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

              <div className="px-5 pt-3.5 pb-2">
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
                            {formatTime12((c.time || c.time_start)?.slice(0,5) ?? '')} · {(() => { const m = c.mode || (c.slot_mode === 'BOTH' ? 'BOTH' : c.slot_mode === 'OL' ? 'OL' : c.slot_mode ? 'F2F' : 'F2F'); return m === 'F2F' ? 'In-Person' : m === 'BOTH' ? 'F2F & Online' : 'Online'; })()}
                          </p>
                        </div>
                        <StatusBadge status={c.status} isDark={isDark} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-5 pt-2 pb-3">
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

              <div className={`px-5 pt-3 pb-5 mt-auto border-t ${isDark ? 'border-white/[0.08]' : 'border-gray-100'}`}>
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
                      ? 'bg-white/[0.06] border border-white/[0.12] text-gray-200 placeholder-white/25 focus:border-violet-500/60 focus:bg-white/[0.09] focus:shadow-[0_0_0_3px_rgba(139,92,246,0.14)]'
                      : 'bg-white/60 border border-gray-100 text-gray-700 placeholder-gray-300 focus:border-violet-300 focus:bg-white focus:shadow-[0_0_0_3px_rgba(139,92,246,0.08)]'
                    }`}
                />
                <div className="flex justify-end mt-2">
                  <button
                    onMouseDown={e => { e.preventDefault(); saveNote(); }}
                    style={!isDark ? { color: '#ffffff' } : undefined}
                    className={`text-[11px] font-bold px-4 py-1.5 rounded-lg transition-all flex items-center gap-1.5
                      ${isDark
                        ? 'bg-gradient-to-br from-violet-500/20 to-purple-500/20 text-violet-300 hover:from-violet-500/30 hover:to-purple-500/30 border border-violet-500/25 shadow-md shadow-violet-900/30'
                        : 'bg-violet-700 hover:bg-violet-800 shadow-md shadow-violet-700/40'
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
  const [bookTopicFilter, setBookTopicFilter] = useState<string>('all');
  const [bookSortBy, setBookSortBy]       = useState<'slots' | 'date'>('slots');
  const [slotModalProf, setSlotModalProf] = useState<{
    professor_id: number; professor_name: string; department: string;
    specializations: string[]; professor_avatar?: string | null; slots: Schedule[];
  } | null>(null);
  const [topics, setTopics] = useState<{ id: number; label: string }[]>([]);

  // Data
  const [schedules, setSchedules]         = useState<Schedule[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading]             = useState(true);
  // professor_id → true if that professor is currently in session
  const [professorInSession, setProfessorInSession] = useState<Record<number, boolean>>({});
  const [announcements, setAnnouncements] = useState<AnnItem[]>([]);
  const [calOverrides, setCalOverrides]   = useState<CalendarOverride[]>([]);
  const [term, setTerm]                   = useState<TermConfig>(CURRENT_TERM);

  // File upload / download
  const [uploadingId, setUploadingId]               = useState<number | null>(null);
  const [previewModal, setPreviewModal]             = useState<{ fetchUrl: string; title: string; filename: string } | null>(null);
  const [expandedRemarks, setExpandedRemarks]       = useState<Set<number>>(new Set());
  const [dayModal, setDayModal]                     = useState<{ date: string; label: string; dateObj: Date } | null>(null);
  const [weekOverviewOpen, setWeekOverviewOpen]     = useState(false);
  const mainScrollRef = useRef<HTMLElement>(null);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const uploadForId   = useRef<number | null>(null);

  // Digital slip view
  const [viewSlipId, setViewSlipId] = useState<number | null>(null);
  const [viewSlipData, setViewSlipData] = useState<Record<string, string | null>>({});
  const [viewSlipLoading, setViewSlipLoading] = useState(false);

  // Proof of evidence
  const [replaceModalId, setReplaceModalId]     = useState<number | null>(null);
  const [viewingFile, setViewingFile]           = useState<number | null>(null); // kept for backward compat but no longer used as loading flag

  // Profile card popup
  const [profileCard, setProfileCard] = useState<{ id: number; role: 'professor' | 'student' } | null>(null);
  const [rescheduleModal, setRescheduleModal] = useState<{ consultId: number; professorId: number; profName: string; remarks: string | null } | null>(null);

  // Student profile
  const [profile, setProfile] = useState<StudentProfile>({
    full_name: '', student_number: '', program: '', year_level: '', email: '', phone: '', avatar: null,
  });

  // Leaderboards
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
    fetchData().catch(() => setLoading(false));
  }, [authReady]);

  // Poll consultations + schedules every 30 s for real-time feel
  useEffect(() => {
    if (!authReady || !token) return;
    const id = setInterval(() => {
      Promise.all([
        api.get('/api/consultations', token!),
        api.get('/api/schedules', token!),
      ]).then(([consult, sched]) => {
        if (Array.isArray(consult)) setConsultations(consult);
        if (Array.isArray(sched)) {
          const todayN = new Date();
          const today = `${todayN.getFullYear()}-${String(todayN.getMonth()+1).padStart(2,'0')}-${String(todayN.getDate()).padStart(2,'0')}`;
          setSchedules(sched.filter((s: Schedule) => !s.date || s.date >= today));
        }
      }).catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [authReady, token]);

  // Subscribe to professor session status changes via SSE
  useEffect(() => {
    if (!authReady || !token) return;
    // Token in query param — EventSource can't send custom headers,
    // and Brave/Safari block cross-origin cookies by default.
    const es = new EventSource(
      `${API_URL}/api/notifications/stream?token=${encodeURIComponent(token)}`
    );
    let errorCount = 0;
    es.onmessage = (e) => {
      errorCount = 0;
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'professor_session_update') {
          const { professor_id, in_session: inSession } = data as { professor_id: number; in_session: boolean };
          setProfessorInSession(prev => ({ ...prev, [professor_id]: inSession }));
          if (!inSession) {
            setConsultations(prev => prev.map(c =>
              c.professor_id === professor_id ? { ...c, in_session: false } : c
            ));
          }
        } else if (data.type === 'consultation_status_update') {
          api.get('/api/consultations', token!).then((consult: unknown) => {
            const freshConsults: Consultation[] = Array.isArray(consult) ? consult : [];
            setConsultations(freshConsults);
            const sessionMap: Record<number, boolean> = {};
            for (const c of freshConsults) {
              if ((c.in_session || c.prof_in_session) && c.status === 'confirmed') {
                sessionMap[c.professor_id] = true;
              }
            }
            setProfessorInSession(sessionMap);
          }).catch(() => {});
        }
      } catch { /* ignore malformed */ }
    };
    es.onerror = () => {
      errorCount++;
      if (errorCount >= 5) es.close(); // stop retrying; effect re-runs on token change
    };
    return () => es.close();
  }, [authReady, token]);

  const fetchData = async () => {
    try {
    const [sched, consult, prof, ann, cal, termData, notifSettings, topicsData, allTopics] = await Promise.all([
      api.get('/api/schedules', token!),
      api.get('/api/consultations', token!),
      api.get('/api/auth/profile', token!),
      fetch(`${API_URL}/api/announcements`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_URL}/api/calendar`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_URL}/api/settings/term`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${API_URL}/api/settings/notifications`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null).catch(() => null),
      api.get('/api/consultations/my-topics', token!),
      fetch(`${API_URL}/api/topics`).then(r => r.ok ? r.json() : []).catch(() => []),
    ]);
    setTopics(Array.isArray(allTopics) ? allTopics : []);
    const todayN = new Date();
    const today = `${todayN.getFullYear()}-${String(todayN.getMonth()+1).padStart(2,'0')}-${String(todayN.getDate()).padStart(2,'0')}`;
    setSchedules((Array.isArray(sched) ? sched : []).filter(s => !s.date || s.date >= today));
    const freshConsults: Consultation[] = Array.isArray(consult) ? consult : [];
    setConsultations(freshConsults);

    // Seed professor session state from fetched data — use professor-level flag so
    // all students with confirmed bookings see the badge, not just the active one.
    const sessionMap: Record<number, boolean> = {};
    for (const c of freshConsults) {
      if ((c.in_session || c.prof_in_session) && c.status === 'confirmed') {
        sessionMap[c.professor_id] = true;
      }
    }
    setProfessorInSession(sessionMap);

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
    setMyTopics(Array.isArray(topicsData) ? topicsData : []);
  } catch (err) {
    console.error('fetchData error:', err);
  } finally {
    setLoading(false);
  }
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

  const openViewSlip = async (id: number) => {
    setViewSlipId(id); setViewSlipLoading(true); setViewSlipData({});
    try {
      const res = await fetch(`${API_URL}/api/consultations/${id}/slip`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); setViewSlipData(d); }
    } catch { /* ignore */ }
    setViewSlipLoading(false);
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

  const handleViewFile = (id: number) => {
    setPreviewModal({
      fetchUrl: `${API_URL}/api/consultations/${id}/proof`,
      title: 'Proof of Evidence',
      filename: `proof-${id}.pdf`,
    });
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
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

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
  const activeTabConsultations = consultations.filter(c => ['pending', 'confirmed', 'rescheduled', 'needs_reschedule'].includes(c.status));
  const pastTabConsultations   = consultations.filter(c => ['completed', 'cancelled', 'missed'].includes(c.status));

  const recentConsultations = [...consultations]
    .sort((a, b) => {
      const da = (a.date || '') + (a.time || a.time_start || '');
      const db = (b.date || '') + (b.time || b.time_start || '');
      return db.localeCompare(da);
    })
    .slice(0, 3);

  // Notification bell: status-update consultations (confirmed/rescheduled/cancelled) for the bell
  // Exclude student-self-cancelled consultations — student doesn't need to be notified they cancelled
  const statusNotifConsults = consultations
    .filter(c => ['confirmed', 'rescheduled', 'cancelled'].includes(c.status) && !!c.date
      && !(c.status === 'cancelled' && c.cancelled_by === 'student'))
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
  const card      = isDark ? 'bg-[#252525] border border-white/5 shadow-[0_10px_40px_rgba(0,0,0,0.60),0_4px_12px_rgba(0,0,0,0.40)]' : 'bg-white border border-gray-200 shadow-[0_8px_32px_rgba(99,102,241,0.10),0_4px_16px_rgba(0,0,0,0.06),0_1px_4px_rgba(0,0,0,0.04)]';
  const tp        = isDark ? 'text-white'    : 'text-gray-900';
  const ts        = isDark ? 'text-gray-400' : 'text-gray-500';
  const tm        = isDark ? 'text-gray-400' : 'text-gray-500';
  const innerCard = isDark ? 'bg-white/[0.03] border-white/5' : 'bg-gray-50 border-gray-200';
  const hoverBg   = isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-sky-50/60';

  const activeConsults = activeTabConsultations.length;

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
      <div className="min-h-screen flex items-center justify-center" style={{ background: isDark ? '#1a1a1a' : 'linear-gradient(135deg, #93c5fd 0%, #bfdbfe 45%, #eff6ff 100%)' }}>
        <div className="w-8 h-8 border-2 border-[#0EA5E9] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={`h-screen flex flex-col overflow-hidden ${isDark ? 'bg-[#1e2235]' : ''}`} style={!isDark ? { background: 'linear-gradient(135deg, #93c5fd 0%, #bfdbfe 45%, #eff6ff 100%)' } : undefined}>

      {/* Mapua logo full-page watermark */}
      <img
        src="/mapua-logo.png"
        alt=""
        aria-hidden
        className={`pointer-events-none select-none fixed inset-0 w-full h-full object-contain z-0 ${isDark ? 'opacity-[0.18]' : 'opacity-[0.12]'}`}
        style={isDark ? { filter: 'drop-shadow(0 0 80px rgba(122,0,0,0.6)) drop-shadow(0 0 40px rgba(180,0,0,0.4)) drop-shadow(0 0 120px rgba(122,0,0,0.3))' } : { filter: 'drop-shadow(0 0 60px rgba(122,0,0,0.35)) drop-shadow(0 0 30px rgba(180,0,0,0.25))' }}
      />

      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />

      {/* Reschedule booking modal */}
      {rescheduleModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" onClick={() => setRescheduleModal(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className={`relative z-10 w-full max-w-lg flex flex-col shadow-2xl rounded-2xl border max-h-[90vh] ${isDark ? 'border-white/10 bg-[#1e1f22]' : 'border-gray-200 bg-white'}`}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-5 py-4 border-b flex-shrink-0 ${isDark ? 'border-white/[0.08]' : 'border-gray-100'}`}>
              <div>
                <h2 className={`text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Select New Schedule</h2>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Rescheduling with {rescheduleModal.profName}
                </p>
              </div>
              <button
                onClick={() => setRescheduleModal(null)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-gray-200 hover:bg-white/8' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-5 py-4">
              <RescheduleBookingPanel
                key={rescheduleModal.consultId}
                consultId={rescheduleModal.consultId}
                professorId={rescheduleModal.professorId}
                rescheduleRemarks={rescheduleModal.remarks}
                token={token!}
                isDark={isDark}
                onSuccess={() => {
                  setRescheduleModal(null);
                  toast.success(`New schedule confirmed with ${rescheduleModal.profName}!`);
                  fetchData();
                }}
                onCancel={() => setRescheduleModal(null)}
              />
            </div>
          </div>
        </div>
      )}

      <DashboardNavbar
        role="student"
        navItems={STUDENT_NAV_ITEMS}
        activeTab={tab}
        onTabChange={handleTabChange}
        profileName={profile.full_name}
        profileAvatar={profile.avatar}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        announcements={announcements}
        pendingConsultations={statusNotifConsults}
        storageKey={`student_notifs_${profile.email || 'default'}`}
        scrollRef={mainScrollRef}
      />

      {/* Day-detail modal */}
      {dayModal && (() => {
        const dayConsults = consultations
          .filter(c => c.date.slice(0, 10) === dayModal.date && c.status !== 'cancelled')
          .sort((a, b) => (a.time || a.time_start).localeCompare(b.time || b.time_start));
        const daySlots = schedules.filter(s => s.date === dayModal.date && s.is_available);
        const dateLabel = dayModal.dateObj.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });
        return (
          <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center sm:p-4" onClick={() => setDayModal(null)}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <div
              className={`relative z-10 w-full sm:max-w-lg flex flex-col shadow-2xl rounded-t-2xl sm:rounded-2xl border-t sm:border max-h-[88vh] sm:max-h-[80vh] ${isDark ? 'border-white/10 bg-[#1e1f22]' : 'border-gray-200 bg-white'}`}
              onClick={e => e.stopPropagation()}
            >
              {/* Drag handle */}
              <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className={`w-10 h-1 rounded-full ${isDark ? 'bg-white/20' : 'bg-gray-300'}`} />
              </div>
              {/* Header */}
              <div className={`flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b flex-shrink-0 ${isDark ? 'border-white/[0.08]' : 'border-gray-100'}`}>
                <div>
                  <h2 className={`text-base sm:text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{dayModal.label}, {dateLabel.split(', ').slice(1).join(', ')}</h2>
                  <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {dayConsults.length > 0 ? `${dayConsults.length} consultation${dayConsults.length !== 1 ? 's' : ''}` : 'No bookings'}
                    {daySlots.length > 0 && <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isDark ? 'bg-violet-500/15 text-violet-400' : 'bg-violet-50 text-violet-600'}`}>{daySlots.length} open slot{daySlots.length !== 1 ? 's' : ''}</span>}
                  </p>
                </div>
                <button onClick={() => setDayModal(null)} className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-gray-200 hover:bg-white/8' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              {/* Body */}
              <div className="overflow-y-auto flex-1 px-3 sm:px-5 py-3 sm:py-4 space-y-4">
                {/* Booked consultations */}
                {dayConsults.length > 0 && (
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Your Consultations</p>
                    <div className={`rounded-xl overflow-hidden border divide-y ${isDark ? 'border-white/[0.08] divide-white/[0.05]' : 'border-gray-100 divide-gray-100'}`}>
                      {dayConsults.map(c => {
                        const statusColors: Record<string, string> = {
                          pending:     isDark ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-50 text-amber-700',
                          confirmed:   isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700',
                          rescheduled: isDark ? 'bg-blue-500/15 text-blue-300' : 'bg-blue-50 text-blue-700',
                          completed:   isDark ? 'bg-gray-500/15 text-gray-400' : 'bg-gray-100 text-gray-600',
                          missed:      isDark ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-600',
                        };
                        return (
                          <div key={c.id} className={`flex items-center gap-3 px-3 sm:px-4 py-3 ${isDark ? 'hover:bg-white/[0.03]' : 'hover:bg-gray-50'} transition-colors`}>
                            <span className={`text-xs font-mono tabular-nums w-14 flex-shrink-0 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                              {formatTime12((c.time || c.time_start)?.slice(0, 5) ?? '')}
                            </span>
                            <div className={`w-px h-4 flex-shrink-0 ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{c.professor_name}</p>
                              <p className={`text-[10px] truncate ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{parseNature(c.nature_of_advising).join(', ') || '—'}</p>
                            </div>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${statusColors[c.status] ?? (isDark ? 'bg-gray-500/15 text-gray-400' : 'bg-gray-100 text-gray-500')}`}>
                              {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* Available professor slots */}
                {daySlots.length > 0 && (
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Open Slots</p>
                    <div className={`rounded-xl overflow-hidden border divide-y ${isDark ? 'border-white/[0.08] divide-white/[0.05]' : 'border-gray-100 divide-gray-100'}`}>
                      {daySlots.map(s => (
                        <div key={s.id} className={`flex items-center gap-3 px-3 sm:px-4 py-3 ${isDark ? 'hover:bg-white/[0.03]' : 'hover:bg-gray-50'} transition-colors`}>
                          <span className={`text-xs font-mono tabular-nums w-14 flex-shrink-0 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                            {formatTime12(s.time_start.slice(0, 5))}
                          </span>
                          <div className={`w-px h-4 flex-shrink-0 ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{s.professor_name}</p>
                            <p className={`text-[10px] truncate ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{s.department}</p>
                          </div>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${isDark ? 'bg-violet-500/15 text-violet-300' : 'bg-violet-50 text-violet-700'}`}>Open</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {dayConsults.length === 0 && daySlots.length === 0 && (
                  <div className={`flex flex-col items-center justify-center py-10 gap-2 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                    <svg className="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                    <p className="text-sm font-medium">Nothing scheduled</p>
                  </div>
                )}
              </div>
              {/* Footer — book button if slots available */}
              {daySlots.length > 0 && (
                <div className={`px-4 sm:px-6 py-3 sm:py-4 border-t flex-shrink-0 ${isDark ? 'border-white/[0.08]' : 'border-gray-100'}`}>
                  <button
                    onClick={() => { setDayModal(null); handleTabChange('book'); }}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold bg-sky-500 hover:bg-sky-600 text-white transition-colors"
                  >
                    Book a Slot →
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Weekly Overview modal */}
      {weekOverviewOpen && (() => {
        const CHART_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const weekMonday = new Date(now);
        const _cdow = now.getDay();
        weekMonday.setDate(now.getDate() + (_cdow === 0 ? -6 : 1 - _cdow));
        weekMonday.setHours(0, 0, 0, 0);
        const weekDays = CHART_DAYS.map((lbl, i) => {
          const d = new Date(weekMonday);
          d.setDate(weekMonday.getDate() + i);
          const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          const items = consultations
            .filter(c => c.date.slice(0, 10) === ds && c.status !== 'cancelled')
            .sort((a, b) => (a.time || a.time_start).localeCompare(b.time || b.time_start));
          return { label: lbl, date: ds, dateObj: d, items, isToday: ds === todayStr };
        });
        const rangeLabel = `${weekMonday.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${weekDays[6].dateObj.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`;
        const statusColors: Record<string, string> = {
          pending:     isDark ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-50 text-amber-700',
          confirmed:   isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700',
          rescheduled: isDark ? 'bg-blue-500/15 text-blue-300' : 'bg-blue-50 text-blue-700',
          completed:   isDark ? 'bg-gray-500/15 text-gray-400' : 'bg-gray-100 text-gray-600',
          missed:      isDark ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-600',
        };
        return (
          <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center sm:p-4" onClick={() => setWeekOverviewOpen(false)}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <div
              className={`relative z-10 w-full sm:max-w-xl flex flex-col shadow-2xl rounded-t-2xl sm:rounded-2xl border-t sm:border max-h-[88vh] sm:max-h-[80vh] ${isDark ? 'border-white/10 bg-[#1e1f22]' : 'border-gray-200 bg-white'}`}
              onClick={e => e.stopPropagation()}
            >
              {/* Drag handle */}
              <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className={`w-10 h-1 rounded-full ${isDark ? 'bg-white/20' : 'bg-gray-300'}`} />
              </div>
              {/* Header */}
              <div className={`flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b flex-shrink-0 ${isDark ? 'border-white/[0.08]' : 'border-gray-100'}`}>
                <div>
                  <h2 className={`text-base sm:text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Weekly Overview</h2>
                  <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{rangeLabel}</p>
                </div>
                <button onClick={() => setWeekOverviewOpen(false)} className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-gray-200 hover:bg-white/8' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              {/* Body */}
              <div className="overflow-y-auto flex-1 px-3 sm:px-5 py-3 sm:py-4 space-y-4">
                {weekDays.map(day => (
                  <div key={day.date}>
                    <div className="flex items-center gap-2 mb-2">
                      <p className={`text-[10px] font-bold uppercase tracking-widest ${day.isToday ? (isDark ? 'text-sky-400' : 'text-sky-600') : (isDark ? 'text-gray-500' : 'text-gray-400')}`}>
                        {day.label}, {day.dateObj.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                      </p>
                      {day.isToday && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? 'bg-sky-500/15 text-sky-400' : 'bg-sky-50 text-sky-600'}`}>Today</span>
                      )}
                    </div>
                    {day.items.length > 0 ? (
                      <div className={`rounded-xl overflow-hidden border divide-y ${isDark ? 'border-white/[0.08] divide-white/[0.05]' : 'border-gray-100 divide-gray-100'}`}>
                        {day.items.map(c => (
                          <div key={c.id} className={`flex items-center gap-3 px-3 sm:px-4 py-3 ${isDark ? 'hover:bg-white/[0.03]' : 'hover:bg-gray-50'} transition-colors`}>
                            <span className={`text-xs font-mono tabular-nums w-14 flex-shrink-0 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                              {formatTime12((c.time || c.time_start)?.slice(0, 5) ?? '')}
                            </span>
                            <div className={`w-px h-4 flex-shrink-0 ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{c.professor_name}</p>
                              <p className={`text-[10px] truncate ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{parseNature(c.nature_of_advising).join(', ') || '—'}</p>
                            </div>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${statusColors[c.status] ?? (isDark ? 'bg-gray-500/15 text-gray-400' : 'bg-gray-100 text-gray-500')}`}>
                              {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={`text-xs pl-1 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>No consultations</p>
                    )}
                  </div>
                ))}
              </div>
              {/* Footer */}
              <div className={`px-4 sm:px-6 py-3 sm:py-4 border-t flex-shrink-0 ${isDark ? 'border-white/[0.08]' : 'border-gray-100'}`}>
                <button
                  onClick={() => { setWeekOverviewOpen(false); handleTabChange('my'); }}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold bg-sky-500 hover:bg-sky-600 text-white transition-colors"
                >
                  View My Consultations →
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileSelected} />

        <main ref={mainScrollRef} className="flex-1 overflow-y-auto" style={!isDark ? { background: 'linear-gradient(135deg, #93c5fd 0%, #bfdbfe 45%, #eff6ff 100%)' } : undefined}>
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
            <div className="w-8 h-8 border-2 border-[#0EA5E9] border-t-transparent rounded-full animate-spin" />
            <p className={`text-sm ${ts}`}>Loading...</p>
          </div>

        ) : tab === 'home' ? (() => {
          const confirmedCount = consultations.filter(c => c.status === 'confirmed').length;
          const studentInitials = profile.full_name.split(' ').filter(Boolean).map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
          const completionPct = allConsultsTotal > 0 ? Math.round((allConsultsCompleted / allConsultsTotal) * 100) : 0;

          const glassCard = isDark
            ? { background: 'rgba(30,31,34,0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 10px 40px rgba(0,0,0,0.60),0 4px 12px rgba(0,0,0,0.40)' }
            : { background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid #f1f5f9', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06),0 4px 16px rgba(0,0,0,0.04)' };

          const CHART_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
          const weekMonday = new Date(now);
          const _cdow = now.getDay();
          weekMonday.setDate(now.getDate() + (_cdow === 0 ? -6 : 1 - _cdow));
          weekMonday.setHours(0, 0, 0, 0);
          const chartBars = CHART_DAYS.map((lbl, i) => {
            const d = new Date(weekMonday);
            d.setDate(weekMonday.getDate() + i);
            const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            const items = consultations.filter(c => c.date.slice(0, 10) === ds && c.status !== 'cancelled');
            const uniqueProfs = Array.from(
              new Map(items.map(c => [c.professor_name, { name: c.professor_name, avatar: c.professor_avatar }])).values()
            ).slice(0, 3);
            const availableSlots = schedules.filter(s => s.date === ds && s.is_available).length;
            return {
              label: lbl, date: ds, isToday: ds === todayStr,
              pending:   items.filter(c => c.status === 'pending').length,
              confirmed: items.filter(c => c.status === 'confirmed' || c.status === 'completed').length,
              completed: items.filter(c => c.status === 'completed').length,
              total: items.length, professors: uniqueProfs, availableSlots,
              overflow: Math.max(0, new Map(items.map(c => [c.professor_name, true])).size - 3),
            };
          });
          const weekUpcoming = consultations.filter(c => c.date >= todayStr && c.status === 'confirmed').length;

          return (
          <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-6 flex flex-col gap-5 sm:gap-6 flex-1">

            {/* ── Welcome header ── */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className={`text-2xl sm:text-3xl font-extrabold leading-tight ${tp}`}
                  style={!isDark ? { textShadow: '0 2px 8px rgba(255,255,255,0.7)' } : undefined}>
                  {greetingWord}{firstName ? `, ${firstName}` : ''} 👋
                </h1>
                <p className={`text-sm mt-0.5 font-medium ${isDark ? 'text-gray-400' : 'text-gray-700'}`}
                  style={!isDark ? { textShadow: '0 1px 4px rgba(255,255,255,0.8)' } : undefined}>
                  {upcomingConsultations.length > 0
                    ? `You have ${upcomingConsultations.length} upcoming consultation${upcomingConsultations.length !== 1 ? 's' : ''}.`
                    : 'No upcoming consultations scheduled.'}
                </p>
              </div>

              {/* Stats strip */}
              <div
                className={`flex-shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3`}
              >
                {([
                  { value: allConsultsTotal,     label: 'Total Requests', color: '#0EA5E9', darkColor: '#38BDF8', bg: isDark ? 'bg-sky-500/10 border-sky-500/20'     : 'bg-sky-50 border-sky-200',     icon: <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9z" /> },
                  { value: confirmedCount,       label: 'Confirmed',      color: '#7C3AED', darkColor: '#A78BFA', bg: isDark ? 'bg-violet-500/10 border-violet-500/20' : 'bg-violet-50 border-violet-200', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /> },
                  { value: allConsultsCompleted, label: 'Completed',      color: '#059669', darkColor: '#34D399', bg: isDark ? 'bg-emerald-500/10 border-emerald-500/20': 'bg-emerald-50 border-emerald-200', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /> },
                  { value: allConsultsPending,   label: 'Pending',        color: '#D97706', darkColor: '#FCD34D', bg: isDark ? 'bg-amber-500/10 border-amber-500/20'   : 'bg-amber-50 border-amber-200',   icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /> },
                ] as const).map(s => (
                  <div key={s.label} className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${s.bg} ${isDark ? '' : 'shadow-sm'}`}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${isDark ? s.darkColor : s.color}18` }}>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: isDark ? s.darkColor : s.color }}>{s.icon}</svg>
                    </div>
                    <div>
                      <p className="text-2xl font-extrabold leading-none" style={{ color: isDark ? s.darkColor : s.color }}>{s.value}</p>
                      <p className={`text-[11px] font-medium mt-0.5 ${ts}`}>{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Bento grid ── */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-[240px_1fr_300px] gap-5 items-stretch">

              {/* ── Col 1: Profile card ── */}
              <div className="rounded-2xl overflow-hidden flex flex-col" style={glassCard}>
                <div className={`flex-shrink-0 px-6 pt-7 pb-6 ${isDark ? 'bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-transparent' : 'bg-gradient-to-br from-sky-50 to-white'}`}>
                  <div className="flex flex-col items-center text-center mb-8">
                    <div className="rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0 ring-2 ring-[#0EA5E9]/30 mb-4"
                      style={{ background: 'linear-gradient(135deg, #0369A1, #0EA5E9)', width: '80px', height: '80px' }}>
                      {profile.avatar && !profile.avatar.startsWith('/uploads/')
                        ? <img src={profile.avatar} alt={profile.full_name} className="w-full h-full object-cover" />
                        : <span className="text-2xl font-bold text-white">{studentInitials}</span>}
                    </div>
                    <p className={`text-xl font-bold ${tp}`}>{profile.full_name}</p>
                    <p className={`text-sm mt-1 ${ts}`}>{profile.program || 'Student'}</p>
                    <p className="text-xs mt-1 font-medium text-sky-400">
                      {profile.year_level ? `Year ${profile.year_level}` : ''}{profile.student_number ? ` · ${profile.student_number}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#0369A1] to-[#0EA5E9] flex flex-col items-center justify-center flex-shrink-0 shadow-lg shadow-sky-900/30">
                      <span className="text-white text-3xl font-black leading-none">{currentWeek ?? '–'}</span>
                      <span className="text-sky-100 text-[9px] font-bold uppercase tracking-wide">WK</span>
                    </div>
                    <div>
                      <p className={`text-sm font-semibold whitespace-nowrap ${tp}`}>{currentWeek ? `Week ${currentWeek} of ${term.totalWeeks}` : 'Not active'}</p>
                      <p className={`text-sm mt-1 ${tm}`}>{term.label}</p>
                    </div>
                  </div>
                </div>
                <div className={`flex-1 flex flex-col px-6 pt-6 pb-7 border-t ${isDark ? 'border-white/15' : 'border-gray-300'}`}>
                  <div className="space-y-5">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-sm font-medium ${ts}`}>Term Progress</span>
                        <span className="text-sm font-bold text-emerald-500">{Math.round(termProgress)}%</span>
                      </div>
                      <div className={`h-2.5 rounded-full overflow-hidden ${isDark ? 'bg-white/8' : 'bg-gray-100'}`}>
                        <div className="h-full bg-gradient-to-r from-[#0369A1] to-[#0EA5E9] rounded-full transition-all duration-700" style={{ width: `${termProgress}%` }} />
                      </div>
                      <div className="flex justify-between mt-1.5">
                        <span className={`text-xs ${tm}`}>Start</span>
                        <span className={`text-xs ${tm}`}>Finals W{term.finalsWeek}</span>
                        <span className={`text-xs ${tm}`}>End</span>
                      </div>
                    </div>
                    <div className={`rounded-xl overflow-hidden divide-y ${isDark ? 'divide-white/10 border border-white/10' : 'divide-gray-200 border border-gray-200'}`}>
                      {([
                        { label: 'Days to Finals', value: daysToFinals, dot: isDark ? 'bg-slate-500' : 'bg-slate-400' },
                        { label: 'Days to End',    value: daysToEnd,    dot: isDark ? 'bg-slate-500' : 'bg-slate-400' },
                        { label: 'Weeks Left',     value: currentWeek ? Math.max(0, term.totalWeeks - currentWeek) : term.totalWeeks, dot: isDark ? 'bg-slate-500' : 'bg-slate-400' },
                      ] as const).map(m => (
                        <div key={m.label} className={`flex items-center justify-between px-4 py-3 ${isDark ? 'bg-white/[0.03]' : 'bg-white'}`}>
                          <div className="flex items-center gap-2.5">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${m.dot}`} />
                            <span className={`text-sm font-medium ${ts}`}>{m.label}</span>
                          </div>
                          <span className={`text-xl font-bold ${isDark ? 'text-sky-400' : 'text-sky-600'}`}>{m.value}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => handleTabChange('book')}
                      className="w-full mt-2 py-2.5 rounded-full text-sm font-semibold transition-colors bg-gradient-to-r from-[#0369A1] to-[#0EA5E9] text-white hover:from-[#0284c7] hover:to-[#38bdf8] shadow-md shadow-sky-900/30 hover:shadow-sky-500/30"
                    >
                      Book a Consultation
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Col 2: Center column wrapper — flex-col so Today's Schedule can flex-1 ── */}
              <div className="flex flex-col gap-5">

                {/* Weekly Overview */}
                <div
                  className={`p-5 rounded-2xl flex-shrink-0 ${isDark ? 'border border-white/5 shadow-[0_10px_40px_rgba(0,0,0,0.60),0_4px_12px_rgba(0,0,0,0.40)]' : ''}`}
                  style={isDark ? { background: 'rgba(30,31,34,0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: '16px' } : { background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid #f1f5f9', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06),0 4px 16px rgba(0,0,0,0.04)' }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className={`text-xl font-bold ${tp}`}>Weekly Overview</h3>
                      <p className={`text-sm ${tm} mt-0.5`}>Your consultations this week</p>
                    </div>
                    <button onClick={() => setWeekOverviewOpen(true)} className="text-xs text-sky-400 hover:text-sky-300 font-medium transition-colors flex-shrink-0">
                      View all →
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {([
                      { label: 'Upcoming',  value: weekUpcoming,         bg: isDark ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'         : 'bg-blue-50 text-blue-600 border-blue-100'         },
                      { label: 'Completed', value: allConsultsCompleted, bg: isDark ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-100' },
                      { label: 'Pending',   value: allConsultsPending,   bg: isDark ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'       : 'bg-amber-50 text-amber-700 border-amber-100'       },
                    ] as const).map(s => (
                      <span key={s.label} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold border ${s.bg}`}>
                        <span className="text-base font-black leading-none">{s.value}</span>
                        {s.label}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    {chartBars.map(b => (
                      <div
                        key={b.label}
                        onClick={() => setDayModal({ date: b.date, label: b.label, dateObj: (() => { const d = new Date(weekMonday); d.setDate(weekMonday.getDate() + CHART_DAYS.indexOf(b.label)); return d; })() })}
                        title={b.total > 0 ? `${b.total} consultation${b.total !== 1 ? 's' : ''} – click for details` : b.availableSlots > 0 ? `${b.availableSlots} slot${b.availableSlots !== 1 ? 's' : ''} available – click to see` : `No activity on ${b.label}`}
                        className={`flex-1 flex flex-col items-center justify-between py-3 sm:py-5 px-1 sm:px-2 rounded-xl transition-colors cursor-pointer select-none ${
                          b.isToday
                            ? 'bg-[#0EA5E9] shadow-md shadow-sky-500/25 hover:brightness-110'
                            : b.total > 0
                              ? isDark ? 'bg-white/[0.10] ring-1 ring-white/[0.22] hover:bg-white/[0.16]' : 'bg-white ring-1 ring-gray-300 shadow-sm hover:bg-sky-50 hover:ring-sky-300'
                              : b.availableSlots > 0
                                ? isDark ? 'bg-violet-500/[0.08] ring-1 ring-violet-400/30 hover:bg-violet-500/[0.14]' : 'bg-violet-50 ring-1 ring-violet-200 hover:bg-violet-100'
                                : isDark ? 'bg-white/[0.05] ring-1 ring-white/[0.14] hover:bg-white/[0.09]' : 'bg-gray-50 ring-1 ring-gray-300 hover:bg-gray-100'
                        }`}
                      >
                        <span className={`text-[9px] sm:text-xs font-semibold uppercase tracking-wider leading-none ${
                          b.isToday ? 'text-sky-100' : isDark ? (b.total > 0 ? 'text-gray-300' : 'text-gray-400') : (b.total > 0 ? 'text-gray-500' : 'text-gray-400')
                        }`}>{b.label}</span>
                        <span className={`text-2xl sm:text-4xl font-bold leading-none my-2 sm:my-3 ${
                          b.isToday ? 'text-white' : b.total > 0 ? (isDark ? 'text-white' : 'text-gray-800') : (isDark ? 'text-gray-500' : 'text-gray-300')
                        }`}>{b.total > 0 ? b.total : '–'}</span>
                        <div className="hidden sm:flex items-center justify-center h-8">
                          {b.professors.length > 0 ? (
                            <div className="flex -space-x-1.5">
                              {b.professors.map((p, pi) => (
                                <div key={pi} className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold ring-2 ${b.isToday ? 'ring-[#0EA5E9]' : isDark ? 'ring-[#252525]' : 'ring-white'} overflow-hidden`}
                                  style={{ background: 'linear-gradient(135deg, #0369A1, #0EA5E9)' }}
                                  title={p.name}>
                                  {p.avatar && !p.avatar.startsWith('/uploads/')
                                    ? <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                                    : <span className="text-white">{p.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}</span>}
                                </div>
                              ))}
                              {b.overflow > 0 && (
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center ring-2 ${b.isToday ? 'ring-[#0EA5E9] bg-sky-300/30 text-white' : isDark ? 'ring-[#252525] bg-white/10 text-gray-300' : 'ring-white bg-gray-100 text-gray-500'} text-[9px] font-bold flex-shrink-0`}>
                                  +{b.overflow}
                                </div>
                              )}
                            </div>
                          ) : b.availableSlots > 0 ? (
                            <span className={`text-[9px] sm:text-[10px] font-semibold text-center leading-tight ${b.isToday ? 'text-white' : isDark ? 'text-violet-400' : 'text-violet-500'}`}>
                              {b.availableSlots} open
                            </span>
                          ) : (
                            <div className="flex gap-1 items-center">
                              {b.pending > 0 && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${b.isToday ? 'bg-amber-300 ring-1 ring-white/80' : 'bg-amber-400'}`} />}
                              {b.confirmed > 0 && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${b.isToday ? 'bg-emerald-300 ring-1 ring-white/80' : 'bg-emerald-400'}`} />}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className={`mt-4 pt-3 border-t flex items-center gap-4 flex-wrap ${isDark ? 'border-white/15' : 'border-gray-300'}`}>
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /><span className={`text-xs font-medium ${tm}`}>Pending</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /><span className={`text-xs font-medium ${tm}`}>Confirmed</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#0EA5E9]" /><span className={`text-xs font-medium ${tm}`}>Today</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-violet-400" /><span className={`text-xs font-medium ${tm}`}>Available</span></div>
                  </div>
                </div>

                {/* Today's Schedule — grows to fill remaining column height */}
                <div
                  className={`p-6 rounded-2xl flex-1 flex flex-col ${isDark ? 'border border-white/5 shadow-[0_10px_40px_rgba(0,0,0,0.60),0_4px_12px_rgba(0,0,0,0.40)]' : ''}`}
                  style={isDark ? { background: 'rgba(30,31,34,0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: '16px' } : { background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid #f1f5f9', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06),0 4px 16px rgba(0,0,0,0.04)' }}
                >
                  <p className={`text-base font-semibold mb-3 flex-shrink-0 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Today's Schedule</p>
                  {todayConsultations.length > 0 ? (
                    <div className="flex flex-col gap-2 overflow-y-auto max-h-60">
                      {todayConsultations.map(c => (
                        <div key={c.id} className={`flex items-center gap-3 px-3 py-3 rounded-lg ${isDark ? 'bg-white/[0.03] hover:bg-white/[0.05]' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}>
                          <span className={`text-sm font-mono font-bold tabular-nums w-16 flex-shrink-0 ${tp}`}>
                            {formatTime12((c.time || c.time_start)?.slice(0, 5) ?? '')}
                          </span>
                          <div className={`w-px h-3.5 flex-shrink-0 ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />
                          <span className={`text-base font-semibold flex-1 truncate ${tp}`}>{c.professor_name}</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                            c.status === 'pending'    ? (isDark ? 'bg-amber-500/15 text-amber-300'    : 'bg-amber-50 text-amber-700')
                          : c.status === 'confirmed'  ? (isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700')
                          :                             (isDark ? 'bg-white/5 text-gray-400'           : 'bg-gray-100 text-gray-500')
                          }`}>
                            {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={`flex-1 flex flex-col items-center justify-center gap-3 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                      <svg className="w-10 h-10 opacity-40 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                      </svg>
                      <span className="text-base">No consultations scheduled for today</span>
                    </div>
                  )}
                </div>

              </div>{/* /center column wrapper */}

              {/* ── Col 3: Right column ── */}
              <div className="flex flex-col gap-4">

              {/* Popular Topics card */}
              <div
                className={`p-5 rounded-2xl flex flex-col gap-4 ${isDark ? 'border border-white/5 shadow-[0_10px_40px_rgba(0,0,0,0.60),0_4px_12px_rgba(0,0,0,0.40)]' : 'shadow-sm'}`}
                style={isDark ? { background: 'rgba(30,31,34,0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: '16px' } : { background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06),0 0 0 1px rgba(0,0,0,0.03)' }}
              >
                {/* Header */}
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-orange-500/15' : 'bg-orange-50'}`}>
                    <svg className="w-4 h-4 text-orange-500" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" clipRule="evenodd" d="M12.963 2.286a.75.75 0 0 0-1.071-.136 9.742 9.742 0 0 0-3.539 6.177A7.547 7.547 0 0 1 6.648 6.61a.75.75 0 0 0-1.152-.082A9 9 0 1 0 15.68 4.534a7.46 7.46 0 0 1-2.717-2.248ZM15.75 14.25a3.75 3.75 0 1 1-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 0 1 1.925-3.545 3.75 3.75 0 0 1 3.255 3.717Z" /></svg>
                  </div>
                  <div>
                    <p className={`text-sm font-bold ${tp}`}>Popular Topics</p>
                    <p className={`text-[10px] font-medium ${ts}`}>Trending across all consultations</p>
                  </div>
                </div>

                {/* Topic rows */}
                <div className="flex-1 space-y-3">
                  {(() => {
                    const RANK_CFG = [
                      { rank: '1st', accentColor: '#F59E0B', gradFrom: '#F59E0B', gradTo: '#FCD34D', bg: isDark ? 'bg-amber-500/8'  : 'bg-amber-50/80',  border: isDark ? 'border-amber-500/20' : 'border-amber-200',  text: isDark ? 'text-amber-300' : 'text-amber-700',  badge: isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-700' },
                      { rank: '2nd', accentColor: '#94A3B8', gradFrom: '#94A3B8', gradTo: '#CBD5E1', bg: isDark ? 'bg-slate-500/8'  : 'bg-slate-50/80',  border: isDark ? 'border-slate-500/20' : 'border-slate-200',  text: isDark ? 'text-slate-300' : 'text-slate-600',  badge: isDark ? 'bg-slate-500/20 text-slate-300' : 'bg-slate-100 text-slate-600' },
                      { rank: '3rd', accentColor: '#CD7C3A', gradFrom: '#CD7C3A', gradTo: '#FDBA74', bg: isDark ? 'bg-orange-500/8' : 'bg-orange-50/80', border: isDark ? 'border-orange-500/20': 'border-orange-200', text: isDark ? 'text-orange-300': 'text-orange-700', badge: isDark ? 'bg-orange-500/20 text-orange-300': 'bg-orange-100 text-orange-700' },
                    ];
                    const top3 = mostConsultedTopics.slice(0, 3);
                    const topCount = top3[0]?.count || 1;
                    if (top3.length === 0) return (
                      <div className={`flex flex-col items-center justify-center py-6 gap-2 rounded-xl ${isDark ? 'bg-white/[0.03]' : 'bg-gray-50'}`}>
                        <svg className="w-7 h-7 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" /></svg>
                        <p className={`text-xs font-medium ${ts}`}>No data yet</p>
                      </div>
                    );
                    return top3.map((t, i) => {
                      const cfg = RANK_CFG[i];
                      const pct = Math.max(6, Math.round((t.count / topCount) * 100));
                      return (
                        <div key={t.label} className={`rounded-xl border p-3 ${cfg.bg} ${cfg.border}`}>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-start gap-2 min-w-0">
                              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md flex-shrink-0 mt-0.5 ${cfg.badge}`}>{cfg.rank}</span>
                              <span className={`text-xs font-semibold leading-snug ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{t.label}</span>
                            </div>
                            <span className={`text-lg font-black tabular-nums flex-shrink-0 leading-none ${cfg.text}`}>{t.count}</span>
                          </div>
                          <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/[0.08]' : 'bg-black/[0.06]'}`}>
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${cfg.gradFrom}, ${cfg.gradTo})` }} />
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Quick Actions card */}
              <div
                className={`p-5 rounded-2xl flex flex-col gap-3 ${isDark ? 'border border-white/5 shadow-[0_10px_40px_rgba(0,0,0,0.60),0_4px_12px_rgba(0,0,0,0.40)]' : 'shadow-sm'}`}
                style={isDark ? { background: 'rgba(30,31,34,0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: '16px' } : { background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06),0 0 0 1px rgba(0,0,0,0.03)' }}
              >
                {/* Header */}
                <div className="flex items-center gap-2.5 mb-1">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-violet-500/15' : 'bg-violet-50'}`}>
                    <svg className="w-4 h-4 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
                  </div>
                  <div>
                    <p className={`text-sm font-bold ${tp}`}>Quick Actions</p>
                    <p className={`text-[10px] font-medium ${ts}`}>Shortcuts to common tasks</p>
                  </div>
                </div>

                {/* Action buttons */}
                {([
                  {
                    label: 'Book a Consultation',
                    sub: 'Find an available professor',
                    color: 'text-sky-600 dark:text-sky-400',
                    iconBg: isDark ? 'bg-sky-500/15' : 'bg-sky-50',
                    border: isDark ? 'border-white/[0.06] hover:border-sky-500/30' : 'border-gray-100 hover:border-sky-200',
                    hoverBg: isDark ? 'hover:bg-sky-500/[0.07]' : 'hover:bg-sky-50/60',
                    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />,
                    iconColor: 'text-sky-500',
                    onClick: () => handleTabChange('book'),
                  },
                  {
                    label: 'View History',
                    sub: 'Past consultations & records',
                    color: 'text-emerald-600 dark:text-emerald-400',
                    iconBg: isDark ? 'bg-emerald-500/15' : 'bg-emerald-50',
                    border: isDark ? 'border-white/[0.06] hover:border-emerald-500/30' : 'border-gray-100 hover:border-emerald-200',
                    hoverBg: isDark ? 'hover:bg-emerald-500/[0.07]' : 'hover:bg-emerald-50/60',
                    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
                    iconColor: 'text-emerald-500',
                    onClick: () => handleTabChange('history'),
                  },
                  {
                    label: 'Download Blank Slip',
                    sub: 'Get the advising form template',
                    color: 'text-amber-600 dark:text-amber-400',
                    iconBg: isDark ? 'bg-amber-500/15' : 'bg-amber-50',
                    border: isDark ? 'border-white/[0.06] hover:border-amber-500/30' : 'border-gray-100 hover:border-amber-200',
                    hoverBg: isDark ? 'hover:bg-amber-500/[0.07]' : 'hover:bg-amber-50/60',
                    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />,
                    iconColor: 'text-amber-500',
                    onClick: async () => {
                      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/forms/blank-slip`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a'); a.href = url; a.download = 'advising-slip.pdf'; a.click();
                      URL.revokeObjectURL(url);
                    },
                  },
                ] as const).map(a => (
                  <button
                    key={a.label}
                    onClick={a.onClick}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${a.border} ${a.hoverBg}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${a.iconBg}`}>
                      <svg className={`w-4 h-4 ${a.iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>{a.icon}</svg>
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{a.label}</p>
                      <p className={`text-[10px] font-medium ${ts} truncate`}>{a.sub}</p>
                    </div>
                    <svg className={`w-3.5 h-3.5 ml-auto flex-shrink-0 ${ts}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                  </button>
                ))}
              </div>

              </div>{/* /right column */}

            </div>{/* /bento grid */}

          </div>
          );
        })()

        : tab === 'book' ? (
          <div className="relative z-[1] px-3 sm:px-8 py-5 sm:py-8">
            {(() => {
              // PHT "now" — single source of truth for hiding past slots across
              // counts, sort, card visibility, and chips.
              const phtNowParts = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', hour12: false,
              }).formatToParts(new Date());
              const phtNow = (t: string) => phtNowParts.find(p => p.type === t)?.value ?? '00';
              const phtToday = `${phtNow('year')}-${phtNow('month')}-${phtNow('day')}`;
              const phtMins  = parseInt(phtNow('hour'), 10) * 60 + parseInt(phtNow('minute'), 10);
              // A slot is still bookable if: it's recurring (no date), a future date,
              // or today with at least one time range that hasn't ended yet (in-progress OK).
              const isSlotFuture = (s: Schedule): boolean => {
                if (!s.date) return true;
                if (s.date < phtToday) return false;
                if (s.date > phtToday) return true;
                const ranges = s.time_ranges?.length
                  ? s.time_ranges
                  : [{ time_start: s.time_start, time_end: s.time_end }];
                return ranges.some(r => {
                  const [h, m] = r.time_end.slice(0, 5).split(':').map(Number);
                  return h * 60 + m > phtMins;
                });
              };

              const profMap = new Map<number, {
                professor_id: number; professor_name: string; department: string;
                specializations: string[]; professor_avatar?: string | null; slots: Schedule[];
              }>();
              for (const s of schedules) {
                if (!isSlotFuture(s)) continue;
                if (!profMap.has(s.professor_id)) {
                  profMap.set(s.professor_id, {
                    professor_id: s.professor_id,
                    professor_name: s.professor_name,
                    department: s.department,
                    specializations: s.specializations ?? [],
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

              // Only offer topics that at least one currently-listed professor actually specializes in —
              // an option nobody handles would just filter the list down to nothing.
              const assignedTopicLabels = new Set(allProfessors.flatMap(p => p.specializations));
              const topicOptions = [
                { value: 'all', label: 'Any concern' },
                ...topics.filter(t => assignedTopicLabels.has(t.label)).map(t => ({ value: t.label, label: t.label })),
              ];

              // Filter + sort
              const q = bookSearch.trim().toLowerCase();
              const filtered = allProfessors.filter(p => {
                const matchQ     = !q || p.professor_name.toLowerCase().includes(q) || (p.department || '').toLowerCase().includes(q);
                const matchDept  = bookDeptFilter === 'all' || deptCat(p.department) === bookDeptFilter;
                const matchTopic = bookTopicFilter === 'all' || p.specializations.includes(bookTopicFilter);
                return matchQ && matchDept && matchTopic;
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
                    <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-700'}`}>{allProfessors.length} professor{allProfessors.length !== 1 ? 's' : ''} available</p>
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
                    {topicOptions.length > 1 && (
                      <CustomSelect
                        value={bookTopicFilter}
                        onChange={v => setBookTopicFilter(v)}
                        isDark={isDark}
                        className="py-2 px-3 text-sm"
                        options={topicOptions}
                      />
                    )}
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
                      <button onClick={() => { setBookSearch(''); setBookDeptFilter('all'); setBookTopicFilter('all'); }}
                        className="text-xs text-sky-400 hover:text-sky-300 transition-colors mt-0.5">Clear filters</button>
                    </div>
                  ) : (
                    <div className="columns-1 sm:columns-2 gap-4">
                      {displayedProfessors.map(prof => {
                        const slotsSorted = [...prof.slots].sort((a, b) => {
                          if (a.date && b.date) return a.date.localeCompare(b.date);
                          if (a.date) return -1; if (b.date) return 1;
                          return DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
                        });
                        // Past slots are already excluded at the grouping stage
                        // (isSlotFuture), so the sorted list is safe to render directly.
                        const slotsForChips = slotsSorted;
                        const alreadyBooked = bookedProfIds.has(prof.professor_id);

                        return (
                          <div key={prof.professor_id} className={`mb-4 break-inside-avoid rounded-2xl overflow-hidden transition-all ${card} ${isDark ? 'hover:border-white/10' : 'hover:border-sky-200'}`}>
                            <div className="p-4 flex flex-col">
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
                                  </div>
                                  {prof.specializations.length > 0 ? (
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                      {prof.specializations.slice(0, 2).map(spec => {
                                        const short = spec.replace(/^Concerns?\s+(about|on|regarding)\s+/i, '').replace(/\s+concerns?$/i, '').replace(/Mentoring\/Clarification on the Topic of the Subjects Enrolled/i, 'Mentoring').replace(/Thesis\/Design Subject/i, 'Thesis').split(/[,/]/)[0].trim();
                                        return (
                                          <span key={spec} className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${isDark ? 'bg-violet-500/15 text-violet-300' : 'bg-violet-50 text-violet-700'}`}>
                                            {short}
                                          </span>
                                        );
                                      })}
                                      {prof.specializations.length > 2 && (
                                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${isDark ? 'bg-white/5 text-gray-500' : 'bg-gray-100 text-gray-500'}`}>
                                          +{prof.specializations.length - 2}
                                        </span>
                                      )}
                                    </div>
                                  ) : prof.department && prof.department.toLowerCase() !== 'others' ? (
                                    <p className={`text-xs mt-0.5 truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{prof.department}</p>
                                  ) : null}
                                  <span className="inline-flex items-center gap-1 text-xs text-emerald-500 mt-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    {prof.slots.length} slot{prof.slots.length !== 1 ? 's' : ''} open
                                  </span>
                                </div>
                              </div>

                              {/* Date chips */}
                              <div className="flex flex-wrap gap-1.5 mt-3">
                                {slotsForChips.slice(0, 3).map(s => {
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
                                {slotsForChips.length > 3 && (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${isDark ? 'bg-white/5 text-gray-500' : 'bg-gray-100 text-gray-500'}`}>
                                    +{slotsForChips.length - 3} more
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

                              {/* Actions */}
                              <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                                <button type="button"
                                  onClick={() => setSlotModalProf(prof)}
                                  className={`flex items-center gap-1 text-xs font-medium transition-colors ${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}>
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                                  Preview slots
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
                  )}
                </>
              );
            })()}
          </div>

        ) : tab === 'history' ? (
          <div className="relative z-[1] px-3 sm:px-8 py-5 sm:py-8">
            <div className="mb-5 sm:mb-7 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h1 className={`text-2xl font-bold ${tp}`}>History</h1>
                <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-700'}`}>Past consultations grouped by term</p>
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
                  {groupByQuarter(historyItems).map(([quarter, items]) => {
                    return (
                    <div key={quarter}>
                      <div className="flex items-center gap-3 mb-3 flex-wrap">
                        <p className={`text-[11px] font-semibold uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{quarter}</p>
                        <span className={`text-xs font-bold ${isDark ? 'text-gray-400' : 'text-gray-700'}`}>{items.length} consultation{items.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className={`rounded-2xl overflow-hidden border ${isDark ? 'bg-[#252525] border-white/5' : 'bg-white border-gray-200 shadow-sm'}`}>
                        <div className="overflow-x-auto">
                          <table className="w-full" style={{ minWidth: '650px' }}>
                            <colgroup>
                              <col className="w-[120px]" />
                              <col className="w-[18%]" />
                              <col />
                              <col className="w-[150px]" />
                              <col className="w-[100px]" />
                              <col className="w-[18%]" />
                            </colgroup>
                            <thead>
                              <tr className={`border-b ${isDark ? 'border-white/5 bg-white/[0.03]' : 'border-gray-200 bg-gray-50'}`}>
                                {['Date', 'Adviser', 'Purpose', 'Action Taken', 'Status', 'Remarks'].map(h => (
                                  <th key={h} className={`text-left text-xs font-semibold uppercase tracking-widest px-5 py-3.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className={`divide-y ${isDark ? 'divide-white/[0.04]' : 'divide-gray-100'}`}>
                              {items.map(c => {
                                const initials = (c.professor_name || '?').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
                                return (
                                <tr key={c.id} className={`transition-colors align-middle ${isDark ? 'hover:bg-white/[0.025]' : 'hover:bg-gray-50/70'}`}>
                                  <td className={`px-5 py-4 text-sm whitespace-nowrap align-middle ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                    {new Date((c.date || '').slice(0, 10) + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </td>
                                  <td className="px-5 py-4 align-middle">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isDark ? 'bg-sky-500/15 text-sky-400' : 'bg-sky-100 text-sky-700'}`}>{initials}</div>
                                      <p className={`truncate text-sm font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{c.professor_name}</p>
                                    </div>
                                  </td>
                                  <td className={`px-5 py-4 text-sm align-middle ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                    <span className="line-clamp-2 break-words leading-relaxed">{natureLabel(c)}</span>
                                  </td>
                                  <td className={`px-5 py-4 text-sm align-middle ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                    {c.action_taken
                                      ? <div className="flex items-center gap-1.5">
                                          <svg className="w-4 h-4 flex-shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                          </svg>
                                          <span className="line-clamp-2">{actionLabel(c.action_taken, c.referral, c.referral_specify)}</span>
                                        </div>
                                      : <span className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>—</span>
                                    }
                                  </td>
                                  <td className="px-5 py-4 align-middle"><StatusBadge status={c.status} isDark={isDark} /></td>
                                  <td className={`px-5 py-4 text-sm align-top ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                    {c.remarks
                                      ? (() => {
                                          const isLong = c.remarks.length > 80;
                                          const isOpen = expandedRemarks.has(c.id);
                                          return (
                                            <div>
                                              <span className={`break-words leading-relaxed italic ${!isOpen && isLong ? 'line-clamp-2' : ''}`}>{c.remarks}</span>
                                              {isLong && (
                                                <button
                                                  onClick={() => setExpandedRemarks(prev => {
                                                    const next = new Set(prev);
                                                    isOpen ? next.delete(c.id) : next.add(c.id);
                                                    return next;
                                                  })}
                                                  className={`mt-1 flex items-center gap-0.5 text-xs font-medium transition-colors ${isDark ? 'text-sky-400 hover:text-sky-300' : 'text-sky-600 hover:text-sky-800'}`}
                                                >
                                                  {isOpen ? 'Show less' : 'Show more'}
                                                  <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                                  </svg>
                                                </button>
                                              )}
                                            </div>
                                          );
                                        })()
                                      : <span className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>—</span>
                                    }
                                  </td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

        ) : (
          /* My Consultations */
          <div className="relative z-[1] px-3 sm:px-8 py-5 sm:py-8">
            <div className="mb-5 sm:mb-6 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h1 className={`text-2xl font-bold ${tp}`}>My Consultations</h1>
                <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-700'}`}>{upcomingConsultations.length} upcoming · {activeConsults} active</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {statusFilter && ['pending', 'confirmed', 'rescheduled', 'completed', 'cancelled', 'missed'].includes(statusFilter) && (
                  <button onClick={clearStatusFilter}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${isDark ? 'bg-white/5 text-gray-300 hover:bg-white/10' : 'bg-sky-50 text-sky-700 hover:bg-sky-100'}`}>
                    Filtered: {statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
            </div>

            {/* Tab switcher */}
            <div className={`flex gap-1 p-1 rounded-full mb-4 sm:mb-6 w-full sm:w-fit overflow-x-auto ${isDark ? 'bg-[#1e1e1e] border border-white/5' : 'bg-gray-100 border border-gray-200'}`}>
              {([
                { key: 'active', label: 'Active & Upcoming', count: activeTabConsultations.length },
                { key: 'past',   label: 'Past',              count: pastTabConsultations.length  },
              ] as const).map(t => (
                <button key={t.key} onClick={() => setConsultTab(t.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-colors ${
                    consultTab === t.key ? 'bg-[#0EA5E9] text-white shadow-sm' : `${ts} ${isDark ? 'hover:text-gray-200 hover:bg-white/5' : 'hover:text-gray-800 hover:bg-white'}`
                  }`}>
                  {t.label}
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${consultTab === t.key ? 'bg-white/20 text-white' : isDark ? 'bg-white/10 text-gray-300' : 'bg-gray-300 text-gray-600'}`}>
                    {t.count}
                  </span>
                </button>
              ))}
            </div>

            {(() => {
              const displayActive = statusFilter && ['pending', 'confirmed', 'rescheduled', 'needs_reschedule'].includes(statusFilter)
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
                  <div key={c.id} className={`rounded-2xl p-5 ${card}`}>
                    <div className="flex items-start gap-4">
                      <button type="button" onClick={() => setProfileCard({ id: c.professor_id, role: 'professor' })}
                        className="flex-shrink-0 hover:opacity-75 transition-opacity rounded-full focus:outline-none" title="View profile">
                        <Avatar name={c.professor_name} avatarUrl={c.professor_avatar} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button type="button" onClick={() => setProfileCard({ id: c.professor_id, role: 'professor' })}
                              className={`font-semibold text-base hover:opacity-75 transition-opacity text-left ${tp}`}>
                              {c.professor_name}
                            </button>
                            {c.status === 'confirmed' && (c.in_session || professorInSession[c.professor_id]) && (
                              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500 text-white shadow-[0_0_10px_rgba(245,158,11,0.6)]">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                                In Session
                              </span>
                            )}
                          </div>
                          <StatusBadge status={c.status} isDark={isDark} />
                        </div>
                        <p className={`text-sm mt-0.5 line-clamp-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{natureLabel(c)}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className={`rounded-lg border px-3 py-2.5 ${innerCard}`}>
                        <p className={`text-xs uppercase tracking-wide mb-1 font-semibold ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Date & Time</p>
                        <p className={`text-base font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                          {new Date((c.date || '').slice(0, 10) + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                        <p className={`text-sm mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{c.day} · {(() => {
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
                        <p className={`text-xs uppercase tracking-wide mb-1 font-semibold ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Meeting</p>
                        {(() => {
                          const effMode = c.mode || (c.slot_mode === 'BOTH' ? 'BOTH' : c.slot_mode === 'OL' ? 'OL' : c.slot_mode ? 'F2F' : 'F2F');
                          return (
                            <>
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${effMode === 'F2F' ? 'bg-purple-400' : effMode === 'BOTH' ? 'bg-teal-400' : 'bg-emerald-400'}`} />
                                <span className={`text-base font-semibold ${effMode === 'F2F' ? (isDark ? 'text-purple-300' : 'text-purple-600') : effMode === 'BOTH' ? (isDark ? 'text-teal-300' : 'text-teal-600') : (isDark ? 'text-emerald-300' : 'text-emerald-600')}`}>
                                  {effMode === 'F2F' ? 'Face-to-Face' : effMode === 'BOTH' ? 'Face-to-Face & Online' : 'Online'}
                                </span>
                              </div>
                              {(effMode === 'F2F' || effMode === 'BOTH') && c.location && (
                                <p className={`text-xs mt-0.5 ${ts}`}>{c.location}</p>
                              )}
                              {(effMode === 'OL' || effMode === 'BOTH') && c.status === 'confirmed' && (
                                c.meeting_link
                                  ? <a href={c.meeting_link} target="_blank" rel="noopener noreferrer" className={`text-xs mt-0.5 block hover:underline truncate ${effMode === 'BOTH' ? (isDark ? 'text-teal-400' : 'text-teal-600') : (isDark ? 'text-emerald-400' : 'text-emerald-600')}`}>Join Meeting →</a>
                                  : <p className={`text-xs mt-0.5 italic ${tm}`}>No meeting link added yet</p>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    {c.status === 'needs_reschedule' && (
                      <div className={`mt-3.5 pt-3.5 border-t ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                        <div className={`flex items-start gap-2.5 p-3 rounded-xl mb-3 ${isDark ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'}`}>
                          <svg className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-semibold ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>Your professor requested to reschedule this consultation.</p>
                            {c.reschedule_remarks && (
                              <p className={`text-xs mt-0.5 ${isDark ? 'text-amber-400/80' : 'text-amber-700'}`}>"{c.reschedule_remarks}"</p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => setRescheduleModal({ consultId: c.id, professorId: c.professor_id, profName: c.professor_name, remarks: c.reschedule_remarks ?? null })}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${isDark ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30 hover:bg-amber-500/25' : 'bg-amber-100 text-amber-700 ring-1 ring-amber-300 hover:bg-amber-200'}`}>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            Select New Schedule
                          </button>
                          <button onClick={() => handleCancel(c.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ring-1 ${isDark ? 'bg-red-500/10 text-red-400 ring-red-500/30 hover:bg-red-500/20 hover:ring-red-500/50' : 'bg-red-50 text-red-600 ring-red-200 hover:bg-red-100 hover:ring-red-300'}`}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── Proof-required warning ───────────────────────── */}
                    {c.proof_required && !c.proof_of_evidence && ['pending', 'confirmed'].includes(c.status) && (
                      <div className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs ${isDark ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                        <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                        <span>This booking won&apos;t be visible to your professor until you submit proof of your filled advising slip. Download the template, fill it out, and upload the completed PDF.</span>
                      </div>
                    )}

                    {/* ── Proof + Actions row ───────────────────────────── */}
                    <div className={`mt-3.5 pt-3.5 border-t ${isDark ? 'border-white/5' : 'border-gray-100'} flex flex-wrap items-center justify-between gap-2`}>
                      {/* Left: proof status or download receipt */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* ── Proof submitted: show view + replace ───────── */}
                        {c.status !== 'cancelled' && c.proof_of_evidence && (
                          <>
                            <span className={`flex items-center gap-1.5 text-xs font-medium ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Proof Submitted
                            </span>
                            {c.proof_type === 'link' ? (
                              <>
                                <a href={c.proof_of_evidence} target="_blank" rel="noopener noreferrer"
                                  className={`text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${isDark ? 'bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20 hover:bg-sky-500/20' : 'bg-sky-50 text-sky-600 ring-1 ring-sky-200 hover:bg-sky-100'}`}>
                                  View Link →
                                </a>
                                {['pending', 'confirmed'].includes(c.status) && (
                                  <button
                                    onClick={() => setReplaceModalId(c.id)}
                                    className={`text-xs px-2 py-1 rounded-lg transition-colors ${isDark ? 'text-[#c0392b] hover:text-[#e74c3c] hover:bg-red-900/20' : 'text-[#8B0000] hover:text-[#a00000] hover:bg-red-50'}`}>
                                    Replace
                                  </button>
                                )}
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleViewFile(c.id)}
                                  disabled={viewingFile === c.id}
                                  className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 ${isDark ? 'bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20 hover:bg-sky-500/20' : 'bg-sky-50 text-sky-600 ring-1 ring-sky-200 hover:bg-sky-100'}`}>
                                  {viewingFile === c.id
                                    ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                                    : 'View File →'}
                                </button>
                                {['pending', 'confirmed'].includes(c.status) && (
                                  <button
                                    onClick={() => setReplaceModalId(c.id)}
                                    className={`text-xs px-2 py-1 rounded-lg transition-colors ${isDark ? 'text-[#c0392b] hover:text-[#e74c3c] hover:bg-red-900/20' : 'text-[#8B0000] hover:text-[#a00000] hover:bg-red-50'}`}>
                                    Replace
                                  </button>
                                )}
                              </>
                            )}
                          </>
                        )}

                        {/* ── View Slip: always available for pending/confirmed (auto-generated) ─────── */}
                        {['pending', 'confirmed'].includes(c.status) && !c.proof_of_evidence && (
                          <button
                            onClick={() => setPreviewModal({ fetchUrl: `${API_URL}/api/forms/advising-slip/${c.id}`, title: `Advising Slip #${c.id}`, filename: `advising-slip-${c.id}.pdf` })}
                            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ring-1 transition-colors ${isDark ? 'bg-sky-500/10 text-sky-400 ring-sky-500/20 hover:bg-sky-500/20' : 'bg-sky-50 text-sky-700 ring-sky-200 hover:bg-sky-100'}`}>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            View Slip
                          </button>
                        )}

                        {/* ── Auto: Replace Slip (upload manual PDF over the auto slip) ─────── */}
                        {['pending', 'confirmed'].includes(c.status) && !c.proof_required && !c.proof_of_evidence && (
                          <button
                            onClick={() => setReplaceModalId(c.id)}
                            className={`text-xs px-2 py-1 rounded-lg transition-colors ${isDark ? 'text-[#c0392b] hover:text-[#e74c3c] hover:bg-red-900/20' : 'text-[#8B0000] hover:text-[#a00000] hover:bg-red-50'}`}>
                            Replace Slip
                          </button>
                        )}

                        {/* ── Manual: Submit Proof ──── */}
                        {['pending', 'confirmed'].includes(c.status) && c.proof_required && !c.proof_of_evidence && (
                          <button
                            onClick={() => setReplaceModalId(c.id)}
                            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ring-1 transition-colors ${isDark ? 'bg-violet-500/10 text-violet-400 ring-violet-500/20 hover:bg-violet-500/20' : 'bg-violet-50 text-violet-700 ring-violet-200 hover:bg-violet-100'}`}>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                            Submit Proof
                          </button>
                        )}
                        {c.status === 'completed' && (
                          <>
                            <button onClick={() => openViewSlip(c.id)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isDark ? 'bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20 hover:bg-sky-500/20' : 'bg-sky-50 text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100'}`}>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                              View Slip
                            </button>
                            <button
                              onClick={() => setPreviewModal({ fetchUrl: `${API_URL}/api/forms/advising-slip/${c.id}`, title: `Advising Slip #${c.id}`, filename: `advising-slip-${c.id}.pdf` })}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isDark ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 hover:bg-emerald-500/20' : 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-200'}`}>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                              Download Receipt
                            </button>
                          </>
                        )}
                      </div>
                      {/* Right: cancel */}
                      {(c.status === 'pending' || c.status === 'confirmed') && (
                        <button onClick={() => handleCancel(c.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ring-1 ${isDark ? 'bg-red-500/10 text-red-400 ring-red-500/30 hover:bg-red-500/20 hover:ring-red-500/50' : 'bg-red-50 text-red-600 ring-red-200 hover:bg-red-100 hover:ring-red-300'}`}>
                          Cancel
                        </button>
                      )}
                    </div>

                  </div>
                ))}
              </div>
            );
            })()}
          </div>
        )}
      </main>

      {/* ── Digital Advising Slip View Modal ── */}
      {viewSlipId !== null && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className={`rounded-2xl p-6 w-full max-w-md border shadow-2xl ${isDark ? 'bg-[#1a1a2e] border-white/10' : 'bg-white border-gray-200'}`}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className={`font-bold text-base ${isDark ? 'text-white' : 'text-gray-900'}`}>Advising Slip</p>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Record of action taken by your adviser</p>
              </div>
              <button onClick={() => setViewSlipId(null)} className={`p-1.5 rounded-lg ${isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-white/5' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {viewSlipLoading ? (
              <div className="flex justify-center py-8"><span className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : (
              <div className="space-y-3">
                {/* Student info */}
                {viewSlipData.student_name && (
                  <div className={`rounded-xl px-4 py-3 ${isDark ? 'bg-white/[0.04]' : 'bg-gray-50'}`}>
                    <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Student</p>
                    <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{viewSlipData.student_name}</p>
                    {viewSlipData.student_number && <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{viewSlipData.student_number} · {viewSlipData.program}</p>}
                  </div>
                )}
                {/* Nature of advising */}
                {viewSlipData.nature_of_advising && (
                  <div className={`rounded-xl px-4 py-3 ${isDark ? 'bg-white/[0.04]' : 'bg-gray-50'}`}>
                    <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Nature of Advising</p>
                    {(() => {
                      try { const arr = JSON.parse(viewSlipData.nature_of_advising as string); return (Array.isArray(arr) ? arr : [viewSlipData.nature_of_advising]).map((n: string) => <p key={n} className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>• {n}</p>); }
                      catch { return <p className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>• {viewSlipData.nature_of_advising}</p>; }
                    })()}
                  </div>
                )}
                {/* Outcome */}
                <div className={`rounded-xl px-4 py-3 ${isDark ? 'bg-white/[0.04]' : 'bg-gray-50'}`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Action Taken</p>
                  {viewSlipData.slip_outcome ? (
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${viewSlipData.slip_outcome === 'resolved' ? (isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700') : (isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-700')}`}>
                      {viewSlipData.slip_outcome === 'resolved' ? 'Resolved' : 'For Follow-up'}
                    </span>
                  ) : <p className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Not yet filled by adviser</p>}
                </div>
                {/* Referred to */}
                {viewSlipData.slip_referred_to && (
                  <div className={`rounded-xl px-4 py-3 ${isDark ? 'bg-white/[0.04]' : 'bg-gray-50'}`}>
                    <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Referred To</p>
                    <p className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{viewSlipData.slip_referred_to}</p>
                  </div>
                )}
                {/* Prof notes */}
                {viewSlipData.slip_prof_notes && (
                  <div className={`rounded-xl px-4 py-3 ${isDark ? 'bg-white/[0.04]' : 'bg-gray-50'}`}>
                    <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Adviser Remarks</p>
                    <p className={`text-xs leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{viewSlipData.slip_prof_notes}</p>
                  </div>
                )}
                <p className={`text-[11px] text-center ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                  Need to submit a physically signed copy instead?{' '}
                  <button
                    onClick={() => triggerUpload(viewSlipId)}
                    disabled={uploadingId === viewSlipId}
                    className={`underline font-medium disabled:opacity-50 ${isDark ? 'text-sky-400 hover:text-sky-300' : 'text-sky-600 hover:text-sky-700'}`}
                  >
                    {uploadingId === viewSlipId ? 'Uploading…' : 'Upload a scan'}
                  </button>
                </p>
                <button onClick={() => setViewSlipId(null)} className={`w-full py-2.5 rounded-xl text-sm font-medium mt-2 transition-colors ${isDark ? 'bg-white/5 text-gray-300 hover:bg-white/10' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Slot preview modal */}
      {slotModalProf && (() => {
        const mp = slotModalProf;
        const sorted = [...mp.slots].sort((a, b) => {
          const DAY_ORDER = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
          if (a.date && b.date) return a.date.localeCompare(b.date);
          if (a.date) return -1; if (b.date) return 1;
          return DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
        });
        return (
          <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center sm:p-4"
            onClick={() => setSlotModalProf(null)}>
            <div className={`w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh] ${isDark ? 'bg-[#1a1f35] border border-white/10' : 'bg-white border border-gray-200'}`}
              onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className={`px-4 py-3 flex items-center gap-3 border-b ${isDark ? 'border-white/8' : 'border-gray-100'}`}>
                <button type="button" onClick={() => setProfileCard({ id: mp.professor_id, role: 'professor' })}
                  className="flex-shrink-0 hover:opacity-75 transition-opacity rounded-full focus:outline-none">
                  <Avatar name={mp.professor_name} avatarUrl={mp.professor_avatar} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm truncate ${tp}`}>{mp.professor_name}</p>
                  <p className={`text-[11px] ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                    {mp.slots.length} slot{mp.slots.length !== 1 ? 's' : ''} available
                  </p>
                </div>
                <button type="button" onClick={() => setSlotModalProf(null)}
                  className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-white/5' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Slot list */}
              <div className={`overflow-y-auto divide-y ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
                {sorted.map(s => {
                  const dateObj = s.date ? new Date(s.date + 'T12:00:00') : null;
                  const dateLabel = dateObj
                    ? dateObj.toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric' })
                    : s.day;
                  const times = (s.time_ranges?.length ? s.time_ranges : [{ time_start: s.time_start, time_end: s.time_end }])
                    .map(r => `${formatTime12(r.time_start.slice(0, 5))} – ${formatTime12(r.time_end.slice(0, 5))}`).join(' · ');
                  return (
                    <div key={s.id} className="px-4 py-3 flex items-start gap-3">
                      <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? 'bg-sky-500/15' : 'bg-sky-50'}`}>
                        <svg className={`w-4 h-4 ${isDark ? 'text-sky-400' : 'text-sky-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{dateLabel}</p>
                        <p className={`text-xs mt-0.5 font-medium ${isDark ? 'text-sky-400' : 'text-sky-600'}`}>{times}</p>
                        {s.location && <p className={`text-[11px] mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{s.location}</p>}
                        {s.announcement && (
                          <p className={`text-[11px] mt-1 italic ${isDark ? 'text-amber-400/80' : 'text-amber-600'}`}>{s.announcement}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Footer */}
              <div className={`px-4 py-3 border-t ${isDark ? 'border-white/8' : 'border-gray-100'}`}>
                <button onClick={() => { setSlotModalProf(null); router.push(`/dashboard/student/book/prof/${mp.professor_id}`); }}
                  className="w-full py-2 rounded-xl text-sm font-semibold bg-[#0EA5E9] text-white hover:bg-[#0284C7] transition-colors shadow-sm shadow-sky-500/20">
                  Book a Slot
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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

      {previewModal && (
        <DocPreviewModal
          isOpen={!!previewModal}
          onClose={() => setPreviewModal(null)}
          title={previewModal.title}
          fetchUrl={previewModal.fetchUrl}
          token={token ?? ''}
          filename={previewModal.filename}
        />
      )}
      {replaceModalId !== null && (
        <ReplaceSlipModal
          isOpen={replaceModalId !== null}
          onClose={() => setReplaceModalId(null)}
          consultationId={replaceModalId}
          token={token ?? ''}
          apiUrl={API_URL}
          isDark={isDark}
          title={consultations.find(c => c.id === replaceModalId)?.proof_required ? 'Submit Proof of Evidence' : 'Replace Advising Slip'}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
}
