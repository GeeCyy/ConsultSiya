'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Label } from '@/components/ui/label';
import UserProfileCard from '@/components/UserProfileCard';
import LeftSidebar from '@/components/LeftSidebar';
import MatrixCalendar from '@/components/MatrixCalendar';

export type ProfessorTab = 'home' | 'schedules' | 'calendar' | 'consultations' | 'export' | 'history';

const PROF_NAV_ITEMS = [
  { key: 'home',          label: 'Home' },
  { key: 'schedules',     label: 'Manage Schedules' },
  { key: 'calendar',      label: 'Booking Calendar' },
  { key: 'consultations', label: 'My Consultations' },
  { key: 'export',        label: 'Export Report' },
  { key: 'history',       label: 'History' },
];
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
    <div className={`rounded-full bg-red-950 border border-red-900/50 flex items-center justify-center text-red-300 font-semibold flex-shrink-0 overflow-hidden ${sizeClass}`}>
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
  const dayToday   = isDark ? 'text-white ring-1 ring-inset ring-[#CC0000]/40 hover:bg-white/10' : 'text-gray-900 ring-1 ring-inset ring-[#CC0000]/40 hover:bg-black/8';

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
                isSelected ? 'bg-[#CC0000] text-white' :
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
        <p className="text-[#CC0000] text-[10px] text-center mt-2.5 font-medium">
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
    ? 'bg-[#1e1e1e] border border-white/15 text-white text-sm rounded-lg px-2.5 py-2 focus:outline-none focus:border-[#CC0000]/50 cursor-pointer hover:border-white/30 transition-colors'
    : 'bg-white border border-gray-300 text-gray-900 text-sm rounded-lg px-2.5 py-2 focus:outline-none focus:border-[#CC0000]/60 cursor-pointer hover:border-gray-400 transition-colors';
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

// ── Academic mini-calendar ───────────────────────────────────────────────────
const MONTH_NAMES_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_NAMES_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const NOTE_COLORS = [
  { id: 'indigo', dot: 'bg-indigo-400',  ring: 'ring-indigo-400' },
  { id: 'sky',    dot: 'bg-sky-400',     ring: 'ring-sky-400'    },
  { id: 'teal',   dot: 'bg-teal-400',    ring: 'ring-teal-400'   },
  { id: 'rose',   dot: 'bg-rose-400',    ring: 'ring-rose-400'   },
  { id: 'amber',  dot: 'bg-amber-400',   ring: 'ring-amber-400'  },
  { id: 'violet', dot: 'bg-violet-400',  ring: 'ring-violet-400' },
] as const;

type UserNote = { id: number; date: string; note: string; color: string };

