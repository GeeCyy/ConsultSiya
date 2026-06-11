'use client';

import { useEffect, useState, useRef, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Label } from '@/components/ui/label';
import UserProfileCard from '@/components/UserProfileCard';
import LeftSidebar from '@/components/LeftSidebar';
import MatrixCalendar from '@/components/MatrixCalendar';
import LeaderboardCard, { type LeaderboardItem } from '@/components/LeaderboardCard';

export type ProfessorTab = 'home' | 'schedules' | 'calendar' | 'consultations' | 'export' | 'history';

const PROF_NAV_ITEMS = [
  { key: 'home',          label: 'Home' },
  { key: 'schedules',     label: 'Manage Schedules' },
  { key: 'calendar',      label: 'Booking Calendar' },
  { key: 'consultations', label: 'My Consultations' },
  { key: 'export',        label: 'Export Report' },
  { key: 'history',       label: 'History' },
];
import { Check, X, CalendarClock, CheckCheck } from 'lucide-react';
import ChatbotWidget from '@/components/ChatbotWidget';
import { ToastContainer, useToast } from '@/components/Toast';
import { ConfirmModal } from '@/components/ConfirmModal';
import {
  CURRENT_TERM,
  buildTermFromConfig,
  getAcademicWeek,
  getWeekMode,
  daysUntil,
  getTermDates,
  getTermProgress,
  type CalendarOverride,
  type TermConfig,
  type RawTermConfig,
} from '@/lib/academicCalendar';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const REFERRAL_OPTIONS = [
  'Peer Advising (W501-Intramuros / R203-Makati)',
  'Counseling of Personal Concerns (Center for Guidance and Counseling)',
  'Career Advising (Center for Career Services)',
  'Other Office (Please Specify)',
];

function parseNature(natureStr: string | null): string[] {
  if (!natureStr) return [];
  try {
    const parsed = JSON.parse(natureStr);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [natureStr];
  }
}

function addMins(timeStr: string, mins: number): string {
  const [h, m] = timeStr.slice(0, 5).split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function to12h(t: string): string {
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtTime(c: { time: string | null; time_start: string; time_end: string }): string {
  if (c.time) return `${c.time.slice(0, 5)}–${addMins(c.time, 30)}`;
  return `${c.time_start?.slice(0, 5)}–${c.time_end?.slice(0, 5)}`;
}

type Consultation = {
  id: number;
  student_id: number;
  student_name: string;
  student_number: string;
  program: string;
  date: string;
  day: string;
  time: string | null;
  time_start: string;
  time_end: string;
  nature_of_advising: string;
  nature_of_advising_specify: string | null;
  mode: string;
  status: string;
  uploaded_form_path: string | null;
  action_taken: string | null;
  referral: string | null;
  referral_specify: string | null;
  remarks: string | null;
  notes?: string | null;
  location?: string;
  meeting_link?: string | null;
  student_avatar?: string | null;
};

type TimeRange = { time_start: string; time_end: string };

type Schedule = {
  id: number;
  day: string;
  date?: string;
  time_start: string;
  time_end: string;
  time_ranges?: TimeRange[];
  is_available: boolean;
  location?: string;
  upcoming_count?: number;
};


type ProfProfile = {
  full_name: string;
  department: string;
  email: string;
  phone: string;
  avatar: string | null;
};

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
  const initials = (name || '').split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const sizeClass = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  const fullSrc = avatarUrl && !avatarUrl.startsWith('/uploads/') ? avatarUrl : null;
  return (
    <div className={`rounded-full bg-[#0369A1] border border-[#0EA5E9]/30 flex items-center justify-center text-sky-200 font-semibold flex-shrink-0 overflow-hidden ${sizeClass}`}>
      {fullSrc
        ? <img src={fullSrc} alt={name} className="w-full h-full object-cover" />
        : initials
      }
    </div>
  );
}


function getQuarterLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const m = d.getMonth();
  const y = d.getFullYear();
  const q = m < 3 ? '1st' : m < 6 ? '2nd' : m < 9 ? '3rd' : '4th';
  return `${q} Quarter ${y}`;
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

function fmtDate(dateStr: string | null | undefined, options: Intl.DateTimeFormatOptions): string {
  if (!dateStr) return '—';
  const d = new Date(String(dateStr).slice(0, 10) + 'T12:00:00');
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-PH', options);
}

function actionLabel(action_taken: string | null, referral: string | null, referral_specify: string | null): string {
  if (!action_taken) return '—';
  if (action_taken === 'Referred to' && referral) {
    if (referral === 'Other Office (Please Specify)' && referral_specify) return `Referred to: ${referral_specify}`;
    return `Referred to: ${referral.split(' (')[0]}`;
  }
  return action_taken;
}


type Tab = ProfessorTab | 'profile';

type Announcement = {
  id: number;
  title: string;
  body: string;
  type: 'info' | 'warning';
  created_at: string;
};

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#252525] shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h2 className="text-white font-bold text-base">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-200 hover:bg-white/5 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ScheduleDatePicker({
  selected,
  onSelect,
  disabledDates,
  isDark = true,
}: {
  selected: string;
  onSelect: (dateStr: string, dayName: string) => void;
  disabledDates: string[];
  isDark?: boolean;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const initDate = selected ? new Date(selected + 'T12:00:00') : today;
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());
  const [mounted, setMounted] = useState(false);

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  const prevMonth = () => {
    if (isCurrentMonth) return;
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const calBg      = isDark ? '#1e1e1e'              : '#f5f5f5';
  const calBorder  = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const monthText  = isDark ? 'text-white'            : 'text-gray-800';
  const navBtn     = isDark ? 'text-gray-500 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-gray-800 hover:bg-black/8';
  const dayHeader  = isDark ? 'text-gray-600'         : 'text-gray-400';
  const dayNormal  = isDark ? 'text-gray-300 hover:bg-white/10' : 'text-gray-700 hover:bg-black/8';
  const dayDisabled= isDark ? 'text-gray-700'         : 'text-gray-300';
  const dayToday   = isDark ? 'text-white ring-1 ring-inset ring-[#0EA5E9]/40 hover:bg-white/10' : 'text-gray-900 ring-1 ring-inset ring-[#0EA5E9]/40 hover:bg-black/8';

  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="rounded-xl p-3 min-h-[220px]" style={{ backgroundColor: calBg, border: `1px solid ${calBorder}` }} />;

  return (
    <div className="rounded-xl p-3 select-none" style={{ backgroundColor: calBg, border: `1px solid ${calBorder}` }}>
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={prevMonth} disabled={isCurrentMonth}
          className={`w-7 h-7 flex items-center justify-center rounded-lg disabled:opacity-20 disabled:cursor-not-allowed transition-colors ${navBtn}`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className={`text-sm font-medium ${monthText}`}>{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button type="button" onClick={nextMonth}
          className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${navBtn}`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} className={`text-center text-[10px] font-medium py-1 ${dayHeader}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstDow }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const date = new Date(viewYear, viewMonth, day);
          const dow = date.getDay();
          const dayName = DAY_NAMES[dow];
          const isPast = date < today;
          const isSunday = dow === 0;
          const hasSlot = disabledDates.includes(dateStr);
          const isDisabled = isPast || isSunday || hasSlot;
          const isSelected = selected === dateStr;
          const isToday = date.getTime() === today.getTime();
          return (
            <button
              key={dateStr}
              type="button"
              disabled={isDisabled}
              onClick={() => onSelect(dateStr, dayName)}
              className={[
                'rounded-lg text-xs py-1.5 font-medium transition-colors w-full',
                isSelected ? 'bg-[#0EA5E9] text-white' :
                isDisabled ? `${dayDisabled} cursor-not-allowed` :
                isToday ? dayToday :
                dayNormal,
              ].join(' ')}>
              {day}
            </button>
          );
        })}
      </div>
      {selected && (
        <p className="text-sky-400 text-[10px] text-center mt-2.5 font-medium">
          {new Date(selected + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      )}
    </div>
  );
}

