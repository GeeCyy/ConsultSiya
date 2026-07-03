'use client';

import { useEffect, useState, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import * as XLSX from 'xlsx';
import { Label } from '@/components/ui/label';
import UserProfileCard from '@/components/UserProfileCard';
import LeftSidebar from '@/components/LeftSidebar';
import LeaderboardCard, { type LeaderboardItem } from '@/components/LeaderboardCard';
import CustomSelect from '@/components/CustomSelect';

export type ProfessorTab = 'home' | 'schedules' | 'calendar' | 'consultations' | 'export' | 'history';

const PROF_NAV_ITEMS = [
  { key: 'home',          label: 'Home' },
  { key: 'schedules',     label: 'Manage Schedules' },
  { key: 'calendar',      label: 'Booking Calendar' },
  { key: 'consultations', label: 'My Consultations' },
  { key: 'export',        label: 'Export Report' },
  { key: 'history',       label: 'History' },
];
import { Check, X, CalendarClock, CheckCheck, Megaphone, PencilLine } from 'lucide-react';
import ChatbotWidget from '@/components/ChatbotWidget';
import NavigationTour from '@/components/NavigationTour';
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

const MEETING_LINK_PREFIXES = [
  'https://zoom.us/',
  'https://us02web.zoom.us/',
  'https://meet.google.com/',
  'https://teams.microsoft.com/',
];
const isValidMeetingLink = (url: string) => MEETING_LINK_PREFIXES.some(p => url.startsWith(p));

const REFERRAL_OPTIONS = [
  'Peer Advising (W501-Intramuros / R203-Makati)',
  'Counseling of Personal Concerns (Center for Guidance and Counseling)',
  'Career Advising (Center for Career Services)',
  'Other Office (Please Specify)',
];

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

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
  if (c.time) return `${to12h(c.time)}–${to12h(addMins(c.time, 30))}`;
  return `${to12h(c.time_start)}–${to12h(c.time_end)}`;
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
  slot_mode?: string | null;
  preferred_mode?: string | null;
  status: string;
  uploaded_form_path: string | null;
  action_taken: string | null;
  referral: string | null;
  referral_specify: string | null;
  remarks: string | null;
  reschedule_remarks?: string | null;
  notes?: string | null;
  location?: string;
  meeting_link?: string | null;
  student_avatar?: string | null;
  proof_of_evidence: string | null;
  proof_type: 'file' | 'link' | null;
  in_session?: boolean;
  session_started_at?: string | null;
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
  announcement?: string | null;
  meeting_link?: string | null;
  mode?: string | null;
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
  rescheduled:      { darkBg: 'bg-orange-500/15',  lightBg: 'bg-orange-50',   darkText: 'text-orange-400',   lightText: 'text-orange-700',   dot: 'bg-orange-500',   label: 'Rescheduled' },
  needs_reschedule: { darkBg: 'bg-amber-500/15',   lightBg: 'bg-amber-50',    darkText: 'text-amber-400',    lightText: 'text-amber-700',    dot: 'bg-amber-500',    label: 'Reschedule Requested' },
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

function Modal({ title, onClose, children, isDark }: { title: string; onClose: () => void; children: React.ReactNode; isDark?: boolean }) {
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
        className={`relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl ${isDark ? 'border-white/10 bg-[#252525]' : 'border-gray-200 bg-white'}`}
        onClick={e => e.stopPropagation()}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
          <h2 className={`font-bold text-base ${isDark ? 'text-white' : 'text-gray-900'}`}>{title}</h2>
          <button onClick={onClose} className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-gray-200 hover:bg-white/5' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
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
          const isDisabled = isPast || isSunday;
          const isSelected = selected === dateStr;
          const isToday = date.getTime() === today.getTime();
          return (
            <button
              key={dateStr}
              type="button"
              disabled={isDisabled}
              onClick={() => onSelect(dateStr, dayName)}
              className={[
                'relative rounded-lg text-xs py-1.5 font-medium transition-colors w-full',
                isSelected ? 'bg-[#0EA5E9] text-white' :
                isDisabled ? `${dayDisabled} cursor-not-allowed` :
                isToday ? dayToday :
                dayNormal,
              ].join(' ')}>
              {day}
              {hasSlot && !isDisabled && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-400" />
              )}
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

function TimePicker({ value, onChange, dark = true, forceUp = false }: { value: string; onChange: (v: string) => void; dark?: boolean; forceUp?: boolean }) {
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
  const selCls = 'text-sm px-2.5 py-2 w-[4.5rem]';
  return (
    <div className="flex items-center gap-1.5">
      <CustomSelect
        value={h}
        onChange={v => emit(v, m, ampm)}
        isDark={dark}
        className={selCls}
        forceUp={forceUp}
        options={[{ value: '', label: '--' }, ...HOURS.map(hr => ({ value: hr, label: hr }))]}
      />
      <span className={`text-sm font-bold select-none ${dark ? 'text-gray-600' : 'text-gray-400'}`}>:</span>
      <CustomSelect
        value={m}
        onChange={v => emit(h, v, ampm)}
        isDark={dark}
        className={selCls}
        forceUp={forceUp}
        options={MINS.map(mn => ({ value: mn, label: mn }))}
      />
      <CustomSelect
        value={ampm}
        onChange={v => emit(h, m, v)}
        isDark={dark}
        className={selCls}
        forceUp={forceUp}
        options={[{ value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }]}
      />
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
    if (!selected) return;
    setTimeout(() => {
      if (window.innerWidth < 1024) {
        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 60);
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

  const calGlassStyle = isDark ? {
    background: 'rgba(22,23,26,1)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '16px',
    border: '1px solid rgba(255,255,255,0.07)',
  } as const : {
    background: 'rgba(255, 255, 255, 0.82)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.9)',
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(99, 102, 241, 0.14), 0 4px 16px rgba(0, 0, 0, 0.08), 0 1px 4px rgba(0, 0, 0, 0.05)',
  } as const;

  const cardCls = isDark
    ? 'bg-[#1e1f22] border-white/[0.06] shadow-[0_24px_80px_rgba(0,0,0,0.90),0_8px_32px_rgba(0,0,0,0.70),0_2px_8px_rgba(0,0,0,0.50)]'
    : '';
  const tp = isDark ? 'text-white'    : 'text-gray-900';
  const tm = isDark ? 'text-gray-400' : 'text-gray-500';

  const selConsults     = selected ? (consultByDate.get(selected) ?? []) : [];
  const selSlots        = selected ? schedulesForDate(selected) : [];
  const selLabel        = selected ? dateLabelMap.get(selected) : undefined;
  const selIsBlocked    = selected ? blockedMap.has(selected) : false;
  const selBlockedLabel = selected ? blockedMap.get(selected) : undefined;
  const selDateObj      = selected ? new Date(selected + 'T12:00:00') : null;

  return (
    <div ref={calendarRef} className={`rounded-2xl overflow-hidden ${isDark ? 'border' : ''} ${cardCls}`} style={calGlassStyle}>

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

          <div className={`grid grid-cols-7 divide-x divide-y border-b ${isDark ? 'divide-white/[0.08] border-white/[0.08]' : 'divide-gray-300 border-gray-300'}`}>
            {Array.from({ length: firstDow }, (_, i) => (
              <div key={`e${i}`} className={`min-h-[60px] sm:min-h-[88px] ${isDark ? 'bg-[#17181a]/60' : 'bg-gray-50/50'}`} />
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
                  className={`min-h-[60px] sm:min-h-[88px] p-1.5 sm:p-2 text-left flex flex-col transition-all duration-150 focus:outline-none group ${
                    isBlocked
                      ? isDark ? 'bg-red-950/30 hover:bg-red-950/40' : 'bg-red-50/70 hover:bg-red-50'
                      : isSel
                      ? isDark ? 'bg-sky-500/[0.15] ring-1 ring-inset ring-sky-500/40' : 'bg-sky-50/90 ring-1 ring-inset ring-sky-300/60'
                      : isT
                      ? isDark ? 'bg-sky-500/[0.07] hover:bg-sky-500/[0.12]' : 'bg-sky-50/60 hover:bg-sky-50/90'
                      : isDark ? 'hover:bg-white/[0.025]' : 'hover:bg-blue-50/30'
                  }`}>
                  <div className={`w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full text-xs sm:text-sm font-semibold transition-all ${
                    isT
                      ? 'bg-gradient-to-br from-sky-400 to-blue-500 text-white shadow-lg shadow-sky-500/40'
                      : isBlocked
                      ? isDark ? 'text-red-400' : 'text-red-500'
                      : isSel
                      ? isDark ? 'text-sky-300' : 'text-sky-700'
                      : isDark ? 'text-gray-300 group-hover:text-white' : 'text-gray-600 group-hover:text-gray-900'
                  }`}>{day}</div>

                  {(evLabel || (isBlocked && !evLabel)) && (
                    <p className={`hidden sm:block text-[9px] font-semibold leading-tight truncate w-full mt-1 ${
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
            {Array.from({ length: (7 - ((firstDow + daysInMonth) % 7)) % 7 }, (_, i) => (
              <div key={`t${i}`} className={`min-h-[60px] sm:min-h-[88px] ${isDark ? 'bg-[#17181a]/60' : 'bg-gray-50/50'}`} />
            ))}
          </div>

          {/* Legend — acts as the visual border between calendar and detail panel */}
          <div className={`flex items-center gap-x-4 gap-y-1.5 flex-wrap px-4 py-2.5 border-t text-xs font-medium ${isDark ? 'border-white/[0.08] text-gray-500 bg-[#17181a]' : 'border-gray-200 text-gray-400 bg-gray-50/70'}`}>
            {([
              { label: 'Pending',   cls: 'bg-amber-400',   shadow: 'shadow-amber-400/60'   },
              { label: 'Confirmed', cls: 'bg-blue-400',    shadow: 'shadow-blue-400/60'    },
              { label: 'Completed', cls: 'bg-emerald-400', shadow: 'shadow-emerald-400/60' },
              { label: 'Cancelled', cls: 'bg-red-400',     shadow: 'shadow-red-400/60'     },
              { label: 'My Slot',   cls: 'bg-sky-400',     shadow: 'shadow-sky-400/60'     },
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
            style={panelMaxH > 0 ? { height: `${panelMaxH}px`, ...(isDark ? {} : { boxShadow: '-6px 0 24px rgba(0,0,0,0.07)' }) } : (isDark ? {} : { boxShadow: '-6px 0 24px rgba(0,0,0,0.07)' })}
            className={`w-full lg:w-[440px] xl:w-[520px] flex-shrink-0 flex flex-col overflow-y-auto scroll-smooth
            ${isDark
              ? 'border-t lg:border-t-0 lg:border-l border-white/[0.06] bg-[#17181a]'
              : 'bg-white border-l border-gray-200'
            }`}>

            <div className={`sticky top-0 z-10 relative px-5 pt-4 pb-3 border-b
              ${isDark ? 'border-white/[0.06] bg-[#17181a]' : 'border-gray-100 bg-white'}`}>
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
            <div className="px-5 pt-3.5 pb-2">
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
                          {to12h((c.time || c.time_start)?.slice(0,5) ?? '')} · {(() => { const m = c.slot_mode === 'BOTH' ? 'BOTH' : c.slot_mode === 'OL' ? 'OL' : c.slot_mode ? 'F2F' : (c.mode || 'F2F'); return m === 'BOTH' ? 'F2F & Online' : m === 'F2F' ? 'In-Person' : 'Online'; })()}
                        </p>
                      </div>
                      <StatusBadge status={c.status} isDark={isDark} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* My Schedule section */}
            <div className="px-5 pt-2 pb-3">
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
            <div className={`px-5 pt-3 pb-5 mt-auto border-t ${isDark ? 'border-white/[0.06]' : 'border-gray-100'}`}>
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

export default function ProfessorDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('home');
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [pastSlotsOpen, setPastSlotsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const [topNavNotifOpen, setTopNavNotifOpen] = useState(false);
  const [topNavProfileOpen, setTopNavProfileOpen] = useState(false);
  const [seenPendingIds, setSeenPendingIds] = useState<Set<number>>(new Set());
  const topNavNotifRef        = useRef<HTMLDivElement>(null);
  const topNavNotifPanelRef   = useRef<HTMLDivElement>(null);
  const topNavProfileRef      = useRef<HTMLDivElement>(null);
  const topNavProfilePanelRef = useRef<HTMLDivElement>(null);

  const [profileCard, setProfileCard] = useState<{ id: number; role: 'professor' | 'student' } | null>(null);

  // Complete modal
  const [completingConsult, setCompletingConsult] = useState<Consultation | null>(null);
  const [completeForm, setCompleteForm] = useState({ action_taken: '', referral: '', referral_specify: '', remarks: '' });
  const [completeError, setCompleteError] = useState('');

  // Reschedule modal
  const [reschedulingConsult, setReschedulingConsult] = useState<Consultation | null>(null);
  const [rescheduleRemarks, setRescheduleRemarks] = useState('');
  const [rescheduleError, setRescheduleError] = useState('');
  const [rescheduleSaving, setRescheduleSaving] = useState(false);

  // History page
  const [histSearch,     setHistSearch]     = useState('');
  const [histStatus,     setHistStatus]     = useState<'all' | 'completed' | 'missed'>('all');
  const [expandedHistId, setExpandedHistId] = useState<number | null>(null);
  const [histNotes,      setHistNotes]      = useState<Record<number, { action_taken: string; remarks: string }>>({});
  const [histSaving,     setHistSaving]     = useState<number | null>(null);

  // Export filters
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');
  const [exportTerm, setExportTerm] = useState('');
  const [exportStatus, setExportStatus] = useState<'all' | 'pending' | 'confirmed' | 'completed' | 'cancelled'>('all');
  const [pdfExporting, setPdfExporting] = useState(false);
  const [histTermExporting, setHistTermExporting] = useState<string | null>(null);

  // Add schedule
  const [newSched, setNewSched] = useState({ day: 'Monday', location: '', time_ranges: [{ time_start: '', time_end: '' }] as TimeRange[] });
  const [newSchedDate, setNewSchedDate] = useState('');
  const [newSchedMode, setNewSchedMode] = useState<'F2F' | 'Online'>('F2F');
  const [newSchedAnnouncement, setNewSchedAnnouncement] = useState('');
  const [newSchedMeetingLink, setNewSchedMeetingLink] = useState('');
  const [schedError, setSchedError] = useState('');
  const [showConfirmSched, setShowConfirmSched] = useState(false);
  const [pendingSched, setPendingSched] = useState<(typeof newSched & { mode: string }) | null>(null);

  // Edit schedule modal
  const [editingScheduleSlot, setEditingScheduleSlot] = useState<Schedule | null>(null);
  const [editSched, setEditSched] = useState({ day: 'Monday', location: '', time_ranges: [{ time_start: '', time_end: '' }] as TimeRange[] });
  const [editSchedDate, setEditSchedDate] = useState('');
  const [editSchedMode, setEditSchedMode] = useState<'F2F' | 'Online'>('F2F');
  const [editSchedAnnouncement, setEditSchedAnnouncement] = useState('');
  const [editSchedMeetingLink, setEditSchedMeetingLink] = useState('');
  const [editSchedError, setEditSchedError] = useState('');
  const [showConfirmEdit, setShowConfirmEdit] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<{ id: number; date: string; announcement?: string; meeting_link?: string; mode?: string } & typeof editSched | null>(null);

  const [downloadingForm, setDownloadingForm]   = useState<number | null>(null);
  const [viewingProof, setViewingProof]         = useState<number | null>(null);
  const [togglingSession, setTogglingSession]   = useState<number | null>(null);
  const [sessionStartAt, setSessionStartAt]     = useState<number | null>(null);
  const [sessionElapsed, setSessionElapsed]     = useState(0);
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Meeting link modal (for confirming OL consultations)
  const [meetingLinkConsult, setMeetingLinkConsult] = useState<Consultation | null>(null);
  const [meetingLinkInput, setMeetingLinkInput] = useState('');

  // Edit meeting link modal (for already-confirmed OL consultations)
  const [editLinkConsult, setEditLinkConsult] = useState<Consultation | null>(null);
  const [editLinkInput, setEditLinkInput] = useState('');
  const [editLinkError, setEditLinkError] = useState('');
  const [bulkMeetingLinkError, setBulkMeetingLinkError] = useState('');

  // Cancel modal
  const [cancellingConsult, setCancellingConsult] = useState<Consultation | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');

  // My Consultations — search / filter / sort
  const [consultSearch,       setConsultSearch]       = useState('');
  const [consultStatusFilter, setConsultStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'rescheduled' | 'needs_reschedule'>('all');
  const [consultSortBy,       setConsultSortBy]       = useState<'date' | 'name' | 'status'>('date');
  const [consultSortDir,      setConsultSortDir]      = useState<'asc' | 'desc'>('desc');
  const [sortMenuOpen,        setSortMenuOpen]        = useState(false);
  const sortMenuBtnRef = useRef<HTMLButtonElement>(null);
  const sortMenuPanelRef = useRef<HTMLDivElement>(null);

  // Bulk selection
  const [selectedIds,     setSelectedIds]     = useState<Set<number>>(new Set());
  const [bulkCancelOpen,  setBulkCancelOpen]  = useState(false);
  const [bulkCancelReason,setBulkCancelReason]= useState('');
  const [bulkCancelError, setBulkCancelError] = useState('');
  const [bulkMeetingLinkOpen,  setBulkMeetingLinkOpen]  = useState(false);
  const [bulkMeetingLinkInput, setBulkMeetingLinkInput] = useState('');
  const [bulkRescheduleOpen,    setBulkRescheduleOpen]    = useState(false);
  const [bulkRescheduleRemarks, setBulkRescheduleRemarks] = useState('');
  const [bulkRescheduleError,   setBulkRescheduleError]   = useState('');

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

  // Weekly overview modal
  const [weeklyModalOpen, setWeeklyModalOpen] = useState(false);
  const [weeklySelectedDate, setWeeklySelectedDate] = useState<string | null>(null);

  // Navbar scroll-aware state
  const [navScrolled, setNavScrolled] = useState(false);
  const mainScrollRef = useRef<HTMLElement>(null);

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

  // Session timer — counts up while professor has an active in-session consultation
  useEffect(() => {
    if (sessionStartAt !== null) {
      setSessionElapsed(Math.floor((Date.now() - sessionStartAt) / 1000));
      sessionTimerRef.current = setInterval(() => {
        setSessionElapsed(Math.floor((Date.now() - sessionStartAt) / 1000));
      }, 1000);
    } else {
      setSessionElapsed(0);
    }
    return () => { if (sessionTimerRef.current) clearInterval(sessionTimerRef.current); };
  }, [sessionStartAt]);

  // Seed the timer from the DB timestamp so the elapsed time survives page refreshes.
  // Runs whenever consultations load or are refreshed; derives sessionStartAt from
  // the stored session_started_at rather than relying on a click timestamp.
  useEffect(() => {
    const active = consultations.find(c => c.in_session && c.session_started_at);
    setSessionStartAt(active?.session_started_at
      ? new Date(active.session_started_at).getTime()
      : null
    );
  }, [consultations]);

  // navScrolled is driven by onScroll on the <main> element — no useEffect needed

  // Auth guard — confirm token + role before rendering anything
  useEffect(() => {
    const t = localStorage.getItem('token');
    const r = localStorage.getItem('role');
    if (!t) { router.push('/login'); return; }
    if (r !== 'professor') { router.push('/dashboard/home'); return; }
    setAuthReady(true);

    const onTabChange = (e: Event) => setTab((e as CustomEvent<string>).detail as Tab);
    window.addEventListener('consulta-tab-change', onTabChange);
    return () => window.removeEventListener('consulta-tab-change', onTabChange);
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

  // Subscribe to real-time consultation status changes via SSE
  useEffect(() => {
    if (!authReady || !token) return;
    const es = new EventSource(
      `${API_URL}/api/notifications/stream?token=${encodeURIComponent(token)}`
    );
    let errorCount = 0;
    es.onmessage = (e) => {
      errorCount = 0;
      try {
        const data = JSON.parse(e.data);
        if (data.type !== 'consultation_status_update' && data.type !== 'proof_submitted') return;
        api.get('/api/consultations', token!).then((c: unknown) => {
          setConsultations(Array.isArray(c) ? c : []);
        }).catch(() => {});
      } catch { /* ignore malformed */ }
    };
    es.onerror = () => {
      errorCount++;
      if (errorCount >= 5) es.close();
    };
    return () => es.close();
  }, [authReady, token]);

  // Weekly overview modal: intercept back button + Escape key
  useEffect(() => {
    if (!weeklyModalOpen) return;
    window.history.pushState({ weeklyModal: true }, '');
    const onPop = () => setWeeklyModalOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setWeeklyModalOpen(false); };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
    };
  }, [weeklyModalOpen]);

  // Close desktop top-nav notification panel on outside click
  useEffect(() => {
    if (!topNavNotifOpen) return;
    const handler = (e: MouseEvent) => {
      const inBtn   = topNavNotifRef.current?.contains(e.target as Node);
      const inPanel = topNavNotifPanelRef.current?.contains(e.target as Node);
      if (!inBtn && !inPanel) setTopNavNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [topNavNotifOpen]);

  // Load previously-seen pending IDs from localStorage when profile is ready
  useEffect(() => {
    if (!profile.email) return;
    try {
      const stored = localStorage.getItem(`prof_seen_pending_${profile.email}`);
      if (stored) setSeenPendingIds(new Set(JSON.parse(stored) as number[]));
    } catch {}
  }, [profile.email]);

  // Close desktop top-nav profile dropdown on outside click
  useEffect(() => {
    if (!topNavProfileOpen) return;
    const handler = (e: MouseEvent) => {
      const inBtn   = topNavProfileRef.current?.contains(e.target as Node);
      const inPanel = topNavProfilePanelRef.current?.contains(e.target as Node);
      if (!inBtn && !inPanel) setTopNavProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [topNavProfileOpen]);

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
    const link = editLinkInput.trim();
    if (link && !isValidMeetingLink(link)) {
      setEditLinkError('Link must be a Zoom, Google Meet, or Microsoft Teams URL.');
      return;
    }
    setEditLinkError('');
    const data = await api.patch(`/api/consultations/${editLinkConsult.id}/meeting-link`, { meeting_link: link || null }, token!);
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
    const needsLink = toConfirm.some(c => c.slot_mode === 'BOTH' || c.slot_mode === 'OL' || c.mode === 'OL' || c.mode === 'BOTH');
    if (needsLink) {
      setBulkMeetingLinkInput('');
      setBulkMeetingLinkOpen(true);
      return;
    }
    await Promise.all(toConfirm.map(c => api.patch(`/api/consultations/${c.id}/confirm`, {}, token!)));
    clearSelection();
    fetchAll();
    toast.success(`${toConfirm.length} consultation${toConfirm.length !== 1 ? 's' : ''} confirmed.`);
  };

  const handleBulkConfirmWithLink = async () => {
    const toConfirm = visibleConsultations.filter(c => selectedIds.has(c.id) && c.status === 'pending');
    if (!toConfirm.length) return;
    const rawLink = bulkMeetingLinkInput.trim();
    if (rawLink && !isValidMeetingLink(rawLink)) {
      setBulkMeetingLinkError('Link must be a Zoom, Google Meet, or Microsoft Teams URL.');
      return;
    }
    setBulkMeetingLinkError('');
    const link = rawLink || undefined;
    await Promise.all(toConfirm.map(c => {
      const needsLink = c.slot_mode === 'BOTH' || c.slot_mode === 'OL' || c.mode === 'OL' || c.mode === 'BOTH';
      return api.patch(`/api/consultations/${c.id}/confirm`, needsLink ? { meeting_link: link } : {}, token!);
    }));
    setBulkMeetingLinkOpen(false);
    setBulkMeetingLinkInput('');
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

  const handleBulkReschedule = async () => {
    const toReschedule = visibleConsultations.filter(c => selectedIds.has(c.id) && (c.status === 'pending' || c.status === 'confirmed'));
    if (!toReschedule.length) return;
    setBulkRescheduleError('');
    await Promise.all(toReschedule.map(c => api.patch(`/api/consultations/${c.id}/request-reschedule`, { reschedule_remarks: bulkRescheduleRemarks }, token!)));
    setBulkRescheduleOpen(false);
    setBulkRescheduleRemarks('');
    clearSelection();
    fetchAll();
    toast.success(`Reschedule request sent for ${toReschedule.length} consultation${toReschedule.length !== 1 ? 's' : ''}.`);
  };

  const openRescheduleModal = (c: Consultation) => {
    setReschedulingConsult(c);
    setRescheduleRemarks('');
    setRescheduleError('');
  };

  const handleReschedule = async () => {
    if (!reschedulingConsult || rescheduleSaving) return;
    setRescheduleError('');
    setRescheduleSaving(true);
    try {
      const data = await api.patch(`/api/consultations/${reschedulingConsult.id}/request-reschedule`, { reschedule_remarks: rescheduleRemarks }, token!);
      if (data.error) { setRescheduleError(data.error); return; }
      setReschedulingConsult(null);
      fetchAll();
      toast.success('Reschedule request sent to student.');
    } finally {
      setRescheduleSaving(false);
    }
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

  const handleToggleInSession = async (c: Consultation) => {
    setTogglingSession(c.id);
    try {
      const next = !c.in_session;
      const data = await api.patch(`/api/consultations/${c.id}/in-session`, { in_session: next }, token!);
      if (data.error) { toast.error(data.error); return; }
      // Persist session_started_at in local state so the consultations useEffect
      // keeps sessionStartAt in sync without needing another fetch.
      setConsultations(prev => prev.map(x =>
        x.id === c.id
          ? { ...x, in_session: next, session_started_at: data.session_started_at ?? null }
          : (next ? x : { ...x, in_session: false, session_started_at: null })
      ));
      // Also set sessionStartAt directly so the timer responds immediately
      // (the consultations useEffect will arrive at the same value on its next run).
      if (next) {
        setSessionStartAt(data.session_started_at ? new Date(data.session_started_at).getTime() : Date.now());
      } else {
        setSessionStartAt(null);
      }
    } finally {
      setTogglingSession(null);
    }
  };

  const handleViewProof = async (id: number, proofType: string | null, proofOfEvidence: string | null) => {
    if (proofType === 'link') {
      if (proofOfEvidence) window.open(proofOfEvidence, '_blank');
      return;
    }
    setViewingProof(id);
    try {
      const res = await fetch(`${API_URL}/api/consultations/${id}/proof`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const e = await res.json(); toast.error(e.error || 'Could not open proof file.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } finally { setViewingProof(null); }
  };

  // Schedule add — show confirmation dialog first
  const handleRequestAddSchedule = () => {
    setSchedError('');
    if (!newSchedDate) { setSchedError('Please select a date.'); return; }
    if (newSchedMode === 'F2F' && !newSched.location.trim()) { setSchedError('Location is required for Face-to-Face slots.'); return; }
    if (newSched.time_ranges.length === 0) { setSchedError('At least one time range is required.'); return; }
    for (const r of newSched.time_ranges) {
      if (!r.time_start || !r.time_end) { setSchedError('Please fill in all time range fields.'); return; }
      if (r.time_start >= r.time_end) { setSchedError('End time must be after start time in each range.'); return; }
    }
    const nowManila = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Manila', hour12: false });
    const [todayStr, currentTimeStr] = nowManila.split(', ');
    if (newSchedDate === todayStr) {
      const allPast = newSched.time_ranges.every(r => r.time_end && r.time_end.slice(0, 5) <= currentTimeStr.slice(0, 5));
      if (allPast) {
        setSchedError('Cannot add a slot with a time that has already passed.');
        return;
      }
    }
    const resolvedMode = newSchedMode === 'Online' ? 'OL' : 'FF';
    const resolvedLocation = newSchedMode === 'Online' ? '' : newSched.location;
    setPendingSched({ ...newSched, location: resolvedLocation, mode: resolvedMode });
    setShowConfirmSched(true);
  };

  const handleConfirmAddSchedule = async () => {
    if (!pendingSched) return;
    setShowConfirmSched(false);
    const announcement = newSchedAnnouncement.trim() || undefined;
    const meeting_link = newSchedMode === 'Online' ? (newSchedMeetingLink.trim() || undefined) : undefined;
    const payload = { ...pendingSched, date: newSchedDate, announcement, meeting_link };
    const data = await api.post('/api/schedules', payload, token!);
    if (data.error) { setSchedError(data.error); return; }
    setNewSched({ day: 'Monday', location: '', time_ranges: [{ time_start: '', time_end: '' }] });
    setNewSchedDate('');
    setNewSchedMeetingLink('');
    setNewSchedMode('F2F');
    setNewSchedAnnouncement('');
    setPendingSched(null);
    fetchAll();
  };

  // Schedule edit modal
  const openEditModal = (s: Schedule) => {
    setEditingScheduleSlot(s);
    const slotMode: 'F2F' | 'Online' =
      s.mode === 'OL' ? 'Online' :
      s.mode === 'FF' ? 'F2F' :
      s.location === 'Online Only' ? 'Online' : 'F2F';
    setEditSchedMode(slotMode);
    setEditSched({
      day: s.day,
      location: (slotMode === 'Online') ? '' : (s.location || ''),
      time_ranges: s.time_ranges?.length
        ? s.time_ranges.map(r => ({ time_start: r.time_start.slice(0, 5), time_end: r.time_end.slice(0, 5) }))
        : [{ time_start: s.time_start.slice(0, 5), time_end: s.time_end.slice(0, 5) }],
    });
    setEditSchedDate(s.date || '');
    setEditSchedAnnouncement(s.announcement || '');
    setEditSchedMeetingLink(s.meeting_link || '');
    setEditSchedError('');
  };

  const handleRequestEditSchedule = () => {
    setEditSchedError('');
    if (!editSchedDate) { setEditSchedError('Please select a date.'); return; }
    if (editSchedMode === 'F2F' && !editSched.location.trim()) { setEditSchedError('Location is required for Face-to-Face slots.'); return; }
    if (editSched.time_ranges.length === 0) { setEditSchedError('At least one time range is required.'); return; }
    for (const r of editSched.time_ranges) {
      if (!r.time_start || !r.time_end) { setEditSchedError('Please fill in all time range fields.'); return; }
      if (r.time_start >= r.time_end) { setEditSchedError('End time must be after start time in each range.'); return; }
    }
    const resolvedMode = editSchedMode === 'Online' ? 'OL' : 'FF';
    const resolvedLocation = editSchedMode === 'Online' ? '' : editSched.location;
    const meeting_link = editSchedMode === 'Online' ? (editSchedMeetingLink.trim() || undefined) : undefined;
    setPendingEdit({ id: editingScheduleSlot!.id, ...editSched, location: resolvedLocation, date: editSchedDate, announcement: editSchedAnnouncement.trim() || undefined, meeting_link, mode: resolvedMode });
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

  const handleExport = async (format: 'excel' | 'pdf') => {
    const rows = getExportRows();
    if (rows.length === 0) { toast.error('No records match the selected filters.'); return; }

    const proofLabel = (c: Consultation): string => {
      if (!c.proof_of_evidence) return '—';
      if (c.proof_type === 'link') return c.proof_of_evidence;
      return c.proof_of_evidence; // filename
    };

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
      proofLabel(c),
    ]);

    const headers = ['Student Name', 'Student No.', 'Program', 'Date', 'Time', 'Mode', 'Nature of Advising', 'Action Taken', 'Status', 'Proof of Evidence'];

    if (format === 'pdf') {
      if (pdfExporting) return;
      setPdfExporting(true);
      try {
        const params = new URLSearchParams();
        if (exportDateFrom) params.set('date_from', exportDateFrom);
        if (exportDateTo)   params.set('date_to',   exportDateTo);
        if (exportStatus !== 'all') params.set('status', exportStatus);

        const resp = await fetch(`${API_URL}/api/reports/pdf?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          toast.error(err.error || 'Failed to generate PDF.');
          return;
        }
        const blob = await resp.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `advising-report-${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`PDF downloaded (${rows.length} record${rows.length !== 1 ? 's' : ''}).`);
      } catch {
        toast.error('Failed to generate PDF. Please try again.');
      } finally {
        setPdfExporting(false);
      }
    } else {
      const wsData = [headers, ...tableData];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [20, 14, 14, 14, 10, 8, 30, 16, 12, 40].map(w => ({ wch: w }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Advising Records');
      XLSX.writeFile(wb, `advising-report-${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })}.xlsx`);
      toast.success(`Excel downloaded (${rows.length} record${rows.length !== 1 ? 's' : ''}).`);
    }
  };

  const handleHistTermExport = async (termLabel: string, items: Consultation[], format: 'pdf' | 'excel') => {
    if (histTermExporting) return;
    const key = `${termLabel}-${format}`;
    setHistTermExporting(key);
    try {
      const dates = items.map(c => c.date).sort();
      const dateFrom = dates[0];
      const dateTo   = dates[dates.length - 1];
      const params   = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, status: 'all' });
      const endpoint = format === 'pdf' ? '/api/reports/pdf' : '/api/reports/excel';
      const ext      = format === 'pdf' ? 'pdf' : 'xlsx';
      const resp = await fetch(`${API_URL}${endpoint}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        toast.error(err.error || `Failed to generate ${format.toUpperCase()}.`);
        return;
      }
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `archive-${termLabel.replace(/[^a-z0-9]/gi, '-')}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} downloaded (${items.length} record${items.length !== 1 ? 's' : ''}).`);
    } catch {
      toast.error(`Failed to generate ${format.toUpperCase()}. Please try again.`);
    } finally {
      setHistTermExporting(null);
    }
  };

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const visibleConsultations = consultations.filter(
    c => c.status === 'confirmed' || c.status === 'rescheduled' || c.status === 'needs_reschedule' || (c.status === 'pending' && c.date >= todayStr)
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
      const dir = consultSortDir === 'asc' ? 1 : -1;
      if (consultSortBy === 'name')   return dir * a.student_name.localeCompare(b.student_name);
      if (consultSortBy === 'status') return dir * a.status.localeCompare(b.status);
      const dateA = a.date + (a.time_start || a.time || '');
      const dateB = b.date + (b.time_start || b.time || '');
      return dir * dateA.localeCompare(dateB);
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
      selected
        ? isDark ? 'bg-[#0EA5E9]/10 ring-1 ring-[#0EA5E9]/30 text-white' : 'bg-sky-50 ring-1 ring-sky-300/60 text-gray-900'
        : isDark ? 'bg-[#2d2d2d] text-gray-400 hover:bg-white/5' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
    }`;

  const radioBtn = (selected: boolean) => (
    <span className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center ${
      selected ? 'border-[#0EA5E9] bg-[#0EA5E9]' : isDark ? 'border-gray-600' : 'border-gray-300'
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
  const activeSessionConsult = consultations.find(c => c.in_session && !!c.session_started_at) ?? null;
  const profInSession = activeSessionConsult !== null;

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
  const card      = isDark ? 'relative z-[1] rounded-2xl bg-[#252525] border border-white/5 shadow-[0_10px_40px_rgba(0,0,0,0.60),0_4px_12px_rgba(0,0,0,0.40)]' : '';
  const glassStyle = {
    background: 'rgba(255, 255, 255, 0.82)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.9)',
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(99, 102, 241, 0.14), 0 4px 16px rgba(0, 0, 0, 0.08), 0 1px 4px rgba(0, 0, 0, 0.05)',
  } as const;
  const glassStyleSm = { ...glassStyle, borderRadius: '12px' } as const;
  const tp        = isDark ? 'text-white'    : 'text-gray-900';
  const ts        = isDark ? 'text-gray-400' : 'text-gray-500';
  const tm        = isDark ? 'text-gray-400' : 'text-gray-500';
  const modePill  = (m: string) => m === 'Online'
    ? isDark ? 'bg-blue-500/20 text-blue-300'      : 'bg-blue-50 text-blue-600'
    : isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-50 text-emerald-700';
  const modeDot   = (m: string) => m === 'Online' ? 'bg-blue-400' : 'bg-emerald-400';
  const cardRaw    = isDark ? 'relative z-[1] rounded-2xl bg-[#252525]' : '';
  const innerCard  = isDark ? 'bg-white/[0.03] border-white/5' : 'bg-gray-50 border-gray-100';
  const dividerCls = isDark ? 'divide-white/5' : 'divide-gray-100';
  const borderSoft = isDark ? 'border-white/5' : 'border-gray-200';
  const borderMid  = isDark ? 'border-white/10' : 'border-gray-200';
  const hoverBg    = isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-gray-50/80';

  const btnPrimary   = 'bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-[10px] transition-colors duration-150';
  const btnSecondary = isDark
    ? 'border border-white/20 text-gray-300 bg-transparent font-medium rounded-[10px] transition-colors duration-150 hover:bg-white/8 hover:border-white/30'
    : 'border border-gray-300 text-gray-600 bg-transparent font-medium rounded-[10px] transition-colors duration-150 hover:bg-gray-50 hover:border-gray-400';
  const btnDanger    = isDark
    ? 'border border-red-400/40 text-red-400 bg-transparent font-semibold rounded-[10px] transition-colors duration-150 hover:bg-red-500/10 hover:border-red-400/60'
    : 'border border-red-300 text-red-500 bg-transparent font-semibold rounded-[10px] transition-colors duration-150 hover:bg-red-50 hover:border-red-400';
  const btnSuccess   = 'bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-[10px] transition-colors duration-150';

  const handleNavSignOut = () => {
    const tourStudent = localStorage.getItem('consulta-tour-done-student');
    const tourProf    = localStorage.getItem('consulta-tour-done-professor');
    const tourAdmin   = localStorage.getItem('consulta-tour-done-admin');
    localStorage.clear();
    if (tourStudent) localStorage.setItem('consulta-tour-done-student', tourStudent);
    if (tourProf)    localStorage.setItem('consulta-tour-done-professor', tourProf);
    if (tourAdmin)   localStorage.setItem('consulta-tour-done-admin', tourAdmin);
    router.push('/login');
  };

  const handleTabChange = (next: ProfessorTab) => {
    setWeeklyModalOpen(false);
    setTab(next);
    router.replace(`?view=${next}`, { scroll: false });
  };

  // Block all rendering until token + role are confirmed — prevents flash of wrong layout
  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: isDark ? '#1e2235' : 'linear-gradient(135deg, #93c5fd 0%, #bfdbfe 45%, #eff6ff 100%)' }}>
        <div className="w-8 h-8 border-2 border-[#0EA5E9] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const unseenPendingCount = consultations.filter(c => c.status === 'pending' && !seenPendingIds.has(c.id)).length;

  return (
    <div className={`h-screen flex overflow-hidden relative ${isDark ? 'bg-[#1e2235]' : ''}`} style={!isDark ? { background: 'linear-gradient(135deg, #93c5fd 0%, #bfdbfe 45%, #eff6ff 100%)' } : undefined}>
      {/* Mapua logo full-page watermark */}
      <img
        src="/mapua-logo.png"
        alt=""
        aria-hidden
        className={`pointer-events-none select-none fixed inset-0 w-full h-full object-contain z-0 ${isDark ? 'opacity-[0.18]' : 'opacity-[0.12]'}`}
        style={isDark ? { filter: 'drop-shadow(0 0 80px rgba(14,165,233,0.6)) drop-shadow(0 0 40px rgba(99,102,241,0.4)) drop-shadow(0 0 120px rgba(14,165,233,0.3))' } : { filter: 'drop-shadow(0 0 30px rgba(99,102,241,0.15))' }}
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

      <div className="lg:hidden">
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
          hideDesktopSidebar={true}
        />
      </div>

      {/* ── Desktop Top Navbar — full-width, transparent at top / solid when scrolled ── */}
      <div
        className="hidden lg:flex items-center h-16 px-6 gap-0 border-b"
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          transition: 'background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease',
          background: navScrolled
            ? (isDark ? 'rgba(20,21,26,0.97)' : 'rgba(255,255,255,0.97)')
            : 'transparent',
          backdropFilter: navScrolled ? 'blur(12px)' : 'none',
          WebkitBackdropFilter: navScrolled ? 'blur(12px)' : 'none',
          borderBottomColor: navScrolled
            ? (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.14)')
            : 'transparent',
          boxShadow: navScrolled
            ? (isDark ? '0 2px 20px rgba(0,0,0,0.6)' : '0 2px 12px rgba(0,0,0,0.10)')
            : 'none',
        }}
      >
          {/* Logo */}
          <div className="flex items-center gap-3 pr-6 flex-shrink-0">
            <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center overflow-hidden">
              <img src="/consulta-logo.png" alt="Consulta" className="w-full h-full object-contain scale-[1.6]" />
            </div>
            <div>
              <p className="font-bold text-base leading-none transition-colors duration-250" style={{ color: isDark ? '#ffffff' : (navScrolled ? '#111827' : '#1e3a5f') }}>Consulta</p>
              <p className="text-[9px] leading-none mt-1 tracking-wide transition-colors duration-250" style={{ color: isDark ? '#6b7280' : (navScrolled ? '#9ca3af' : '#4b6d8f') }}>MAPUA SOIT</p>
            </div>
          </div>

          {/* Divider */}
          <div className="w-px h-8 flex-shrink-0 mr-2 transition-colors duration-250" style={{ background: isDark ? 'rgba(255,255,255,0.10)' : (navScrolled ? '#e5e7eb' : 'rgba(30,58,95,0.2)') }} />

          {/* Nav links — equal gap between every item */}
          <div className="flex items-center gap-1">
            {PROF_NAV_ITEMS.map(item => {
              const isActive = (tab === 'profile' ? 'home' : tab) === item.key;
              const navPendBadge = item.key === 'consultations' ? consultations.filter(c => c.status === 'pending').length : 0;
              return (
                <button
                  key={item.key}
                  data-tour={`nav-${item.key}`}
                  onClick={() => handleTabChange(item.key as ProfessorTab)}
                  className={`relative flex items-center gap-1.5 rounded-lg text-[15px] font-semibold whitespace-nowrap transition-colors px-3 pt-2 pb-3 ${
                    isActive
                      ? isDark ? 'text-white' : (navScrolled ? 'text-[#0369A1]' : 'text-[#1e3a5f]')
                      : isDark
                        ? 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]'
                        : (navScrolled ? 'text-gray-500 hover:text-gray-800 hover:bg-gray-100' : 'text-[#2d5075]/80 hover:text-[#1e3a5f] hover:bg-white/30')
                  }`}
                >
                  {item.label}
                  {navPendBadge > 0 && (
                    <span className={`inline-flex items-center justify-center min-w-[16px] h-4 px-0.5 rounded-full text-[9px] font-bold ${isActive ? (isDark ? 'bg-white/20 text-white' : 'bg-[#0369A1]/20 text-[#0369A1]') : 'bg-[#0EA5E9] text-white'}`}>
                      {navPendBadge > 9 ? '9+' : navPendBadge}
                    </span>
                  )}
                  {isActive && (
                    <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 h-[3px] w-5 rounded-full ${isDark ? 'bg-white' : 'bg-[#0369A1]'}`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Divider */}
          <div className="w-px h-8 flex-shrink-0 ml-2 transition-colors duration-250" style={{ background: isDark ? 'rgba(255,255,255,0.10)' : (navScrolled ? '#e5e7eb' : 'rgba(30,58,95,0.2)') }} />

          {/* Right icons */}
          <div className="flex items-center gap-1 pl-4 flex-shrink-0">

            {/* Notification bell */}
            <div className="relative" ref={topNavNotifRef}>
              <button
                data-tour="notifications"
                onClick={() => {
                  const opening = !topNavNotifOpen;
                  setTopNavNotifOpen(o => !o);
                  if (opening) {
                    const ids = new Set([...seenPendingIds, ...consultations.filter(c => c.status === 'pending').map(c => c.id)]);
                    setSeenPendingIds(ids);
                    try { localStorage.setItem(`prof_seen_pending_${profile.email || 'default'}`, JSON.stringify([...ids])); } catch {}
                  }
                }}
                className={`relative w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
                </svg>
                {unseenPendingCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-[#CC0000] text-white text-[9px] font-bold flex items-center justify-center">
                    {unseenPendingCount > 9 ? '9+' : unseenPendingCount}
                  </span>
                )}
              </button>
            </div>

            {/* Dark mode toggle */}
            <button
              onClick={toggleTheme}
              title={isDark ? 'Light Mode' : 'Dark Mode'}
              className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {isDark ? (
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0z" /></svg>
              ) : (
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998z" /></svg>
              )}
            </button>

            {/* Professor name + dropdown trigger */}
            <div className="relative" ref={topNavProfileRef}>
              <button
                onClick={() => { setTopNavProfileOpen(o => !o); setTopNavNotifOpen(false); }}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-200 hover:bg-white/5' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                <span className="text-sm font-medium truncate max-w-[140px]">{profile.full_name || 'Professor'}</span>
                <svg
                  className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${topNavProfileOpen ? 'rotate-180' : ''} ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

          </div>
      </div>

      {/* Desktop notification dropdown */}
      {topNavNotifOpen && (
        <div ref={topNavNotifPanelRef} className={`hidden lg:block fixed top-[68px] right-4 z-[9999] w-80 rounded-xl shadow-2xl overflow-hidden border ${isDark ? 'bg-[#252525] border-white/10' : 'bg-white border-gray-200 shadow-[0_8px_30px_rgba(0,0,0,0.12)]'}`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'bg-[#1e1e1e] border-white/10' : 'bg-gray-50 border-gray-200'}`}>
            <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Notifications
              {unseenPendingCount > 0 && (
                <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#CC0000] text-white">
                  {unseenPendingCount} new
                </span>
              )}
            </p>
            <button onClick={() => setTopNavNotifOpen(false)} className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${isDark ? 'text-gray-500 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="overflow-y-auto max-h-80">
            {consultations.filter(c => c.status === 'pending').length > 0 && (
              <div className={`px-4 py-1.5 border-b ${isDark ? 'border-white/5 bg-[#1a1a1a]' : 'border-gray-100 bg-gray-50'}`}>
                <span className={`text-[9px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Pending Requests</span>
              </div>
            )}
            {consultations.filter(c => c.status === 'pending').slice(0, 6).map(c => (
              <div key={`tnc-${c.id}`} className={`border-b ${isDark ? 'border-white/5 bg-white/[0.03]' : 'border-gray-100 bg-blue-50/60'}`}>
                <button
                  onClick={() => { handleTabChange('consultations'); setTopNavNotifOpen(false); }}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${isDark ? 'hover:bg-white/5' : 'hover:bg-blue-50'}`}
                >
                  <span className="text-base flex-shrink-0 mt-0.5">📅</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium leading-snug ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                      <span className="font-semibold">{c.student_name}</span> booked a consultation
                    </p>
                    <p className={`text-[11px] mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      {new Date(c.date.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  {!seenPendingIds.has(c.id) && <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5 bg-[#CC0000]" />}
                </button>
              </div>
            ))}
            {announcements.length > 0 && (
              <div className={`px-4 py-1.5 border-b ${isDark ? 'border-white/5 bg-[#1a1a1a]' : 'border-gray-100 bg-gray-50'}`}>
                <span className={`text-[9px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Announcements</span>
              </div>
            )}
            {announcements.slice(0, 3).map(a => (
              <div key={`tna-${a.id}`} className={`border-b ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                <button
                  onClick={() => setTopNavNotifOpen(false)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}
                >
                  <span className="text-base flex-shrink-0 mt-0.5">{a.type === 'warning' ? '⚠️' : '📢'}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium leading-snug ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{a.title || a.body.slice(0, 60)}</p>
                  </div>
                </button>
              </div>
            ))}
            {consultations.filter(c => c.status === 'pending').length === 0 && announcements.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No notifications</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Profile dropdown */}
      {topNavProfileOpen && (
        <div ref={topNavProfilePanelRef} className="hidden lg:block fixed top-[68px] right-4 z-[9999] min-w-[150px] rounded-xl bg-white shadow-md border border-gray-100 overflow-hidden">
          <button
            onClick={() => { router.push('/settings'); setTopNavProfileOpen(false); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 transition-colors text-left"
          >
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </button>
          <div className="h-px bg-gray-100" />
          <button
            onClick={() => { handleNavSignOut(); setTopNavProfileOpen(false); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors text-left"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9" />
            </svg>
            Sign Out
          </button>
        </div>
      )}

      {/* Weekly Overview Modal */}
      {weeklyModalOpen && (() => {
        const toDS = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const _dow = now.getDay();
        const mon = new Date(now);
        mon.setDate(now.getDate() + (_dow === 0 ? -6 : 1 - _dow));
        mon.setHours(0, 0, 0, 0);
        const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
        const weekDays = DAYS.map((lbl, i) => {
          const d = new Date(mon);
          d.setDate(mon.getDate() + i);
          const ds = toDS(d);
          const items = consultations
            .filter(c => c.date.slice(0,10) === ds)
            .sort((a,b) => (a.time || a.time_start).localeCompare(b.time || b.time_start));
          return { label: lbl, dateStr: ds, dateObj: d, items, isToday: ds === todayStr };
        });
        const visibleDays = weeklySelectedDate ? weekDays.filter(d => d.dateStr === weeklySelectedDate) : weekDays;
        const totalCount = visibleDays.reduce((acc, d) => acc + d.items.length, 0);
        const selectedDay = weeklySelectedDate ? weekDays.find(d => d.dateStr === weeklySelectedDate) : null;
        return (
          <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center sm:p-4" onClick={() => { setWeeklyModalOpen(false); setWeeklySelectedDate(null); }}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <div
              className={`relative z-10 w-full sm:max-w-2xl flex flex-col shadow-2xl
                rounded-t-2xl sm:rounded-2xl border-t sm:border
                max-h-[88vh] sm:max-h-[85vh]
                ${isDark ? 'border-white/10 bg-[#1e1f22]' : 'border-gray-200 bg-white'}`}
              onClick={e => e.stopPropagation()}
            >
              {/* Drag handle (mobile only) */}
              <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className={`w-10 h-1 rounded-full ${isDark ? 'bg-white/20' : 'bg-gray-300'}`} />
              </div>
              {/* Header */}
              <div className={`flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b flex-shrink-0 ${isDark ? 'border-white/[0.08]' : 'border-gray-100'}`}>
                <div className="flex items-center gap-3 min-w-0">
                  {weeklySelectedDate && (
                    <button
                      onClick={() => setWeeklySelectedDate(null)}
                      className={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${isDark ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}
                      title="Back to full week"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                    </button>
                  )}
                  <div>
                    <h2 className={`text-base sm:text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {selectedDay
                        ? `${selectedDay.label} — ${selectedDay.dateObj.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}`
                        : 'Weekly Overview'}
                    </h2>
                    <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {selectedDay ? (
                        <>
                          {totalCount > 0
                            ? <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isDark ? 'bg-sky-500/15 text-sky-400' : 'bg-sky-50 text-sky-600'}`}>{totalCount} consultation{totalCount !== 1 ? 's' : ''}</span>
                            : 'No consultations this day'}
                        </>
                      ) : (
                        <>
                          {mon.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} –{' '}
                          {new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {totalCount > 0 && <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isDark ? 'bg-sky-500/15 text-sky-400' : 'bg-sky-50 text-sky-600'}`}>{totalCount} total</span>}
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <button onClick={() => { setWeeklyModalOpen(false); setWeeklySelectedDate(null); }} className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-gray-200 hover:bg-white/8' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              {/* Body */}
              <div className="overflow-y-auto flex-1 px-3 sm:px-5 py-3 sm:py-4 space-y-3">
                {visibleDays.map(day => (
                  <div
                    key={day.dateStr}
                    id={`wday-${day.dateStr}`}
                    className={`rounded-xl overflow-hidden border transition-shadow ${
                      weeklySelectedDate === day.dateStr
                        ? isDark ? 'border-sky-400/50 shadow-[0_0_0_2px_rgba(56,189,248,0.25)]' : 'border-sky-400 shadow-[0_0_0_2px_rgba(14,165,233,0.15)]'
                        : isDark ? 'border-white/[0.08]' : 'border-gray-100'
                    }`}>
                    {/* Day header */}
                    <div className={`flex items-center justify-between px-3 sm:px-4 py-2.5 ${
                      day.isToday
                        ? 'bg-[#0EA5E9]'
                        : weeklySelectedDate === day.dateStr
                          ? isDark ? 'bg-sky-500/10' : 'bg-sky-50'
                          : isDark ? 'bg-white/[0.05]' : 'bg-gray-50'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold uppercase tracking-widest ${day.isToday ? 'text-sky-100' : isDark ? 'text-gray-300' : 'text-gray-600'}`}>{day.label}</span>
                        <span className={`text-xs font-medium ${day.isToday ? 'text-sky-200' : isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                          {day.dateObj.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                        </span>
                        {day.isToday && <span className="text-[9px] font-black uppercase tracking-wider bg-white/20 text-white px-1.5 py-0.5 rounded-full">Today</span>}
                      </div>
                      {day.items.length > 0 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${day.isToday ? 'bg-white/20 text-white' : isDark ? 'bg-sky-500/15 text-sky-400' : 'bg-sky-100 text-sky-600'}`}>{day.items.length}</span>
                      )}
                    </div>
                    {/* Consultations list */}
                    {day.items.length === 0 ? (
                      <div className={`px-3 sm:px-4 py-3 text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>No consultations</div>
                    ) : (
                      <div className={`divide-y ${isDark ? 'divide-white/[0.05]' : 'divide-gray-100'}`}>
                        {day.items.map(c => {
                          const s = STATUS_STYLES[c.status] ?? { darkBg: 'bg-gray-500/15', lightBg: 'bg-gray-100', darkText: 'text-gray-400', lightText: 'text-gray-600', dot: 'bg-gray-400', label: c.status };
                          return (
                            <div key={c.id} className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 ${isDark ? 'hover:bg-white/[0.03]' : 'hover:bg-gray-50'} transition-colors`}>
                              <span className={`text-xs font-mono tabular-nums w-12 sm:w-14 flex-shrink-0 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                {to12h((c.time || c.time_start)?.slice(0,5) ?? '')}
                              </span>
                              <div className={`hidden sm:block w-px h-4 flex-shrink-0 ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />
                              <Avatar name={c.student_name} avatarUrl={c.student_avatar} size="sm" />
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{c.student_name}</p>
                                <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                  {(() => { const m = c.slot_mode === 'BOTH' ? 'BOTH' : c.slot_mode === 'OL' ? 'OL' : c.slot_mode ? 'F2F' : (c.mode || 'F2F'); return m === 'BOTH' ? 'F2F & Online' : m === 'F2F' ? 'In-Person' : 'Online'; })()}
                                </p>
                              </div>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${isDark ? s.darkBg + ' ' + s.darkText : s.lightBg + ' ' + s.lightText}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                                {s.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Content area ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden" style={!isDark ? { background: 'linear-gradient(135deg, #93c5fd 0%, #bfdbfe 45%, #eff6ff 100%)', minHeight: '100vh' } : undefined}>
        <div className="lg:hidden h-14 flex-shrink-0" />

      {/* Confirmation dialogs */}
      {showConfirmSched && pendingSched && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className={`rounded-2xl p-6 w-full max-w-sm border ${isDark ? 'bg-[#252525] border-white/10' : 'bg-white border-gray-200'}`}>
            <h2 className={`font-bold text-lg mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>Confirm New Schedule</h2>
            <div className="space-y-2 mb-5">
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}><span className={isDark ? 'text-gray-600' : 'text-gray-400'}>Date:</span> {newSchedDate ? new Date(newSchedDate + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : pendingSched.day}</p>
              {pendingSched.time_ranges.map((r, i) => (
                <p key={i} className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}><span className={isDark ? 'text-gray-600' : 'text-gray-400'}>Range {i + 1}:</span> {to12h(r.time_start)} – {to12h(r.time_end)}</p>
              ))}
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}><span className={isDark ? 'text-gray-600' : 'text-gray-400'}>Mode:</span> {pendingSched.mode === 'OL' ? 'Online' : pendingSched.mode === 'BOTH' ? 'Face-to-Face & Online' : 'Face-to-Face'}</p>
              {pendingSched.location && <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}><span className={isDark ? 'text-gray-600' : 'text-gray-400'}>Location:</span> {pendingSched.location}</p>}
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
          <div className={`rounded-2xl p-6 w-full max-w-sm border ${isDark ? 'bg-[#252525] border-white/10' : 'bg-white border-gray-200'}`}>
            <h2 className={`font-bold text-lg mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>Edit Meeting Link</h2>
            <p className="text-gray-500 text-sm mb-5">Update the Zoom or Google Meet link for this consultation.</p>
            <div className="mb-5">
              <label className="text-gray-500 text-xs mb-1.5 block">Meeting Link</label>
              <input
                type="url"
                placeholder="https://zoom.us/j/... or https://meet.google.com/..."
                value={editLinkInput}
                onChange={e => {
                  const val = e.target.value;
                  setEditLinkInput(val);
                  if (val.trim() && !isValidMeetingLink(val.trim())) {
                    setEditLinkError('Invalid link. Please use Zoom, Google Meet, or Teams.');
                  } else {
                    setEditLinkError('');
                  }
                }}
                onKeyDown={e => e.key === 'Enter' && handleSaveMeetingLink()}
                className={`w-full ${fieldCls} ${editLinkError ? '!border-red-500' : ''} ${isDark ? 'placeholder-gray-600' : 'placeholder-gray-400'}`}
              />
              {editLinkError && <p className="text-red-500 text-xs mt-1">{editLinkError}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setEditLinkConsult(null); setEditLinkInput(''); setEditLinkError(''); }} className={`flex-1 py-2 text-sm ${btnSecondary}`}>Cancel</button>
              <button
                onClick={handleSaveMeetingLink}
                disabled={!!editLinkInput.trim() && !isValidMeetingLink(editLinkInput.trim())}
                className={`flex-1 py-2 text-sm ${btnPrimary} disabled:opacity-50`}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkMeetingLinkOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className={`rounded-2xl p-6 w-full max-w-sm border ${isDark ? 'bg-[#252525] border-white/10' : 'bg-white border-gray-200'}`}>
            <h2 className={`font-bold text-lg mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>Confirm Selected Consultations</h2>
            <p className="text-gray-500 text-sm mb-5">Some selected bookings require a meeting link (Online / Both). Optionally provide one — it will be applied to all online/hybrid sessions.</p>
            <div className="mb-5">
              <label className="text-gray-500 text-xs mb-1.5 block">Meeting Link <span className="text-gray-400">(optional)</span></label>
              <input
                type="url"
                placeholder="https://zoom.us/j/... or https://meet.google.com/..."
                value={bulkMeetingLinkInput}
                onChange={e => {
                  const val = e.target.value;
                  setBulkMeetingLinkInput(val);
                  if (val.trim() && !isValidMeetingLink(val.trim())) {
                    setBulkMeetingLinkError('Invalid link. Please use Zoom, Google Meet, or Teams.');
                  } else {
                    setBulkMeetingLinkError('');
                  }
                }}
                onKeyDown={e => e.key === 'Enter' && handleBulkConfirmWithLink()}
                className={`w-full ${fieldCls} ${bulkMeetingLinkError ? '!border-red-500' : ''} ${isDark ? 'placeholder-gray-600' : 'placeholder-gray-400'}`}
              />
              {bulkMeetingLinkError && <p className="text-red-500 text-xs mt-1">{bulkMeetingLinkError}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setBulkMeetingLinkOpen(false); setBulkMeetingLinkInput(''); setBulkMeetingLinkError(''); }} className={`flex-1 py-2 text-sm ${btnSecondary}`}>Cancel</button>
              <button
                onClick={handleBulkConfirmWithLink}
                disabled={!!bulkMeetingLinkInput.trim() && !isValidMeetingLink(bulkMeetingLinkInput.trim())}
                className={`flex-1 py-2 text-sm ${btnSuccess} disabled:opacity-50`}>
                Confirm All
              </button>
            </div>
          </div>
        </div>
      )}


      {showConfirmEdit && pendingEdit && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className={`rounded-2xl p-6 w-full max-w-sm border ${isDark ? 'bg-[#252525] border-white/10' : 'bg-white border-gray-200'}`}>
            <h2 className={`font-bold text-lg mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>Confirm Schedule Edit</h2>
            <div className="space-y-2 mb-5">
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}><span className={isDark ? 'text-gray-600' : 'text-gray-400'}>Date:</span> {pendingEdit.date ? new Date(pendingEdit.date + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : pendingEdit.day}</p>
              {pendingEdit.time_ranges.map((r, i) => (
                <p key={i} className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}><span className={isDark ? 'text-gray-600' : 'text-gray-400'}>Range {i + 1}:</span> {to12h(r.time_start)} – {to12h(r.time_end)}</p>
              ))}
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}><span className={isDark ? 'text-gray-600' : 'text-gray-400'}>Mode:</span> {pendingEdit.mode === 'OL' ? 'Online' : pendingEdit.mode === 'BOTH' ? 'Face-to-Face & Online' : 'Face-to-Face'}</p>
              {pendingEdit.location && <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}><span className={isDark ? 'text-gray-600' : 'text-gray-400'}>Location:</span> {pendingEdit.location}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirmEdit(false)} className={`flex-1 py-2 text-sm ${btnSecondary}`}>Cancel</button>
              <button onClick={handleConfirmEditSchedule} className={`flex-1 py-2 text-sm ${btnPrimary}`}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      <main ref={mainScrollRef} onScroll={e => setNavScrolled((e.currentTarget as HTMLElement).scrollTop > 8)} className="flex-1 overflow-y-auto flex flex-col pt-14 lg:pt-16" style={{ ...(isDark ? { background: 'rgba(18,19,24,0.85)' } : { background: 'linear-gradient(135deg, #93c5fd 0%, #bfdbfe 45%, #eff6ff 100%)' }) }}>
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
              const uniqueStudents = Array.from(
                new Map(items.map(c => [c.student_name, { name: c.student_name, avatar: c.student_avatar }])).values()
              ).slice(0, 3);
              return {
                label: lbl,
                date: ds,
                isToday: ds === todayStr,
                pending:   items.filter(c => c.status === 'pending' || c.status === 'missed').length,
                confirmed: items.filter(c => c.status === 'confirmed' || c.status === 'completed').length,
                completed: items.filter(c => c.status === 'completed').length,
                total: items.length,
                students: uniqueStudents,
                overflow: Math.max(0, new Map(items.map(c => [c.student_name, true])).size - 3),
              };
            });
            const initials = profile.full_name.split(' ').filter(Boolean).map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

            return (
            <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-6 flex flex-col gap-5 sm:gap-6 flex-1">

              {/* ── Welcome header + stat card ── */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                {/* Left: greeting */}
                <div>
                  <p
                    className={`text-[11px] font-bold uppercase tracking-[0.15em] mb-1 ${isDark ? 'text-gray-400' : 'text-gray-800'}`}
                    style={!isDark ? { textShadow: '0 1px 4px rgba(255,255,255,0.8)' } : undefined}
                  >
                    MAPUA UNIVERSITY · SOIT ADVISING PORTAL
                  </p>
                  <h1
                    className={`text-2xl sm:text-3xl font-extrabold leading-tight ${tp}`}
                    style={!isDark ? { textShadow: '0 2px 8px rgba(255,255,255,0.7)' } : undefined}
                  >
                    {greetingWord}{firstName ? `, ${firstName}` : ''} 👋
                  </h1>
                  <p
                    className={`text-sm mt-1 font-medium ${isDark ? 'text-gray-400' : 'text-gray-800'}`}
                    style={!isDark ? { textShadow: '0 1px 4px rgba(255,255,255,0.8)' } : undefined}
                  >
                    {visibleConsultations.length > 0
                      ? `You have ${stats.pending} pending and ${stats.confirmed} confirmed this week.`
                      : 'No upcoming consultations this week.'}
                  </p>
                </div>

                {/* Right: stats card */}
                <div
                  className={`grid grid-cols-2 sm:flex sm:items-center gap-x-5 gap-y-3 sm:gap-5 px-5 sm:px-7 py-4 sm:py-3.5 flex-shrink-0 rounded-2xl sm:rounded-full ${isDark ? 'bg-white/[0.06] border border-white/10 shadow-md shadow-black/40' : ''}`}
                  style={!isDark ? { background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.9)', borderRadius: '9999px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' } : undefined}
                >
                  {([
                    { value: tTotal,        label: 'Total Requests', numColor: '#0EA5E9', darkNumColor: '#7DD3FC' },
                    { value: tApproved,     label: 'Approved',       numColor: '#7C3AED', darkNumColor: '#C4B5FD' },
                    { value: tCompleted,    label: 'Completed',      numColor: '#059669', darkNumColor: '#6EE7B7' },
                    { value: totalStudents, label: 'Students',       numColor: '#7C3AED', darkNumColor: '#C4B5FD' },
                  ] as const).map((s, i, arr) => (
                    <div key={s.label} className={`flex flex-col items-center ${i < arr.length - 1 ? `sm:pr-5 sm:border-r ${isDark ? 'sm:border-white/20' : 'sm:border-gray-400'}` : ''}`}>
                      <span className="text-2xl font-extrabold leading-none" style={{ color: isDark ? s.darkNumColor : s.numColor }}>{s.value}</span>
                      <span className={`text-[11px] font-medium mt-1 ${ts}`}>{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Bento grid — single row, all columns stretch to same height ── */}
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-[240px_1fr_300px] gap-5 items-stretch">

                {/* ── Col 1: Profile card ── */}
                <div
                  className={`rounded-2xl overflow-hidden flex flex-col ${isDark ? 'border border-white/5 shadow-[0_10px_40px_rgba(0,0,0,0.60),0_4px_12px_rgba(0,0,0,0.40)]' : ''}`}
                  style={isDark ? { background: 'rgba(30,31,34,0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: '16px' } : { background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid #f1f5f9', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06),0 4px 16px rgba(0,0,0,0.04)' }}
                >
                  <div className={`flex-shrink-0 px-6 pt-7 pb-6 ${isDark ? 'bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-transparent' : 'bg-gradient-to-br from-sky-50 to-white'}`}>
                    <div className="flex flex-col items-center text-center mb-8">
                      <div className="rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0 ring-2 ring-[#0EA5E9]/30 mb-4" style={{ background: 'linear-gradient(135deg, #0369A1, #0EA5E9)', width: '80px', height: '80px' }}>
                        {profile.avatar && !profile.avatar.startsWith('/uploads/')
                          ? <img src={profile.avatar} alt={profile.full_name} className="w-full h-full object-cover" />
                          : <span className="text-2xl font-bold text-white">{initials}</span>}
                      </div>
                      <p className={`text-xl font-bold ${tp}`}>{profile.full_name}</p>
                      <p className={`text-sm mt-1 ${ts}`}>{profile.department || 'Professor'}</p>
                      <p className="text-xs mt-1 font-medium text-sky-400">MAPUA SOIT</p>
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
                          { label: 'Days to Finals',  value: daysToFinals,   dot: isDark ? 'bg-slate-500' : 'bg-slate-400' },
                          { label: 'Days to End',      value: daysToEnd,      dot: isDark ? 'bg-slate-500' : 'bg-slate-400' },
                          { label: 'Weeks Remaining',  value: currentWeek ? Math.max(0, term.totalWeeks - currentWeek) : term.totalWeeks, dot: isDark ? 'bg-slate-500' : 'bg-slate-400' },
                        ] as const).map(m => (
                          <div key={m.label} className={`flex items-center justify-between px-4 py-3 ${isDark ? 'bg-white/[0.03]' : 'bg-white'}`}>
                            <div className="flex items-center gap-2.5">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${m.dot}`} />
                              <span className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-900'}`}>{m.label}</span>
                            </div>
                            <span className={`text-xl font-bold ${isDark ? 'text-sky-400' : 'text-sky-600'}`}>{m.value}</span>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => handleTabChange('export')}
                        className="w-full mt-2 py-2.5 rounded-xl text-sm font-semibold transition-all bg-gradient-to-r from-[#0369A1] to-[#0EA5E9] text-white hover:from-[#0284c7] hover:to-[#38bdf8] shadow-md shadow-sky-900/30 hover:shadow-sky-500/30 hover:-translate-y-0.5"
                      >
                        Export Records
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
                        <p className={`text-sm ${tm} mt-0.5`}>Consultations breakdown for this week</p>
                      </div>
                      <button onClick={() => setWeeklyModalOpen(true)} className="text-xs text-sky-400 hover:text-sky-300 font-medium transition-colors flex-shrink-0">
                        View all →
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {([
                        { label: 'Upcoming',  value: scheduledCount, bg: isDark ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'         : 'bg-blue-50 text-blue-600 border-blue-100'         },
                        { label: 'Completed', value: completedCount, bg: isDark ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-100' },
                        { label: 'Pending',   value: pendingCount,   bg: isDark ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'       : 'bg-amber-50 text-amber-700 border-amber-100'       },
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
                          onClick={() => { setWeeklySelectedDate(b.date); setWeeklyModalOpen(true); }}
                          title={b.total > 0 ? `${b.total} consultation${b.total !== 1 ? 's' : ''} on ${b.label}` : `No consultations on ${b.label}`}
                          className={`flex-1 flex flex-col items-center justify-between py-3 sm:py-5 px-1 sm:px-2 rounded-xl transition-colors cursor-pointer select-none ${
                            b.isToday
                              ? 'bg-[#0EA5E9] shadow-md shadow-sky-500/25 hover:brightness-110'
                              : b.total > 0
                                ? isDark ? 'bg-white/[0.10] ring-1 ring-white/[0.22] hover:bg-white/[0.16]' : 'bg-white ring-1 ring-gray-300 shadow-sm hover:bg-sky-50 hover:ring-sky-300'
                                : isDark ? 'bg-white/[0.05] ring-1 ring-white/[0.14] hover:bg-white/[0.09]' : 'bg-gray-50 ring-1 ring-gray-300 hover:bg-gray-100'
                          }`}
                        >
                          <span className={`text-[9px] sm:text-xs font-semibold uppercase tracking-wider leading-none ${
                            b.isToday ? 'text-sky-100' : isDark ? (b.total > 0 ? 'text-gray-300' : 'text-gray-400') : (b.total > 0 ? 'text-gray-500' : 'text-gray-400')
                          }`}>{b.label}</span>
                          <span className={`text-2xl sm:text-4xl font-bold leading-none my-2 sm:my-3 ${
                            b.isToday ? 'text-white' : b.total > 0 ? (isDark ? 'text-white' : 'text-gray-800') : (isDark ? 'text-gray-500' : 'text-gray-300')
                          }`}>{b.total > 0 ? b.total : '–'}</span>
                          {/* Student avatars */}
                          <div className="hidden sm:flex items-center justify-center h-8">
                            {b.students.length > 0 ? (
                              <div className="flex -space-x-1.5">
                                {b.students.map((s, si) => (
                                  <div key={si} className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold ring-2 ${b.isToday ? 'ring-[#0EA5E9]' : isDark ? 'ring-[#252525]' : 'ring-white'} overflow-hidden`}
                                    style={{ background: 'linear-gradient(135deg, #0369A1, #0EA5E9)' }}
                                    title={s.name}>
                                    {s.avatar && !s.avatar.startsWith('/uploads/')
                                      ? <img src={s.avatar} alt={s.name} className="w-full h-full object-cover" />
                                      : <span className="text-white">{s.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}</span>}
                                  </div>
                                ))}
                                {b.overflow > 0 && (
                                  <div className={`w-7 h-7 rounded-full flex items-center justify-center ring-2 ${b.isToday ? 'ring-[#0EA5E9] bg-sky-300/30 text-white' : isDark ? 'ring-[#252525] bg-white/10 text-gray-300' : 'ring-white bg-gray-100 text-gray-500'} text-[9px] font-bold flex-shrink-0`}>
                                    +{b.overflow}
                                  </div>
                                )}
                              </div>
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
                    <div className={`mt-4 pt-3 border-t flex items-center gap-4 ${isDark ? 'border-white/15' : 'border-gray-300'}`}>
                      <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /><span className={`text-xs font-medium ${tm}`}>Pending</span></div>
                      <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /><span className={`text-xs font-medium ${tm}`}>Confirmed</span></div>
                      <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#0EA5E9]" /><span className={`text-xs font-medium ${tm}`}>Today</span></div>
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
                        {todayConsultations.map(c => {
                          const isPending   = c.status === 'pending';
                          const isConfirmed = c.status === 'confirmed';
                          return (
                            <div key={c.id} className={`flex items-center gap-3 px-3 py-3 rounded-lg ${isDark ? 'bg-white/[0.03] hover:bg-white/[0.05]' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}>
                              <span className={`text-sm font-mono font-bold tabular-nums w-16 flex-shrink-0 ${tp}`}>
                                {to12h((c.time || c.time_start)?.slice(0, 5) ?? '')}
                              </span>
                              <div className={`w-px h-3.5 flex-shrink-0 ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />
                              <span className={`text-base font-semibold flex-1 truncate ${tp}`}>{c.student_name}</span>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                                isPending   ? (isDark ? 'bg-amber-500/15 text-amber-300'   : 'bg-amber-50 text-amber-700')
                              : isConfirmed ? (isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700')
                              :               (isDark ? 'bg-white/5 text-gray-400'          : 'bg-gray-100 text-gray-500')
                              }`}>
                                {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                              </span>
                              <span className={`text-[10px] flex-shrink-0 ${tm}`}>
                                {(() => { const m = c.slot_mode === 'BOTH' ? 'BOTH' : c.slot_mode === 'OL' ? 'OL' : c.slot_mode ? 'F2F' : (c.mode || 'F2F'); return m === 'BOTH' ? 'F2F & Online' : m === 'F2F' ? 'F2F' : 'Online'; })()}
                              </span>
                            </div>
                          );
                        })}
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

                {/* ── Col 3: Rankings card ── */}
                <div
                  className={`p-4 rounded-2xl flex flex-col ${isDark ? 'border border-white/5 shadow-[0_10px_40px_rgba(0,0,0,0.60),0_4px_12px_rgba(0,0,0,0.40)]' : ''}`}
                  style={isDark ? { background: 'rgba(30,31,34,0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: '16px' } : { background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid #f1f5f9', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06),0 4px 16px rgba(0,0,0,0.04)' }}
                >
                  <div className="flex-shrink-0 flex gap-1.5 mb-3">
                    {(['rankings', 'consulted'] as const).map(v => (
                      <button key={v} onClick={() => setLbView(v)}
                        className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all border ${
                          lbView === v
                            ? isDark ? 'bg-sky-500/15 text-sky-300 border-sky-500/40' : 'bg-sky-50 text-sky-700 border-sky-300'
                            : isDark ? 'bg-transparent text-gray-400 border-white/15 hover:text-gray-300 hover:border-white/25' : 'bg-transparent text-gray-500 border-gray-300 hover:text-gray-700 hover:border-gray-400'
                        }`}>
                        {v === 'rankings' ? 'Rankings' : 'Top Topics'}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-400/30">
                    {lbView === 'rankings' && (
                      <div className="space-y-4">
                        {/* Professors section */}
                        <div>
                          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-3 ${isDark ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-amber-100 border border-amber-300'}`}>
                            <span className="text-base leading-none">🏆</span>
                            <p className={`text-sm font-bold uppercase tracking-widest ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>Professors</p>
                          </div>
                          <div className="space-y-1.5">
                            {lbProfs.slice(0, 3).map((item, i) => {
                              const isMe = item.label === profile.full_name;
                              const medal = ['🥇','🥈','🥉'][i];
                              return (
                                <div key={item.rank} className={`flex items-center gap-3 py-2.5 px-3 rounded-xl transition-colors ${isMe ? (isDark ? 'bg-amber-500/20 ring-1 ring-amber-500/30' : 'bg-amber-50 ring-1 ring-amber-300/60') : (isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-gray-50')}`}>
                                  <span className="text-lg leading-none w-6 text-center flex-shrink-0">{medal}</span>
                                  <span className={`flex-1 text-base truncate font-semibold min-w-0 ${isMe ? (isDark ? 'text-amber-300' : 'text-amber-700') : ts}`}>{item.label}</span>
                                  {isMe && <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0 leading-none ${isDark ? 'bg-amber-500/30 text-amber-300' : 'bg-amber-400 text-white'}`}>you</span>}
                                  <span className={`text-base font-bold tabular-nums flex-shrink-0 ${isMe ? (isDark ? 'text-amber-300' : 'text-amber-600') : tp}`}>{item.count}</span>
                                </div>
                              );
                            })}
                            {lbProfs.length === 0 && <p className={`text-sm ${tm} py-1 px-2`}>No data.</p>}
                          </div>
                        </div>
                        {/* Divider */}
                        <div className={`border-t ${isDark ? 'border-white/20' : 'border-gray-300'}`} />
                        {/* Students section */}
                        <div>
                          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-3 ${isDark ? 'bg-indigo-500/20 border border-indigo-500/30' : 'bg-indigo-100 border border-indigo-300'}`}>
                            <span className="text-base leading-none">🎓</span>
                            <p className={`text-sm font-bold uppercase tracking-widest ${isDark ? 'text-indigo-300' : 'text-indigo-700'}`}>Students</p>
                          </div>
                          <div className="space-y-1.5">
                            {lbStudents.slice(0, 3).map((item, i) => {
                              const medal = ['🥇','🥈','🥉'][i];
                              return (
                                <div key={item.rank} className={`flex items-center gap-3 py-2.5 px-3 rounded-xl transition-colors ${isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-gray-50'}`}>
                                  <span className="text-lg leading-none w-6 text-center flex-shrink-0">{medal}</span>
                                  <span className={`flex-1 text-base truncate font-semibold min-w-0 ${ts}`}>{item.label}</span>
                                  <span className={`text-base font-bold tabular-nums flex-shrink-0 ${tp}`}>{item.count}</span>
                                </div>
                              );
                            })}
                            {lbStudents.length === 0 && <p className={`text-sm ${tm} py-1 px-2`}>No data.</p>}
                          </div>
                        </div>
                      </div>
                    )}
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
                  {/* Top Topics preview — pinned to bottom of rankings card */}
                  {lbView === 'rankings' && lbTopics.length > 0 && (
                    <div className={`flex-shrink-0 mt-4 pt-3 border-t ${isDark ? 'border-white/[0.06]' : 'border-gray-100'}`}>
                      <p className={`text-[9px] font-bold uppercase tracking-widest mb-2 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>🔥 Top Topics</p>
                      <div className="flex flex-wrap gap-1.5">
                        {lbTopics.slice(0, 3).map(t => (
                          <button key={t.label} onClick={() => setLbView('consulted')}
                            className={`text-sm font-semibold px-2.5 py-1 rounded-full transition-colors ${isDark ? 'bg-white/[0.06] text-gray-300 hover:bg-white/10' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {lbView === 'rankings' && lbTopics.length === 0 && tTotal > 0 && (
                    <div className={`flex-shrink-0 mt-4 pt-3 border-t ${isDark ? 'border-white/[0.06]' : 'border-gray-100'}`}>
                      <p className={`text-xs font-semibold ${tm}`}>
                        🎯 {Math.round((tCompleted / tTotal) * 100)}% completion rate this term
                      </p>
                    </div>
                  )}
                </div>

              </div>{/* /bento grid */}

            </div>
            );
          })()

        : tab === 'consultations' ? (
          <div className="relative z-[1] px-4 sm:px-6 lg:px-8 py-5 sm:py-8">

            {/* ── Header ── */}
            <div className="mb-6">
              <h1 className={`text-2xl font-bold ${tp}`}>My Consultations</h1>
              <p className={`text-sm mt-1 ${tp}`}>Review and manage student consultation requests</p>
            </div>

            {/* ── Bento grid ── */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">

              {/* ── Left column: search + list ── */}
              <div className="flex flex-col gap-4 min-w-0">

                {/* Search / Filter / Sort bar */}
                <div className={`p-4 rounded-2xl flex flex-col sm:flex-row gap-3 ${isDark ? 'bg-[#252525] border border-white/5' : 'bg-white shadow-sm'}`}>
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
              {/* Status filter — Notion-style: dot + label + count */}
              <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                {([
                  { key: 'all',         label: 'All',         dot: isDark ? 'bg-gray-400' : 'bg-gray-500',   count: visibleConsultations.length },
                  { key: 'pending',     label: 'Pending',     dot: 'bg-amber-400',                           count: visibleConsultations.filter(c => c.status === 'pending').length },
                  { key: 'confirmed',   label: 'Confirmed',   dot: 'bg-sky-400',                             count: visibleConsultations.filter(c => c.status === 'confirmed').length },
                  { key: 'rescheduled',      label: 'Rescheduled',         dot: 'bg-orange-400', count: visibleConsultations.filter(c => c.status === 'rescheduled').length },
                  { key: 'needs_reschedule', label: 'Reschedule Requested', dot: 'bg-amber-500', count: visibleConsultations.filter(c => c.status === 'needs_reschedule').length },
                ] as const).map(s => {
                  const isActive = consultStatusFilter === s.key;
                  const activeCls =
                    s.key === 'pending'          ? (isDark ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'   : 'bg-amber-50 text-amber-700 border-amber-200') :
                    s.key === 'confirmed'        ? (isDark ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'         : 'bg-sky-50 text-sky-700 border-sky-200') :
                    s.key === 'rescheduled'      ? (isDark ? 'bg-orange-500/15 text-orange-300 border-orange-500/30': 'bg-orange-50 text-orange-700 border-orange-200') :
                    s.key === 'needs_reschedule' ? (isDark ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'   : 'bg-amber-50 text-amber-700 border-amber-200') :
                                                  (isDark ? 'bg-white/8 text-white border-white/15'                : 'bg-gray-100 text-gray-800 border-gray-300');
                  return (
                    <button
                      key={s.key}
                      onClick={() => setConsultStatusFilter(s.key)}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all ${
                        isActive
                          ? activeCls
                          : isDark
                            ? 'text-gray-400 border-transparent hover:text-gray-200 hover:bg-white/5 hover:border-white/10'
                            : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50 hover:border-gray-200'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                      {s.label}
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ml-0.5 ${
                        isActive
                          ? isDark ? 'bg-white/15 text-white' : 'bg-black/8 text-current'
                          : isDark ? 'bg-white/5 text-gray-500' : 'bg-gray-100 text-gray-400'
                      }`}>{s.count}</span>
                    </button>
                  );
                })}
              </div>
              {/* Sort */}
              <div className="flex-shrink-0 relative">
                <button
                  ref={sortMenuBtnRef}
                  onClick={() => {
                    if (!sortMenuOpen) {
                      const rect = sortMenuBtnRef.current?.getBoundingClientRect();
                      if (rect && sortMenuPanelRef.current) {
                        sortMenuPanelRef.current.style.top  = `${rect.bottom + 4}px`;
                        sortMenuPanelRef.current.style.left = `${rect.left}px`;
                      }
                    }
                    setSortMenuOpen(o => !o);
                  }}
                  className={`flex items-center gap-1.5 text-xs py-2 px-3 rounded-lg border transition-colors ${isDark ? 'bg-[#252535] border-white/10 text-white hover:border-white/20' : 'bg-white border-gray-200 text-gray-900 hover:border-gray-300'}`}
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M6 12h12M10 17h4" />
                  </svg>
                  Sort
                  <svg className={`w-3 h-3 flex-shrink-0 transition-transform ${sortMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {sortMenuOpen && typeof document !== 'undefined' && createPortal(
                  <>
                    <div className="fixed inset-0 z-[999]" onClick={() => setSortMenuOpen(false)} />
                    <div
                      ref={sortMenuPanelRef}
                      className={`fixed z-[1000] min-w-[150px] rounded-lg border shadow-xl py-1 ${isDark ? 'bg-[#252535] border-white/10' : 'bg-white border-gray-200'}`}
                      style={{ top: (sortMenuBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4, right: window.innerWidth - (sortMenuBtnRef.current?.getBoundingClientRect().right ?? 0), left: 'auto' }}
                    >
                      {([
                        { value: 'date',   label: 'Date' },
                        { value: 'name',   label: 'Name' },
                        { value: 'status', label: 'Status' },
                      ] as const).map(opt => (
                        <button key={opt.value} onClick={() => { setConsultSortBy(opt.value); setSortMenuOpen(false); }}
                          className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors ${isDark ? 'text-gray-200 hover:bg-white/10' : 'text-gray-700 hover:bg-gray-100'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-opacity ${consultSortBy === opt.value ? (isDark ? 'bg-sky-400' : 'bg-sky-500') : 'opacity-0'}`} />
                          {opt.label}
                        </button>
                      ))}
                      <div className={`my-1 border-t ${isDark ? 'border-white/10' : 'border-gray-200'}`} />
                      {([
                        { value: 'asc',  label: 'Ascending' },
                        { value: 'desc', label: 'Descending' },
                      ] as const).map(opt => (
                        <button key={opt.value} onClick={() => { setConsultSortDir(opt.value); setSortMenuOpen(false); }}
                          className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors ${isDark ? 'text-gray-200 hover:bg-white/10' : 'text-gray-700 hover:bg-gray-100'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-opacity ${consultSortDir === opt.value ? (isDark ? 'bg-sky-400' : 'bg-sky-500') : 'opacity-0'}`} />
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>,
                  document.body
                )}
              </div>
              </div>

                {/* ── Bulk action toolbar ── */}
                {someSelected && (
                  <div className={`rounded-2xl border px-4 py-3 flex items-center gap-3 flex-wrap ${isDark ? 'bg-sky-500/10 border-sky-500/30' : 'bg-sky-50 border-sky-200'}`}>
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
                  {displayedConsultations.some(c => selectedIds.has(c.id) && (c.status === 'pending' || c.status === 'confirmed')) && (
                    <button
                      onClick={() => { setBulkRescheduleOpen(true); setBulkRescheduleRemarks(''); setBulkRescheduleError(''); }}
                      className={`px-3 py-1.5 text-xs ${btnPrimary}`}>
                      Reschedule ({displayedConsultations.filter(c => selectedIds.has(c.id) && (c.status === 'pending' || c.status === 'confirmed')).length})
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
                  <div className={`flex flex-col items-center justify-center py-24 rounded-2xl ${isDark ? 'bg-[#252525] border border-white/5' : 'bg-white shadow-sm'}`}>
                    <p className={`font-medium text-sm ${ts}`}>No consultations yet</p>
                    <p className={`text-xs mt-1 ${tm}`}>Students will appear here once they book a slot</p>
                  </div>
                ) : displayedConsultations.length === 0 ? (
                  <div className={`flex flex-col items-center justify-center py-16 rounded-2xl ${isDark ? 'bg-[#252525] border border-white/5' : 'bg-white shadow-sm'}`}>
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
                    <div className="flex items-center gap-2 px-1">
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
                          className={`rounded-2xl overflow-hidden transition-all hover:shadow-md ${isDark ? 'bg-[#252525] border border-white/5 shadow-[0_4px_12px_rgba(0,0,0,0.40)]' : 'bg-white shadow-sm border border-gray-100 hover:border-gray-200'} ${
                            selectedIds.has(c.id)
                              ? isDark ? 'ring-2 ring-sky-500/50' : 'ring-2 ring-sky-400'
                              : ''
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
                            {(() => {
                              const effMode = c.slot_mode === 'BOTH' ? 'BOTH' : c.slot_mode === 'OL' ? 'OL' : c.slot_mode ? 'F2F' : (c.mode || 'F2F');
                              return (
                                <>
                                  <div className="flex items-center gap-1.5">
                                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${effMode === 'F2F' ? 'bg-purple-400' : effMode === 'BOTH' ? 'bg-teal-400' : 'bg-cyan-400'}`} />
                                    <span className={`text-sm font-medium ${effMode === 'F2F' ? 'text-purple-300' : effMode === 'BOTH' ? 'text-teal-300' : 'text-cyan-300'}`}>
                                      {effMode === 'F2F' ? 'Face-to-Face' : effMode === 'BOTH' ? 'Face-to-Face & Online' : 'Online'}
                                    </span>
                                  </div>
                                  {(effMode === 'F2F' || effMode === 'BOTH') && c.location && (
                                    <p className="text-gray-500 text-xs mt-0.5 truncate">{c.location}</p>
                                  )}
                                  {effMode === 'BOTH' && c.preferred_mode && (
                                    <p className={`text-xs mt-1.5 flex items-center gap-1 ${c.preferred_mode === 'F2F' ? 'text-purple-400' : 'text-cyan-400'}`}>
                                      <span className="font-medium">Student Preference:</span>
                                      {c.preferred_mode === 'F2F' ? 'Face-to-Face' : 'Online'}
                                    </p>
                                  )}
                                </>
                              );
                            })()}
                            {(c.slot_mode === 'BOTH' || c.slot_mode === 'OL' || c.mode === 'OL' || c.mode === 'BOTH') && c.meeting_link && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <a href={c.meeting_link} target="_blank" rel="noopener noreferrer"
                                  className="text-cyan-400 text-xs truncate hover:underline flex-1 min-w-0">
                                  Join Meeting →
                                </a>
                                  <button
                                    onClick={() => { setEditLinkConsult(c); setEditLinkInput(c.meeting_link || ''); }}
                                    className="text-gray-600 hover:text-gray-300 transition-colors flex-shrink-0 p-0.5 rounded"
                                    title="Edit meeting link">
                                    <PencilLine className="w-3.5 h-3.5" />
                                  </button>
                              </div>
                            )}
                            {(c.slot_mode === 'BOTH' || c.slot_mode === 'OL' || c.mode === 'OL' || c.mode === 'BOTH') && !c.meeting_link && (
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
                            {c.proof_of_evidence ? (
                              c.proof_type === 'link' ? (
                                <a
                                  href={c.proof_of_evidence}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20 hover:bg-violet-500/20 transition-colors">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                  </svg>
                                  View Proof
                                </a>
                              ) : (
                                <button
                                  onClick={() => handleViewProof(c.id, c.proof_type, c.proof_of_evidence)}
                                  disabled={viewingProof === c.id}
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20 hover:bg-violet-500/20 transition-colors disabled:opacity-50">
                                  {viewingProof === c.id
                                    ? <span className="w-3.5 h-3.5 border border-violet-400 border-t-transparent rounded-full animate-spin" />
                                    : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                      </svg>}
                                  View Proof
                                </button>
                              )
                            ) : (
                              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-500/10 text-gray-500 ring-1 ring-gray-500/20 cursor-not-allowed select-none">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                                No Proof Submitted
                              </span>
                            )}
                          </div>

                          {(c.status === 'pending' || c.status === 'confirmed') && (
                            <div className="flex flex-wrap items-center gap-2">
                              {c.status === 'pending' && (
                                <button
                                  onClick={() => handleConfirm(c.id)}
                                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-green-500 hover:bg-green-600 text-white">
                                  <Check className="w-3.5 h-3.5" />
                                  Confirm
                                </button>
                              )}
                              {c.status === 'confirmed' && (
                                profInSession && !c.in_session ? (
                                  <div className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium opacity-50 cursor-not-allowed border ${isDark ? 'border-amber-400/30 text-amber-400/60' : 'border-amber-300 text-amber-500/60'}`}>
                                    <span className="w-2 h-2 rounded-full border-2 border-current" />
                                    Start Session
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleToggleInSession(c)}
                                    disabled={togglingSession === c.id}
                                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${
                                      (c.in_session && c.session_started_at)
                                        ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                                        : isDark ? 'border border-amber-400/50 text-amber-400 hover:bg-amber-950/50' : 'border border-amber-400 text-amber-600 hover:bg-amber-50'
                                    }`}>
                                    {togglingSession === c.id
                                      ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                      : (c.in_session && c.session_started_at)
                                        ? <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                        : <span className="w-2 h-2 rounded-full border-2 border-current" />
                                    }
                                    {(c.in_session && c.session_started_at) ? `End Session · ${formatElapsed(sessionElapsed)}` : 'Start Session'}
                                  </button>
                                )
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
                          {c.status === 'rescheduled' && (
                            <div className="flex flex-wrap items-center gap-2">
                              {profInSession && !c.in_session ? (
                                <div className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium opacity-50 cursor-not-allowed border ${isDark ? 'border-amber-400/30 text-amber-400/60' : 'border-amber-300 text-amber-500/60'}`}>
                                  <span className="w-2 h-2 rounded-full border-2 border-current" />
                                  Start Session
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleToggleInSession(c)}
                                  disabled={togglingSession === c.id}
                                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${
                                    (c.in_session && c.session_started_at)
                                      ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                                      : isDark ? 'border border-amber-400/50 text-amber-400 hover:bg-amber-950/50' : 'border border-amber-400 text-amber-600 hover:bg-amber-50'
                                  }`}>
                                  {togglingSession === c.id
                                    ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    : (c.in_session && c.session_started_at)
                                      ? <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                      : <span className="w-2 h-2 rounded-full border-2 border-current" />
                                  }
                                  {(c.in_session && c.session_started_at) ? `End Session · ${formatElapsed(sessionElapsed)}` : 'Start Session'}
                                </button>
                              )}
                              <button onClick={() => openCancelModal(c)}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${isDark ? 'border-red-400/60 text-red-400 hover:bg-red-950/60' : 'border-red-400 text-red-600 hover:bg-red-50'}`}>
                                <X className="w-3.5 h-3.5" />
                                Cancel
                              </button>
                              <button onClick={() => openCompleteModal(c)}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-blue-500 hover:bg-blue-600 text-white">
                                <CheckCheck className="w-3.5 h-3.5" />
                                Mark Completed
                              </button>
                            </div>
                          )}
                          {c.status === 'needs_reschedule' && (
                            <div className="flex flex-col gap-2">
                              {c.reschedule_remarks && (
                                <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${isDark ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                  <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                                  <span>Remark: {c.reschedule_remarks}</span>
                                </div>
                              )}
                              <div className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium ${isDark ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-700'}`}>
                                <svg className="w-3.5 h-3.5 animate-pulse" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" opacity=".2"/><path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
                                Waiting for student to select a new schedule
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button onClick={() => openCancelModal(c)}
                                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${isDark ? 'border-red-400/60 text-red-400 hover:bg-red-950/60' : 'border-red-400 text-red-600 hover:bg-red-50'}`}>
                                  <X className="w-3.5 h-3.5" />
                                  Cancel
                                </button>
                              </div>
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

              {/* ── Right column ── */}
              <div className="flex flex-col gap-4">

                {/* This Week's Activity */}
                <div className={`rounded-2xl p-5 ${isDark ? 'bg-[#252525] border border-white/5' : 'bg-white shadow-sm'}`}>
                  <h3 className={`font-semibold text-sm mb-4 ${tp}`}>This Week&apos;s Activity</h3>
                  <div className="flex flex-col gap-2">
                    {([
                      { label: 'Upcoming',  value: scheduledCount, numCls: 'text-sky-500',     bgCls: isDark ? 'bg-sky-500/10'     : 'bg-sky-50'    },
                      { label: 'Completed', value: completedCount, numCls: 'text-emerald-500', bgCls: isDark ? 'bg-emerald-500/10' : 'bg-emerald-50' },
                      { label: 'Pending',   value: pendingCount,   numCls: 'text-amber-500',   bgCls: isDark ? 'bg-amber-500/10'   : 'bg-amber-50'  },
                    ] as const).map(s => (
                      <div key={s.label} className={`flex items-center justify-between px-4 py-3 rounded-xl ${s.bgCls}`}>
                        <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{s.label}</span>
                        <span className={`text-xl font-bold ${s.numCls}`}>{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Activity */}
                {(() => {
                  const recentActivity = [...consultations]
                    .sort((a, b) => (b.date + (b.time_start || '')).localeCompare(a.date + (a.time_start || '')))
                    .slice(0, 5);
                  return (
                    <div className={`rounded-2xl p-5 ${isDark ? 'bg-[#252525] border border-white/5' : 'bg-white shadow-sm'}`}>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className={`font-semibold text-sm ${tp}`}>Recent Activity</h3>
                        <button
                          onClick={() => handleTabChange('history')}
                          className="text-xs text-sky-500 hover:text-sky-400 transition-colors font-medium"
                        >
                          View all →
                        </button>
                      </div>
                      {recentActivity.length === 0 ? (
                        <p className={`text-sm text-center py-4 ${tm}`}>No activity yet</p>
                      ) : (
                        <div className="flex flex-col">
                          {recentActivity.map((c, i) => (
                            <div key={c.id} className={`flex items-center gap-3 py-2.5 ${i < recentActivity.length - 1 ? (isDark ? 'border-b border-white/5' : 'border-b border-gray-100') : ''}`}>
                              <Avatar name={c.student_name} avatarUrl={c.student_avatar} />
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium truncate ${tp}`}>{c.student_name}</p>
                                <p className={`text-xs ${tm}`}>{fmtDate(c.date, { month: 'short', day: 'numeric' })}</p>
                              </div>
                              <StatusBadge status={c.status} isDark={isDark} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

              </div>
            </div>
          </div>

        ) : tab === 'calendar' ? (
          <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-8">

            {/* ── Full month calendar ── */}
            <div className="mb-6 sm:mb-8">
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

            {/* ── Date-grouped list ── */}
            <p className={`text-[11px] font-semibold uppercase tracking-widerst mb-3 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
              Upcoming Bookings List
            </p>
            {visibleConsultations.length === 0 ? (
              <div className={`flex flex-col items-center justify-center py-12 ${card}`} style={isDark ? { background: 'rgba(22,23,26,1)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.07)' } : glassStyle}>
                <p className={`text-sm ${ts}`}>No upcoming bookings</p>
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(bookedByDate)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([date, consultList]) => {
                    const isPast = new Date(date) < new Date(new Date().toDateString());
                    return (
                      <div key={date} className={`rounded-2xl overflow-hidden ${cardRaw} ${isPast ? `border ${borderSoft} opacity-60` : `border ${borderMid}`}`} style={isDark ? { background: 'rgba(22,23,26,1)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: '16px' } : glassStyle}>
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
                                  <p className={`text-xs ${tm}`}>{fmtTime(c)} · {(() => { const m = c.slot_mode === 'BOTH' ? 'BOTH' : c.slot_mode === 'OL' ? 'OL' : c.slot_mode ? 'F2F' : (c.mode || 'F2F'); return m === 'BOTH' ? 'Face-to-Face & Online' : m === 'F2F' ? 'Face-to-Face' : 'Online'; })()}</p>
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
                    <div className={`text-center py-10 ${card}`} style={isDark ? undefined : glassStyle}>
                      <p className={`text-sm ${ts}`}>No slots created yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {upcomingSlots.map(s => {
                        const booked = Number(s.upcoming_count) > 0;
                        return (
                          <div key={s.id} className={`flex items-center justify-between px-4 py-3 ${card}`} style={isDark ? undefined : glassStyleSm}>
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
          <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* ── Left: Add new slot form ── */}
              <div className={`p-5 ${card}`} style={isDark ? undefined : glassStyle}>
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
                  <div className={`flex rounded-lg p-0.5 w-full ${isDark ? 'bg-white/5' : 'bg-gray-100'}`}>
                    {(['F2F', 'Online'] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setNewSchedMode(m)}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                          newSchedMode === m
                            ? m === 'Online'
                              ? 'bg-sky-500 text-white shadow-sm'
                              : isDark ? 'bg-white/10 text-white shadow-sm' : 'bg-white border border-gray-200 shadow text-gray-800'
                            : isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {m === 'F2F' ? 'Face-to-Face' : m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Location — shown for F2F */}
                {newSchedMode === 'F2F' && (
                  <div className="mb-3">
                    <Label className="text-gray-500 text-xs mb-1.5 block">Location</Label>
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
                              forceUp
                            />
                          </div>
                          <div>
                            <Label className="text-gray-600 text-[10px] mb-1 block">End</Label>
                            <TimePicker
                              value={r.time_end}
                              onChange={v => setNewSched(s => ({ ...s, time_ranges: s.time_ranges.map((x, j) => j === i ? { ...x, time_end: v } : x) }))}
                              dark={isDark}
                              forceUp
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

                {/* Announcement */}
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <Label className="text-gray-500 text-xs">Announcement <span className={`font-normal ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>(Optional)</span></Label>
                    <span className={`text-[10px] tabular-nums ${newSchedAnnouncement.length > 270 ? 'text-amber-400' : isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                      {newSchedAnnouncement.length}/300
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    maxLength={300}
                    value={newSchedAnnouncement}
                    onChange={e => setNewSchedAnnouncement(e.target.value)}
                    placeholder="e.g. Bring your thesis draft, online via Google Meet link: …"
                    className={`w-full ${fieldCls} resize-none text-xs ${isDark ? 'placeholder-gray-600' : 'placeholder-gray-400'}`}
                  />
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
                  const now = new Date();
                  const getSlotEndDt = (s: Schedule): Date => {
                    const endTime = s.time_ranges?.length
                      ? s.time_ranges[s.time_ranges.length - 1].time_end
                      : s.time_end;
                    return new Date(`${s.date}T${endTime}`);
                  };
                  // Include both dated-future slots AND undated (recurring) slots; sort chronologically
                  const activeSlots = schedules
                    .filter(s => !s.date || getSlotEndDt(s) >= now)
                    .sort((a, b) => {
                      if (!a.date && !b.date) return 0;
                      if (!a.date) return 1;   // undated recurring slots go after dated ones
                      if (!b.date) return -1;
                      return a.date.localeCompare(b.date);
                    });
                  const pastSlots = schedules
                    .filter(s => s.date && getSlotEndDt(s) < now)
                    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

                  const renderSlot = (s: Schedule, dimmed = false) => {
                    const hasBookings = Number(s.upcoming_count) > 0;
                    const slotIsOL = s.mode === 'OL' || (!s.mode && s.location === 'Online Only');
                    const slotIsBoth = s.mode === 'BOTH';
                    const timeStr = (s.time_ranges?.length ? s.time_ranges : [{ time_start: s.time_start, time_end: s.time_end }])
                      .map(r => `${to12h(r.time_start)}–${to12h(r.time_end)}`).join('  ·  ');
                    return (
                      <div key={s.id} className={`${card} ${dimmed ? 'opacity-50' : ''}`} style={isDark ? undefined : glassStyleSm}>
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
                            {/* Online badge */}
                            {slotIsOL && (
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${isDark ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' : 'bg-sky-50 text-sky-700 border-sky-200'}`}>
                                <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 11H4a1 1 0 110-2h3.586L5.293 7.707a1 1 0 010-1.414z"/></svg>
                                Online
                              </span>
                            )}
                            {/* Both badge */}
                            {slotIsBoth && (
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${isDark ? 'bg-violet-500/10 text-violet-400 border-violet-500/20' : 'bg-violet-50 text-violet-700 border-violet-200'}`}>
                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/></svg>
                                F2F & Online
                              </span>
                            )}
                            {/* Location badge (shown for F2F and Both when location exists) */}
                            {!slotIsOL && s.location && s.location !== 'Online Only' && (
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${isDark ? 'bg-white/5 text-gray-400 border-white/10' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
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
                            {s.announcement && (
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${isDark ? 'bg-violet-500/10 text-violet-400 border-violet-500/20' : 'bg-violet-50 text-violet-700 border-violet-200'}`}>
                                <Megaphone size={10} strokeWidth={2} />
                                Announcement
                              </span>
                            )}
                          </div>
                          {/* Announcement text */}
                          {s.announcement && (
                            <div className={`mt-2 mx-0 pl-[18px]`}>
                              <p className={`text-[11px] leading-relaxed ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{s.announcement}</p>
                            </div>
                          )}
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
          <div className="relative z-[1] px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
            {/* Header + search/filter */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5 sm:mb-6">
              <div className="flex-1">
                <h1 className={`text-2xl font-bold ${tp}`}>History</h1>
                <p className={`text-sm mt-0.5 ${tp}`}>Past advising records grouped by term</p>
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
                <CustomSelect
                  value={histStatus}
                  onChange={v => setHistStatus(v as typeof histStatus)}
                  isDark={isDark}
                  className="px-3 py-2 text-sm"
                  options={[
                    { value: 'all', label: 'All statuses' },
                    { value: 'completed', label: 'Completed' },
                    { value: 'missed', label: 'Missed' },
                  ]}
                />
              </div>
            </div>

            {(() => {
              const q = histSearch.toLowerCase().trim();
              const historyItems = consultations
                .filter(c => ['completed','missed'].includes(c.status))
                .filter(c => histStatus === 'all' || c.status === histStatus)
                .filter(c => !q || c.student_name?.toLowerCase().includes(q) || c.student_number?.toLowerCase().includes(q));

              if (consultations.filter(c => ['completed','missed'].includes(c.status)).length === 0) {
                return (
                  <div className={`flex flex-col items-center justify-center py-16 sm:py-24 ${card}`} style={isDark ? undefined : glassStyle}>
                    <p className={`font-medium text-sm ${ts}`}>No history yet</p>
                    <p className={`text-xs mt-1 ${tm}`}>Completed advising sessions will appear here</p>
                  </div>
                );
              }

              if (historyItems.length === 0) {
                return (
                  <div className={`flex flex-col items-center justify-center py-12 ${card}`} style={isDark ? undefined : glassStyle}>
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
                    return (
                      <div key={quarter}>
                        {/* Term header + summary */}
                        <div className="flex items-center gap-3 mb-3 flex-wrap">
                          <p className={`text-[11px] font-semibold uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{quarter}</p>
                          <span className={`text-xs font-bold ${isDark ? 'text-gray-400' : 'text-gray-700'}`}>{items.length} session{items.length !== 1 ? 's' : ''}</span>
                        </div>

                        <div className={`rounded-2xl overflow-hidden border ${isDark ? 'bg-[#252525] border-white/5' : 'bg-white border-gray-200 shadow-sm'}`}>
                          <div className="overflow-x-auto">
                          <table className="w-full" style={{ minWidth: '750px' }}>
                            <colgroup>
                              <col className="w-[140px]" />
                              <col className="w-[22%]" />
                              <col />
                              <col className="w-[170px]" />
                              <col className="w-[130px]" />
                            </colgroup>
                              <thead>
                                <tr className={`border-b ${isDark ? 'border-white/5 bg-white/[0.03]' : 'border-gray-200 bg-gray-50'}`}>
                                  <th className={`text-left text-xs font-semibold uppercase tracking-widest px-5 py-3.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Date</th>
                                  <th className={`text-left text-xs font-semibold uppercase tracking-widest px-5 py-3.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Student</th>
                                  <th className={`text-left text-xs font-semibold uppercase tracking-widest px-5 py-3.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Purpose</th>
                                  <th className={`text-left text-xs font-semibold uppercase tracking-widest px-5 py-3.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Action Taken</th>
                                  <th className={`text-left text-xs font-semibold uppercase tracking-widest px-5 py-3.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Status</th>
                                </tr>
                              </thead>
                              <tbody className={`divide-y ${isDark ? 'divide-white/[0.04]' : 'divide-gray-100'}`}>
                                {items.map(c => {
                                  const isExpanded = expandedHistId === c.id;
                                  const draft = histNotes[c.id] ?? { action_taken: c.action_taken ?? '', remarks: c.remarks ?? '' };
                                  const setDraft = (patch: Partial<typeof draft>) =>
                                    setHistNotes(prev => ({ ...prev, [c.id]: { ...draft, ...patch } }));
                                  const initials = (c.student_name || '?').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();

                                  return (
                                    <Fragment key={c.id}>
                                      {/* Main row */}
                                      <tr
                                        onClick={() => setExpandedHistId(isExpanded ? null : c.id)}
                                        className={`cursor-pointer transition-colors align-middle ${isExpanded
                                          ? isDark ? 'bg-sky-500/[0.07]' : 'bg-sky-50'
                                          : isDark ? 'hover:bg-white/[0.025]' : 'hover:bg-gray-50/70'
                                        }`}
                                      >
                                        <td className={`px-5 py-4 text-sm whitespace-nowrap align-middle ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                          <div className="flex items-center gap-2">
                                            <svg className={`w-3.5 h-3.5 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''} ${isDark ? 'text-gray-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                                            {fmtDate(c.date, { month: 'short', day: 'numeric', year: 'numeric' })}
                                          </div>
                                        </td>
                                        <td className="px-5 py-4 align-middle">
                                          <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isDark ? 'bg-sky-500/15 text-sky-400' : 'bg-sky-100 text-sky-700'}`}>{initials}</div>
                                            <div className="min-w-0">
                                              <p className={`truncate text-sm font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{c.student_name}</p>
                                              <p className={`text-xs mt-0.5 truncate font-mono ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{c.student_number}</p>
                                            </div>
                                          </div>
                                        </td>
                                        <td className={`px-5 py-4 text-sm align-middle ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                          <span className="line-clamp-2 break-words leading-relaxed">{natureLabel(c)}</span>
                                        </td>
                                        <td className="px-5 py-4 text-sm align-middle">
                                          {c.action_taken
                                            ? <div className="flex items-center gap-1.5">
                                                <svg className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                                                <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{actionLabel(c.action_taken, c.referral, c.referral_specify)}</span>
                                              </div>
                                            : <button
                                                onClick={e => { e.stopPropagation(); setExpandedHistId(c.id); }}
                                                className={`text-sm font-medium px-3 py-1 rounded-lg border transition-colors ${isDark ? 'border-sky-500/20 text-sky-400 hover:bg-sky-500/10' : 'border-sky-200 text-sky-600 bg-sky-50 hover:bg-sky-100'}`}
                                              >
                                                + Add note
                                              </button>
                                          }
                                        </td>
                                        <td className="px-5 py-4 align-middle"><StatusBadge status={c.status} isDark={isDark} /></td>
                                      </tr>

                                      {/* Expanded detail row */}
                                      {isExpanded && (
                                        <tr key={`${c.id}-detail`}>
                                          <td colSpan={5} className={`px-4 py-0 overflow-hidden ${isDark ? 'bg-[#1e2a35]' : 'bg-slate-50'}`}>
                                            <div className={`py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 w-full overflow-hidden border-t ${isDark ? 'border-white/[0.06]' : 'border-slate-200'}`}>

                                              {/* Left: full details */}
                                              <div className="space-y-3 min-w-0">
                                                <div>
                                                  <p className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Full Purpose</p>
                                                  <p className={`text-sm leading-relaxed break-words ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{natureLabel(c) || '—'}</p>
                                                </div>
                                                <div className="flex gap-6 flex-wrap">
                                                  <div>
                                                    <p className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Mode</p>
                                                    <p className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{(() => { const m = c.slot_mode === 'BOTH' ? 'BOTH' : c.slot_mode === 'OL' ? 'OL' : c.slot_mode ? 'F2F' : (c.mode || 'F2F'); return m === 'BOTH' ? 'Face-to-Face & Online' : m === 'F2F' ? 'In-Person' : 'Online'; })()}</p>
                                                  </div>
                                                  <div>
                                                    <p className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Time</p>
                                                    <p className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{c.time_start ? to12h(c.time_start.slice(0,5)) : '—'}</p>
                                                  </div>
                                                  <div>
                                                    <p className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Program</p>
                                                    <p className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{c.program || '—'}</p>
                                                  </div>
                                                </div>
                                                {c.notes && (
                                                  <div className={`rounded-lg px-3 py-2.5 border ${isDark ? 'bg-sky-500/[0.06] border-sky-500/15' : 'bg-white border-slate-200'}`}>
                                                    <p className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>Student&apos;s Note</p>
                                                    <p className={`text-sm leading-relaxed break-words ${isDark ? 'text-sky-200/80' : 'text-gray-700'}`}>{c.notes}</p>
                                                  </div>
                                                )}
                                              </div>

                                              {/* Right: editable notes */}
                                              <div className="space-y-2.5 min-w-0">
                                                <div>
                                                  <p className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Action Taken</p>
                                                  <input
                                                    value={draft.action_taken}
                                                    onChange={e => setDraft({ action_taken: e.target.value })}
                                                    placeholder="e.g. Academic advising, Referred to registrar…"
                                                    className={`w-full text-sm rounded-lg px-3 py-2 outline-none border transition-colors ${isDark
                                                      ? 'bg-white/[0.05] border-white/10 text-gray-200 placeholder-white/30 focus:border-sky-500/50'
                                                      : 'bg-white border-slate-300 text-gray-800 placeholder-gray-400 focus:border-sky-400'
                                                    }`}
                                                  />
                                                </div>
                                                <div>
                                                  <p className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Remarks</p>
                                                  <textarea
                                                    value={draft.remarks}
                                                    onChange={e => setDraft({ remarks: e.target.value })}
                                                    placeholder="Additional notes…"
                                                    rows={2}
                                                    className={`w-full text-sm rounded-lg px-3 py-2 outline-none border resize-none transition-colors ${isDark
                                                      ? 'bg-white/[0.05] border-white/10 text-gray-200 placeholder-white/30 focus:border-sky-500/50'
                                                      : 'bg-white border-slate-300 text-gray-800 placeholder-gray-400 focus:border-sky-400'
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
                          </div>{/* /overflow-x-auto */}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

        ) : tab === 'profile' ? (
          <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
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
                <p className="text-gray-600 text-sm mt-1 text-center">
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
                  <div className={`rounded-2xl overflow-hidden ${isDark ? 'bg-[#252525] border border-white/10' : ''}`} style={isDark ? undefined : glassStyle}>
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
                  <div className={`rounded-2xl overflow-hidden ${isDark ? 'bg-[#252525] border border-white/10' : ''}`} style={isDark ? undefined : glassStyle}>
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
                  <div className={`rounded-2xl overflow-hidden ${isDark ? 'bg-[#252525] border border-white/10' : ''}`} style={isDark ? undefined : glassStyle}>
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
                  <div className={`rounded-2xl overflow-hidden ${isDark ? 'bg-[#252525] border border-white/10' : ''}`} style={isDark ? undefined : glassStyle}>
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
          const inputCls = `w-full rounded-xl px-4 py-3 text-sm border ${isDark ? 'bg-[#2b2d31] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-800'} focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/40`;
          const labelCls = `block text-xs font-semibold uppercase tracking-wider mb-2 ${tm}`;
          return (
            <div className="min-h-[75vh] flex items-center justify-center px-4 sm:px-6 lg:px-8 py-8">
              <div className="w-full max-w-2xl">
              <div className="mb-8 text-center">
                <h1 className={`text-3xl font-bold ${tp}`}>Export Report</h1>
                <p className={`text-base mt-2 ${tp}`}>Generate a downloadable advising record with custom filters</p>
              </div>

              {/* Filters card */}
              <div className={`p-7 mb-5 ${card}`} style={isDark ? undefined : glassStyle}>
                <p className={`text-base font-semibold mb-5 ${tp}`}>Filter Records</p>

                {/* Term dropdown */}
                {(() => {
                  const termOptions = groupByQuarter(consultations)
                    .map(([label, items]) => {
                      const dates = items.map(c => c.date).sort();
                      return { label, dateFrom: dates[0], dateTo: dates[dates.length - 1] };
                    });
                  if (termOptions.length === 0) return null;
                  return (
                    <div className="mb-4">
                      <label className={labelCls}>Academic Term</label>
                      <CustomSelect
                        value={exportTerm}
                        onChange={v => {
                          const selected = termOptions.find(o => o.label === v);
                          if (selected) {
                            setExportTerm(selected.label);
                            setExportDateFrom(selected.dateFrom);
                            setExportDateTo(selected.dateTo);
                          } else {
                            setExportTerm('');
                            setExportDateFrom('');
                            setExportDateTo('');
                          }
                        }}
                        isDark={isDark}
                        wrapperClassName="w-full"
                        className="w-full px-3 py-2 text-sm"
                        options={[
                          { value: '', label: 'All Terms' },
                          ...termOptions.map(o => ({ value: o.label, label: o.label })),
                        ]}
                      />
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className={labelCls}>Date From</label>
                    <input type="date" value={exportDateFrom} onChange={e => { setExportDateFrom(e.target.value); setExportTerm(''); }} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Date To</label>
                    <input type="date" value={exportDateTo} onChange={e => { setExportDateTo(e.target.value); setExportTerm(''); }} className={inputCls} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Status</label>
                    <CustomSelect
                      value={exportStatus}
                      onChange={v => setExportStatus(v as typeof exportStatus)}
                      isDark={isDark}
                      wrapperClassName="w-full"
                      className="w-full px-3 py-2 text-sm"
                      options={[
                        { value: 'all', label: 'All Statuses' },
                        { value: 'pending', label: 'Pending' },
                        { value: 'confirmed', label: 'Confirmed' },
                        { value: 'completed', label: 'Completed' },
                        { value: 'cancelled', label: 'Cancelled' },
                      ]}
                    />
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
                  className={`p-7 text-left transition-all group ${card}`}
                  style={isDark ? undefined : glassStyle}>
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4 group-hover:bg-emerald-500/20 transition-colors">
                    <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2z" />
                    </svg>
                  </div>
                  <p className={`font-semibold text-base ${tp}`}>Excel Spreadsheet</p>
                  <p className={`text-sm mt-1.5 ${tm}`}>Download as .xlsx — open in Excel or Sheets</p>
                </button>
                <button onClick={() => handleExport('pdf')} disabled={pdfExporting}
                  className={`p-7 text-left transition-all group ${card} ${pdfExporting ? 'opacity-60 cursor-not-allowed' : ''}`}
                  style={isDark ? undefined : glassStyle}>
                  <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
                    {pdfExporting
                      ? <div className="w-7 h-7 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      : <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 0 0 2-2V9.414a1 1 0 0 0-.293-.707l-5.414-5.414A1 1 0 0 0 12.586 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z" />
                        </svg>
                    }
                  </div>
                  <p className={`font-semibold text-base ${tp}`}>{pdfExporting ? 'Generating PDF…' : 'PDF Document'}</p>
                  <p className={`text-sm mt-1.5 ${tm}`}>Download as .pdf — landscape layout, MAPUA header</p>
                </button>
              </div>
              </div>
            </div>
          );
        })()}
      </main>

      {/* Complete modal */}
      {completingConsult && (
        <Modal title="Mark as Completed" onClose={() => setCompletingConsult(null)} isDark={isDark}>
          <div className="px-5 py-5 space-y-4">
            <div className={`flex items-center gap-3 p-3 rounded-xl border ${isDark ? 'bg-white/3 border-white/5' : 'bg-gray-50 border-gray-200'}`}>
              <Avatar name={completingConsult.student_name} avatarUrl={completingConsult.student_avatar} size="sm" />
              <div>
                <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{completingConsult.student_name}</p>
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
                  <input className={`mt-2 w-full ${fieldCls} ${isDark ? 'placeholder-gray-600' : 'placeholder-gray-400'}`}
                    placeholder="Please specify the office…"
                    value={completeForm.referral_specify}
                    onChange={e => { setCompleteForm(f => ({ ...f, referral_specify: e.target.value })); setCompleteError(''); }} />
                )}
              </div>
            )}
            <div>
              <Label className="text-gray-500 text-xs mb-1.5 block">Remarks (optional)</Label>
              <textarea value={completeForm.remarks} onChange={e => setCompleteForm(f => ({ ...f, remarks: e.target.value }))}
                rows={2} className={`w-full ${fieldCls} resize-none ${isDark ? 'placeholder-gray-600' : 'placeholder-gray-400'}`}
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

      {/* Reschedule request modal */}
      {reschedulingConsult && (
        <Modal title="Request Reschedule" onClose={() => setReschedulingConsult(null)} isDark={isDark}>
          <div className="px-5 py-5 space-y-4">
            <div className={`flex items-center gap-3 p-3 rounded-xl border ${isDark ? 'bg-white/3 border-white/5' : 'bg-gray-50 border-gray-200'}`}>
              <Avatar name={reschedulingConsult.student_name} avatarUrl={reschedulingConsult.student_avatar} size="sm" />
              <div>
                <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{reschedulingConsult.student_name}</p>
                <p className="text-gray-500 text-xs mt-0.5">{reschedulingConsult.student_number} · {fmtDate(reschedulingConsult.date, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>
            </div>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>The student will be notified and asked to select a new schedule slot.</p>
            <div>
              <Label className={`text-xs mb-1.5 block ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Reason for rescheduling (optional)</Label>
              <textarea
                value={rescheduleRemarks}
                onChange={e => setRescheduleRemarks(e.target.value)}
                rows={3}
                className={`w-full ${fieldCls} resize-none ${isDark ? 'placeholder-gray-600' : 'placeholder-gray-400'}`}
                placeholder="e.g. I have a conflict at this time, please pick another slot…"
              />
            </div>
            {rescheduleError && <p className="text-red-400 text-xs">{rescheduleError}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setReschedulingConsult(null)} className={`flex-1 py-2.5 text-sm ${btnSecondary}`}>
                Cancel
              </button>
              <button onClick={handleReschedule} disabled={rescheduleSaving} className={`flex-1 py-2.5 text-sm disabled:opacity-50 ${btnPrimary}`}>
                {rescheduleSaving
                  ? <span className="flex items-center justify-center gap-2"><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Sending…</span>
                  : 'Send Reschedule Request'
                }
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit schedule modal */}
      {editingScheduleSlot && (
        <Modal title="Edit Schedule Slot" onClose={() => setEditingScheduleSlot(null)} isDark={isDark}>
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
              <Label className="text-gray-500 text-xs mb-1.5 block">Mode</Label>
              <div className={`flex rounded-lg p-0.5 w-full ${isDark ? 'bg-white/5' : 'bg-gray-100'}`}>
                {(['F2F', 'Online'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setEditSchedMode(m)}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      editSchedMode === m
                        ? m === 'Online'
                          ? 'bg-sky-500 text-white shadow-sm'
                          : isDark ? 'bg-white/10 text-white shadow-sm' : 'bg-white border border-gray-200 shadow text-gray-800'
                        : isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {m === 'F2F' ? 'Face-to-Face' : m}
                  </button>
                ))}
              </div>
            </div>
            {editSchedMode === 'F2F' && (
              <div>
                <Label className="text-gray-500 text-xs mb-1.5 block">Location</Label>
                <input type="text" value={editSched.location} onChange={e => setEditSched(f => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. Room 201"
                  className={`w-full ${fieldCls} ${isDark ? 'placeholder-gray-600' : 'placeholder-gray-400'}`} />
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-gray-500 text-xs">Time Ranges</Label>
                <button type="button"
                  onClick={() => setEditSched(f => ({ ...f, time_ranges: [...f.time_ranges, { time_start: '', time_end: '' }] }))}
                  className={`text-xs font-medium transition-colors ${isDark ? 'text-sky-400 hover:text-sky-300' : 'text-sky-600 hover:text-sky-700'}`}>
                  + Add Time Range
                </button>
              </div>
              <div className="space-y-2">
                {editSched.time_ranges.map((r, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-gray-500 text-[10px] mb-1 block">Start</Label>
                        <TimePicker
                          value={r.time_start}
                          onChange={v => setEditSched(f => ({ ...f, time_ranges: f.time_ranges.map((x, j) => j === i ? { ...x, time_start: v } : x) }))}
                          dark={isDark}
                          forceUp
                        />
                      </div>
                      <div>
                        <Label className="text-gray-500 text-[10px] mb-1 block">End</Label>
                        <TimePicker
                          value={r.time_end}
                          onChange={v => setEditSched(f => ({ ...f, time_ranges: f.time_ranges.map((x, j) => j === i ? { ...x, time_end: v } : x) }))}
                          dark={isDark}
                          forceUp
                        />
                      </div>
                    </div>
                    {editSched.time_ranges.length > 1 && (
                      <button type="button"
                        onClick={() => setEditSched(f => ({ ...f, time_ranges: f.time_ranges.filter((_, j) => j !== i) }))}
                        className={`pb-1.5 transition-colors text-lg leading-none ${isDark ? 'text-gray-600 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}>
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-gray-500 text-xs">Announcement <span className={`font-normal ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>(Optional)</span></Label>
                <span className={`text-[10px] tabular-nums ${editSchedAnnouncement.length > 270 ? 'text-amber-400' : isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                  {editSchedAnnouncement.length}/300
                </span>
              </div>
              <textarea
                rows={2}
                maxLength={300}
                value={editSchedAnnouncement}
                onChange={e => setEditSchedAnnouncement(e.target.value)}
                placeholder="e.g. Bring your thesis draft, online via Google Meet link: …"
                className={`w-full ${fieldCls} resize-none text-xs ${isDark ? 'placeholder-gray-600' : 'placeholder-gray-400'}`}
              />
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
        <Modal title="Cancel Consultation" onClose={() => setCancellingConsult(null)} isDark={isDark}>
          <div className="px-5 py-5 space-y-4">
            <div className={`flex items-center gap-3 p-3 rounded-xl border ${isDark ? 'bg-white/3 border-white/5' : 'bg-gray-50 border-gray-200'}`}>
              <Avatar name={cancellingConsult.student_name} avatarUrl={cancellingConsult.student_avatar} size="sm" />
              <div>
                <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{cancellingConsult.student_name}</p>
                <p className="text-gray-500 text-xs mt-0.5">{cancellingConsult.student_number} · {fmtDate(cancellingConsult.date, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>
            </div>
            <div>
              <Label className="text-gray-500 text-xs mb-1.5 block">Reason for Cancellation <span className="text-red-400">*</span></Label>
              <textarea
                value={cancelReason}
                onChange={e => { setCancelReason(e.target.value); setCancelError(''); }}
                rows={3}
                className={`w-full ${fieldCls} resize-none ${isDark ? 'placeholder-gray-600' : 'placeholder-gray-400'}`}
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
        <Modal title="Cancel Selected Consultations" onClose={() => setBulkCancelOpen(false)} isDark={isDark}>
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
                className={`w-full ${fieldCls} resize-none ${isDark ? 'placeholder-gray-600' : 'placeholder-gray-400'}`}
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

      {/* ── Bulk Reschedule Modal ── */}
      {bulkRescheduleOpen && (
        <Modal title="Request Reschedule for Selected" onClose={() => setBulkRescheduleOpen(false)} isDark={isDark}>
          <div className="px-5 py-5 space-y-4">
            <div className={`flex items-center gap-2 p-3 rounded-xl ${isDark ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'}`}>
              <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-amber-400 text-xs font-medium">
                Reschedule request will be sent for <span className="font-bold">{displayedConsultations.filter(c => selectedIds.has(c.id) && (c.status === 'pending' || c.status === 'confirmed')).length}</span> consultation{displayedConsultations.filter(c => selectedIds.has(c.id) && (c.status === 'pending' || c.status === 'confirmed')).length !== 1 ? 's' : ''}.
              </p>
            </div>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Each affected student will be notified and asked to select a new schedule slot.</p>
            <div>
              <Label className={`text-xs mb-1.5 block ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Reason for rescheduling (optional)</Label>
              <textarea
                value={bulkRescheduleRemarks}
                onChange={e => setBulkRescheduleRemarks(e.target.value)}
                rows={3}
                className={`w-full ${fieldCls} resize-none ${isDark ? 'placeholder-gray-600' : 'placeholder-gray-400'}`}
                placeholder="e.g. I have a conflict at this time, please pick another slot…"
              />
            </div>
            {bulkRescheduleError && <p className="text-red-400 text-xs">{bulkRescheduleError}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setBulkRescheduleOpen(false)} className={`flex-1 py-2.5 text-sm ${btnSecondary}`}>
                Back
              </button>
              <button onClick={handleBulkReschedule} className={`flex-1 py-2.5 text-sm ${btnPrimary}`}>
                Send Reschedule Requests
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

      </div>{/* /content area */}

      <ChatbotWidget token={token ?? ''} role="professor" />
      <NavigationTour isDark={isDark} role="professor" />
    </div>
  );
}