function MiniCalendar({
  dateLabelMap, dateColorMap, isDark, token, calOverrides,
}: {
  dateLabelMap: Map<string, string>;
  dateColorMap: Map<string, string>;
  isDark: boolean;
  token: string | null;
  calOverrides: CalendarOverride[];
}) {
  const [viewYear, setViewYear]   = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [todayStr, setTodayStr]   = useState('');
  const [selected, setSelected]   = useState<string | null>(null);
  const [userNotes, setUserNotes] = useState<UserNote[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteDraftColor, setNoteDraftColor] = useState('indigo');
  const [noteSaving, setNoteSaving] = useState(false);

  useEffect(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    setTodayStr(`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`);
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/calendar/notes`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setUserNotes(data); })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!selected) { setNoteDraft(''); setNoteDraftColor('indigo'); return; }
    const existing = userNotes.find(n => n.date === selected);
    setNoteDraft(existing?.note ?? '');
    setNoteDraftColor(existing?.color ?? 'indigo');
  }, [selected, userNotes]);

  const prevMonth = () => viewMonth === 0 ? (setViewMonth(11), setViewYear(y => y-1)) : setViewMonth(m => m-1);
  const nextMonth = () => viewMonth === 11 ? (setViewMonth(0),  setViewYear(y => y+1)) : setViewMonth(m => m+1);

  const handleSaveNote = async () => {
    if (!token || !selected || !noteDraft.trim()) return;
    setNoteSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/calendar/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ date: selected, note: noteDraft.trim(), color: noteDraftColor }),
      });
      if (res.ok) {
        const saved: UserNote = await res.json();
        setUserNotes(prev => [...prev.filter(n => n.date !== selected), saved]);
      }
    } finally { setNoteSaving(false); }
  };

  const handleDeleteNote = async (noteId: number) => {
    if (!token) return;
    const res = await fetch(`${API_URL}/api/calendar/notes/${noteId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setUserNotes(prev => prev.filter(n => n.id !== noteId));
  };

  const firstDow   = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth= new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthPfx   = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}`;

  const augmented = new Map(dateLabelMap);
  const augColors  = new Map(dateColorMap);

  // Blocked dates (holidays / no-class) from admin overrides
  const blockedMap = new Map(
    calOverrides
      .filter(o => o.type === 'blocked_date' && o.date)
      .map(o => [o.date!, o.label ?? o.value ?? 'No Class'])
  );

  const noteMap = new Map(userNotes.map(n => [n.date, n]));

  const dotCls: Record<string, string> = {
    red: 'bg-red-500', orange: 'bg-orange-400', blue: 'bg-blue-500',
    green: 'bg-emerald-500', yellow: 'bg-yellow-400', purple: 'bg-purple-500',
  };
  const card = isDark ? 'bg-[#252525] border-white/5' : 'bg-white border-gray-200 shadow-sm';
  const tp   = isDark ? 'text-white' : 'text-gray-900';
  const ts   = isDark ? 'text-gray-400' : 'text-gray-500';
  const tm   = isDark ? 'text-gray-400' : 'text-gray-500';

  const events = Array.from(augmented.entries())
    .filter(([d]) => d.startsWith(monthPfx))
    .sort(([a],[b]) => a.localeCompare(b));

  // Blocked entries for the current month (not already shown as a date_label)
  const blockedEvents = Array.from(blockedMap.entries())
    .filter(([d]) => d.startsWith(monthPfx) && !augmented.has(d))
    .sort(([a],[b]) => a.localeCompare(b));

  const existingNote = selected ? noteMap.get(selected) : undefined;
  const noteChanged  = selected ? (noteDraft.trim() !== (existingNote?.note ?? '') || noteDraftColor !== (existingNote?.color ?? 'indigo')) : false;

  return (
    <div className={`rounded-2xl border p-4 w-full min-w-0 ${card}`}>

      {/* ── Header: month/year + nav arrows ── */}
      <div className="flex items-center justify-between mb-3">
        <span className={`text-sm font-bold ${tp}`}>{MONTH_NAMES_FULL[viewMonth]} {viewYear}</span>
        <div className="flex gap-0.5">
          <button
            onClick={prevMonth}
            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
              isDark ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <button
            onClick={nextMonth}
            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
              isDark ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Day-of-week headers ── */}
      <div className="grid grid-cols-7 mb-1">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} className={`text-center text-[11px] font-bold py-1.5 ${tm}`}>{d}</div>
        ))}
      </div>

      {/* ── Date grid ── */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {Array.from({ length: firstDow }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const ds  = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          const isT = ds === todayStr;
          const isSel = ds === selected;
          const isBlocked = blockedMap.has(ds);
          const evColor = augColors.get(ds);
          const userNote = noteMap.get(ds);
          const nc = userNote ? (NOTE_COLORS.find(c => c.id === userNote.color) ?? NOTE_COLORS[0]) : null;
          return (
            <button
              key={ds}
              onClick={() => setSelected(isSel ? null : ds)}
              className={`relative flex flex-col items-center py-0.5 rounded-lg transition-colors ${
                isBlocked ? (isDark ? 'bg-red-500/15' : 'bg-red-50') :
                isSel && !isT ? (isDark ? 'bg-white/10' : 'bg-gray-100') :
                (!isT ? (isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50') : '')
              }`}
            >
              <div className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-medium ${
                isT ? 'bg-[#CC0000] text-white font-semibold' :
                isBlocked ? (isDark ? 'text-red-400' : 'text-red-500') :
                isDark ? 'text-gray-200' : 'text-gray-800'
              }`}>{day}</div>
              {evColor && <div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${dotCls[evColor] ?? 'bg-red-500'}`} />}
              {!evColor && isBlocked && <div className="w-1.5 h-1.5 rounded-full mt-0.5 bg-red-400" />}
              {nc && !evColor && !isBlocked && <div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${nc.dot}`} />}
              {nc && (evColor || isBlocked) && <div className={`absolute top-0 right-0.5 w-1.5 h-1.5 rounded-full ${nc.dot}`} />}
            </button>
          );
        })}
      </div>

      {/* ── Events / holidays legend ── */}
      {(events.length > 0 || blockedEvents.length > 0) && (
        <div className={`mt-3 pt-3 border-t ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
          <p className={`text-[9px] font-bold uppercase tracking-widest mb-2 ${tm}`}>This Month</p>
          <div className="space-y-1.5">
            {events.slice(0, 4).map(([date, label]) => {
              const d = new Date(date + 'T12:00:00');
              const c = augColors.get(date) ?? 'red';
              return (
                <div key={date} className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotCls[c] ?? 'bg-red-500'}`} />
                  <span className={`text-[10px] font-semibold flex-shrink-0 ${ts}`}>{MONTH_NAMES_SHORT[d.getMonth()]} {d.getDate()}</span>
                  <span className={`text-[10px] truncate ${date === todayStr ? 'text-[#CC0000] font-semibold' : tm}`}>
                    {date === todayStr ? 'Today' : label}
                  </span>
                </div>
              );
            })}
            {blockedEvents.map(([date, label]) => {
              const d = new Date(date + 'T12:00:00');
              return (
                <div key={date} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-red-400" />
                  <span className={`text-[10px] font-semibold flex-shrink-0 ${ts}`}>{MONTH_NAMES_SHORT[d.getMonth()]} {d.getDate()}</span>
                  <span className="text-[10px] truncate text-red-400">{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Selected date note editor ── */}
      {selected && token && (
        <div className={`mt-3 pt-3 border-t ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
          <p className={`text-[9px] font-bold uppercase tracking-widest mb-2 ${tm}`}>
            Note — {MONTH_NAMES_SHORT[parseInt(selected.slice(5,7))-1]} {parseInt(selected.slice(8,10))}
          </p>
          <textarea
            rows={2}
            value={noteDraft}
            onChange={e => setNoteDraft(e.target.value)}
            placeholder="Add a personal note…"
            className={`w-full rounded-lg px-2.5 py-2 text-xs border focus:outline-none resize-none transition-colors ${
              isDark
                ? 'bg-white/[0.04] border-white/10 text-white placeholder-gray-500 focus:border-indigo-500/60 focus:bg-white/[0.06]'
                : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:bg-white'
            }`}
          />
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-[9px] font-semibold ${tm}`}>Color</span>
            <div className="flex items-center gap-1.5">
              {NOTE_COLORS.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setNoteDraftColor(c.id)}
                  className={`w-3.5 h-3.5 rounded-full ${c.dot} transition-all ${
                    noteDraftColor === c.id
                      ? `scale-125 ring-2 ${c.ring} ring-offset-1 ${isDark ? 'ring-offset-[#252525]' : 'ring-offset-white'}`
                      : 'hover:scale-110 opacity-70 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2 mt-2">
            {existingNote && (
              <button
                onClick={() => handleDeleteNote(existingNote.id)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors text-red-400 border-red-500/20 ${isDark ? 'hover:bg-red-500/10' : 'hover:bg-red-50'}`}
              >Delete</button>
            )}
            <button
              onClick={handleSaveNote}
              disabled={noteSaving || !noteDraft.trim() || !noteChanged}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {noteSaving ? 'Saving…' : existingNote ? 'Update' : 'Save Note'}
            </button>
          </div>
        </div>
      )}
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

  // Export filters
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');
  const [exportStatus, setExportStatus] = useState<'all' | 'pending' | 'confirmed' | 'completed' | 'cancelled'>('all');
  const [exportOrientation, setExportOrientation] = useState<'portrait' | 'landscape'>('landscape');

  // Add schedule
  const [newSched, setNewSched] = useState({ day: 'Monday', location: '', time_ranges: [{ time_start: '', time_end: '' }] as TimeRange[] });
  const [newSchedDate, setNewSchedDate] = useState('');
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

  // Profile
  const [profile, setProfile] = useState<ProfProfile>({ full_name: '', department: '', email: '', phone: '', avatar: null });

  // Home-tab data
  const [term, setTerm] = useState<TermConfig>(CURRENT_TERM);
  const [calOverrides, setCalOverrides] = useState<CalendarOverride[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

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
    const [c, s, prof, ann, cal, termData] = await Promise.all([
      api.get('/api/consultations', token!),
      api.get('/api/schedules/mine', token!),
      api.get('/api/auth/profile', token!),
      fetch(`${API_URL}/api/announcements`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_URL}/api/calendar`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_URL}/api/settings/term`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    setConsultations(Array.isArray(c) ? c : []);
    setSchedules(Array.isArray(s) ? s : []);
    if (Array.isArray(ann)) setAnnouncements(ann);
    if (Array.isArray(cal)) setCalOverrides(cal);
    if (termData && !termData.error) setTerm(buildTermFromConfig(termData as RawTermConfig));
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
    setPendingSched({ ...newSched });
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
      new Date(c.date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }),
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

      doc.save(`advising-report-${new Date().toISOString().slice(0, 10)}.pdf`);
    } else {
      const wsData = [headers, ...tableData];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [20, 14, 14, 14, 10, 8, 30, 16, 12].map(w => ({ wch: w }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Advising Records');
      XLSX.writeFile(wb, `advising-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
    }
    toast.success(`${format === 'pdf' ? 'PDF' : 'Excel'} downloaded (${rows.length} record${rows.length !== 1 ? 's' : ''}).`);
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const visibleConsultations = consultations.filter(
    c => (c.status === 'pending' || c.status === 'confirmed') && c.date >= todayStr
  );
  const stats = {
    total: visibleConsultations.length,
    pending: visibleConsultations.filter(c => c.status === 'pending').length,
    confirmed: visibleConsultations.filter(c => c.status === 'confirmed').length,
  };

  const natureLabel = (c: Consultation) => {
    const items = parseNature(c.nature_of_advising);
    return items.map(i =>
      i === 'Others (Please Specify)' && c.nature_of_advising_specify
        ? `Others: ${c.nature_of_advising_specify}` : i
    ).join(', ') || '—';
  };

  const radioCls = (selected: boolean) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
      selected ? 'bg-[#CC0000]/10 ring-1 ring-[#CC0000]/30 text-white' : 'bg-[#2d2d2d] text-gray-400 hover:bg-white/5'
    }`;

  const radioBtn = (selected: boolean) => (
    <span className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center ${
      selected ? 'border-[#CC0000] bg-[#CC0000]' : 'border-gray-600'
    }`}>
      {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
    </span>
  );

  const fieldCls = isDark
    ? 'px-3 py-2 rounded-lg text-white text-sm bg-[#1e1e1e] border border-white/10 focus:outline-none focus:border-[#CC0000]/50'
    : 'px-3 py-2 rounded-lg text-gray-900 text-sm bg-white border border-gray-300 focus:outline-none focus:border-[#CC0000]/60';

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
  const mondayStr = monday.toISOString().slice(0, 10);
  const sundayStr = sunday.toISOString().slice(0, 10);

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
  const card      = isDark ? 'bg-[#252525] border border-white/5' : 'bg-white border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]';
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

  const handleTabChange = (next: ProfessorTab) => {
    setTab(next);
    router.replace(`?view=${next}`, { scroll: false });
  };

  // Block all rendering until token + role are confirmed — prevents flash of wrong layout
  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: isDark ? '#1a1a1a' : '#f2f3f5' }}>
        <div className="w-8 h-8 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex ${isDark ? 'bg-[#2d2d2d]' : 'bg-[#f2f3f5]'}`}>

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
              <button onClick={() => setShowConfirmSched(false)} className="flex-1 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={handleConfirmAddSchedule} className="flex-1 py-2 rounded-lg text-sm font-medium bg-[#CC0000] text-white hover:bg-[#aa0000] transition-colors">Save Schedule</button>
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
                className="w-full px-3 py-2 rounded-lg text-white text-sm bg-[#1e1e1e] border border-white/10 focus:outline-none focus:border-[#CC0000]/50 placeholder-gray-600"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setEditLinkConsult(null); setEditLinkInput(''); }} className="flex-1 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={handleSaveMeetingLink} className="flex-1 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors">Save</button>
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
                className="w-full px-3 py-2 rounded-lg text-white text-sm bg-[#1e1e1e] border border-white/10 focus:outline-none focus:border-[#CC0000]/50 placeholder-gray-600"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setMeetingLinkConsult(null); setMeetingLinkInput(''); }} className="flex-1 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={handleConfirmWithLink} className="flex-1 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors">Confirm</button>
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
              <button onClick={() => setShowConfirmEdit(false)} className="flex-1 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={handleConfirmEditSchedule} className="flex-1 py-2 rounded-lg text-sm font-medium bg-[#CC0000] text-white hover:bg-[#aa0000] transition-colors">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-8 h-8 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600 text-sm">Loading...</p>
          </div>

        ) : tab === 'home' ? (() => {
            const termStart = term.start instanceof Date ? term.start : new Date(term.start as string);
            const termConsults = consultations.filter(c => new Date(c.date) >= termStart);
            const tApproved  = termConsults.filter(c => c.status === 'confirmed').length;
            const tCompleted = termConsults.filter(c => c.status === 'completed').length;
            const tPending   = termConsults.filter(c => c.status === 'pending').length;
            const tTotal     = termConsults.length;
            const approvedThisWeek = thisWeek.filter(c => c.status === 'confirmed').length;

            // Bar chart data: Mon–Sat
            const CHART_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const weekMonday = new Date(now);
            const _dow = now.getDay();
            weekMonday.setDate(now.getDate() + (_dow === 0 ? -6 : 1 - _dow));
            weekMonday.setHours(0, 0, 0, 0);
            const chartBars = CHART_DAYS.map((lbl, i) => {
              const d = new Date(weekMonday);
              d.setDate(weekMonday.getDate() + i);
              const ds = d.toISOString().slice(0, 10);
              const items = consultations.filter(c => c.date.slice(0, 10) === ds);
              return {
                label: lbl,
                date: ds,
                isToday: ds === todayStr,
                confirmed: items.filter(c => c.status === 'confirmed').length,
                pending:   items.filter(c => c.status === 'pending').length,
                completed: items.filter(c => c.status === 'completed').length,
                total: items.filter(c => !['cancelled', 'missed'].includes(c.status)).length,
              };
            });
            const chartMax = Math.max(...chartBars.map(b => b.total), 1);

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
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${isDark ? 'bg-[#CC0000]/15 text-[#ff6666]' : 'bg-red-100 text-red-700'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full bg-[#CC0000]`} />
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

              {/* ── Section 2: Big stat numbers ── */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {([
                  { value: tTotal,     label: 'Total Requests',  sub: 'this term',       color: isDark ? 'text-white'          : 'text-gray-900',     bg: isDark ? 'bg-[#252525] border-white/5' : 'bg-white border-gray-200 shadow-sm' },
                  { value: tApproved,  label: 'Approved',        sub: 'confirmations',   color: isDark ? 'text-blue-400'       : 'text-blue-600',     bg: isDark ? 'bg-blue-500/10 border-blue-500/15' : 'bg-blue-50 border-blue-100 shadow-sm' },
                  { value: tCompleted, label: 'Completed',       sub: 'sessions done',   color: isDark ? 'text-emerald-400'    : 'text-emerald-600',  bg: isDark ? 'bg-emerald-500/10 border-emerald-500/15' : 'bg-emerald-50 border-emerald-100 shadow-sm' },
                  { value: totalStudents, label: 'Students',     sub: 'unique advisees', color: isDark ? 'text-purple-400'     : 'text-purple-600',   bg: isDark ? 'bg-purple-500/10 border-purple-500/15' : 'bg-purple-50 border-purple-100 shadow-sm' },
                ] as const).map(s => (
                  <div key={s.label} className={`rounded-2xl p-5 border ${s.bg}`}>
                    <p className={`text-4xl sm:text-5xl font-black leading-none tracking-tight ${s.color}`}>{s.value}</p>
                    <p className={`text-sm font-semibold mt-2 ${tp}`}>{s.label}</p>
                    <p className={`text-xs mt-0.5 ${tm}`}>{s.sub}</p>
                  </div>
                ))}
              </div>

              {/* ── Section 3: Widget grid ── */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

                {/* Profile + term card */}
                <div className={`lg:col-span-4 rounded-2xl overflow-hidden border ${card}`}>
                  <div className={`px-5 pt-5 pb-4 ${isDark ? 'bg-gradient-to-br from-[#CC0000]/10 via-[#CC0000]/5 to-transparent' : 'bg-gradient-to-br from-red-50 to-orange-50/30'}`}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0 ring-2 ring-[#CC0000]/30" style={{ background: 'linear-gradient(135deg, #7a0000, #CC0000)' }}>
                        {profile.avatar && !profile.avatar.startsWith('/uploads/')
                          ? <img src={profile.avatar} alt={profile.full_name} className="w-full h-full object-cover" />
                          : <span className="text-white text-lg font-bold">{initials}</span>}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-bold truncate ${tp}`}>{profile.full_name}</p>
                        <p className={`text-xs ${ts}`}>{profile.department || 'Professor'}</p>
                        <p className={`text-[10px] mt-0.5 font-medium text-[#CC0000]`}>MAPUA SOIT</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-[#CC0000] flex flex-col items-center justify-center flex-shrink-0 shadow-lg shadow-red-900/30">
                        <span className="text-white text-2xl font-black leading-none">{currentWeek ?? '–'}</span>
                        <span className="text-red-200 text-[8px] font-bold uppercase tracking-wide">WK</span>
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
                        <div className="h-full bg-gradient-to-r from-[#CC0000] to-red-400 rounded-full transition-all duration-700" style={{ width: `${termProgress}%` }} />
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
                      className={`w-full mt-1 py-2 rounded-xl text-xs font-semibold transition-colors ${isDark ? 'bg-white/5 text-gray-300 hover:bg-white/10' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      Export Records
                    </button>
                  </div>
                </div>

                {/* Bar chart: consultations per day */}
                <div className={`lg:col-span-5 rounded-2xl border p-5 ${card}`}>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className={`text-sm font-semibold ${tp}`}>Consultations This Week</h3>
                    <button onClick={() => handleTabChange('consultations')} className="text-xs text-[#CC0000] hover:text-red-400 font-medium transition-colors">
                      View all →
                    </button>
                  </div>
                  <p className={`text-xs ${tm} mb-4`}>{scheduledCount} upcoming · {completedCount} completed · {pendingCount} pending</p>

                  {/* Chart */}
                  <div className="flex items-end gap-2 h-28">
                    {chartBars.map(b => {
                      const pct = chartMax > 0 ? (b.total / chartMax) : 0;
                      const confirmedPct = b.total > 0 ? (b.confirmed / b.total) : 0;
                      return (
                        <div key={b.label} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                          {b.total > 0 && (
                            <p className={`text-[10px] font-bold ${b.isToday ? 'text-[#CC0000]' : ts}`}>{b.total}</p>
                          )}
                          <div className="w-full flex flex-col-reverse rounded-lg overflow-hidden" style={{ height: `${Math.max(pct * 76, b.total > 0 ? 10 : 4)}px`, minHeight: '4px' }}>
                            <div
                              className={`w-full rounded-lg transition-all ${b.isToday ? 'bg-[#CC0000]' : (isDark ? 'bg-white/25' : 'bg-blue-200')}`}
                              style={{ height: `${(1 - confirmedPct) * 100}%` }}
                            />
                            {b.confirmed > 0 && (
                              <div
                                className={`w-full ${b.isToday ? 'bg-white/40' : (isDark ? 'bg-emerald-400' : 'bg-emerald-400')}`}
                                style={{ height: `${confirmedPct * 100}%` }}
                              />
                            )}
                          </div>
                          <p className={`text-[10px] font-semibold ${b.isToday ? 'text-[#CC0000]' : tm}`}>{b.label}</p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Bar legend */}
                  <div className={`flex items-center gap-4 mt-4 pt-3 border-t ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded-sm ${isDark ? 'bg-white/25' : 'bg-blue-200'}`} />
                      <span className={`text-[10px] ${tm}`}>Pending</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
                      <span className={`text-[10px] ${tm}`}>Confirmed</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#CC0000]" />
                      <span className={`text-[10px] ${tm}`}>Today</span>
                    </div>
                  </div>
                </div>

                {/* Approved this week + pending actions */}
                <div className={`lg:col-span-3 rounded-2xl border p-5 flex flex-col ${card}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className={`text-sm font-semibold ${tp}`}>This Week</h3>
                    <button onClick={() => handleTabChange('consultations')} className="text-xs text-[#CC0000] hover:text-red-400 font-medium transition-colors">
                      Manage →
                    </button>
                  </div>

                  {/* 2x2 stat squares */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {([
                      { label: 'Scheduled', value: scheduledCount, bg: isDark ? 'bg-blue-500/10'    : 'bg-blue-50',    color: isDark ? 'text-blue-400'    : 'text-blue-600'    },
                      { label: 'Completed', value: completedCount, bg: isDark ? 'bg-emerald-500/10' : 'bg-emerald-50', color: isDark ? 'text-emerald-400' : 'text-emerald-600' },
                      { label: 'Pending',   value: pendingCount,   bg: isDark ? 'bg-amber-500/10'   : 'bg-amber-50',   color: isDark ? 'text-amber-400'   : 'text-amber-600'   },
                      { label: 'Students',  value: totalStudents,  bg: isDark ? 'bg-purple-500/10'  : 'bg-purple-50',  color: isDark ? 'text-purple-400'  : 'text-purple-600'  },
                    ] as const).map(s => (
                      <div key={s.label} className={`rounded-xl p-3 ${s.bg}`}>
                        <p className={`text-2xl font-black leading-none ${s.color}`}>{s.value}</p>
                        <p className={`text-[11px] font-medium mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Today's schedule */}
                  {todayConsultations.length > 0 ? (
                    <div className={`mt-auto pt-3 border-t ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                      <p className={`text-[11px] font-semibold uppercase tracking-wider mb-2 ${tm}`}>Today</p>
                      <div className="space-y-2">
                        {todayConsultations.slice(0, 3).map(c => (
                          <div key={c.id} className="flex items-center gap-2">
                            <span className={`text-[10px] font-mono flex-shrink-0 ${tm}`}>{(c.time || c.time_start)?.slice(0, 5)}</span>
                            <div className={`flex-1 min-w-0 pl-2 border-l-2 ${c.status === 'confirmed' ? 'border-blue-400' : 'border-amber-400'}`}>
                              <p className={`text-xs font-medium truncate ${tp}`}>{c.student_name.split(' ').slice(-1)[0]}</p>
                              <p className={`text-[10px] ${tm}`}>{c.mode === 'F2F' ? 'In-Person' : 'Online'}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className={`mt-auto pt-3 border-t ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                      <p className={`text-xs text-center py-2 ${tm}`}>No consultations today</p>
                    </div>
                  )}
                </div>

              </div>{/* /widget grid */}

              {/* ── Section 4: Upcoming + Calendar ── */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

                {/* Upcoming consultations table */}
                <div className={`lg:col-span-8 rounded-2xl border overflow-hidden ${card}`}>
                  <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                    <h3 className={`text-sm font-semibold ${tp}`}>Upcoming Consultations</h3>
                    <button onClick={() => handleTabChange('consultations')} className="text-xs text-[#CC0000] hover:text-red-400 font-medium transition-colors">
                      View all →
                    </button>
                  </div>
                  {visibleConsultations.length === 0 ? (
                    <p className={`text-sm text-center py-10 ${tm}`}>No upcoming consultations</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[480px]">
                        <thead>
                          <tr className={`border-b ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                            {['Student', 'Date & Time', 'Mode', 'Status'].map(h => (
                              <th key={h} className={`text-left text-[11px] font-semibold uppercase tracking-wider px-5 py-3 ${tm}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-gray-50'}`}>
                          {visibleConsultations.slice(0, 7).map(c => (
                            <tr key={c.id} className={`transition-colors ${isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-gray-50/80'}`}>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2.5">
                                  <Avatar name={c.student_name} avatarUrl={c.student_avatar} size="sm" />
                                  <div className="min-w-0">
                                    <p className={`text-xs font-semibold truncate ${tp}`}>{c.student_name}</p>
                                    <p className={`text-[10px] truncate ${tm}`}>{c.program}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-3">
                                <p className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                  {new Date(c.date + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                                </p>
                                <p className={`text-[10px] font-mono ${tm}`}>{(c.time || c.time_start)?.slice(0, 5)}</p>
                              </td>
                              <td className="px-5 py-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  c.mode === 'F2F'
                                    ? isDark ? 'bg-purple-500/10 text-purple-400' : 'bg-purple-50 text-purple-700'
                                    : isDark ? 'bg-cyan-500/10 text-cyan-400' : 'bg-cyan-50 text-cyan-700'
                                }`}>{c.mode === 'F2F' ? 'In-Person' : 'Online'}</span>
                              </td>
                              <td className="px-5 py-3">
                                <StatusBadge status={c.status} isDark={isDark} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Mini calendar */}
                <div className="lg:col-span-4">
                  <MiniCalendar
                    dateLabelMap={dateLabelMap}
                    dateColorMap={dateColorMap}
                    isDark={isDark}
                    token={token}
                    calOverrides={calOverrides}
                  />
                </div>

              </div>{/* /upcoming + calendar */}

            </div>
            );
          })()

        : tab === 'consultations' ? (
          <div className="px-3 sm:px-8 py-5 sm:py-8">
            <div className="mb-5 sm:mb-7">
              <h1 className={`text-2xl font-bold ${tp}`}>My Consultations</h1>
              <p className="text-gray-500 text-sm mt-1">Review and manage student consultation requests</p>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-5 sm:mb-7">
              {[
                { label: 'Total', value: stats.total, color: tp },
                { label: 'Pending', value: stats.pending, color: 'text-amber-400' },
                { label: 'Confirmed', value: stats.confirmed, color: 'text-blue-400' },
              ].map(s => (
                <div key={s.label} className={`rounded-xl px-4 py-3 ${card}`}>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className={`text-xs mt-0.5 ${tm}`}>{s.label}</p>
                </div>
              ))}
            </div>

            {visibleConsultations.length === 0 ? (
              <div className={`flex flex-col items-center justify-center py-24 rounded-2xl ${card}`}>
                <p className={`font-medium text-sm ${ts}`}>No consultations yet</p>
                <p className={`text-xs mt-1 ${tm}`}>Students will appear here once they book a slot</p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleConsultations.map(c => (
                  <div key={c.id} className={`rounded-2xl overflow-hidden transition-colors ${card} ${isDark ? 'hover:border-white/10' : 'hover:border-gray-300'}`}>
                    <div className="p-5">
                      <div className="flex items-start gap-4">
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
                            {new Date(c.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
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
                          <div className="flex items-center gap-2">
                            {c.status === 'pending' && (
                              <button
                                onClick={() => c.mode === 'OL'
                                  ? (setMeetingLinkConsult(c), setMeetingLinkInput(''))
                                  : handleConfirm(c.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">
                                Confirm
                              </button>
                            )}
                            <button onClick={() => openCancelModal(c)}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-red-500/10 text-red-400 hover:bg-red-500/20">
                              Cancel
                            </button>
                            <button onClick={() => openRescheduleModal(c)}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-orange-500/10 text-orange-400 hover:bg-orange-500/20">
                              Reschedule
                            </button>
                            <button onClick={() => openCompleteModal(c)}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-[#CC0000]/10 text-[#ff5555] hover:bg-[#CC0000]/20">
                              Mark Completed
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
                            <span className={`text-xs px-2 py-0.5 rounded-full ${isPast ? 'bg-gray-500/10 text-gray-500' : 'bg-[#CC0000]/10 text-[#CC0000]'}`}>
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
              const todayStr = new Date().toISOString().slice(0, 10);
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
                <div className="mb-3">
                  <Label className="text-gray-500 text-xs mb-1.5 block">Date</Label>
                  <ScheduleDatePicker
                    selected={newSchedDate}
                    onSelect={(dateStr, dayName) => { setNewSchedDate(dateStr); setNewSched(s => ({ ...s, day: dayName })); }}
                    disabledDates={schedules.map(s => s.date).filter((d): d is string => !!d)}
                    isDark={isDark}
                  />
                </div>
                <div className="mb-3">
                  <Label className="text-gray-500 text-xs mb-1.5 block">Location (F2F, optional)</Label>
                  <input
                    type="text"
                    value={newSched.location}
                    onChange={e => setNewSched(s => ({ ...s, location: e.target.value }))}
                    placeholder="e.g. Room 201"
                    className={`w-full ${fieldCls} ${isDark ? 'placeholder-gray-600' : 'placeholder-gray-400'}`}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-gray-500 text-xs">Time Ranges</Label>
                    <button type="button"
                      onClick={() => setNewSched(s => ({ ...s, time_ranges: [...s.time_ranges, { time_start: '', time_end: '' }] }))}
                      className="text-xs text-[#CC0000] hover:text-red-400 transition-colors font-medium">
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
                            className="pb-1.5 text-gray-600 hover:text-red-400 transition-colors text-lg leading-none">
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                {schedError && <p className="text-red-400 text-xs mt-2">{schedError}</p>}
                <button onClick={handleRequestAddSchedule}
                  className="mt-4 px-4 py-2 rounded-lg text-sm font-medium bg-[#CC0000] text-white hover:bg-[#aa0000] transition-colors shadow-lg shadow-red-900/20">
                  Add Slot
                </button>
              </div>

              {/* ── Right: Slots list ── */}
              <div>
                {(() => {
                  const todayStr = new Date().toISOString().slice(0, 10);
                  const activeSlots = schedules.filter(s => s.date && s.date >= todayStr);
                  const pastSlots   = schedules.filter(s => s.date && s.date < todayStr)
                    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

                  const renderSlot = (s: Schedule, dimmed = false) => {
                    const hasBookings = Number(s.upcoming_count) > 0;
                    return (
                      <div key={s.id} className={`rounded-xl overflow-hidden transition-colors ${card} ${dimmed ? 'opacity-50' : isDark ? 'hover:border-white/10' : 'hover:border-gray-300'}`}>
                        <div className="flex items-center justify-between px-4 py-3.5">
                          <div className="flex items-center gap-4">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dimmed ? 'bg-gray-600' : hasBookings ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                            <div>
                              <span className={`text-sm font-medium ${dimmed ? ts : tp}`}>
                                {s.date
                                  ? new Date(s.date + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                                  : s.day}
                              </span>
                            </div>
                            <span className={`text-sm font-mono ${ts}`}>
                              {(s.time_ranges?.length ? s.time_ranges : [{ time_start: s.time_start, time_end: s.time_end }])
                                .map(r => `${to12h(r.time_start)}–${to12h(r.time_end)}`).join(',  ')}
                            </span>
                            {s.location && <span className={`text-xs font-semibold ${tm}`}>{s.location}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            {!dimmed && (
                              <span className={`text-xs ${hasBookings ? 'text-amber-500' : 'text-emerald-500'}`}>
                                {hasBookings ? `${s.upcoming_count} upcoming` : 'Available'}
                              </span>
                            )}
                            <button onClick={() => openEditModal(s)}
                              className="px-2.5 py-1 rounded-lg text-xs text-blue-400 hover:bg-blue-500/10 transition-colors">
                              Edit
                            </button>
                            <button onClick={() => handleDeleteSchedule(s.id)}
                              className="px-2.5 py-1 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors">
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  };

                  return (
                    <>
                      {/* ── Active slots ── */}
                      <p className={`text-[11px] font-semibold uppercase tracking-widerst mb-3 ${tm}`}>
                        Your Slots ({activeSlots.length})
                      </p>
                      {activeSlots.length === 0 ? (
                        <div className={`text-center py-12 rounded-2xl ${card}`}>
                          <p className={`text-sm ${ts}`}>No slots created yet.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">{activeSlots.map(s => renderSlot(s))}</div>
                      )}

                      {/* ── Past slots (collapsible) ── */}
                      {pastSlots.length > 0 && (
                        <div className="mt-4">
                          <button
                            onClick={() => setPastSlotsOpen(o => !o)}
                            className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widerst text-gray-700 hover:text-gray-500 transition-colors mb-2"
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
            <div className="mb-5 sm:mb-7">
              <h1 className={`text-2xl font-bold ${tp}`}>History</h1>
              <p className="text-gray-500 text-sm mt-1">Past advising records grouped by term</p>
            </div>
            {(() => {
              const historyItems = consultations.filter(c => c.status === 'completed' || c.status === 'rescheduled' || c.status === 'missed');
              if (historyItems.length === 0) {
                return (
                  <div className={`flex flex-col items-center justify-center py-16 sm:py-24 rounded-2xl ${card}`}>
                    <p className={`font-medium text-sm ${ts}`}>No history yet</p>
                    <p className={`text-xs mt-1 ${tm}`}>Completed advising sessions will appear here</p>
                  </div>
                );
              }
              return (
                <div className="space-y-8">
                  {groupByQuarter(historyItems).map(([quarter, items]) => (
                    <div key={quarter}>
                      <div className="flex items-center gap-3 mb-3">
                        <p className={`text-[11px] font-semibold uppercase tracking-widerst ${ts}`}>{quarter}</p>
                        <span className={`text-xs ${tm}`}>{items.length} session{items.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className={`rounded-2xl overflow-hidden ${card}`}>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[600px] table-fixed">
                            <thead>
                              <tr className={`border-b ${borderSoft}`}>
                                <th className={`text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3 w-[110px] ${tm}`}>Date</th>
                                <th className={`text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3 w-[160px] ${tm}`}>Student</th>
                                <th className={`text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3 ${tm}`}>Purpose</th>
                                <th className={`text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3 w-[170px] ${tm}`}>Action Taken</th>
                                <th className={`text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3 w-[130px] ${tm}`}>Status</th>
                              </tr>
                            </thead>
                            <tbody className={`divide-y ${dividerCls}`}>
                              {items.map(c => (
                                <tr key={c.id} className={`transition-colors ${hoverBg}`}>
                                  <td className={`px-4 py-3 text-xs whitespace-nowrap ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                    {new Date(c.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </td>
                                  <td className={`px-4 py-3 text-xs ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                    <p className="truncate font-medium">{c.student_name}</p>
                                    <p className={`text-[10px] mt-0.5 ${tm}`}>{c.student_number}</p>
                                  </td>
                                  <td className={`px-4 py-3 text-xs ${ts}`}>
                                    <span className="line-clamp-2">{natureLabel(c)}</span>
                                  </td>
                                  <td className={`px-4 py-3 text-xs ${ts}`}>
                                    <span className="line-clamp-2">{actionLabel(c.action_taken, c.referral, c.referral_specify)}</span>
                                  </td>
                                  <td className="px-4 py-3"><StatusBadge status={c.status} isDark={isDark} /></td>
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

        ) : tab === 'profile' ? (
          <div className="px-3 sm:px-8 py-6 sm:py-10">
            <div>

              {/* Avatar hero */}
              <div className={`relative flex flex-col items-center pb-8 mb-8 border-b ${borderMid}`}>
                <button
                  onClick={() => router.push('/settings')}
                  className="absolute top-0 right-0 px-4 py-2 rounded-lg text-xs font-semibold bg-[#CC0000] text-white hover:opacity-90 transition-opacity">
                  Edit Profile
                </button>

                <div className="w-24 h-24 rounded-full overflow-hidden bg-[#7a0000] flex items-center justify-center text-white text-3xl font-bold select-none ring-4 ring-[#CC0000]/15 flex-shrink-0">
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
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#CC0000]/10 text-[#ff7777] ring-1 ring-[#CC0000]/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#CC0000]" />
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
                      <p className="text-[10px] font-bold text-[#CC0000] uppercase tracking-widest">Personal Information</p>
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
                      <p className="text-[10px] font-bold text-[#CC0000] uppercase tracking-widest">Faculty Information</p>
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
                      <p className="text-[10px] font-bold text-[#CC0000] uppercase tracking-widest">Contact Information</p>
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
                      <p className="text-[10px] font-bold text-[#CC0000] uppercase tracking-widest">Account</p>
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
          const inputCls = `w-full rounded-xl px-3 py-2 text-sm border ${isDark ? 'bg-[#2b2d31] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-800'} focus:outline-none focus:ring-2 focus:ring-[#CC0000]/40`;
          const labelCls = `block text-xs font-semibold uppercase tracking-wider mb-1.5 ${tm}`;
          return (
            <div className="px-3 sm:px-8 py-5 sm:py-8 max-w-3xl">
              <div className="mb-6">
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
                              ? 'bg-[#CC0000]/10 border-[#CC0000]/40 text-[#CC0000]'
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
                <p className="text-gray-500 text-xs mt-0.5">{completingConsult.student_number} · {new Date(completingConsult.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
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
                  <input className="mt-2 w-full rounded-lg bg-[#2d2d2d] border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-[#CC0000]/50 placeholder-gray-600"
                    placeholder="Please specify the office…"
                    value={completeForm.referral_specify}
                    onChange={e => { setCompleteForm(f => ({ ...f, referral_specify: e.target.value })); setCompleteError(''); }} />
                )}
              </div>
            )}
            <div>
              <Label className="text-gray-500 text-xs mb-1.5 block">Remarks (optional)</Label>
              <textarea value={completeForm.remarks} onChange={e => setCompleteForm(f => ({ ...f, remarks: e.target.value }))}
                rows={2} className="w-full rounded-lg bg-[#2d2d2d] border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-[#CC0000]/50 resize-none placeholder-gray-600"
                placeholder="Additional remarks…" />
            </div>
            {completeError && <p className="text-red-400 text-xs">{completeError}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setCompletingConsult(null)} className="flex-1 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-white/5 transition-colors">
                Cancel
              </button>
              <button onClick={handleComplete} className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
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
                <p className="text-gray-500 text-xs mt-0.5">{reschedulingConsult.student_number} · {new Date(reschedulingConsult.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
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
                <input className="mt-2 w-full rounded-lg bg-[#2d2d2d] border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-[#CC0000]/50 placeholder-gray-600"
                  placeholder="Specify office…"
                  value={rescheduleForm.referral_specify}
                  onChange={e => setRescheduleForm(f => ({ ...f, referral_specify: e.target.value }))} />
              )}
            </div>
            <div>
              <Label className="text-gray-500 text-xs mb-1.5 block">Remarks (optional)</Label>
              <textarea value={rescheduleForm.remarks} onChange={e => setRescheduleForm(f => ({ ...f, remarks: e.target.value }))}
                rows={2} className="w-full rounded-lg bg-[#2d2d2d] border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-[#CC0000]/50 resize-none placeholder-gray-600"
                placeholder="Reason for rescheduling…" />
            </div>
            {rescheduleError && <p className="text-red-400 text-xs">{rescheduleError}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setReschedulingConsult(null)} className="flex-1 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-white/5 transition-colors">
                Cancel
              </button>
              <button onClick={handleReschedule} className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors">
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
                className="w-full px-3 py-2 rounded-lg text-white text-sm bg-[#1e1e1e] border border-white/10 focus:outline-none focus:border-[#CC0000]/50 placeholder-gray-600" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-gray-500 text-xs">Time Ranges</Label>
                <button type="button"
                  onClick={() => setEditSched(f => ({ ...f, time_ranges: [...f.time_ranges, { time_start: '', time_end: '' }] }))}
                  className="text-xs text-[#CC0000] hover:text-red-400 transition-colors font-medium">
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
              <button onClick={() => setEditingScheduleSlot(null)} className="flex-1 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-white/5 transition-colors">
                Cancel
              </button>
              <button onClick={handleRequestEditSchedule} className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">
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
                <p className="text-gray-500 text-xs mt-0.5">{cancellingConsult.student_number} · {new Date(cancellingConsult.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
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
              <button onClick={() => setCancellingConsult(null)} className="flex-1 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-white/5 transition-colors">
                Back
              </button>
              <button onClick={handleCancel} className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                Confirm Cancellation
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