function TimePicker({ value, onChange, dark = true }: { value: string; onChange: (v: string) => void; dark?: boolean }) {
  const parse = (v: string) => {
    if (!v) return { h: '', m: '00', ampm: 'AM' as 'AM' | 'PM' };
    const [hStr, mStr] = v.split(':');
    const h24 = parseInt(hStr, 10);
    return {
      h: String(h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24),
      m: (mStr || '00').padStart(2, '0'),
      ampm: (h24 < 12 ? 'AM' : 'PM') as 'AM' | 'PM',
    };
  };
  const { h, m, ampm } = parse(value);
  const emit = (nh: string, nm: string, na: string) => {
    if (!nh) { onChange(''); return; }
    let h24 = parseInt(nh, 10);
    if (na === 'AM') { if (h24 === 12) h24 = 0; }
    else { if (h24 !== 12) h24 += 12; }
    onChange(`${String(h24).padStart(2, '0')}:${nm}`);
  };
  const HOURS = ['1','2','3','4','5','6','7','8','9','10','11','12'];
  const MINS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
  const sel = dark
    ? 'bg-[#1e1e1e] border border-white/15 text-white text-sm rounded-lg px-2.5 py-2 focus:outline-none focus:border-[#0EA5E9]/50 cursor-pointer hover:border-white/30 transition-colors'
    : 'bg-white border border-gray-300 text-gray-900 text-sm rounded-lg px-2.5 py-2 focus:outline-none focus:border-[#0EA5E9]/60 cursor-pointer hover:border-gray-400 transition-colors';
  return (
    <div className="flex items-center gap-1.5">
      <select value={h} onChange={e => emit(e.target.value, m, ampm)} className={`${sel} w-[4.5rem]`}>
        <option value="">--</option>
        {HOURS.map(hr => <option key={hr} value={hr}>{hr}</option>)}
      </select>
      <span className={`text-sm font-bold select-none ${dark ? 'text-gray-600' : 'text-gray-400'}`}>:</span>
      <select value={m} onChange={e => emit(h, e.target.value, ampm)} className={`${sel} w-[4.5rem]`}>
        {MINS.map(mn => <option key={mn} value={mn}>{mn}</option>)}
      </select>
      <select value={ampm} onChange={e => emit(h, m, e.target.value)} className={`${sel} w-[4.5rem]`}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

// ── Professor Full-width Academic Calendar ───────────────────────────────────
const MONTH_NAMES_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function ProfCalendar({
  consultations, schedules, dateLabelMap, dateColorMap, isDark, calOverrides, profKey,
}: {
  consultations: Consultation[];
  schedules:     Schedule[];
  dateLabelMap:  Map<string, string>;
  dateColorMap:  Map<string, string>;
  isDark:        boolean;
  calOverrides:  CalendarOverride[];
  profKey:       string;
}) {
  const [viewYear, setViewYear]   = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [selected, setSelected]   = useState<string | null>(null);
  const [todayStr]                = useState(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
  });
  const calColRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
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

  const storageKey = `consulta_notes_prof_${profKey}`;
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
              { label: 'My Slot',   cls: 'bg-sky-400',     shadow: 'shadow-sky-400/60'     },
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
                    {hasSlots  && <span title="My schedule slot" className="w-[7px] h-[7px] rounded-full shadow-sm bg-sky-400 shadow-sky-400/50" />}
                    {!isBlocked && evColor && <span className={`w-[7px] h-[7px] rounded-full shadow-sm ${evDotCls[evColor] ?? 'bg-red-400'}`} />}
                    {hasNote   && <span title="Has note" className="w-[7px] h-[7px] rounded-full shadow-sm bg-violet-400 shadow-violet-400/50" />}
                  </div>
                </button>
              );
            })}
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

            {/* Student Bookings section */}
            <div className="px-4 pt-3.5 pb-2">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="w-1.5 h-3.5 rounded-full bg-blue-500 flex-shrink-0" />
                <p className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Student Bookings{selConsults.length > 0 ? <span className={`ml-1.5 font-bold px-1.5 py-0.5 rounded-full text-[9px] ${isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>{selConsults.length}</span> : ''}
                </p>
              </div>
              {selConsults.length === 0 ? (
                <p className={`text-[11px] ${tm} py-1 pl-3.5`}>No bookings.</p>
              ) : (
                <div className={`rounded-xl overflow-hidden divide-y ${isDark ? 'divide-white/[0.05] bg-white/[0.03] border border-white/[0.05]' : 'divide-gray-100 bg-white border border-gray-200/80 shadow-sm'}`}>
                  {selConsults.map(c => (
                    <div key={c.id} className={`flex items-center gap-2.5 px-3 py-2.5 transition-colors ${isDark ? 'hover:bg-white/[0.03]' : 'hover:bg-gray-50'}`}>
                      <Avatar name={c.student_name} avatarUrl={c.student_avatar} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className={`text-[11px] font-semibold truncate ${tp}`}>{c.student_name}</p>
                        <p className={`text-[10px] ${tm}`}>
                          {to12h((c.time || c.time_start)?.slice(0,5) ?? '')} · {c.mode === 'F2F' ? 'In-Person' : 'Online'}
                        </p>
                      </div>
                      <StatusBadge status={c.status} isDark={isDark} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* My Schedule section */}
            <div className="px-4 pt-2 pb-3">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="w-1.5 h-3.5 rounded-full bg-sky-400 flex-shrink-0" />
                <p className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  My Schedule{selSlots.length > 0 ? <span className={`ml-1.5 font-bold px-1.5 py-0.5 rounded-full text-[9px] ${isDark ? 'bg-sky-500/15 text-sky-400' : 'bg-sky-100 text-sky-600'}`}>{selSlots.length}</span> : ''}
                </p>
              </div>
              {selSlots.length === 0 ? (
                <p className={`text-[11px] ${tm} py-1 pl-3.5`}>No slots scheduled.</p>
              ) : (
                <div className={`rounded-xl overflow-hidden divide-y ${isDark ? 'divide-white/[0.05] bg-white/[0.03] border border-white/[0.05]' : 'divide-gray-100 bg-white border border-gray-200/80 shadow-sm'}`}>
                  {selSlots.map(s => {
                    const times = (s.time_ranges?.length ? s.time_ranges : [{ time_start: s.time_start, time_end: s.time_end }])
                      .map(r => `${to12h(r.time_start.slice(0,5))} – ${to12h(r.time_end.slice(0,5))}`)
                      .join(', ');
                    return (
                      <div key={s.id} className={`flex items-center gap-2.5 px-3 py-2.5 transition-colors ${isDark ? 'hover:bg-white/[0.03]' : 'hover:bg-gray-50'}`}>
                        <span className={`w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center ${isDark ? 'bg-sky-500/10 text-sky-400' : 'bg-sky-100 text-sky-600'}`}>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"/>
                          </svg>
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[11px] font-semibold truncate ${tp}`}>{times}</p>
                          {s.location && <p className={`text-[10px] ${tm} truncate`}>{s.location}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Notes section */}
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

export default function ProfessorDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('home');
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [pastSlotsOpen, setPastSlotsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const [profileCard, setProfileCard] = useState<{ id: number; role: 'professor' | 'student' } | null>(null);

  // Complete modal
  const [completingConsult, setCompletingConsult] = useState<Consultation | null>(null);
  const [completeForm, setCompleteForm] = useState({ action_taken: '', referral: '', referral_specify: '', remarks: '' });
  const [completeError, setCompleteError] = useState('');

  // Reschedule modal
  const [reschedulingConsult, setReschedulingConsult] = useState<Consultation | null>(null);
  const [rescheduleForm, setRescheduleForm] = useState({ referral: '', referral_specify: '', remarks: '' });
  const [rescheduleError, setRescheduleError] = useState('');

  // History page
  const [histSearch,     setHistSearch]     = useState('');
  const [histStatus,     setHistStatus]     = useState<'all' | 'completed' | 'rescheduled' | 'missed'>('all');
  const [expandedHistId, setExpandedHistId] = useState<number | null>(null);
  const [histNotes,      setHistNotes]      = useState<Record<number, { action_taken: string; remarks: string }>>({});
  const [histSaving,     setHistSaving]     = useState<number | null>(null);

  // Export filters
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');
  const [exportStatus, setExportStatus] = useState<'all' | 'pending' | 'confirmed' | 'completed' | 'cancelled'>('all');
  const [exportOrientation, setExportOrientation] = useState<'portrait' | 'landscape'>('landscape');

  // Add schedule
  const [newSched, setNewSched] = useState({ day: 'Monday', location: '', time_ranges: [{ time_start: '', time_end: '' }] as TimeRange[] });
  const [newSchedDate, setNewSchedDate] = useState('');
  const [newSchedMode, setNewSchedMode] = useState<'F2F' | 'Online'>('F2F');
  const [schedError, setSchedError] = useState('');
  const [showConfirmSched, setShowConfirmSched] = useState(false);
  const [pendingSched, setPendingSched] = useState<typeof newSched | null>(null);

  // Edit schedule modal
  const [editingScheduleSlot, setEditingScheduleSlot] = useState<Schedule | null>(null);
  const [editSched, setEditSched] = useState({ day: 'Monday', location: '', time_ranges: [{ time_start: '', time_end: '' }] as TimeRange[] });
  const [editSchedDate, setEditSchedDate] = useState('');
  const [editSchedError, setEditSchedError] = useState('');
  const [showConfirmEdit, setShowConfirmEdit] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<{ id: number; date: string } & typeof editSched | null>(null);

  const [downloadingForm, setDownloadingForm] = useState<number | null>(null);

  // Meeting link modal (for confirming OL consultations)
  const [meetingLinkConsult, setMeetingLinkConsult] = useState<Consultation | null>(null);
  const [meetingLinkInput, setMeetingLinkInput] = useState('');

  // Edit meeting link modal (for already-confirmed OL consultations)
  const [editLinkConsult, setEditLinkConsult] = useState<Consultation | null>(null);
  const [editLinkInput, setEditLinkInput] = useState('');

  // Cancel modal
  const [cancellingConsult, setCancellingConsult] = useState<Consultation | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');

  // My Consultations — search / filter / sort
  const [consultSearch,       setConsultSearch]       = useState('');
  const [consultStatusFilter, setConsultStatusFilter] = useState<'all' | 'pending' | 'confirmed'>('all');
  const [consultSortBy,       setConsultSortBy]       = useState<'date' | 'name' | 'status'>('date');

  // Bulk selection
  const [selectedIds,     setSelectedIds]     = useState<Set<number>>(new Set());
  const [bulkCancelOpen,  setBulkCancelOpen]  = useState(false);
  const [bulkCancelReason,setBulkCancelReason]= useState('');
  const [bulkCancelError, setBulkCancelError] = useState('');

  // Profile
  const [profile, setProfile] = useState<ProfProfile>({ full_name: '', department: '', email: '', phone: '', avatar: null });

  // Home-tab data
  const [term, setTerm] = useState<TermConfig>(CURRENT_TERM);
  const [calOverrides, setCalOverrides] = useState<CalendarOverride[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  // Leaderboards
  const [lbProfs,    setLbProfs]    = useState<LeaderboardItem[]>([]);
  const [lbStudents, setLbStudents] = useState<LeaderboardItem[]>([]);
  const [lbTopics,   setLbTopics]   = useState<LeaderboardItem[]>([]);
  const [lbView, setLbView]         = useState<'rankings' | 'consulted'>('rankings');

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

  useEffect(() => {
    // One-time migration: clear any stale 'dark' set by old defaults and reset to light.
    // 'consulta-theme-v2' acts as a marker so this only runs once per browser.
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

  const toggleTheme = () => {
    const next = !isDark;
    localStorage.setItem('consulta-theme', next ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    window.dispatchEvent(new CustomEvent('consulta-theme-change', { detail: { dark: next } }));
    setIsDark(next);
  };

  // Auth guard — confirm token + role before rendering anything
  useEffect(() => {
    const t = localStorage.getItem('token');
    const r = localStorage.getItem('role');
    if (!t) { router.push('/login'); return; }
    if (r !== 'professor') { router.push('/dashboard/home'); return; }
    setAuthReady(true);
  }, [router]);

  // Data fetch — only runs once auth is confirmed
  useEffect(() => {
    if (!authReady) return;
    const vParam = new URLSearchParams(window.location.search).get('view');
    if (vParam && (['home','consultations','calendar','schedules','export','history','profile'] as string[]).includes(vParam)) setTab(vParam as Tab);
    fetchAll();
  }, [authReady]);

  // Auto-mark past pending/confirmed as missed, then refresh consultation list
  const markMissed = async () => {
    try {
      const data = await api.post('/api/consultations/mark-missed', {}, token!);
      if (data.marked > 0) {
        const c = await api.get('/api/consultations', token!);
        setConsultations(Array.isArray(c) ? c : []);
      }
    } catch {}
  };

  // Trigger mark-missed whenever professor opens Calendar or My Consultations
  useEffect(() => {
    if (!authReady || !token) return;
    if (tab === 'calendar' || tab === 'consultations') markMissed();
  }, [tab, authReady]);

  const fetchAll = async () => {
    // Mark overdue consultations before loading so the list is already accurate
    await api.post('/api/consultations/mark-missed', {}, token!);
    const [c, s, prof, ann, cal, termData, lbP, lbT, lbS] = await Promise.all([
      api.get('/api/consultations', token!),
      api.get('/api/schedules/mine', token!),
      api.get('/api/auth/profile', token!),
      fetch(`${API_URL}/api/announcements`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_URL}/api/calendar`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_URL}/api/settings/term`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null).catch(() => null),
      api.get('/api/leaderboard/professors', token!),
      api.get('/api/leaderboard/topics', token!),
      api.get('/api/leaderboard/students', token!),
    ]);
    const freshConsults: Consultation[] = Array.isArray(c) ? c : [];
    const profEmail = !prof.error ? (prof.email || 'default') : 'default';
    const profSeenKey = `consulta-prof-seen-ids-${profEmail}`;
    try {
      const prevRaw = localStorage.getItem(profSeenKey);
      const prevIds: number[] | null = prevRaw ? JSON.parse(prevRaw) : null;
      if (prevIds !== null) {
        const prevIdSet = new Set(prevIds);
        for (const fc of freshConsults) {
          if (!prevIdSet.has(fc.id) && fc.status === 'pending') {
            const dateStr = fc.date ? new Date(fc.date.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '';
            toast.info(`New booking: ${fc.student_name} scheduled a consultation${dateStr ? ` on ${dateStr}` : ''}.`);
          }
        }
      }
      localStorage.setItem(profSeenKey, JSON.stringify(freshConsults.map(fc => fc.id)));
    } catch { /* */ }
    setConsultations(freshConsults);
    setSchedules(Array.isArray(s) ? s : []);
    if (Array.isArray(ann)) setAnnouncements(ann);
    if (Array.isArray(cal)) setCalOverrides(cal);
    if (termData && !termData.error) setTerm(buildTermFromConfig(termData as RawTermConfig));
    setLbProfs(Array.isArray(lbP) ? lbP.map((r: any) => ({ rank: r.rank, label: r.name, count: r.count })) : []);
    setLbStudents(Array.isArray(lbS) ? lbS.map((r: any) => ({ rank: r.rank, label: r.name, count: r.count })) : []);
    setLbTopics(Array.isArray(lbT) ? lbT : []);
    if (!prof.error) {
      const avatarVal = prof.avatar || null;
      setProfile({
        full_name: prof.full_name || '',
        department: prof.department || '',
        email: prof.email || '',
        phone: prof.phone || '',
        avatar: avatarVal,
      });
      const fullAvatarUrl = avatarVal && !avatarVal.startsWith('/uploads/') ? avatarVal : null;
      if (fullAvatarUrl) localStorage.setItem('consulta-avatar', fullAvatarUrl);
      else localStorage.removeItem('consulta-avatar');
      window.dispatchEvent(new CustomEvent('consulta-avatar-change', { detail: { url: fullAvatarUrl } }));
      localStorage.setItem('consulta-name', prof.full_name || '');
    }
    setLoading(false);
  };

  const handleConfirm = async (id: number, meetingLink?: string) => {
    const body = meetingLink ? { meeting_link: meetingLink } : {};
    const data = await api.patch(`/api/consultations/${id}/confirm`, body, token!);
    if (data.error) { toast.error(data.error); return; }
    fetchAll();
  };

  const handleConfirmWithLink = async () => {
    if (!meetingLinkConsult) return;
    await handleConfirm(meetingLinkConsult.id, meetingLinkInput.trim() || undefined);
    setMeetingLinkConsult(null);
    setMeetingLinkInput('');
  };

  const handleSaveMeetingLink = async () => {
    if (!editLinkConsult) return;
    const data = await api.patch(`/api/consultations/${editLinkConsult.id}/meeting-link`, { meeting_link: editLinkInput.trim() || null }, token!);
    if (data.error) { toast.error(data.error); return; }
    setEditLinkConsult(null);
    setEditLinkInput('');
    fetchAll();
  };

  const openCancelModal = (c: Consultation) => {
    setCancellingConsult(c);
    setCancelReason('');
    setCancelError('');
  };

  const handleCancel = async () => {
    if (!cancellingConsult) return;
    if (!cancelReason.trim()) { setCancelError('Please provide a reason for cancellation.'); return; }
    setCancelError('');
    const data = await api.patch(`/api/consultations/${cancellingConsult.id}/cancel`, { cancel_reason: cancelReason.trim() }, token!);
    if (data.error) { setCancelError(data.error); return; }
    setCancellingConsult(null);
    fetchAll();
  };

  const openCompleteModal = (c: Consultation) => {
    setCompletingConsult(c);
    setCompleteForm({ action_taken: '', referral: '', referral_specify: '', remarks: '' });
    setCompleteError('');
  };

  const handleComplete = async () => {
    if (!completingConsult) return;
    if (!completeForm.action_taken) { setCompleteError('Please select an action taken.'); return; }
    if (completeForm.action_taken === 'Referred to' && !completeForm.referral) {
      setCompleteError('Please select a referral option.'); return;
    }
    if (completeForm.referral === 'Other Office (Please Specify)' && !completeForm.referral_specify.trim()) {
      setCompleteError('Please specify the other office.'); return;
    }
    setCompleteError('');
    const data = await api.patch(`/api/consultations/${completingConsult.id}/complete`, completeForm, token!);
    if (data.error) { setCompleteError(data.error); return; }
    setCompletingConsult(null);
    fetchAll();
  };

  // ── Bulk actions ────────────────────────────────────────────────────────────
  const handleBulkConfirm = async () => {
    const toConfirm = visibleConsultations.filter(c => selectedIds.has(c.id) && c.status === 'pending');
    if (!toConfirm.length) return;
    await Promise.all(toConfirm.map(c => api.patch(`/api/consultations/${c.id}/confirm`, {}, token!)));
    clearSelection();
    fetchAll();
    toast.success(`${toConfirm.length} consultation${toConfirm.length !== 1 ? 's' : ''} confirmed.`);
  };

  const handleBulkCancel = async () => {
    if (!bulkCancelReason.trim()) { setBulkCancelError('Please provide a cancellation reason.'); return; }
    const toCancel = visibleConsultations.filter(c => selectedIds.has(c.id));
    if (!toCancel.length) return;
    setBulkCancelError('');
    await Promise.all(toCancel.map(c => api.patch(`/api/consultations/${c.id}/cancel`, { cancel_reason: bulkCancelReason.trim() }, token!)));
    setBulkCancelOpen(false);
    setBulkCancelReason('');
    clearSelection();
    fetchAll();
    toast.success(`${toCancel.length} consultation${toCancel.length !== 1 ? 's' : ''} cancelled.`);
  };

  const openRescheduleModal = (c: Consultation) => {
    setReschedulingConsult(c);
    setRescheduleForm({ referral: '', referral_specify: '', remarks: '' });
    setRescheduleError('');
  };

  const handleReschedule = async () => {
    if (!reschedulingConsult) return;
    setRescheduleError('');
    const data = await api.patch(`/api/consultations/${reschedulingConsult.id}/reschedule`, rescheduleForm, token!);
    if (data.error) { setRescheduleError(data.error); return; }
    setReschedulingConsult(null);
    fetchAll();
  };

  const handleDownloadStudentForm = async (id: number) => {
    setDownloadingForm(id);
    try {
      const res = await fetch(`${API_URL}/api/forms/download/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const e = await res.json(); toast.error(e.error || 'Download failed.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `student-form-${id}`; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingForm(null);
    }
  };

  // Schedule add — show confirmation dialog first
  const handleRequestAddSchedule = () => {
    setSchedError('');
    if (!newSchedDate) { setSchedError('Please select a date.'); return; }
    if (newSched.time_ranges.length === 0) { setSchedError('At least one time range is required.'); return; }
    for (const r of newSched.time_ranges) {
      if (!r.time_start || !r.time_end) { setSchedError('Please fill in all time range fields.'); return; }
      if (r.time_start >= r.time_end) { setSchedError('End time must be after start time in each range.'); return; }
    }
    const resolvedLocation = newSchedMode === 'Online' ? 'Online Only' : newSched.location;
    setPendingSched({ ...newSched, location: resolvedLocation });
    setShowConfirmSched(true);
  };

  const handleConfirmAddSchedule = async () => {
    if (!pendingSched) return;
    setShowConfirmSched(false);
    const payload = { ...pendingSched, date: newSchedDate };
    const data = await api.post('/api/schedules', payload, token!);
    if (data.error) { setSchedError(data.error); return; }
    setNewSched({ day: 'Monday', location: '', time_ranges: [{ time_start: '', time_end: '' }] });
    setNewSchedDate('');
    setNewSchedMode('F2F');
    setPendingSched(null);
    fetchAll();
  };

  // Schedule edit modal
  const openEditModal = (s: Schedule) => {
    setEditingScheduleSlot(s);
    setEditSched({
      day: s.day,
      location: s.location || '',
      time_ranges: s.time_ranges?.length
        ? s.time_ranges.map(r => ({ time_start: r.time_start.slice(0, 5), time_end: r.time_end.slice(0, 5) }))
        : [{ time_start: s.time_start.slice(0, 5), time_end: s.time_end.slice(0, 5) }],
    });
    setEditSchedDate(s.date || '');
    setEditSchedError('');
  };

  const handleRequestEditSchedule = () => {
    setEditSchedError('');
    if (!editSchedDate) { setEditSchedError('Please select a date.'); return; }
    if (editSched.time_ranges.length === 0) { setEditSchedError('At least one time range is required.'); return; }
    for (const r of editSched.time_ranges) {
      if (!r.time_start || !r.time_end) { setEditSchedError('Please fill in all time range fields.'); return; }
      if (r.time_start >= r.time_end) { setEditSchedError('End time must be after start time in each range.'); return; }
    }
    setPendingEdit({ id: editingScheduleSlot!.id, ...editSched, date: editSchedDate });
    setShowConfirmEdit(true);
  };

  const handleConfirmEditSchedule = async () => {
    if (!pendingEdit) return;
    const { id, ...body } = pendingEdit;
    setShowConfirmEdit(false);
    const data = await api.patch(`/api/schedules/${id}`, body, token!);
    if (data.error) { setEditSchedError(data.error); return; }
    setEditingScheduleSlot(null);
    setPendingEdit(null);
    fetchAll();
  };

  const handleDeleteSchedule = (id: number) => {
    openConfirm(
      'Delete Schedule Slot',
      'Are you sure you want to delete this schedule slot? This cannot be undone.',
      async () => {
        closeConfirm();
        const data = await api.delete(`/api/schedules/${id}`, token!);
        if (data.error) { toast.error(data.error); return; }
        fetchAll();
      }
    );
  };

  const getExportRows = () => {
    return consultations.filter(c => {
      if (exportStatus !== 'all' && c.status !== exportStatus) return false;
      if (exportDateFrom && c.date < exportDateFrom) return false;
      if (exportDateTo && c.date > exportDateTo) return false;
      return true;
    });
  };

  const handleExport = (format: 'excel' | 'pdf') => {
    const rows = getExportRows();
    if (rows.length === 0) { toast.error('No records match the selected filters.'); return; }

    const profName = profile.full_name || 'Professor';
    const dateLabel = exportDateFrom || exportDateTo
      ? `${exportDateFrom || '—'} to ${exportDateTo || '—'}`
      : 'All dates';

    const tableData = rows.map(c => [
      c.student_name,
      c.student_number,
      c.program || '—',
      fmtDate(c.date, { year: 'numeric', month: 'short', day: 'numeric' }),
      fmtTime(c),
      c.mode || '—',
      natureLabel(c),
      actionLabel(c.action_taken, c.referral, c.referral_specify),
      c.status.charAt(0).toUpperCase() + c.status.slice(1),
    ]);

    const headers = ['Student Name', 'Student No.', 'Program', 'Date', 'Time', 'Mode', 'Nature of Advising', 'Action Taken', 'Status'];

    if (format === 'pdf') {
      const doc = new jsPDF({ orientation: exportOrientation, unit: 'pt', format: 'letter' });
      const pageW = doc.internal.pageSize.getWidth();

      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('MAPUA UNIVERSITY', pageW / 2, 40, { align: 'center' });
      doc.setFontSize(11);
      doc.text('School of Information Technology', pageW / 2, 56, { align: 'center' });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Faculty Academic Advising Record', pageW / 2, 72, { align: 'center' });

      doc.setFontSize(9);
      doc.text(`Adviser: ${profName}`, 40, 96);
      doc.text(`Period: ${dateLabel}`, 40, 110);
      doc.text(`Status: ${exportStatus === 'all' ? 'All' : exportStatus.charAt(0).toUpperCase() + exportStatus.slice(1)}`, 40, 124);
      doc.text(`Generated: ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}`, 40, 138);

      autoTable(doc, {
        head: [headers],
        body: tableData,
        startY: 155,
        styles: { fontSize: 7.5, cellPadding: 4 },
        headStyles: { fillColor: [204, 0, 0], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        columnStyles: {
          0: { cellWidth: 90 },
          1: { cellWidth: 68 },
          2: { cellWidth: 68 },
          3: { cellWidth: 68 },
          4: { cellWidth: 68 },
          5: { cellWidth: 42 },
          6: { cellWidth: 'auto' },
          7: { cellWidth: 72 },
          8: { cellWidth: 60 },
        },
        margin: { left: 40, right: 40 },
      });

      doc.save(`advising-report-${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })}.pdf`);
    } else {
      const wsData = [headers, ...tableData];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [20, 14, 14, 14, 10, 8, 30, 16, 12].map(w => ({ wch: w }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Advising Records');
      XLSX.writeFile(wb, `advising-report-${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })}.xlsx`);
    }
    toast.success(`${format === 'pdf' ? 'PDF' : 'Excel'} downloaded (${rows.length} record${rows.length !== 1 ? 's' : ''}).`);
  };

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const visibleConsultations = consultations.filter(
    c => (c.status === 'pending' || c.status === 'confirmed') && c.date >= todayStr
  );
  const stats = {
    total: visibleConsultations.length,
    pending: visibleConsultations.filter(c => c.status === 'pending').length,
    confirmed: visibleConsultations.filter(c => c.status === 'confirmed').length,
  };

  // Filtered + sorted list for the My Consultations tab
  const displayedConsultations = visibleConsultations
    .filter(c => {
      const q = consultSearch.trim().toLowerCase();
      const matchSearch = !q || c.student_name.toLowerCase().includes(q) || c.student_number.toLowerCase().includes(q);
      const matchStatus = consultStatusFilter === 'all' || c.status === consultStatusFilter;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      if (consultSortBy === 'name')   return a.student_name.localeCompare(b.student_name);
      if (consultSortBy === 'status') return a.status.localeCompare(b.status);
      const dateA = a.date + (a.time_start || a.time || '');
      const dateB = b.date + (b.time_start || b.time || '');
      return dateA.localeCompare(dateB);
    });

  const toggleSelect    = (id: number) => setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const selectAll       = ()           => setSelectedIds(new Set(displayedConsultations.map(c => c.id)));
  const clearSelection  = ()           => setSelectedIds(new Set());
  const allSelected     = displayedConsultations.length > 0 && displayedConsultations.every(c => selectedIds.has(c.id));
  const someSelected    = displayedConsultations.some(c => selectedIds.has(c.id));

  const natureLabel = (c: Consultation) => {
    const items = parseNature(c.nature_of_advising);
    return items.map(i =>
      i === 'Others (Please Specify)' && c.nature_of_advising_specify
        ? `Others: ${c.nature_of_advising_specify}` : i
    ).join(', ') || '—';
  };

  const radioCls = (selected: boolean) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
      selected ? 'bg-[#0EA5E9]/10 ring-1 ring-[#0EA5E9]/30 text-white' : 'bg-[#2d2d2d] text-gray-400 hover:bg-white/5'
    }`;

  const radioBtn = (selected: boolean) => (
    <span className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center ${
      selected ? 'border-[#0EA5E9] bg-[#0EA5E9]' : 'border-gray-600'
    }`}>
      {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
    </span>
  );

  const fieldCls = isDark
    ? 'px-3 py-2 rounded-lg text-white text-sm bg-[#1e1e1e] border border-white/10 focus:outline-none focus:border-[#0EA5E9]/50'
    : 'px-3 py-2 rounded-lg text-gray-900 text-sm bg-white border border-gray-300 focus:outline-none focus:border-[#0EA5E9]/60';

  // Calendar: group consultations by date for the calendar view
  const bookedByDate = visibleConsultations.reduce<Record<string, Consultation[]>>((acc, c) => {
    if (!acc[c.date]) acc[c.date] = [];
    acc[c.date].push(c);
    return acc;
  }, {});

  // ── Home-tab derived values ──────────────────────────────────────────────────
  const now = new Date();
  const currentWeek = getAcademicWeek(term, now);
  const calModeMap = new Map(
    calOverrides.filter(o => o.type === 'mode_override' && o.week_number && o.value)
      .map(o => [o.week_number!, o.value!])
  );
  const currentMode = currentWeek ? (calModeMap.get(currentWeek) ?? getWeekMode(term, currentWeek)) : null;
  const nextWeekNum = currentWeek && currentWeek < term.totalWeeks ? currentWeek + 1 : null;
  const nextMode = nextWeekNum ? (calModeMap.get(nextWeekNum) ?? getWeekMode(term, nextWeekNum)) : null;
  const { finalsDate, endDate } = getTermDates(term);
  const daysToFinals = daysUntil(finalsDate, now);
  const daysToEnd   = daysUntil(endDate, now);
  const termProgress = getTermProgress(term, now);

  // This-week window (Mon–Sun)
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const toLocalDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const mondayStr = toLocalDateStr(monday);
  const sundayStr = toLocalDateStr(sunday);

  const thisWeek  = consultations.filter(c => c.date >= mondayStr && c.date <= sundayStr);
  const scheduledCount = thisWeek.filter(c => c.status === 'pending' || c.status === 'confirmed').length;
  const completedCount = thisWeek.filter(c => c.status === 'completed').length;
  const pendingCount   = thisWeek.filter(c => c.status === 'pending').length;
  const totalStudents  = new Set(consultations.map(c => c.student_id)).size;

  // Today's consultations (for Today's Schedule sidebar widget)
  const todayConsultations = consultations
    .filter(c => c.date === todayStr && (c.status === 'pending' || c.status === 'confirmed'))
    .sort((a, b) => (a.time || a.time_start).localeCompare(b.time || b.time_start));

  // Greeting
  const greetingHour = now.getHours();
  const greetingWord = greetingHour < 12 ? 'Good morning' : greetingHour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = profile.full_name.trim().split(/\s+/)[0] ?? '';

  // Calendar event maps for sidebar mini-calendar
  const dateLabelMap = new Map(
    calOverrides.filter(o => o.type === 'date_label' && o.date && o.value).map(o => [o.date!, o.value!])
  );
  const dateColorMap = new Map(
    calOverrides.filter(o => o.type === 'date_label' && o.date).map(o => [o.date!, o.color ?? 'red'])
  );

  // Shared style helpers for the home tab
  const card      = isDark ? 'bg-[#252525] border border-white/5 shadow-[0_10px_40px_rgba(0,0,0,0.60),0_4px_12px_rgba(0,0,0,0.40)] hover:shadow-[0_20px_60px_rgba(0,0,0,0.75),0_8px_20px_rgba(0,0,0,0.50)] hover:-translate-y-0.5 transition-all duration-200' : 'bg-white border border-sky-100 shadow-[0_8px_30px_rgba(0,0,0,0.22),0_3px_10px_rgba(0,0,0,0.14),0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_16px_48px_rgba(0,0,0,0.28),0_6px_16px_rgba(0,0,0,0.16),0_2px_6px_rgba(0,0,0,0.10)] hover:-translate-y-0.5 transition-all duration-200';
  const tp        = isDark ? 'text-white'    : 'text-gray-900';
  const ts        = isDark ? 'text-gray-400' : 'text-gray-500';
  const tm        = isDark ? 'text-gray-400' : 'text-gray-500';
  const modePill  = (m: string) => m === 'Online'
    ? isDark ? 'bg-blue-500/20 text-blue-300'      : 'bg-blue-50 text-blue-600'
    : isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-50 text-emerald-700';
  const modeDot   = (m: string) => m === 'Online' ? 'bg-blue-400' : 'bg-emerald-400';
  const cardRaw    = isDark ? 'bg-[#252525]' : 'bg-white';
  const innerCard  = isDark ? 'bg-white/[0.03] border-white/5' : 'bg-gray-50 border-gray-100';
  const dividerCls = isDark ? 'divide-white/5' : 'divide-gray-100';
  const borderSoft = isDark ? 'border-white/5' : 'border-gray-200';
  const borderMid  = isDark ? 'border-white/10' : 'border-gray-200';
  const hoverBg    = isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-gray-50/80';

  const btnPrimary   = 'bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-[10px] transition-colors duration-150';
  const btnSecondary = 'border border-white/20 text-gray-300 bg-transparent font-medium rounded-[10px] transition-colors duration-150 hover:bg-white/8 hover:border-white/30';
  const btnDanger    = 'border border-red-400/40 text-red-400 bg-transparent font-semibold rounded-[10px] transition-colors duration-150 hover:bg-red-500/10 hover:border-red-400/60';
  const btnSuccess   = 'bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-[10px] transition-colors duration-150';

  const handleTabChange = (next: ProfessorTab) => {
    setTab(next);
    router.replace(`?view=${next}`, { scroll: false });
  };

  // Block all rendering until token + role are confirmed — prevents flash of wrong layout
  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: isDark ? '#1e2235' : '#EEF2FF' }}>
        <div className="w-8 h-8 border-2 border-[#0EA5E9] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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
        role="professor"
        navItems={PROF_NAV_ITEMS}
        activeTab={tab === 'profile' ? 'home' : tab}
        onTabChange={(t) => handleTabChange(t as ProfessorTab)}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        profileName={profile.full_name}
        profileAvatar={profile.avatar}
        pendingConsultations={consultations.filter(c => c.status === 'pending')}
        announcements={announcements}
        storageKey={`prof_read_notifs_${profile.email || 'default'}`}
      />

      {/* ── Content area ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="lg:hidden h-14 flex-shrink-0" />

      {/* Confirmation dialogs */}
      {showConfirmSched && pendingSched && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-[#252525] border border-white/10 rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-white font-bold text-lg mb-4">Confirm New Schedule</h2>
            <div className="space-y-2 mb-5">
              <p className="text-gray-400 text-sm"><span className="text-gray-600">Date:</span> {newSchedDate ? new Date(newSchedDate + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : pendingSched.day}</p>
              {pendingSched.time_ranges.map((r, i) => (
                <p key={i} className="text-gray-400 text-sm"><span className="text-gray-600">Range {i + 1}:</span> {r.time_start} – {r.time_end}</p>
              ))}
              {pendingSched.location && <p className="text-gray-400 text-sm"><span className="text-gray-600">Location:</span> {pendingSched.location}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirmSched(false)} className={`flex-1 py-2 text-sm ${btnSecondary}`}>Cancel</button>
              <button onClick={handleConfirmAddSchedule} className={`flex-1 py-2 text-sm ${btnPrimary}`}>Save Schedule</button>
            </div>
          </div>
        </div>
      )}

      {editLinkConsult && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-[#252525] border border-white/10 rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-white font-bold text-lg mb-1">Edit Meeting Link</h2>
            <p className="text-gray-500 text-sm mb-5">Update the Zoom or Google Meet link for this consultation.</p>
            <div className="mb-5">
              <label className="text-gray-500 text-xs mb-1.5 block">Meeting Link</label>
              <input
                type="url"
                placeholder="https://zoom.us/j/... or https://meet.google.com/..."
                value={editLinkInput}
                onChange={e => setEditLinkInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveMeetingLink()}
                className="w-full px-3 py-2 rounded-lg text-white text-sm bg-[#1e1e1e] border border-white/10 focus:outline-none focus:border-[#0EA5E9]/50 placeholder-gray-600"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setEditLinkConsult(null); setEditLinkInput(''); }} className={`flex-1 py-2 text-sm ${btnSecondary}`}>Cancel</button>
              <button onClick={handleSaveMeetingLink} className={`flex-1 py-2 text-sm ${btnPrimary}`}>Save</button>
            </div>
          </div>
        </div>
      )}

      {meetingLinkConsult && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-[#252525] border border-white/10 rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-white font-bold text-lg mb-1">Confirm Online Consultation</h2>
            <p className="text-gray-500 text-sm mb-5">Provide a Zoom or Google Meet link for the student to join.</p>
            <div className="mb-5">
              <label className="text-gray-500 text-xs mb-1.5 block">Meeting Link</label>
              <input
                type="url"
                placeholder="https://zoom.us/j/... or https://meet.google.com/..."
                value={meetingLinkInput}
                onChange={e => setMeetingLinkInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConfirmWithLink()}
                className="w-full px-3 py-2 rounded-lg text-white text-sm bg-[#1e1e1e] border border-white/10 focus:outline-none focus:border-[#0EA5E9]/50 placeholder-gray-600"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setMeetingLinkConsult(null); setMeetingLinkInput(''); }} className={`flex-1 py-2 text-sm ${btnSecondary}`}>Cancel</button>
              <button onClick={handleConfirmWithLink} className={`flex-1 py-2 text-sm ${btnSuccess}`}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {showConfirmEdit && pendingEdit && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-[#252525] border border-white/10 rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-white font-bold text-lg mb-4">Confirm Schedule Edit</h2>
            <div className="space-y-2 mb-5">
              <p className="text-gray-400 text-sm"><span className="text-gray-600">Date:</span> {pendingEdit.date ? new Date(pendingEdit.date + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : pendingEdit.day}</p>
              {pendingEdit.time_ranges.map((r, i) => (
                <p key={i} className="text-gray-400 text-sm"><span className="text-gray-600">Range {i + 1}:</span> {r.time_start} – {r.time_end}</p>
              ))}
              {pendingEdit.location && <p className="text-gray-400 text-sm"><span className="text-gray-600">Location:</span> {pendingEdit.location}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirmEdit(false)} className={`flex-1 py-2 text-sm ${btnSecondary}`}>Cancel</button>
              <button onClick={handleConfirmEditSchedule} className={`flex-1 py-2 text-sm ${btnPrimary}`}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-8 h-8 border-2 border-[#0EA5E9] border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600 text-sm">Loading...</p>
          </div>

        ) : tab === 'home' ? (() => {
            const termStart = term.start instanceof Date ? term.start : new Date(term.start as string);
            const termConsults = consultations.filter(c => new Date(c.date) >= termStart);
            const tApproved   = termConsults.filter(c => c.status === 'confirmed').length;
            const tCompleted  = termConsults.filter(c => c.status === 'completed').length;
            const tPending    = termConsults.filter(c => c.status === 'pending').length;
            const tTotal      = termConsults.length;
            const approvedThisWeek = thisWeek.filter(c => c.status === 'confirmed').length;

            // Bar chart data: Mon–Sat
            const CHART_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const weekMonday = new Date(now);
            const _dow = now.getDay();
            weekMonday.setDate(now.getDate() + (_dow === 0 ? -6 : 1 - _dow));
            weekMonday.setHours(0, 0, 0, 0);
            const chartBars = CHART_DAYS.map((lbl, i) => {
              const d = new Date(weekMonday);
              d.setDate(weekMonday.getDate() + i);
              const ds = toLocalDateStr(d);
              const items = consultations.filter(c => c.date.slice(0, 10) === ds && c.status !== 'cancelled');
              return {
                label: lbl,
                date: ds,
                isToday: ds === todayStr,
                // for the stacked bar: pending bucket includes missed (past pending that weren't attended)
                pending:   items.filter(c => c.status === 'pending' || c.status === 'missed').length,
                // confirmed bucket includes completed (resolved consultations)
                confirmed: items.filter(c => c.status === 'confirmed' || c.status === 'completed').length,
                completed: items.filter(c => c.status === 'completed').length,
                total: items.length,
              };
            });
            const initials = profile.full_name.split(' ').filter(Boolean).map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

            return (
            <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">

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
                    {visibleConsultations.length > 0
                      ? `You have ${stats.pending} pending and ${stats.confirmed} confirmed this week.`
                      : 'No upcoming consultations this week.'}
                  </p>
                </div>
                {/* Quick pills */}
                <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0 sm:mt-1">
                  {currentWeek && (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${isDark ? 'bg-sky-500/15 text-sky-400' : 'bg-sky-100 text-sky-700'}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                      Week {currentWeek} of {term.totalWeeks}
                    </span>
                  )}
                  {pendingCount > 0 && (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      {pendingCount} pending
                    </span>
                  )}
                  {approvedThisWeek > 0 && (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-100 text-blue-700'}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                      {approvedThisWeek} approved this week
                    </span>
                  )}
                </div>
              </div>

              {/* ── Section 2: Stat cards + Rankings panel ── */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_35%] gap-4 lg:items-stretch">

                {/* Stat cards — fill row height set by Rankings panel */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {([
                    {
                      value: tTotal,
                      label: 'Total Requests',
                      sub: 'this term',
                      numColor: '#0EA5E9', darkNumColor: '#7DD3FC',
                      lightBg: 'linear-gradient(135deg, #EEF2FF, #DBEAFE)', lightBorder: '#BFDBFE',
                      darkBg: 'linear-gradient(135deg, rgba(14,165,233,0.25), rgba(14,165,233,0.12))', darkBorder: 'rgba(56,189,248,0.2)',
                      lightShadow: '0 8px 30px rgba(14,165,233,0.32), 0 3px 12px rgba(0,0,0,0.14), 0 1px 4px rgba(0,0,0,0.08)',
                      lightHoverShadow: '0 16px 48px rgba(14,165,233,0.42), 0 6px 18px rgba(0,0,0,0.16), 0 2px 6px rgba(0,0,0,0.09)',
                      darkShadow: '0 10px 40px rgba(14,165,233,0.20), 0 4px 12px rgba(14,165,233,0.12)',
                      darkHoverShadow: '0 20px 60px rgba(14,165,233,0.30), 0 8px 20px rgba(14,165,233,0.18)',
                    },
                    {
                      value: tApproved,
                      label: 'Approved',
                      sub: 'confirmations',
                      numColor: '#7C3AED', darkNumColor: '#C4B5FD',
                      lightBg: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)', lightBorder: '#DDD6FE',
                      darkBg: 'linear-gradient(135deg, rgba(124,58,237,0.25), rgba(124,58,237,0.12))', darkBorder: 'rgba(167,139,250,0.2)',
                      lightShadow: '0 8px 30px rgba(124,58,237,0.32), 0 3px 12px rgba(0,0,0,0.14), 0 1px 4px rgba(0,0,0,0.08)',
                      lightHoverShadow: '0 16px 48px rgba(124,58,237,0.42), 0 6px 18px rgba(0,0,0,0.16), 0 2px 6px rgba(0,0,0,0.09)',
                      darkShadow: '0 10px 40px rgba(124,58,237,0.20), 0 4px 12px rgba(124,58,237,0.12)',
                      darkHoverShadow: '0 20px 60px rgba(124,58,237,0.30), 0 8px 20px rgba(124,58,237,0.18)',
                    },
                    {
                      value: tCompleted,
                      label: 'Completed',
                      sub: 'sessions done',
                      numColor: '#059669', darkNumColor: '#6EE7B7',
                      lightBg: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)', lightBorder: '#A7F3D0',
                      darkBg: 'linear-gradient(135deg, rgba(5,150,105,0.25), rgba(5,150,105,0.12))', darkBorder: 'rgba(52,211,153,0.2)',
                      lightShadow: '0 8px 30px rgba(5,150,105,0.32), 0 3px 12px rgba(0,0,0,0.14), 0 1px 4px rgba(0,0,0,0.08)',
                      lightHoverShadow: '0 16px 48px rgba(5,150,105,0.42), 0 6px 18px rgba(0,0,0,0.16), 0 2px 6px rgba(0,0,0,0.09)',
                      darkShadow: '0 10px 40px rgba(5,150,105,0.20), 0 4px 12px rgba(5,150,105,0.12)',
                      darkHoverShadow: '0 20px 60px rgba(5,150,105,0.30), 0 8px 20px rgba(5,150,105,0.18)',
                    },
                    {
                      value: totalStudents,
                      label: 'Students',
                      sub: 'unique advisees',
                      numColor: '#7C3AED', darkNumColor: '#C4B5FD',
                      lightBg: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)', lightBorder: '#DDD6FE',
                      darkBg: 'linear-gradient(135deg, rgba(124,58,237,0.30), rgba(168,85,247,0.15))', darkBorder: 'rgba(192,132,252,0.2)',
                      lightShadow: '0 8px 30px rgba(124,58,237,0.32), 0 3px 12px rgba(0,0,0,0.14), 0 1px 4px rgba(0,0,0,0.08)',
                      lightHoverShadow: '0 16px 48px rgba(124,58,237,0.42), 0 6px 18px rgba(0,0,0,0.16), 0 2px 6px rgba(0,0,0,0.09)',
                      darkShadow: '0 10px 40px rgba(124,58,237,0.20), 0 4px 12px rgba(124,58,237,0.12)',
                      darkHoverShadow: '0 20px 60px rgba(124,58,237,0.30), 0 8px 20px rgba(124,58,237,0.18)',
                    },
                  ] as const).map(s => (
                    <div
                      key={s.label}
                      className="rounded-2xl p-5 border h-[200px] flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5"
                      style={{
                        background: isDark ? s.darkBg : s.lightBg,
                        borderColor: isDark ? s.darkBorder : s.lightBorder,
                        boxShadow: isDark ? s.darkShadow : s.lightShadow,
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = isDark ? s.darkHoverShadow : s.lightHoverShadow; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = isDark ? s.darkShadow : s.lightShadow; }}
                    >
                      <div>
                        <p className="text-4xl sm:text-5xl font-black leading-none tracking-tight"
                          style={{ color: isDark ? s.darkNumColor : s.numColor }}>{s.value}</p>
                        <p className={`text-sm font-semibold mt-3 uppercase tracking-wide ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{s.label}</p>
                        <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{s.sub}</p>
                      </div>
                      <div className="h-1 rounded-full opacity-20"
                        style={{ background: isDark ? s.darkNumColor : s.numColor }} />
                    </div>
                  ))}
                </div>

                {/* Rankings panel */}
                <div className={`rounded-2xl border p-4 flex flex-col ${card}`} style={{ height: '200px' }}>

                  {/* Tab toggle */}
                  <div className="flex-shrink-0 flex gap-1.5 mb-3">
                    {(['rankings', 'consulted'] as const).map(v => (
                      <button key={v} onClick={() => setLbView(v)}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all border ${
                          lbView === v
                            ? isDark ? 'bg-sky-500/15 text-sky-300 border-sky-500/40' : 'bg-sky-50 text-sky-700 border-sky-300'
                            : isDark ? 'bg-transparent text-gray-400 border-white/15 hover:text-gray-300 hover:border-white/25' : 'bg-transparent text-gray-500 border-gray-300 hover:text-gray-700 hover:border-gray-400'
                        }`}>
                        {v === 'rankings' ? 'Rankings' : 'Top Topics'}
                      </button>
                    ))}
                  </div>

                  {/* Scrollable tab content */}
                  <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-400/30">

                    {/* Rankings: 2-column with center divider */}
                    {lbView === 'rankings' && (
                      <div className="grid gap-3 h-full" style={{ gridTemplateColumns: '1fr 1px 1fr' }}>

                        {/* Top Professors */}
                        <div className="min-w-0">
                          <div className={`flex items-center gap-1 px-1.5 py-1 rounded-md mb-1.5 ${isDark ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
                            <span className="text-[10px] leading-none">🏆</span>
                            <p className={`text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>Professors</p>
                          </div>
                          <div className="space-y-0.5">
                            {lbProfs.slice(0, 3).map((item, i) => {
                              const isMe = item.label === profile.full_name;
                              return (
                                <div key={item.rank} className={`flex items-center gap-1 py-1 px-1 rounded-lg transition-colors ${isMe ? (isDark ? 'bg-amber-500/20 ring-1 ring-amber-500/30' : 'bg-amber-100 ring-1 ring-amber-300/60') : (isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-gray-50')}`}>
                                  <span className="text-xs leading-none w-4 text-center flex-shrink-0">{['🥇','🥈','🥉'][i]}</span>
                                  <span className={`flex-1 text-[10px] truncate font-semibold min-w-0 ${isMe ? (isDark ? 'text-amber-300' : 'text-amber-700') : ts}`}>{item.label}</span>
                                  {isMe && <span className={`text-[8px] font-black px-1 py-0.5 rounded-full flex-shrink-0 leading-none ${isDark ? 'bg-amber-500/30 text-amber-300' : 'bg-amber-400 text-white'}`}>you</span>}
                                  <span className={`text-[10px] font-black tabular-nums flex-shrink-0 ${isMe ? (isDark ? 'text-amber-300' : 'text-amber-600') : tp}`}>{item.count}</span>
                                </div>
                              );
                            })}
                            {lbProfs.length === 0 && <p className={`text-[10px] ${tm} py-1 px-1`}>No data.</p>}
                          </div>
                        </div>

                        {/* Vertical divider */}
                        <div className={`self-stretch ${isDark ? 'bg-white/[0.06]' : 'bg-gray-200'}`} />

                        {/* Top Students */}
                        <div className="min-w-0">
                          <div className={`flex items-center gap-1 px-1.5 py-1 rounded-md mb-1.5 ${isDark ? 'bg-sky-500/10' : 'bg-sky-50'}`}>
                            <span className="text-[10px] leading-none">🎓</span>
                            <p className={`text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-sky-400' : 'text-sky-600'}`}>Students</p>
                          </div>
                          <div className="space-y-0.5">
                            {lbStudents.slice(0, 3).map((item, i) => (
                              <div key={item.rank} className={`flex items-center gap-1 py-1 px-1 rounded-lg transition-colors ${isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-gray-50'}`}>
                                <span className="text-xs leading-none w-4 text-center flex-shrink-0">{['🥇','🥈','🥉'][i]}</span>
                                <span className={`flex-1 text-[10px] truncate font-semibold min-w-0 ${ts}`}>{item.label}</span>
                                <span className={`text-[10px] font-black tabular-nums flex-shrink-0 ${tp}`}>{item.count}</span>
                              </div>
                            ))}
                            {lbStudents.length === 0 && <p className={`text-[10px] ${tm} py-1 px-1`}>No data.</p>}
                          </div>
                        </div>

                      </div>
                    )}

                    {/* Top Topics */}
                    {lbView === 'consulted' && (() => {
                      const RANK_CFG = [
                        { medal: '🥇', border: 'border-amber-400', rowBg: isDark ? 'bg-amber-400/[0.10]' : 'bg-amber-50', fill: 'from-amber-400 to-yellow-300', track: isDark ? 'bg-white/[0.07]' : 'bg-amber-200/60' },
                        { medal: '🥈', border: 'border-slate-400',  rowBg: isDark ? 'bg-slate-400/[0.10]'  : 'bg-slate-50',  fill: 'from-slate-400 to-slate-300',  track: isDark ? 'bg-white/[0.07]' : 'bg-slate-200/60'  },
                        { medal: '🥉', border: 'border-orange-400', rowBg: isDark ? 'bg-orange-400/[0.10]' : 'bg-orange-50', fill: 'from-orange-500 to-amber-400', track: isDark ? 'bg-white/[0.07]' : 'bg-orange-200/60' },
                      ];
                      const top3 = lbTopics.slice(0, 3);
                      const topCount = top3[0]?.count || 1;
                      return (
                        <div>
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className="text-xs leading-none">🔥</span>
                            <p className={`text-[10px] font-bold uppercase tracking-wider ${tm}`}>Trending topics</p>
                          </div>
                          {top3.length === 0 ? (
                            <p className={`text-xs ${tm} py-1`}>No consultation data yet.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {top3.map((t, i) => {
                                const cfg = RANK_CFG[i];
                                const pct = Math.max(8, Math.round((t.count / topCount) * 100));
                                return (
                                  <div key={t.label} className={`rounded-lg border-l-[3px] overflow-hidden cursor-default transition-colors ${cfg.border} ${isDark ? 'hover:brightness-110' : 'hover:brightness-95'}`}>
                                    <div className={`px-2 py-1.5 ${cfg.rowBg}`}>
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-sm leading-none w-4 text-center flex-shrink-0">{cfg.medal}</span>
                                        <span className={`flex-1 text-[11px] font-semibold truncate ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{t.label}</span>
                                        <span className={`text-sm font-black tabular-nums flex-shrink-0 ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.count}</span>
                                      </div>
                                      <div className={`mt-1.5 ml-5 h-1 rounded-full overflow-hidden ${cfg.track}`}>
                                        <div className={`h-full rounded-full bg-gradient-to-r ${cfg.fill} transition-all duration-500`} style={{ width: `${pct}%` }} />
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

                </div>
              </div>

              {/* ── Section 3: Widget grid ── */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

                {/* Profile + term card */}
                <div className={`lg:col-span-4 rounded-2xl overflow-hidden border ${card}`}>
                  <div className={`px-5 pt-5 pb-4 ${isDark ? 'bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-transparent' : 'bg-gradient-to-br from-sky-50 to-blue-50/30'}`}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0 ring-2 ring-[#0EA5E9]/30" style={{ background: 'linear-gradient(135deg, #0369A1, #0EA5E9)' }}>
                        {profile.avatar && !profile.avatar.startsWith('/uploads/')
                          ? <img src={profile.avatar} alt={profile.full_name} className="w-full h-full object-cover" />
                          : <span className="text-lg font-bold" style={{ color: '#fff' }}>{initials}</span>}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-bold truncate ${tp}`}>{profile.full_name}</p>
                        <p className={`text-xs ${ts}`}>{profile.department || 'Professor'}</p>
                        <p className="text-[10px] mt-0.5 font-medium text-sky-400">MAPUA SOIT</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0369A1] to-[#0EA5E9] flex flex-col items-center justify-center flex-shrink-0 shadow-lg shadow-sky-900/30">
                        <span className="text-white text-2xl font-black leading-none">{currentWeek ?? '–'}</span>
                        <span className="text-sky-100 text-[8px] font-bold uppercase tracking-wide">WK</span>
                      </div>
                      <div>
                        <p className={`text-base font-bold ${tp}`}>{currentWeek ? `Week ${currentWeek} of ${term.totalWeeks}` : 'Not active'}</p>
                        <p className={`text-[10px] ${tm}`}>{term.label}</p>
                      </div>
                    </div>
                  </div>

                  <div className={`px-5 pt-4 pb-5 border-t space-y-3 ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                    {/* Term progress bar */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-xs font-medium ${ts}`}>Term Progress</span>
                        <span className="text-xs font-bold text-emerald-500">{Math.round(termProgress)}%</span>
                      </div>
                      <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-white/8' : 'bg-gray-100'}`}>
                        <div className="h-full bg-gradient-to-r from-[#0369A1] to-[#0EA5E9] rounded-full transition-all duration-700" style={{ width: `${termProgress}%` }} />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className={`text-[9px] ${tm}`}>Start</span>
                        <span className={`text-[9px] ${tm}`}>Finals W{term.finalsWeek}</span>
                        <span className={`text-[9px] ${tm}`}>End</span>
                      </div>
                    </div>
                    {/* Milestone metrics */}
                    {([
                      { label: 'Days to Finals',    value: daysToFinals,   color: 'text-orange-400', dot: 'bg-orange-400' },
                      { label: 'Days to End',        value: daysToEnd,      color: 'text-pink-400',   dot: 'bg-pink-400'   },
                      { label: 'Weeks Remaining',    value: currentWeek ? Math.max(0, term.totalWeeks - currentWeek) : term.totalWeeks, color: 'text-blue-400', dot: 'bg-blue-400' },
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
                      onClick={() => handleTabChange('export')}
                      className="w-full mt-1 py-2 rounded-xl text-xs font-semibold transition-all bg-gradient-to-r from-[#0369A1] to-[#0EA5E9] text-white hover:from-[#0284c7] hover:to-[#38bdf8] shadow-md shadow-sky-900/30 hover:shadow-sky-500/30 hover:-translate-y-0.5"
                    >
                      Export Records
                    </button>
                  </div>
                </div>

                {/* Weekly overview: metric chips + bar chart + today */}
                <div className={`lg:col-span-8 rounded-2xl border p-5 flex flex-col ${card}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className={`text-sm font-semibold ${tp}`}>Weekly Overview</h3>
                      <p className={`text-xs ${tm} mt-0.5`}>Consultations breakdown for this week</p>
                    </div>
                    <button onClick={() => handleTabChange('consultations')} className="text-xs text-sky-400 hover:text-sky-300 font-medium transition-colors flex-shrink-0">
                      View all →
                    </button>
                  </div>

                  {/* Metric chips row */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {([
                      { label: 'Upcoming',  value: scheduledCount, bg: isDark ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'       : 'bg-blue-50 text-blue-600 border-blue-100'       },
                      { label: 'Completed', value: completedCount, bg: isDark ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-100' },
                      { label: 'Pending',   value: pendingCount,   bg: isDark ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'     : 'bg-amber-50 text-amber-700 border-amber-100'     },
                    ] as const).map(s => (
                      <span key={s.label} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${s.bg}`}>
                        <span className="text-sm font-black leading-none">{s.value}</span>
                        {s.label}
                      </span>
                    ))}
                  </div>

                  {/* 7-day pill strip — full width, taller pills */}
                  <div className="flex gap-1.5 mt-2">
                    {chartBars.map(b => (
                      <div
                        key={b.label}
                        className={`flex-1 flex flex-col items-center justify-between py-4 px-1 rounded-xl transition-colors ${
                          b.isToday
                            ? 'bg-[#0EA5E9] shadow-md shadow-sky-500/25'
                            : b.total > 0
                              ? isDark
                                ? 'bg-white/[0.06] ring-1 ring-white/[0.08]'
                                : 'bg-white ring-1 ring-gray-200 shadow-sm'
                              : isDark
                                ? 'bg-white/[0.025] ring-1 ring-white/[0.04]'
                                : 'bg-gray-50 ring-1 ring-gray-100'
                        }`}
                      >
                        {/* Day label */}
                        <span className={`text-[10px] font-bold uppercase tracking-widest leading-none ${
                          b.isToday
                            ? 'text-sky-100'
                            : isDark
                              ? b.total > 0 ? 'text-gray-400' : 'text-gray-600'
                              : b.total > 0 ? 'text-gray-500' : 'text-gray-400'
                        }`}>
                          {b.label}
                        </span>

                        {/* Count */}
                        <span className={`text-2xl font-black leading-none my-2 ${
                          b.isToday
                            ? 'text-white'
                            : b.total > 0
                              ? isDark ? 'text-white' : 'text-gray-800'
                              : isDark ? 'text-gray-700' : 'text-gray-300'
                        }`}>
                          {b.total > 0 ? b.total : '–'}
                        </span>

                        {/* Status dots */}
                        <div className="flex gap-1 h-2 items-center justify-center">
                          {b.pending > 0 && (
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              b.isToday ? 'bg-amber-300 ring-1 ring-white/80' : 'bg-amber-400'
                            }`} />
                          )}
                          {b.confirmed > 0 && (
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              b.isToday ? 'bg-emerald-300 ring-1 ring-white/80' : 'bg-emerald-400'
                            }`} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Today's Schedule — full-width section below the pills */}
                  <div className={`mt-4 pt-3 border-t ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      Today's Schedule
                    </p>
                    {todayConsultations.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {todayConsultations.map(c => {
                          const isPending   = c.status === 'pending';
                          const isConfirmed = c.status === 'confirmed';
                          return (
                            <div key={c.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${isDark ? 'bg-white/[0.03] hover:bg-white/[0.05]' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}>
                              <span className={`text-[11px] font-mono tabular-nums w-10 flex-shrink-0 ${tm}`}>
                                {(c.time || c.time_start)?.slice(0, 5)}
                              </span>
                              <div className={`w-px h-3.5 flex-shrink-0 ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />
                              <span className={`text-xs font-semibold flex-1 truncate ${tp}`}>
                                {c.student_name}
                              </span>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                                isPending
                                  ? isDark ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-50 text-amber-700'
                                  : isConfirmed
                                    ? isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700'
                                    : isDark ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'
                              }`}>
                                {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                              </span>
                              <span className={`text-[10px] flex-shrink-0 ${tm}`}>
                                {c.mode === 'F2F' ? 'F2F' : 'Online'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className={`flex items-center gap-2 py-3 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                        </svg>
                        <span className="text-xs">No consultations scheduled for today</span>
                      </div>
                    )}
                  </div>

                  {/* Legend */}
                  <div className={`mt-4 pt-3 border-t flex items-center gap-4 ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span className={`text-[10px] ${tm}`}>Pending</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className={`text-[10px] ${tm}`}>Confirmed</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#0EA5E9]" />
                      <span className={`text-[10px] ${tm}`}>Today</span>
                    </div>
                  </div>
                </div>

              </div>{/* /widget grid */}

              {/* ── Section 4: Full Calendar ── */}
              <ProfCalendar
                consultations={consultations}
                schedules={schedules}
                dateLabelMap={dateLabelMap}
                dateColorMap={dateColorMap}
                isDark={isDark}
                calOverrides={calOverrides}
                profKey={profile.email || 'prof'}
              />


            </div>
            );
          })()

        : tab === 'consultations' ? (
          <div className="px-3 sm:px-8 py-5 sm:py-8">
            <div className="mb-5 sm:mb-7">
              <h1 className={`text-2xl font-bold ${tp}`}>My Consultations</h1>
              <p className="text-gray-500 text-sm mt-1">Review and manage student consultation requests</p>
            </div>

            {/* ── Stats ── */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: 'Total',     value: stats.total,     color: tp },
                { label: 'Pending',   value: stats.pending,   color: 'text-amber-400' },
                { label: 'Confirmed', value: stats.confirmed, color: 'text-blue-400' },
              ].map(s => (
                <div key={s.label} className={`rounded-xl px-4 py-3 ${card}`}>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className={`text-xs mt-0.5 ${tm}`}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* ── Search / Filter / Sort bar ── */}
            <div className={`rounded-2xl border p-4 mb-4 flex flex-col sm:flex-row gap-3 ${card}`}>
              {/* Search */}
              <div className="relative flex-1 min-w-0">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={consultSearch}
                  onChange={e => setConsultSearch(e.target.value)}
                  placeholder="Search by name or student number…"
                  className={`w-full pl-9 pr-3 py-2 rounded-xl text-sm ${fieldCls}`}
                />
              </div>
              {/* Status filter chips */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {(['all', 'pending', 'confirmed'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setConsultStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      consultStatusFilter === s
                        ? s === 'pending'
                          ? isDark ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40' : 'bg-amber-100 text-amber-700 ring-1 ring-amber-300'
                        : s === 'confirmed'
                          ? isDark ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/40' : 'bg-sky-100 text-sky-700 ring-1 ring-sky-300'
                        : isDark ? 'bg-white/10 text-white ring-1 ring-white/20' : 'bg-gray-200 text-gray-700 ring-1 ring-gray-300'
                        : isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-white/5' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              {/* Sort */}
              <select
                value={consultSortBy}
                onChange={e => setConsultSortBy(e.target.value as typeof consultSortBy)}
                className={`rounded-xl text-xs py-2 px-3 flex-shrink-0 ${fieldCls}`}
              >
                <option value="date">Sort: Date</option>
                <option value="name">Sort: Name</option>
                <option value="status">Sort: Status</option>
              </select>
            </div>

            {/* ── Bulk action toolbar ── */}
            {someSelected && (
              <div className={`rounded-2xl border px-4 py-3 mb-4 flex items-center gap-3 flex-wrap ${isDark ? 'bg-sky-500/10 border-sky-500/30' : 'bg-sky-50 border-sky-200'}`}>
                <span className="text-sky-400 text-sm font-semibold flex-shrink-0">
                  {selectedIds.size} selected
                </span>
                <div className="flex items-center gap-2 flex-wrap flex-1">
                  {displayedConsultations.some(c => selectedIds.has(c.id) && c.status === 'pending') && (
                    <button
                      onClick={() => openConfirm(
                        'Confirm Selected',
                        `Confirm ${displayedConsultations.filter(c => selectedIds.has(c.id) && c.status === 'pending').length} pending consultation(s)?`,
                        handleBulkConfirm
                      )}
                      className={`px-3 py-1.5 text-xs ${btnSuccess}`}>
                      Confirm ({displayedConsultations.filter(c => selectedIds.has(c.id) && c.status === 'pending').length} pending)
                    </button>
                  )}
                  <button
                    onClick={() => { setBulkCancelOpen(true); setBulkCancelReason(''); setBulkCancelError(''); }}
                    className={`px-3 py-1.5 text-xs ${btnDanger}`}>
                    Cancel ({selectedIds.size})
                  </button>
                </div>
                <button onClick={clearSelection} className="text-gray-500 hover:text-gray-300 transition-colors text-xs flex-shrink-0">
                  Clear
                </button>
              </div>
            )}

            {visibleConsultations.length === 0 ? (
              <div className={`flex flex-col items-center justify-center py-24 rounded-2xl ${card}`}>
                <p className={`font-medium text-sm ${ts}`}>No consultations yet</p>
                <p className={`text-xs mt-1 ${tm}`}>Students will appear here once they book a slot</p>
              </div>
            ) : displayedConsultations.length === 0 ? (
              <div className={`flex flex-col items-center justify-center py-16 rounded-2xl ${card}`}>
                <svg className="w-8 h-8 text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className={`font-medium text-sm ${ts}`}>No results</p>
                <p className={`text-xs mt-1 ${tm}`}>Try a different search or filter</p>
                <button onClick={() => { setConsultSearch(''); setConsultStatusFilter('all'); }} className="mt-3 text-xs text-sky-400 hover:text-sky-300 transition-colors">
                  Clear filters
                </button>
              </div>
            ) : (
              <>
                {/* Select-all row */}
                <div className="flex items-center gap-2 px-1 mb-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => allSelected ? clearSelection() : selectAll()}
                    className="w-4 h-4 rounded accent-sky-500 cursor-pointer"
                  />
                  <span className={`text-xs ${tm}`}>
                    {allSelected ? 'Deselect all' : `Select all ${displayedConsultations.length}`}
                  </span>
                </div>

                <div className="space-y-3">
                  {displayedConsultations.map(c => (
                    <div
                      key={c.id}
                      className={`rounded-2xl overflow-hidden transition-all ${card} ${
                        selectedIds.has(c.id)
                          ? isDark ? 'ring-2 ring-sky-500/50' : 'ring-2 ring-sky-400'
                          : isDark ? 'hover:border-white/10' : 'hover:border-gray-300'
                      }`}
                    >
                      <div className="p-5">
                        <div className="flex items-start gap-3">
                          {/* Checkbox */}
                          <input
                            type="checkbox"
                            checked={selectedIds.has(c.id)}
                            onChange={() => toggleSelect(c.id)}
                            className="mt-1 w-4 h-4 rounded accent-sky-500 cursor-pointer flex-shrink-0"
                          />
                          {/* Avatar */}
                          <button
                            type="button"
                            onClick={() => setProfileCard({ id: c.student_id, role: 'student' })}
                            className="flex-shrink-0 hover:opacity-75 transition-opacity rounded-full focus:outline-none"
                            title="View profile"
                          >
                            <Avatar name={c.student_name} avatarUrl={c.student_avatar} />
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => setProfileCard({ id: c.student_id, role: 'student' })}
                                className={`font-semibold text-sm transition-colors text-left ${isDark ? 'text-white hover:text-gray-300' : 'text-gray-900 hover:text-gray-600'}`}
                              >
                                {c.student_name}
                              </button>
                              <StatusBadge status={c.status} isDark={isDark} />
                            </div>
                            <p className="text-gray-500 text-xs mt-0.5">{c.student_number} · {c.program}</p>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div className={`rounded-lg border px-3 py-2.5 ${innerCard}`}>
                            <p className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${tm}`}>Date & Time</p>
                            <p className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                              {fmtDate(c.date, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                            <p className={`text-xs mt-0.5 ${ts}`}>{c.day} · {fmtTime(c)}</p>
                          </div>
                          <div className={`rounded-lg border px-3 py-2.5 ${innerCard}`}>
                            <p className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${tm}`}>Meeting</p>
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.mode === 'F2F' ? 'bg-purple-400' : 'bg-cyan-400'}`} />
                              <span className={`text-sm font-medium ${c.mode === 'F2F' ? 'text-purple-300' : 'text-cyan-300'}`}>
                                {c.mode === 'F2F' ? 'Face-to-Face' : 'Online'}
                              </span>
                            </div>
                            {c.mode === 'F2F' && c.location && (
                              <p className="text-gray-500 text-xs mt-0.5 truncate">{c.location}</p>
                            )}
                            {c.mode === 'OL' && c.meeting_link && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <a href={c.meeting_link} target="_blank" rel="noopener noreferrer"
                                  className="text-cyan-400 text-xs truncate hover:underline flex-1 min-w-0">
                                  Join Meeting →
                                </a>
                                {c.status === 'confirmed' && (
                                  <button
                                    onClick={() => { setEditLinkConsult(c); setEditLinkInput(c.meeting_link || ''); }}
                                    className="text-gray-600 hover:text-gray-300 transition-colors flex-shrink-0 p-0.5 rounded"
                                    title="Edit meeting link">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 0 1 2.828 2.828L11.828 15.828a2 2 0 0 1-1.414.586H7v-3a2 2 0 0 1 .586-1.414z" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            )}
                            {c.mode === 'OL' && c.status === 'confirmed' && !c.meeting_link && (
                              <button
                                onClick={() => { setEditLinkConsult(c); setEditLinkInput(''); }}
                                className="text-cyan-600 hover:text-cyan-400 text-xs mt-0.5 transition-colors">
                                + Add Meeting Link
                              </button>
                            )}
                          </div>
                        </div>

                        <div className={`mt-3 rounded-lg border px-3 py-2.5 ${innerCard}`}>
                          <p className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${tm}`}>Nature of Advising</p>
                          <p className={`text-sm line-clamp-2 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{natureLabel(c)}</p>
                        </div>
                        {c.notes && (
                          <div className={`mt-2 rounded-lg border px-3 py-2.5 ${isDark ? 'bg-sky-500/[0.06] border-sky-500/15' : 'bg-sky-50 border-sky-100'}`}>
                            <p className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${isDark ? 'text-sky-400/70' : 'text-sky-600/70'}`}>Student&apos;s Note</p>
                            <p className={`text-xs leading-relaxed ${isDark ? 'text-sky-200/80' : 'text-sky-800'}`}>{c.notes}</p>
                          </div>
                        )}

                        <div className="mt-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {c.uploaded_form_path && (
                              <button
                                onClick={() => handleDownloadStudentForm(c.id)}
                                disabled={downloadingForm === c.id}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20 hover:bg-blue-500/20 transition-colors disabled:opacity-50">
                                {downloadingForm === c.id
                                  ? <span className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                                  : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0-3-3m3 3 3-3M3 17V7a2 2 0 0 1 2-2h6l2 2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                                }
                                Student Form
                              </button>
                            )}
                          </div>

                          {(c.status === 'pending' || c.status === 'confirmed') && (
                            <div className="flex flex-wrap items-center gap-2">
                              {c.status === 'pending' && (
                                <button
                                  onClick={() => c.mode === 'OL'
                                    ? (setMeetingLinkConsult(c), setMeetingLinkInput(''))
                                    : handleConfirm(c.id)}
                                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-green-500 hover:bg-green-600 text-white">
                                  <Check className="w-3.5 h-3.5" />
                                  Confirm
                                </button>
                              )}
                              <button onClick={() => openCancelModal(c)}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${isDark ? 'border-red-400/60 text-red-400 hover:bg-red-950/60' : 'border-red-400 text-red-600 hover:bg-red-50'}`}>
                                <X className="w-3.5 h-3.5" />
                                Cancel
                              </button>
                              <button onClick={() => openRescheduleModal(c)}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${isDark ? 'border-slate-500/60 text-slate-400 hover:bg-slate-700/40' : 'border-slate-400 text-slate-600 hover:bg-slate-100'}`}>
                                <CalendarClock className="w-3.5 h-3.5" />
                                Reschedule
                              </button>
                              <button onClick={() => openCompleteModal(c)}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-blue-500 hover:bg-blue-600 text-white">
                                <CheckCheck className="w-3.5 h-3.5" />
                                Mark Completed
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

        ) : tab === 'calendar' ? (
          <div className="px-3 sm:px-8 py-5 sm:py-8">
            <div className="mb-5 sm:mb-7">
              <h1 className={`text-2xl font-bold ${tp}`}>Booking Calendar</h1>
              <p className="text-gray-500 text-sm mt-1">Matrix view of consultation schedule by time and day</p>
            </div>

            {/* ── Matrix calendar ── */}
            <div className="mb-6 sm:mb-8">
              <MatrixCalendar consultations={consultations} isDark={isDark} />
            </div>

            {/* ── Date-grouped list ── */}
            <p className={`text-[11px] font-semibold uppercase tracking-widerst mb-3 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
              Upcoming Bookings List
            </p>
            {visibleConsultations.length === 0 ? (
              <div className={`flex flex-col items-center justify-center py-12 rounded-2xl ${card}`}>
                <p className={`text-sm ${ts}`}>No upcoming bookings</p>
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(bookedByDate)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([date, consultList]) => {
                    const isPast = new Date(date) < new Date(new Date().toDateString());
                    return (
                      <div key={date} className={`rounded-2xl overflow-hidden ${cardRaw} ${isPast ? `border ${borderSoft} opacity-60` : `border ${borderMid}`}`}>
                        <div className={`px-5 py-3 border-b ${borderSoft} flex items-center justify-between`}>
                          <div>
                            <p className={`font-semibold text-sm ${tp}`}>
                              {new Date(date).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${isPast ? 'bg-gray-500/10 text-gray-500' : 'bg-sky-500/10 text-sky-400'}`}>
                              {isPast ? 'Past' : 'Upcoming'}
                            </span>
                            <span className="text-gray-600 text-xs">{consultList.length} booking{consultList.length !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                        <div className={`divide-y ${dividerCls}`}>
                          {consultList.map(c => (
                            <div key={c.id} className="px-5 py-3 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <Avatar name={c.student_name} avatarUrl={c.student_avatar} size="sm" />
                                <div>
                                  <p className={`text-sm font-medium ${tp}`}>{c.student_name}</p>
                                  <p className={`text-xs ${tm}`}>{fmtTime(c)} · {c.mode === 'F2F' ? 'Face-to-Face' : 'Online'}</p>
                                </div>
                              </div>
                              <StatusBadge status={c.status} isDark={isDark} />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Slot availability summary */}
            {(() => {
              const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
              const upcomingSlots = schedules
                .filter(s => s.date && s.date >= todayStr)
                .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.time_start.localeCompare(b.time_start));
              return (
                <div className="mt-8">
                  <p className={`text-[11px] font-semibold uppercase tracking-widerst mb-3 ${tm}`}>Your Slots ({upcomingSlots.length})</p>
                  {upcomingSlots.length === 0 ? (
                    <div className={`text-center py-10 rounded-2xl ${card}`}>
                      <p className={`text-sm ${ts}`}>No slots created yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {upcomingSlots.map(s => {
                        const booked = Number(s.upcoming_count) > 0;
                        return (
                          <div key={s.id} className={`flex items-center justify-between px-4 py-3 rounded-xl ${card}`}>
                            <div className="flex items-center gap-3">
                              <span className={`w-2 h-2 rounded-full ${booked ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                              <span className={`text-sm ${tp}`}>
                                {new Date(s.date! + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}
                              </span>
                              <span className={`text-sm font-mono ${ts}`}>{s.time_start?.slice(0, 5)} – {s.time_end?.slice(0, 5)}</span>
                            </div>
                            <span className={`text-xs ${booked ? 'text-amber-400' : 'text-emerald-400'}`}>
                              {booked ? `${s.upcoming_count} booked` : 'Available'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

        ) : tab === 'schedules' ? (
          <div className="px-3 sm:px-8 py-5 sm:py-8">
            <div className="mb-5 sm:mb-7">
              <h1 className={`text-2xl font-bold ${tp}`}>Manage Schedules</h1>
              <p className="text-gray-500 text-sm mt-1">Add or edit your available consultation time slots</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* ── Left: Add new slot form ── */}
              <div className={`rounded-2xl p-5 ${card}`}>
                <p className={`text-sm font-semibold mb-4 ${tp}`}>Add New Slot</p>

                {/* Date */}
                <div className="mb-3">
                  <Label className="text-gray-500 text-xs mb-1.5 block">Date</Label>
                  <ScheduleDatePicker
                    selected={newSchedDate}
                    onSelect={(dateStr, dayName) => { setNewSchedDate(dateStr); setNewSched(s => ({ ...s, day: dayName })); }}
                    disabledDates={schedules.map(s => s.date).filter((d): d is string => !!d)}
                    isDark={isDark}
                  />
                </div>

                {/* Mode toggle */}
                <div className="mb-3">
                  <Label className="text-gray-500 text-xs mb-1.5 block">Mode</Label>
                  <div className={`inline-flex rounded-lg p-0.5 ${isDark ? 'bg-white/5' : 'bg-gray-100'}`}>
                    {(['F2F', 'Online'] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setNewSchedMode(m)}
                        className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                          newSchedMode === m
                            ? m === 'Online'
                              ? 'bg-sky-500 text-white shadow-sm'
                              : isDark ? 'bg-white/10 text-white shadow-sm' : 'bg-white text-gray-800 shadow-sm'
                            : isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {m === 'F2F' ? 'Face-to-Face' : 'Online'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Location — only shown for F2F */}
                {newSchedMode === 'F2F' && (
                  <div className="mb-3">
                    <Label className="text-gray-500 text-xs mb-1.5 block">Location <span className={`font-normal ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>(optional)</span></Label>
                    <input
                      type="text"
                      value={newSched.location}
                      onChange={e => setNewSched(s => ({ ...s, location: e.target.value }))}
                      placeholder="e.g. Room 201"
                      className={`w-full ${fieldCls} ${isDark ? 'placeholder-gray-600' : 'placeholder-gray-400'}`}
                    />
                  </div>
                )}

                {/* Time Ranges */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-gray-500 text-xs">Time Ranges</Label>
                    <button type="button"
                      onClick={() => setNewSched(s => ({ ...s, time_ranges: [...s.time_ranges, { time_start: '', time_end: '' }] }))}
                      className="text-xs text-sky-400 hover:text-sky-300 transition-colors font-medium">
                      + Add Time Range
                    </button>
                  </div>
                  <div className="space-y-2">
                    {newSched.time_ranges.map((r, i) => (
                      <div key={i} className="flex items-end gap-2">
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-gray-600 text-[10px] mb-1 block">Start</Label>
                            <TimePicker
                              value={r.time_start}
                              onChange={v => setNewSched(s => ({ ...s, time_ranges: s.time_ranges.map((x, j) => j === i ? { ...x, time_start: v } : x) }))}
                              dark={isDark}
                            />
                          </div>
                          <div>
                            <Label className="text-gray-600 text-[10px] mb-1 block">End</Label>
                            <TimePicker
                              value={r.time_end}
                              onChange={v => setNewSched(s => ({ ...s, time_ranges: s.time_ranges.map((x, j) => j === i ? { ...x, time_end: v } : x) }))}
                              dark={isDark}
                            />
                          </div>
                        </div>
                        {newSched.time_ranges.length > 1 && (
                          <button type="button"
                            onClick={() => setNewSched(s => ({ ...s, time_ranges: s.time_ranges.filter((_, j) => j !== i) }))}
                            className={`pb-1.5 transition-colors text-lg leading-none ${isDark ? 'text-gray-600 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}>
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {schedError && <p className="text-red-400 text-xs mt-2">{schedError}</p>}
                <button onClick={handleRequestAddSchedule}
                  className={`mt-4 px-4 py-2 text-sm ${btnPrimary}`}>
                  Add Slot
                </button>
              </div>

              {/* ── Right: Slots list ── */}
              <div>
                {(() => {
                  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
                  const activeSlots = schedules.filter(s => s.date && s.date >= todayStr);
                  const pastSlots   = schedules.filter(s => s.date && s.date < todayStr)
                    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

                  const renderSlot = (s: Schedule, dimmed = false) => {
                    const hasBookings = Number(s.upcoming_count) > 0;
                    const isOnline = s.location?.toLowerCase().includes('online');
                    const timeStr = (s.time_ranges?.length ? s.time_ranges : [{ time_start: s.time_start, time_end: s.time_end }])
                      .map(r => `${to12h(r.time_start)}–${to12h(r.time_end)}`).join('  ·  ');
                    return (
                      <div key={s.id} className={`rounded-xl ${card} ${dimmed ? 'opacity-50' : ''}`}>
                        <div className="px-4 py-3.5">
                          {/* Row 1: date + action buttons */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-0.5 ${dimmed ? 'bg-gray-600' : hasBookings ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                              <span className={`text-sm font-semibold ${dimmed ? ts : tp}`}>
                                {s.date
                                  ? new Date(s.date + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                                  : s.day}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button onClick={() => openEditModal(s)} className={`px-2.5 py-1 text-xs ${btnSecondary}`}>Edit</button>
                              <button onClick={() => handleDeleteSchedule(s.id)} className={`px-2.5 py-1 text-xs ${btnDanger}`}>Remove</button>
                            </div>
                          </div>
                          {/* Row 2: time + tags */}
                          <div className="flex flex-wrap items-center gap-2 pl-[18px]">
                            <span className={`text-xs font-mono ${ts}`}>{timeStr}</span>
                            {s.location && (
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                isOnline
                                  ? isDark ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' : 'bg-sky-50 text-sky-700 border-sky-200'
                                  : isDark ? 'bg-white/5 text-gray-400 border-white/10' : 'bg-gray-100 text-gray-600 border-gray-200'
                              }`}>
                                {isOnline
                                  ? <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 11H4a1 1 0 110-2h3.586L5.293 7.707a1 1 0 010-1.414z"/></svg>
                                  : <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                }
                                {s.location}
                              </span>
                            )}
                            {!dimmed && (
                              <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                hasBookings
                                  ? isDark ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-amber-50 text-amber-700 border-amber-200'
                                  : isDark ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}>
                                {hasBookings ? `${s.upcoming_count} upcoming` : 'Available'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  };

                  return (
                    <>
                      {/* ── Active slots ── */}
                      <p className={`text-[11px] font-semibold uppercase tracking-wider mb-3 ${tm}`}>
                        Your Slots ({activeSlots.length})
                      </p>
                      {activeSlots.length === 0 ? (
                        <div className={`flex flex-col items-center justify-center py-14 rounded-2xl border-2 border-dashed ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-gray-200 bg-gray-50/60'}`}>
                          <svg className={`w-8 h-8 mb-3 ${isDark ? 'text-gray-700' : 'text-gray-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/>
                          </svg>
                          <p className={`text-sm font-medium mb-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No upcoming slots</p>
                          <p className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Add a slot using the form on the left</p>
                        </div>
                      ) : (
                        <div className="space-y-2">{activeSlots.map(s => renderSlot(s))}</div>
                      )}

                      {/* ── Past slots (collapsible) ── */}
                      {pastSlots.length > 0 && (
                        <div className="mt-4">
                          <button
                            onClick={() => setPastSlotsOpen(o => !o)}
                            className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider transition-colors mb-2 ${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}
                          >
                            <svg
                              className={`w-3 h-3 transition-transform duration-200 ${pastSlotsOpen ? 'rotate-90' : ''}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                            Past Slots ({pastSlots.length})
                          </button>
                          {pastSlotsOpen && (
                            <div className="space-y-2">{pastSlots.map(s => renderSlot(s, true))}</div>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

          </div>

        ) : tab === 'history' ? (
          <div className="px-3 sm:px-8 py-5 sm:py-8">
            {/* Header + search/filter */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5 sm:mb-6">
              <div className="flex-1">
                <h1 className={`text-2xl font-bold ${tp}`}>History</h1>
                <p className={`text-sm mt-0.5 ${ts}`}>Past advising records grouped by term</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm ${isDark ? 'bg-white/[0.04] border-white/10 text-gray-300' : 'bg-white border-gray-200 text-gray-700'}`}>
                  <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/></svg>
                  <input
                    value={histSearch}
                    onChange={e => setHistSearch(e.target.value)}
                    placeholder="Search student…"
                    className="bg-transparent outline-none placeholder-gray-400 w-36 text-sm"
                  />
                </div>
                <select
                  value={histStatus}
                  onChange={e => setHistStatus(e.target.value as typeof histStatus)}
                  className={`px-3 py-2 rounded-xl border text-sm outline-none cursor-pointer ${isDark ? 'bg-[#252535] border-white/10 text-gray-200' : 'bg-white border-gray-200 text-gray-700'}`}
                >
                  <option value="all">All statuses</option>
                  <option value="completed">Completed</option>
                  <option value="rescheduled">Rescheduled</option>
                  <option value="missed">Missed</option>
                </select>
              </div>
            </div>

            {(() => {
              const q = histSearch.toLowerCase().trim();
              const historyItems = consultations
                .filter(c => ['completed','rescheduled','missed'].includes(c.status))
                .filter(c => histStatus === 'all' || c.status === histStatus)
                .filter(c => !q || c.student_name?.toLowerCase().includes(q) || c.student_number?.toLowerCase().includes(q));

              if (consultations.filter(c => ['completed','rescheduled','missed'].includes(c.status)).length === 0) {
                return (
                  <div className={`flex flex-col items-center justify-center py-16 sm:py-24 rounded-2xl ${card}`}>
                    <p className={`font-medium text-sm ${ts}`}>No history yet</p>
                    <p className={`text-xs mt-1 ${tm}`}>Completed advising sessions will appear here</p>
                  </div>
                );
              }

              if (historyItems.length === 0) {
                return (
                  <div className={`flex flex-col items-center justify-center py-12 rounded-2xl ${card}`}>
                    <p className={`font-medium text-sm ${ts}`}>No results</p>
                    <p className={`text-xs mt-1 ${tm}`}>Try adjusting your search or filter</p>
                  </div>
                );
              }

              const saveNotes = async (c: Consultation) => {
                const draft = histNotes[c.id] ?? { action_taken: c.action_taken ?? '', remarks: c.remarks ?? '' };
                setHistSaving(c.id);
                const res = await fetch(`${API_URL}/api/consultations/${c.id}/notes`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ action_taken: draft.action_taken, remarks: draft.remarks }),
                });
                setHistSaving(null);
                if (res.ok) {
                  setConsultations(prev => prev.map(x => x.id === c.id
                    ? { ...x, action_taken: draft.action_taken || null, remarks: draft.remarks || null }
                    : x
                  ));
                }
              };

              return (
                <div className="space-y-8">
                  {groupByQuarter(historyItems).map(([quarter, items]) => {
                    const completedCount   = items.filter(c => c.status === 'completed').length;
                    const completionRate   = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;
                    return (
                      <div key={quarter}>
                        {/* Term header + summary */}
                        <div className="flex items-center gap-3 mb-3">
                          <p className={`text-[11px] font-semibold uppercase tracking-wider ${ts}`}>{quarter}</p>
                          <span className={`text-xs ${tm}`}>{items.length} session{items.length !== 1 ? 's' : ''}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700'}`}>
                            {completionRate}% completed
                          </span>
                        </div>

                        <div className={`rounded-2xl overflow-hidden ${card}`}>
                          <table className="w-full table-fixed">
                            <colgroup>
                              <col className="w-[96px]" />
                              <col className="w-[22%]" />
                              <col />
                              <col className="w-[20%]" />
                              <col className="w-[130px]" />
                            </colgroup>
                              <thead>
                                <tr className={`border-b ${borderSoft}`}>
                                  <th className={`text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3 ${tm}`}>Date</th>
                                  <th className={`text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3 ${tm}`}>Student</th>
                                  <th className={`text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3 ${tm}`}>Purpose</th>
                                  <th className={`text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3 ${tm}`}>Action Taken</th>
                                  <th className={`text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3 ${tm}`}>Status</th>
                                </tr>
                              </thead>
                              <tbody className={`divide-y ${dividerCls}`}>
                                {items.map(c => {
                                  const isExpanded = expandedHistId === c.id;
                                  const draft = histNotes[c.id] ?? { action_taken: c.action_taken ?? '', remarks: c.remarks ?? '' };
                                  const setDraft = (patch: Partial<typeof draft>) =>
                                    setHistNotes(prev => ({ ...prev, [c.id]: { ...draft, ...patch } }));

                                  return (
                                    <Fragment key={c.id}>
                                      {/* Main row */}
                                      <tr
                                        onClick={() => setExpandedHistId(isExpanded ? null : c.id)}
                                        className={`cursor-pointer transition-colors ${isExpanded
                                          ? isDark ? 'bg-sky-500/[0.08]' : 'bg-sky-50/80'
                                          : hoverBg
                                        }`}
                                      >
                                        <td className={`px-4 py-3 text-xs whitespace-nowrap ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                          <div className="flex items-center gap-1.5">
                                            <svg className={`w-3 h-3 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''} ${tm}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                                            {fmtDate(c.date, { month: 'short', day: 'numeric', year: 'numeric' })}
                                          </div>
                                        </td>
                                        <td className={`px-4 py-3 text-xs ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                          <p className="truncate font-medium">{c.student_name}</p>
                                          <p className={`text-[10px] mt-0.5 truncate ${tm}`}>{c.student_number}</p>
                                        </td>
                                        <td className={`px-4 py-3 text-xs ${ts} max-w-0`}>
                                          <span className="line-clamp-2 break-words">{natureLabel(c)}</span>
                                        </td>
                                        <td className={`px-4 py-3 text-xs ${ts} max-w-0`}>
                                          {c.action_taken
                                            ? <span className="line-clamp-2 break-words">{actionLabel(c.action_taken, c.referral, c.referral_specify)}</span>
                                            : <button
                                                onClick={e => { e.stopPropagation(); setExpandedHistId(c.id); }}
                                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${isDark ? 'border-sky-500/30 text-sky-400 hover:bg-sky-500/10' : 'border-sky-300 text-sky-600 hover:bg-sky-50'}`}
                                              >
                                                + Add note
                                              </button>
                                          }
                                        </td>
                                        <td className="px-4 py-3"><StatusBadge status={c.status} isDark={isDark} /></td>
                                      </tr>

                                      {/* Expanded detail row */}
                                      {isExpanded && (
                                        <tr key={`${c.id}-detail`}>
                                          <td colSpan={5} className={`px-4 py-0 overflow-hidden ${isDark ? 'bg-sky-500/[0.05]' : 'bg-sky-50/60'}`}>
                                            <div className={`py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 w-full overflow-hidden border-t ${isDark ? 'border-sky-500/10' : 'border-sky-100'}`}>

                                              {/* Left: full details */}
                                              <div className="space-y-3 min-w-0">
                                                <div>
                                                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${tm}`}>Full Purpose</p>
                                                  <p className={`text-xs leading-relaxed break-words ${ts}`}>{natureLabel(c) || '—'}</p>
                                                </div>
                                                <div className="flex gap-6 flex-wrap">
                                                  <div>
                                                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${tm}`}>Mode</p>
                                                    <p className={`text-xs ${ts}`}>{c.mode === 'F2F' ? 'In-Person' : c.mode || '—'}</p>
                                                  </div>
                                                  <div>
                                                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${tm}`}>Time</p>
                                                    <p className={`text-xs ${ts}`}>{c.time_start ? to12h(c.time_start.slice(0,5)) : '—'}</p>
                                                  </div>
                                                  <div>
                                                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${tm}`}>Program</p>
                                                    <p className={`text-xs ${ts}`}>{c.program || '—'}</p>
                                                  </div>
                                                </div>
                                                {c.notes && (
                                                  <div className={`rounded-lg px-3 py-2.5 border ${isDark ? 'bg-sky-500/[0.06] border-sky-500/15' : 'bg-sky-50 border-sky-100'}`}>
                                                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-sky-400/70' : 'text-sky-600/70'}`}>Student&apos;s Note</p>
                                                    <p className={`text-xs leading-relaxed break-words ${isDark ? 'text-sky-200/80' : 'text-sky-800'}`}>{c.notes}</p>
                                                  </div>
                                                )}
                                              </div>

                                              {/* Right: editable notes */}
                                              <div className="space-y-2.5 min-w-0">
                                                <div>
                                                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${tm}`}>Action Taken</p>
                                                  <input
                                                    value={draft.action_taken}
                                                    onChange={e => setDraft({ action_taken: e.target.value })}
                                                    placeholder="e.g. Academic advising, Referred to registrar…"
                                                    className={`w-full text-xs rounded-lg px-3 py-2 outline-none border transition-colors ${isDark
                                                      ? 'bg-white/[0.05] border-white/10 text-gray-200 placeholder-white/20 focus:border-sky-500/50'
                                                      : 'bg-white border-gray-200 text-gray-700 placeholder-gray-300 focus:border-sky-400'
                                                    }`}
                                                  />
                                                </div>
                                                <div>
                                                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${tm}`}>Remarks</p>
                                                  <textarea
                                                    value={draft.remarks}
                                                    onChange={e => setDraft({ remarks: e.target.value })}
                                                    placeholder="Additional notes…"
                                                    rows={2}
                                                    className={`w-full text-xs rounded-lg px-3 py-2 outline-none border resize-none transition-colors ${isDark
                                                      ? 'bg-white/[0.05] border-white/10 text-gray-200 placeholder-white/20 focus:border-sky-500/50'
                                                      : 'bg-white border-gray-200 text-gray-700 placeholder-gray-300 focus:border-sky-400'
                                                    }`}
                                                  />
                                                </div>
                                                <div className="flex justify-end">
                                                  <button
                                                    onClick={() => saveNotes(c)}
                                                    disabled={histSaving === c.id}
                                                    className="text-xs font-semibold px-4 py-1.5 rounded-lg bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50 transition-colors shadow-sm shadow-sky-500/30"
                                                  >
                                                    {histSaving === c.id ? 'Saving…' : 'Save Notes'}
                                                  </button>
                                                </div>
                                              </div>

                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

        ) : tab === 'profile' ? (
          <div className="px-3 sm:px-8 py-6 sm:py-10">
            <div>

              {/* Avatar hero */}
              <div className={`relative flex flex-col items-center pb-8 mb-8 border-b ${borderMid}`}>
                <button
                  onClick={() => router.push('/settings')}
                  className={`absolute top-0 right-0 px-4 py-2 text-xs ${btnPrimary}`}>
                  Edit Profile
                </button>

                <div className="w-24 h-24 rounded-full overflow-hidden bg-[#0369A1] flex items-center justify-center text-white text-3xl font-bold select-none ring-4 ring-[#0EA5E9]/20 flex-shrink-0">
                  {profile.avatar && !profile.avatar.startsWith('/uploads/')
                    ? <img src={profile.avatar} alt="avatar" className="w-full h-full object-cover" />
                    : profile.full_name.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?'
                  }
                </div>

                <h2 className={`text-xl font-bold mt-4 text-center ${tp}`}>{profile.full_name || '—'}</h2>
                <p className="text-gray-500 text-sm mt-1 text-center">
                  {profile.department ? `${profile.department} · ` : ''}{profile.email || 'No email set'}
                </p>

                <div className="flex items-center gap-2 mt-3 flex-wrap justify-center">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                    Faculty
                  </span>
                  <span className="text-gray-700 text-xs">·</span>
                  <span className="text-gray-500 text-xs">Mapúa University</span>
                </div>
              </div>

              {/* Two-column layout */}
              <div className="grid grid-cols-1 sm:grid-cols-[3fr_2fr] gap-5 items-start">

                {/* Left column */}
                <div className="space-y-5">

                  {/* Personal Information */}
                  <div className={`rounded-2xl overflow-hidden ${isDark ? 'border border-white/10 bg-[#252525]' : 'border border-gray-200 bg-white shadow-sm'}`}>
                    <div className={`px-5 py-3.5 border-b ${borderMid}`}>
                      <p className="text-[10px] font-bold text-[#0EA5E9] uppercase tracking-widest">Personal Information</p>
                    </div>
                    <div className={`divide-y ${isDark ? 'divide-white/10' : 'divide-gray-100'}`}>
                      <div className="flex items-center gap-4 px-5 py-3.5">
                        <span className={`text-xs font-medium w-32 flex-shrink-0 ${ts}`}>Full Name</span>
                        <span className={`text-sm font-medium ${tp}`}>{profile.full_name || '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Faculty Information */}
                  <div className={`rounded-2xl overflow-hidden ${isDark ? 'border border-white/10 bg-[#252525]' : 'border border-gray-200 bg-white shadow-sm'}`}>
                    <div className={`px-5 py-3.5 border-b ${borderMid}`}>
                      <p className="text-[10px] font-bold text-[#0EA5E9] uppercase tracking-widest">Faculty Information</p>
                    </div>
                    <div className={`divide-y ${isDark ? 'divide-white/10' : 'divide-gray-100'}`}>
                      <div className="flex items-center gap-4 px-5 py-3.5">
                        <span className={`text-xs font-medium w-32 flex-shrink-0 ${ts}`}>Department</span>
                        <span className={`text-sm font-medium ${tp}`}>{profile.department || '—'}</span>
                      </div>
                      <div className="flex items-center gap-4 px-5 py-3.5">
                        <span className={`text-xs font-medium w-32 flex-shrink-0 ${ts}`}>School</span>
                        <span className={`text-sm font-medium ${tp}`}>School of Information Technology</span>
                      </div>
                      <div className="flex items-center gap-4 px-5 py-3.5">
                        <span className={`text-xs font-medium w-32 flex-shrink-0 ${ts}`}>Role</span>
                        <span className={`text-sm font-medium ${tp}`}>Faculty · Academic Adviser</span>
                      </div>
                      <div className="flex items-center gap-4 px-5 py-3.5">
                        <span className={`text-xs font-medium w-32 flex-shrink-0 ${ts}`}>University</span>
                        <span className={`text-sm font-medium ${tp}`}>Mapúa University</span>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Right column */}
                <div className="space-y-5">

                  {/* Contact Information */}
                  <div className={`rounded-2xl overflow-hidden ${isDark ? 'border border-white/10 bg-[#252525]' : 'border border-gray-200 bg-white shadow-sm'}`}>
                    <div className={`px-5 py-3.5 border-b ${borderMid}`}>
                      <p className="text-[10px] font-bold text-[#0EA5E9] uppercase tracking-widest">Contact Information</p>
                    </div>
                    <div className={`divide-y ${isDark ? 'divide-white/10' : 'divide-gray-100'}`}>
                      <div className="px-5 py-3.5">
                        <p className={`text-xs font-medium mb-1.5 ${ts}`}>Email Address</p>
                        <p className={`text-sm font-medium break-all ${tp}`}>{profile.email || '—'}</p>
                      </div>
                      <div className="px-5 py-3.5">
                        <p className={`text-xs font-medium mb-1.5 ${ts}`}>Phone Number</p>
                        <p className={`text-sm font-medium ${tp}`}>{profile.phone || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Account */}
                  <div className={`rounded-2xl overflow-hidden ${isDark ? 'border border-white/10 bg-[#252525]' : 'border border-gray-200 bg-white shadow-sm'}`}>
                    <div className={`px-5 py-3.5 border-b ${borderMid}`}>
                      <p className="text-[10px] font-bold text-[#0EA5E9] uppercase tracking-widest">Account</p>
                    </div>
                    <div className={`divide-y ${isDark ? 'divide-white/10' : 'divide-gray-100'}`}>
                      <div className="px-5 py-3.5">
                        <p className={`text-xs font-medium mb-1.5 ${ts}`}>Role</p>
                        <p className={`text-sm font-medium ${tp}`}>Professor</p>
                      </div>
                      <div className="px-5 py-3.5">
                        <p className={`text-xs font-medium mb-1.5 ${ts}`}>Status</p>
                        <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Active
                        </span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

            </div>
          </div>

        ) : (() => {
          const exportRows = getExportRows();
          const inputCls = `w-full rounded-xl px-3 py-2 text-sm border ${isDark ? 'bg-[#2b2d31] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-800'} focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/40`;
          const labelCls = `block text-xs font-semibold uppercase tracking-wider mb-1.5 ${tm}`;
          return (
            <div className="min-h-[75vh] flex items-center justify-center px-3 sm:px-8 py-8">
              <div className="w-full max-w-xl">
              <div className="mb-6 text-center">
                <h1 className={`text-2xl font-bold ${tp}`}>Export Report</h1>
                <p className={`text-sm mt-1 ${tm}`}>Generate a downloadable advising record with custom filters</p>
              </div>

              {/* Filters card */}
              <div className={`rounded-2xl p-5 mb-5 ${card}`}>
                <p className={`text-sm font-semibold mb-4 ${tp}`}>Filter Records</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className={labelCls}>Date From</label>
                    <input type="date" value={exportDateFrom} onChange={e => setExportDateFrom(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Date To</label>
                    <input type="date" value={exportDateTo} onChange={e => setExportDateTo(e.target.value)} className={inputCls} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Status</label>
                    <select value={exportStatus} onChange={e => setExportStatus(e.target.value as typeof exportStatus)} className={inputCls}>
                      <option value="all">All Statuses</option>
                      <option value="pending">Pending</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>PDF Orientation</label>
                    <div className="flex gap-2">
                      {(['portrait', 'landscape'] as const).map(o => (
                        <button key={o} onClick={() => setExportOrientation(o)}
                          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors border ${
                            exportOrientation === o
                              ? 'bg-sky-500/10 border-sky-500/40 text-sky-400'
                              : isDark ? 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10' : 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200'
                          }`}>
                          {o.charAt(0).toUpperCase() + o.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Record count preview */}
              <div className={`rounded-xl px-4 py-3 mb-5 flex items-center gap-2 ${isDark ? 'bg-white/5 border border-white/10' : 'bg-blue-50 border border-blue-100'}`}>
                <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-blue-800'}`}>
                  <span className="font-semibold">{exportRows.length}</span> record{exportRows.length !== 1 ? 's' : ''} will be exported
                  {(exportDateFrom || exportDateTo) && ` · ${exportDateFrom || '—'} to ${exportDateTo || '—'}`}
                  {exportStatus !== 'all' && ` · ${exportStatus}`}
                </p>
              </div>

              {/* Download buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button onClick={() => handleExport('excel')}
                  className={`rounded-2xl p-5 text-left transition-all group hover:border-emerald-500/20 hover:bg-emerald-500/5 ${card}`}>
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-3 group-hover:bg-emerald-500/20 transition-colors">
                    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2z" />
                    </svg>
                  </div>
                  <p className={`font-semibold text-sm ${tp}`}>Excel Spreadsheet</p>
                  <p className={`text-xs mt-1 ${tm}`}>Download as .xlsx — open in Excel or Sheets</p>
                </button>
                <button onClick={() => handleExport('pdf')}
                  className={`rounded-2xl p-5 text-left transition-all group hover:border-blue-500/20 hover:bg-blue-500/5 ${card}`}>
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-3 group-hover:bg-blue-500/20 transition-colors">
                    <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 0 0 2-2V9.414a1 1 0 0 0-.293-.707l-5.414-5.414A1 1 0 0 0 12.586 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z" />
                    </svg>
                  </div>
                  <p className={`font-semibold text-sm ${tp}`}>PDF Document</p>
                  <p className={`text-xs mt-1 ${tm}`}>Download as .pdf — {exportOrientation} layout, MAPUA header</p>
                </button>
              </div>
              </div>
            </div>
          );
        })()}
      </main>

      {/* Complete modal */}
      {completingConsult && (
        <Modal title="Mark as Completed" onClose={() => setCompletingConsult(null)}>
          <div className="px-5 py-5 space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/3 border border-white/5">
              <Avatar name={completingConsult.student_name} avatarUrl={completingConsult.student_avatar} size="sm" />
              <div>
                <p className="text-white text-sm font-semibold">{completingConsult.student_name}</p>
                <p className="text-gray-500 text-xs mt-0.5">{completingConsult.student_number} · {fmtDate(completingConsult.date, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-2">Action Taken</p>
              <div className="space-y-1.5">
                {['Resolved', 'For Follow-up', 'Referred to'].map(opt => (
                  <label key={opt} className={radioCls(completeForm.action_taken === opt)}>
                    {radioBtn(completeForm.action_taken === opt)}
                    {opt}
                    <input type="radio" className="sr-only" checked={completeForm.action_taken === opt}
                      onChange={() => { setCompleteForm(f => ({ ...f, action_taken: opt, referral: '', referral_specify: '' })); setCompleteError(''); }} />
                  </label>
                ))}
              </div>
            </div>
            {completeForm.action_taken === 'Referred to' && (
              <div>
                <p className="text-gray-500 text-xs mb-2">Referred To</p>
                <div className="space-y-1.5">
                  {REFERRAL_OPTIONS.map(opt => (
                    <label key={opt} className={radioCls(completeForm.referral === opt)}>
                      {radioBtn(completeForm.referral === opt)}
                      {opt}
                      <input type="radio" className="sr-only" checked={completeForm.referral === opt}
                        onChange={() => { setCompleteForm(f => ({ ...f, referral: opt, referral_specify: '' })); setCompleteError(''); }} />
                    </label>
                  ))}
                </div>
                {completeForm.referral === 'Other Office (Please Specify)' && (
                  <input className="mt-2 w-full rounded-lg bg-[#2d2d2d] border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-[#0EA5E9]/50 placeholder-gray-600"
                    placeholder="Please specify the office…"
                    value={completeForm.referral_specify}
                    onChange={e => { setCompleteForm(f => ({ ...f, referral_specify: e.target.value })); setCompleteError(''); }} />
                )}
              </div>
            )}
            <div>
              <Label className="text-gray-500 text-xs mb-1.5 block">Remarks (optional)</Label>
              <textarea value={completeForm.remarks} onChange={e => setCompleteForm(f => ({ ...f, remarks: e.target.value }))}
                rows={2} className="w-full rounded-lg bg-[#2d2d2d] border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-[#0EA5E9]/50 resize-none placeholder-gray-600"
                placeholder="Additional remarks…" />
            </div>
            {completeError && <p className="text-red-400 text-xs">{completeError}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setCompletingConsult(null)} className={`flex-1 py-2.5 text-sm ${btnSecondary}`}>
                Cancel
              </button>
              <button onClick={handleComplete} className={`flex-1 py-2.5 text-sm ${btnSuccess}`}>
                Submit & Mark Completed
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reschedule modal */}
      {reschedulingConsult && (
        <Modal title="Mark as Rescheduled" onClose={() => setReschedulingConsult(null)}>
          <div className="px-5 py-5 space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/3 border border-white/5">
              <Avatar name={reschedulingConsult.student_name} avatarUrl={reschedulingConsult.student_avatar} size="sm" />
              <div>
                <p className="text-white text-sm font-semibold">{reschedulingConsult.student_name}</p>
                <p className="text-gray-500 text-xs mt-0.5">{reschedulingConsult.student_number} · {fmtDate(reschedulingConsult.date, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>
            </div>
            <p className="text-gray-500 text-xs">This marks the consultation as rescheduled (referred/moved to another session).</p>
            <div>
              <p className="text-gray-500 text-xs mb-2">Referred To (optional)</p>
              <div className="space-y-1.5">
                {REFERRAL_OPTIONS.map(opt => (
                  <label key={opt} className={radioCls(rescheduleForm.referral === opt)}>
                    {radioBtn(rescheduleForm.referral === opt)}
                    {opt}
                    <input type="radio" className="sr-only" checked={rescheduleForm.referral === opt}
                      onChange={() => setRescheduleForm(f => ({ ...f, referral: opt, referral_specify: '' }))} />
                  </label>
                ))}
              </div>
              {rescheduleForm.referral === 'Other Office (Please Specify)' && (
                <input className="mt-2 w-full rounded-lg bg-[#2d2d2d] border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-[#0EA5E9]/50 placeholder-gray-600"
                  placeholder="Specify office…"
                  value={rescheduleForm.referral_specify}
                  onChange={e => setRescheduleForm(f => ({ ...f, referral_specify: e.target.value }))} />
              )}
            </div>
            <div>
              <Label className="text-gray-500 text-xs mb-1.5 block">Remarks (optional)</Label>
              <textarea value={rescheduleForm.remarks} onChange={e => setRescheduleForm(f => ({ ...f, remarks: e.target.value }))}
                rows={2} className="w-full rounded-lg bg-[#2d2d2d] border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-[#0EA5E9]/50 resize-none placeholder-gray-600"
                placeholder="Reason for rescheduling…" />
            </div>
            {rescheduleError && <p className="text-red-400 text-xs">{rescheduleError}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setReschedulingConsult(null)} className={`flex-1 py-2.5 text-sm ${btnSecondary}`}>
                Cancel
              </button>
              <button onClick={handleReschedule} className={`flex-1 py-2.5 text-sm ${btnPrimary}`}>
                Mark as Rescheduled
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit schedule modal */}
      {editingScheduleSlot && (
        <Modal title="Edit Schedule Slot" onClose={() => setEditingScheduleSlot(null)}>
          <div className="px-5 py-5 space-y-4">
            <div>
              <Label className="text-gray-500 text-xs mb-1.5 block">Date</Label>
              <ScheduleDatePicker
                selected={editSchedDate}
                onSelect={(dateStr, dayName) => { setEditSchedDate(dateStr); setEditSched(f => ({ ...f, day: dayName })); }}
                disabledDates={schedules.filter(s => s.id !== editingScheduleSlot!.id).map(s => s.date).filter((d): d is string => !!d)}
                isDark={isDark}
              />
            </div>
            <div>
              <Label className="text-gray-500 text-xs mb-1.5 block">Location</Label>
              <input type="text" value={editSched.location} onChange={e => setEditSched(f => ({ ...f, location: e.target.value }))}
                placeholder="Optional"
                className="w-full px-3 py-2 rounded-lg text-white text-sm bg-[#1e1e1e] border border-white/10 focus:outline-none focus:border-[#0EA5E9]/50 placeholder-gray-600" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-gray-500 text-xs">Time Ranges</Label>
                <button type="button"
                  onClick={() => setEditSched(f => ({ ...f, time_ranges: [...f.time_ranges, { time_start: '', time_end: '' }] }))}
                  className="text-xs text-sky-400 hover:text-sky-300 transition-colors font-medium">
                  + Add Time Range
                </button>
              </div>
              <div className="space-y-2">
                {editSched.time_ranges.map((r, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-gray-600 text-[10px] mb-1 block">Start</Label>
                        <TimePicker
                          value={r.time_start}
                          onChange={v => setEditSched(f => ({ ...f, time_ranges: f.time_ranges.map((x, j) => j === i ? { ...x, time_start: v } : x) }))}
                        />
                      </div>
                      <div>
                        <Label className="text-gray-600 text-[10px] mb-1 block">End</Label>
                        <TimePicker
                          value={r.time_end}
                          onChange={v => setEditSched(f => ({ ...f, time_ranges: f.time_ranges.map((x, j) => j === i ? { ...x, time_end: v } : x) }))}
                        />
                      </div>
                    </div>
                    {editSched.time_ranges.length > 1 && (
                      <button type="button"
                        onClick={() => setEditSched(f => ({ ...f, time_ranges: f.time_ranges.filter((_, j) => j !== i) }))}
                        className="pb-1.5 text-gray-600 hover:text-red-400 transition-colors text-lg leading-none">
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {editSchedError && <p className="text-red-400 text-xs">{editSchedError}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditingScheduleSlot(null)} className={`flex-1 py-2.5 text-sm ${btnSecondary}`}>
                Cancel
              </button>
              <button onClick={handleRequestEditSchedule} className={`flex-1 py-2.5 text-sm ${btnPrimary}`}>
                Save Changes
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Cancel modal */}
      {cancellingConsult && (
        <Modal title="Cancel Consultation" onClose={() => setCancellingConsult(null)}>
          <div className="px-5 py-5 space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/3 border border-white/5">
              <Avatar name={cancellingConsult.student_name} avatarUrl={cancellingConsult.student_avatar} size="sm" />
              <div>
                <p className="text-white text-sm font-semibold">{cancellingConsult.student_name}</p>
                <p className="text-gray-500 text-xs mt-0.5">{cancellingConsult.student_number} · {fmtDate(cancellingConsult.date, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>
            </div>
            <div>
              <Label className="text-gray-500 text-xs mb-1.5 block">Reason for Cancellation <span className="text-red-400">*</span></Label>
              <textarea
                value={cancelReason}
                onChange={e => { setCancelReason(e.target.value); setCancelError(''); }}
                rows={3}
                className="w-full rounded-lg bg-[#2d2d2d] border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-red-500/50 resize-none placeholder-gray-600"
                placeholder="e.g. Schedule conflict, unavailable, etc."
                autoFocus
              />
            </div>
            {cancelError && <p className="text-red-400 text-xs">{cancelError}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setCancellingConsult(null)} className={`flex-1 py-2.5 text-sm ${btnSecondary}`}>
                Back
              </button>
              <button onClick={handleCancel} className={`flex-1 py-2.5 text-sm ${btnDanger}`}>
                Confirm Cancellation
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Bulk Cancel Modal ── */}
      {bulkCancelOpen && (
        <Modal title="Cancel Selected Consultations" onClose={() => setBulkCancelOpen(false)}>
          <div className="px-5 py-5 space-y-4">
            <div className={`flex items-center gap-2 p-3 rounded-xl ${isDark ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-200'}`}>
              <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="text-red-400 text-xs font-medium">
                This will cancel <span className="font-bold">{selectedIds.size}</span> consultation{selectedIds.size !== 1 ? 's' : ''}. This cannot be undone.
              </p>
            </div>
            <div>
              <Label className="text-gray-500 text-xs mb-1.5 block">Reason for Cancellation <span className="text-red-400">*</span></Label>
              <textarea
                value={bulkCancelReason}
                onChange={e => { setBulkCancelReason(e.target.value); setBulkCancelError(''); }}
                rows={3}
                className="w-full rounded-lg bg-[#2d2d2d] border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-red-500/50 resize-none placeholder-gray-600"
                placeholder="e.g. Schedule conflict, professor unavailable, etc."
                autoFocus
              />
            </div>
            {bulkCancelError && <p className="text-red-400 text-xs">{bulkCancelError}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setBulkCancelOpen(false)} className={`flex-1 py-2.5 text-sm ${btnSecondary}`}>
                Back
              </button>
              <button onClick={handleBulkCancel} className={`flex-1 py-2.5 text-sm ${btnDanger}`}>
                Cancel {selectedIds.size} Consultation{selectedIds.size !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {profileCard && token && (
        <UserProfileCard
          profileId={profileCard.id}
          profileRole={profileCard.role}
          token={token}
          onClose={() => setProfileCard(null)}
        />
      )}

      <ChatbotWidget token={token} role="professor" />
      </div>{/* /content area */}
    </div>
  );
}
