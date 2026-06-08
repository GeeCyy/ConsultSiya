'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import UserProfileCard from '@/components/UserProfileCard';
import LeftSidebar from '@/components/LeftSidebar';
import ChatbotWidget from '@/components/ChatbotWidget';
import { ToastContainer, useToast } from '@/components/Toast';
import { ConfirmModal } from '@/components/ConfirmModal';
import {
  CURRENT_TERM, buildTermFromConfig, getAcademicWeek, getWeekMode,
  daysUntil, getTermDates, getTermProgress,
  type CalendarOverride, type TermConfig, type RawTermConfig,
} from '@/lib/academicCalendar';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const NATURE_OPTIONS = [
  'Thesis/Design Subject concerns',
  'Mentoring/Clarification on the Topic of the Subjects Enrolled',
  'Requirements in Courses Enrolled',
  'Concerns about Electives/Tracks in the Curriculum',
  'Concerns on Internship/OJT Matters',
  'Concerns regarding Placement/Employment Opportunities',
  'Concerns regarding Personal/Family, etc.',
  'Others (Please Specify)',
];

const STUDENT_NAV_ITEMS = [
  { key: 'home',    label: 'Home' },
  { key: 'book',    label: 'Book a Slot' },
  { key: 'my',      label: 'My Consultations' },
  { key: 'history', label: 'History' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getTimeSlots(start: string, end: string): string[] {
  const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const slots: string[] = [];
  for (let mins = toMins(start); mins < toMins(end); mins += 30) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
  return slots;
}

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
  status: string;
  uploaded_form_path: string | null;
  action_taken: string | null;
  referral: string | null;
  referral_specify: string | null;
  remarks: string | null;
  time?: string | null;
  location?: string;
  meeting_link?: string | null;
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

const BOOKING_MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function BookingCalendar({ specificDate, bookedDates, selected, onSelect, isDark }: {
  specificDate: string | undefined;
  bookedDates: string[];
  selected: string;
  onSelect: (dateStr: string) => void;
  isDark: boolean;
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const initDate = specificDate ? new Date(specificDate + 'T12:00:00') : today;
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());
  const [mounted, setMounted] = useState(false);
  const specificDow = specificDate ? new Date(specificDate + 'T12:00:00').getDay() : -1;
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
  const prevMonth = () => { if (isCurrentMonth) return; if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className={`border rounded-xl p-3 min-h-[220px] ${isDark ? 'bg-[#0f0f0f] border-white/10' : 'bg-gray-50 border-gray-200'}`} />;
  return (
    <div className={`border rounded-xl p-3 select-none ${isDark ? 'bg-[#0f0f0f] border-white/10' : 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={prevMonth} disabled={isCurrentMonth}
          className={`w-7 h-7 flex items-center justify-center rounded-lg disabled:opacity-20 transition-colors ${isDark ? 'text-gray-500 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200'}`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{BOOKING_MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button type="button" onClick={nextMonth}
          className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200'}`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map((d, i) => (
          <div key={d} className={`text-center text-[10px] font-medium py-1 ${i === specificDow ? 'text-[#CC0000]' : isDark ? 'text-gray-700' : 'text-gray-400'}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstDow }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isTarget = dateStr === specificDate;
          const isPast = new Date(viewYear, viewMonth, day) < today;
          const isBooked = bookedDates.includes(dateStr);
          const isDisabled = !isTarget || isPast || isBooked;
          const isSelected = selected === dateStr;
          return (
            <button key={dateStr} type="button" disabled={isDisabled} onClick={() => onSelect(dateStr)}
              className={['rounded-lg text-xs py-1.5 font-medium transition-colors w-full',
                isSelected ? 'bg-blue-600 text-white' :
                isTarget && isBooked ? `line-through cursor-not-allowed ${isDark ? 'bg-red-500/15 text-red-400' : 'bg-red-100 text-red-500'}` :
                isTarget && !isPast ? `font-semibold ${isDark ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}` :
                `cursor-not-allowed ${isDark ? 'text-gray-800' : 'text-gray-300'}`,
              ].join(' ')}>
              {day}
            </button>
          );
        })}
      </div>
      {selected && (
        <p className={`text-[10px] text-center mt-2.5 font-medium ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
          {new Date(selected + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      )}
    </div>
  );
}

function Modal({ title, onClose, isDark, children }: { title: string; onClose: () => void; isDark: boolean; children: React.ReactNode }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className={`relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl ${isDark ? 'border-white/10 bg-[#161616]' : 'border-gray-200 bg-white'}`}
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

// ── Academic mini-calendar (reused from professor dashboard) ──────────────────

const MONTH_NAMES_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_NAMES_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const NOTE_COLORS = [
  { id: 'indigo', dot: 'bg-indigo-400', ring: 'ring-indigo-400' },
  { id: 'sky',    dot: 'bg-sky-400',    ring: 'ring-sky-400'    },
  { id: 'teal',   dot: 'bg-teal-400',   ring: 'ring-teal-400'   },
  { id: 'rose',   dot: 'bg-rose-400',   ring: 'ring-rose-400'   },
  { id: 'amber',  dot: 'bg-amber-400',  ring: 'ring-amber-400'  },
  { id: 'violet', dot: 'bg-violet-400', ring: 'ring-violet-400' },
] as const;

type UserNote = { id: number; date: string; note: string; color: string };

function MiniCalendar({ dateLabelMap, dateColorMap, isDark, token, calOverrides }: {
  dateLabelMap: Map<string, string>;
  dateColorMap: Map<string, string>;
  isDark: boolean;
  token: string | null;
  calOverrides: CalendarOverride[];
}) {
  const [viewYear, setViewYear]       = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth]     = useState(() => new Date().getMonth());
  const [todayStr, setTodayStr]       = useState('');
  const [selected, setSelected]       = useState<string | null>(null);
  const [userNotes, setUserNotes]     = useState<UserNote[]>([]);
  const [noteDraft, setNoteDraft]     = useState('');
  const [noteDraftColor, setNoteDraftColor] = useState('indigo');
  const [noteSaving, setNoteSaving]   = useState(false);

  useEffect(() => {
    const t = new Date(); t.setHours(0,0,0,0);
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

  const firstDow    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthPfx    = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}`;

  const augmented  = new Map(dateLabelMap);
  const augColors  = new Map(dateColorMap);
  const blockedMap = new Map(
    calOverrides.filter(o => o.type === 'blocked_date' && o.date)
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

  const events = Array.from(augmented.entries()).filter(([d]) => d.startsWith(monthPfx)).sort(([a],[b]) => a.localeCompare(b));
  const blockedEvents = Array.from(blockedMap.entries()).filter(([d]) => d.startsWith(monthPfx) && !augmented.has(d)).sort(([a],[b]) => a.localeCompare(b));
  const existingNote = selected ? noteMap.get(selected) : undefined;
  const noteChanged  = selected ? (noteDraft.trim() !== (existingNote?.note ?? '') || noteDraftColor !== (existingNote?.color ?? 'indigo')) : false;

  return (
    <div className={`rounded-2xl border p-5 ${card}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className={`text-base font-bold ${tp}`}>{MONTH_NAMES_FULL[viewMonth]} {viewYear}</span>
        <div className="flex gap-1">
          <button onClick={prevMonth} className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${isDark ? 'hover:bg-white/8 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
          </button>
          <button onClick={nextMonth} className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${isDark ? 'hover:bg-white/8 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1.5">
        {['SUN','MON','TUE','WED','THU','FRI','SAT'].map(d => (
          <div key={d} className={`text-center text-[10px] font-semibold tracking-wide ${tm} py-1`}>{d}</div>
        ))}
      </div>

      {/* Day grid — larger cells */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDow }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const ds  = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          const isT   = ds === todayStr;
          const isSel = ds === selected;
          const isBlocked = blockedMap.has(ds);
          const evColor   = augColors.get(ds);
          const userNote  = noteMap.get(ds);
          const nc = userNote ? (NOTE_COLORS.find(c => c.id === userNote.color) ?? NOTE_COLORS[0]) : null;
          return (
            <button key={ds} onClick={() => setSelected(isSel ? null : ds)}
              className={`relative flex flex-col items-center py-1 rounded-lg transition-colors ${
                isBlocked ? 'bg-red-500/15' :
                isSel && !isT ? (isDark ? 'bg-white/10' : 'bg-gray-100') :
                !isT ? (isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50') : ''
              }`}>
              <div className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium ${
                isT ? 'bg-[#CC0000] text-white font-bold shadow-md shadow-red-900/30' :
                isBlocked ? 'text-red-400' :
                isDark ? 'text-gray-300' : 'text-gray-700'
              }`}>{day}</div>
              <div className="flex gap-0.5 mt-0.5 h-1.5">
                {evColor && <div className={`w-1 h-1 rounded-full ${dotCls[evColor] ?? 'bg-red-500'}`} />}
                {!evColor && isBlocked && <div className="w-1 h-1 rounded-full bg-red-400" />}
                {nc && <div className={`w-1 h-1 rounded-full ${nc.dot}`} />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Events this month */}
      {(events.length > 0 || blockedEvents.length > 0) && (
        <div className={`mt-4 pt-3 border-t ${isDark ? 'border-white/5' : 'border-gray-100'} space-y-2`}>
          <p className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${tm}`}>This Month</p>
          {events.slice(0, 5).map(([date, label]) => {
            const d = new Date(date + 'T12:00:00');
            const c = augColors.get(date) ?? 'red';
            return (
              <div key={date} className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotCls[c] ?? 'bg-red-500'}`} />
                <span className={`text-xs ${tm}`}>{MONTH_NAMES_SHORT[d.getMonth()]} {d.getDate()}</span>
                <span className={`text-xs font-medium truncate ${date === todayStr ? 'text-[#CC0000]' : ts}`}>{date === todayStr ? 'Today' : label}</span>
              </div>
            );
          })}
          {blockedEvents.map(([date, label]) => {
            const d = new Date(date + 'T12:00:00');
            return (
              <div key={date} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-red-400" />
                <span className={`text-xs ${tm}`}>{MONTH_NAMES_SHORT[d.getMonth()]} {d.getDate()}</span>
                <span className="text-xs font-medium text-red-400 truncate">{label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Note editor */}
      {selected && token && (
        <div className={`mt-4 pt-4 border-t ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
          <p className={`text-xs font-bold mb-2 ${tp}`}>
            Note — {MONTH_NAMES_SHORT[parseInt(selected.slice(5,7))-1]} {parseInt(selected.slice(8,10))}
          </p>
          <textarea rows={3} value={noteDraft} onChange={e => setNoteDraft(e.target.value)}
            placeholder="Add a personal note for this date…"
            className={`w-full rounded-xl px-3 py-2.5 text-sm border focus:outline-none resize-none placeholder-gray-400 ${
              isDark ? 'bg-[#1e1f22] border-white/10 text-white focus:border-indigo-500/50' : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-indigo-400'
            }`} />
          <div className="flex items-center gap-2 mt-2.5">
            {NOTE_COLORS.map(c => (
              <button key={c.id} type="button" onClick={() => setNoteDraftColor(c.id)}
                className={`w-4 h-4 rounded-full ${c.dot} transition-transform ${
                  noteDraftColor === c.id ? `scale-125 ring-2 ${c.ring} ring-offset-1 ${isDark ? 'ring-offset-[#252525]' : 'ring-offset-white'}` : 'hover:scale-110'
                }`} />
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            {existingNote && (
              <button onClick={() => handleDeleteNote(existingNote.id)}
                className={`flex-1 py-2 rounded-xl text-xs border transition-colors text-red-400 border-red-500/20 ${isDark ? 'hover:bg-red-500/10' : 'hover:bg-red-50'}`}>
                Delete
              </button>
            )}
            <button onClick={handleSaveNote} disabled={noteSaving || !noteDraft.trim() || !noteChanged}
              className="flex-1 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {noteSaving ? 'Saving…' : existingNote ? 'Update Note' : 'Save Note'}
            </button>
          </div>
        </div>
      )}
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

  // Data
  const [schedules, setSchedules]         = useState<Schedule[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading]             = useState(true);
  const [announcements, setAnnouncements] = useState<AnnItem[]>([]);
  const [calOverrides, setCalOverrides]   = useState<CalendarOverride[]>([]);
  const [term, setTerm]                   = useState<TermConfig>(CURRENT_TERM);

  // Booking
  const [bookingSlot, setBookingSlot] = useState<Schedule | null>(null);
  const [bookForm, setBookForm] = useState({
    nature_of_advising: [] as string[],
    nature_of_advising_specify: '',
    mode: 'F2F',
    date: '',
    time: '',
  });
  const [bookError, setBookError] = useState('');
  const [bookedDates, setBookedDates] = useState<Record<number, string[]>>({});
  const [bookedTimes, setBookedTimes] = useState<Record<string, string[]>>({});

  // File upload / download
  const [uploadingId, setUploadingId]               = useState<number | null>(null);
  const [downloadingSlip, setDownloadingSlip]       = useState<number | null>(null);
  const [downloadingReceipt, setDownloadingReceipt] = useState<number | null>(null);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const uploadForId   = useRef<number | null>(null);

  // Profile card popup
  const [profileCard, setProfileCard] = useState<{ id: number; role: 'professor' | 'student' } | null>(null);

  // Student profile
  const [profile, setProfile] = useState<StudentProfile>({
    full_name: '', student_number: '', program: '', year_level: '', email: '', phone: '', avatar: null,
  });

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
    const v = new URLSearchParams(window.location.search).get('view');
    if (v && (['home', 'book', 'my', 'history'] as string[]).includes(v)) setTab(v as StudentTab);
    setAuthReady(true);
  }, []);

  useEffect(() => {
    if (!authReady || !token) return;
    fetchData();
  }, [authReady]);

  const fetchData = async () => {
    const [sched, consult, prof, ann, cal, termData] = await Promise.all([
      api.get('/api/schedules', token!),
      api.get('/api/consultations', token!),
      api.get('/api/auth/profile', token!),
      fetch(`${API_URL}/api/announcements`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_URL}/api/calendar`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_URL}/api/settings/term`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    setSchedules((Array.isArray(sched) ? sched : []).filter(s => !s.date || s.date >= today));
    setConsultations(Array.isArray(consult) ? consult : []);
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
    setLoading(false);
  };

  // ── Booking handlers ──

  const openBookingModal = async (schedule: Schedule) => {
    setBookingSlot(schedule);
    setBookForm({ nature_of_advising: [], nature_of_advising_specify: '', mode: 'F2F', date: '', time: '' });
    setBookError('');
    try {
      const data = await api.get(`/api/consultations/booked-dates?schedule_id=${schedule.id}`, token!);
      if (Array.isArray(data)) setBookedDates(prev => ({ ...prev, [schedule.id]: data }));
    } catch {}
  };

  const toggleNature = (opt: string) => {
    setBookForm(f => {
      const selected = f.nature_of_advising.includes(opt)
        ? f.nature_of_advising.filter(n => n !== opt)
        : [...f.nature_of_advising, opt];
      return {
        ...f,
        nature_of_advising: selected,
        nature_of_advising_specify:
          opt === 'Others (Please Specify)' && f.nature_of_advising.includes(opt) ? '' : f.nature_of_advising_specify,
      };
    });
  };

  const handleBook = async () => {
    if (!bookingSlot) return;
    setBookError('');
    if (bookForm.nature_of_advising.length === 0) { setBookError('Please select at least one nature of advising.'); return; }
    if (bookForm.nature_of_advising.includes('Others (Please Specify)') && !bookForm.nature_of_advising_specify.trim()) {
      setBookError('Please specify the nature of advising.'); return;
    }
    if (!bookForm.date) { setBookError('Please select a date.'); return; }
    if (!bookForm.time) { setBookError('Please select a preferred time.'); return; }
    const data = await api.post('/api/consultations', {
      professor_id: bookingSlot.professor_id,
      schedule_id: bookingSlot.id,
      date: bookForm.date,
      time: bookForm.time,
      nature_of_advising: bookForm.nature_of_advising,
      nature_of_advising_specify: bookForm.nature_of_advising_specify || undefined,
      mode: bookForm.mode,
    }, token!);
    if (data.error) { setBookError(data.error); return; }
    setBookingSlot(null);
    await fetchData();
    setTab('my');
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
      const a = document.createElement('a'); a.href = url; a.download = 'advising-slip-FM-AS-11-02.pdf'; a.click();
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
      const a = document.createElement('a'); a.href = url; a.download = `receipt-consultation-${c.id}.pdf`; a.click();
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
  const pastTabConsultations   = consultations.filter(c => ['completed', 'cancelled'].includes(c.status));

  // Notification bell: status-change notifications + announcements
  const statusNotifs: AnnItem[] = consultations
    .filter(c => ['confirmed', 'completed', 'rescheduled'].includes(c.status) && !!c.date)
    .map(c => ({
      id: 200000 + c.id,
      title: `Consultation ${c.status.charAt(0).toUpperCase() + c.status.slice(1)}`,
      body: `Your consultation with ${c.professor_name} on ${new Date((c.date || '').slice(0, 10) + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} is ${c.status}.`,
      type: 'info' as const,
      created_at: (c.date || '').slice(0, 10) + 'T12:00:00',
    }));
  const allNotifications = [...statusNotifs, ...announcements];

  // Calendar event maps
  const dateLabelMap = new Map(calOverrides.filter(o => o.type === 'date_label' && o.date && o.value).map(o => [o.date!, o.value!]));
  const dateColorMap = new Map(calOverrides.filter(o => o.type === 'date_label' && o.date).map(o => [o.date!, o.color ?? 'red']));

  // Style tokens
  const card      = isDark ? 'bg-[#252525] border border-white/5' : 'bg-white border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]';
  const tp        = isDark ? 'text-white'    : 'text-gray-900';
  const ts        = isDark ? 'text-gray-400' : 'text-gray-500';
  const tm        = isDark ? 'text-gray-400' : 'text-gray-500';
  const innerCard = isDark ? 'bg-white/[0.03] border-white/5' : 'bg-gray-50 border-gray-100';
  const hoverBg   = isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-gray-50/80';

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

  // ── Auth guard splash ──

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: isDark ? '#1a1a1a' : '#F0F0F0' }}>
        <div className="w-8 h-8 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={`min-h-screen flex ${isDark ? 'bg-[#2d2d2d]' : 'bg-[#F0F0F0]'}`}>

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
        announcements={allNotifications}
        pendingConsultations={[]}
        storageKey={`student_notifs_${profile.email || 'default'}`}
      />

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="lg:hidden h-14 flex-shrink-0" />
        <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileSelected} />

        <main className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
            <div className="w-8 h-8 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" />
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
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${isDark ? 'bg-[#CC0000]/15 text-[#ff6666]' : 'bg-red-100 text-red-700'}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#CC0000]" />
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
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-100 text-blue-700'}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    {confirmedCount} confirmed
                  </span>
                )}
              </div>
            </div>

            {/* ── Section 2: Large stat numbers ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {([
                { value: allConsultsTotal,     label: 'Total Requests',  sub: 'all time',        color: isDark ? 'text-white'       : 'text-gray-900',    bg: isDark ? 'bg-[#252525] border-white/5' : 'bg-white border-gray-200 shadow-sm' },
                { value: confirmedCount,        label: 'Confirmed',       sub: 'approved',        color: isDark ? 'text-blue-400'    : 'text-blue-600',    bg: isDark ? 'bg-blue-500/10 border-blue-500/15' : 'bg-blue-50 border-blue-100 shadow-sm' },
                { value: allConsultsCompleted,  label: 'Completed',       sub: 'sessions done',   color: isDark ? 'text-emerald-400' : 'text-emerald-600', bg: isDark ? 'bg-emerald-500/10 border-emerald-500/15' : 'bg-emerald-50 border-emerald-100 shadow-sm' },
                { value: daysToFinals,          label: 'Days to Finals',  sub: finalsDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }), color: isDark ? 'text-orange-400' : 'text-orange-600', bg: isDark ? 'bg-orange-500/10 border-orange-500/15' : 'bg-orange-50 border-orange-100 shadow-sm' },
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
                        : <span className="text-white text-lg font-bold">{studentInitials}</span>}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-bold truncate ${tp}`}>{profile.full_name}</p>
                      <p className={`text-xs ${ts}`}>{profile.program || 'Student'}</p>
                      <p className={`text-[10px] mt-0.5 font-medium text-[#CC0000]`}>
                        {profile.year_level ? `Year ${profile.year_level}` : ''}{profile.student_number ? ` · ${profile.student_number}` : ''}
                      </p>
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
                  {([
                    { label: 'Days to Finals', value: daysToFinals,  color: 'text-orange-400', dot: 'bg-orange-400' },
                    { label: 'Days to End',     value: daysToEnd,     color: 'text-pink-400',   dot: 'bg-pink-400'   },
                    { label: 'Weeks Left',      value: currentWeek ? Math.max(0, term.totalWeeks - currentWeek) : term.totalWeeks, color: 'text-blue-400', dot: 'bg-blue-400' },
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
                    className="w-full mt-1 py-2 rounded-xl text-xs font-semibold bg-[#CC0000] text-white hover:bg-[#aa0000] transition-colors"
                  >
                    Book a Consultation
                  </button>
                </div>
              </div>

              {/* My consultations breakdown */}
              <div className={`lg:col-span-5 rounded-2xl border p-5 ${card}`}>
                <div className="flex items-center justify-between mb-1">
                  <h3 className={`text-sm font-semibold ${tp}`}>My Consultations</h3>
                  <button onClick={() => handleTabChange('my')} className="text-xs text-[#CC0000] hover:text-red-400 font-medium transition-colors">
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
                    { label: 'Total',     value: allConsultsTotal,     bg: isDark ? 'bg-blue-500/10'    : 'bg-blue-50',    color: isDark ? 'text-blue-400'    : 'text-blue-600'    },
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

                {/* Upcoming next */}
                {upcomingConsultations.length > 0 && (
                  <div className={`mt-4 pt-3 border-t ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                    <p className={`text-[11px] font-semibold uppercase tracking-wider mb-2 ${tm}`}>Next Upcoming</p>
                    {upcomingConsultations.slice(0, 2).map(c => (
                      <div key={c.id} className={`flex items-center gap-2 py-1.5 rounded-lg px-2 ${hoverBg} transition-colors`}>
                        <Avatar name={c.professor_name} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium truncate ${tp}`}>{c.professor_name}</p>
                          <p className={`text-[10px] ${tm}`}>{new Date((c.date || '').slice(0, 10) + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} · {formatTime12((c.time || c.time_start)?.slice(0, 5) ?? '')}</p>
                        </div>
                        <StatusBadge status={c.status} isDark={isDark} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: mini stats + today */}
              <div className={`lg:col-span-3 rounded-2xl border p-5 flex flex-col ${card}`}>
                <h3 className={`text-sm font-semibold mb-3 ${tp}`}>Quick Stats</h3>

                {/* Horizontal metric pills */}
                <div className="space-y-2.5">
                  {([
                    { label: 'This Term',   value: allConsultsTotal,    max: Math.max(allConsultsTotal, 10),    color: isDark ? 'bg-blue-500'    : 'bg-blue-500'    },
                    { label: 'Completed',   value: allConsultsCompleted, max: Math.max(allConsultsTotal, 1),    color: isDark ? 'bg-emerald-500' : 'bg-emerald-500' },
                    { label: 'Pending',     value: allConsultsPending,   max: Math.max(allConsultsTotal, 1),    color: isDark ? 'bg-amber-400'   : 'bg-amber-400'   },
                    { label: 'Week',        value: currentWeek ?? 0,     max: term.totalWeeks,                  color: 'bg-[#CC0000]'                               },
                  ] as const).map(m => (
                    <div key={m.label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[11px] font-medium ${ts}`}>{m.label}</span>
                        <span className={`text-[11px] font-bold ${tp}`}>{m.value}</span>
                      </div>
                      <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-white/8' : 'bg-gray-100'}`}>
                        <div className={`h-full rounded-full transition-all duration-500 ${m.color}`} style={{ width: `${m.max > 0 ? (m.value / m.max) * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Today's consultations */}
                {todayConsultations.length > 0 && (
                  <div className={`mt-4 pt-3 border-t ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                    <p className={`text-[11px] font-semibold uppercase tracking-wider mb-2 ${tm}`}>Today</p>
                    <div className="space-y-2">
                      {todayConsultations.slice(0, 3).map(c => (
                        <div key={c.id} className="flex items-center gap-2">
                          <span className={`text-[10px] font-mono flex-shrink-0 ${tm}`}>{(c.time || c.time_start)?.slice(0, 5)}</span>
                          <div className={`flex-1 min-w-0 pl-2 border-l-2 ${c.status === 'confirmed' ? 'border-blue-400' : 'border-amber-400'}`}>
                            <p className={`text-xs font-medium truncate ${tp}`}>{c.professor_name.split(' ').slice(-1)[0]}</p>
                            <p className={`text-[10px] ${tm}`}>{c.mode === 'F2F' ? 'In-Person' : 'Online'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => handleTabChange('book')}
                  className={`mt-auto pt-3 w-full text-xs font-semibold text-[#CC0000] hover:text-red-400 transition-colors text-center`}
                >
                  + Book Consultation
                </button>
              </div>

            </div>{/* /widget grid */}

            {/* ── Section 4: Upcoming table + Calendar ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

              <div className={`lg:col-span-7 rounded-2xl border overflow-hidden ${card}`}>
                <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                  <h3 className={`text-sm font-semibold ${tp}`}>Upcoming Consultations</h3>
                  <button onClick={() => handleTabChange('my')} className="text-xs text-[#CC0000] hover:text-red-400 font-medium transition-colors">
                    View all →
                  </button>
                </div>
                {upcomingConsultations.length === 0 ? (
                  <p className={`text-sm text-center py-10 ${tm}`}>No upcoming consultations</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px]">
                      <thead>
                        <tr className={`border-b ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                          {['Professor', 'Date & Time', 'Mode', 'Status'].map(h => (
                            <th key={h} className={`text-left text-[11px] font-semibold uppercase tracking-wider px-5 py-3 ${tm}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-gray-50'}`}>
                        {upcomingConsultations.slice(0, 7).map(c => (
                          <tr key={c.id} className={`transition-colors ${isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-gray-50/80'}`}>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2.5">
                                <Avatar name={c.professor_name} size="sm" />
                                <div className="min-w-0">
                                  <p className={`text-xs font-semibold truncate ${tp}`}>{c.professor_name}</p>
                                  <p className={`text-[10px] truncate ${tm}`}>{natureLabel(c).split(',')[0]}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3">
                              <p className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                {new Date((c.date || '').slice(0, 10) + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                              </p>
                              <p className={`text-[10px] font-mono ${tm}`}>{formatTime12((c.time || c.time_start)?.slice(0, 5) ?? '')}</p>
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

              <div className="lg:col-span-5">
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

        : tab === 'book' ? (
          <div className="px-3 sm:px-8 py-5 sm:py-8">
            <div className="mb-5 sm:mb-7">
              <h1 className={`text-2xl sm:text-3xl font-bold ${tp}`}>Book a Consultation</h1>
              <p className={`text-sm sm:text-base mt-1 ${ts}`}>{schedules.length} slot{schedules.length !== 1 ? 's' : ''} available</p>
            </div>
            {schedules.length === 0 ? (
              <div className={`flex flex-col items-center justify-center py-16 sm:py-24 rounded-2xl ${card}`}>
                <p className={`font-medium text-sm ${ts}`}>No slots available</p>
                <p className={`text-xs mt-1 ${tm}`}>Check back later when professors post their schedules</p>
              </div>
            ) : (
              <div className="space-y-3">
                {schedules.map(s => (
                  <div key={s.id} className={`rounded-2xl overflow-hidden transition-colors ${card} ${isDark ? 'hover:border-white/10' : 'hover:border-gray-300'}`}>
                    <div className="p-4 sm:p-5">
                      <div className="flex items-start gap-3 sm:gap-4">
                        <button type="button" onClick={() => setProfileCard({ id: s.professor_id, role: 'professor' })}
                          className="flex-shrink-0 hover:opacity-75 transition-opacity rounded-full focus:outline-none" title="View profile">
                          <Avatar name={s.professor_name} avatarUrl={s.professor_avatar} />
                        </button>
                        <div className="flex-1 min-w-0">
                          <button type="button" onClick={() => setProfileCard({ id: s.professor_id, role: 'professor' })}
                            className={`font-bold text-base sm:text-xl hover:opacity-75 transition-opacity text-left ${tp}`}>
                            {s.professor_name}
                          </button>
                          <p className={`text-sm sm:text-base font-semibold mt-0.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{s.department}</p>
                          {s.location && (
                            <p className="text-sm mt-0.5 font-semibold">
                              <span className="text-purple-400">F2F: </span>
                              <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{s.location}</span>
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-base sm:text-xl font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{s.day}</p>
                          {(s.time_ranges?.length
                            ? s.time_ranges
                            : [{ time_start: s.time_start, time_end: s.time_end }]
                          ).map((r, i) => (
                            <p key={i} className={`text-xs sm:text-base mt-0.5 font-bold font-mono ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                              {r.time_start ? formatTime12(r.time_start.slice(0, 5)) : ''}–{r.time_end ? formatTime12(r.time_end.slice(0, 5)) : ''}
                            </p>
                          ))}
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-sm text-emerald-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Available
                        </span>
                        <button onClick={() => openBookingModal(s)}
                          className="min-h-[44px] sm:min-h-0 px-4 py-2 sm:py-1.5 rounded-lg text-xs font-medium transition-colors bg-[#CC0000] text-white hover:bg-[#aa0000] shadow-lg shadow-red-900/20">
                          Book this slot
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        ) : tab === 'history' ? (
          <div className="px-3 sm:px-8 py-5 sm:py-8">
            <div className="mb-5 sm:mb-7">
              <h1 className={`text-2xl font-bold ${tp}`}>History</h1>
              <p className={`text-sm mt-1 ${ts}`}>Past consultations grouped by term</p>
            </div>
            {(() => {
              const historyItems = consultations.filter(c => ['completed', 'cancelled', 'rescheduled'].includes(c.status));
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
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                                        {downloadingReceipt === c.id
                                          ? <span className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" />
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
            <div className="mb-5 sm:mb-6">
              <h1 className={`text-2xl font-bold ${tp}`}>My Consultations</h1>
              <p className={`text-sm mt-1 ${ts}`}>{upcomingConsultations.length} upcoming · {activeConsults} active</p>
            </div>

            {/* Tab switcher */}
            <div className={`flex gap-1 p-1 rounded-xl mb-4 sm:mb-6 w-full sm:w-fit overflow-x-auto ${isDark ? 'bg-[#1e1e1e] border border-white/5' : 'bg-gray-100 border border-gray-200'}`}>
              {([
                { key: 'active', label: 'Active & Upcoming', count: activeTabConsultations.length },
                { key: 'past',   label: 'Past',              count: pastTabConsultations.length  },
              ] as const).map(t => (
                <button key={t.key} onClick={() => setConsultTab(t.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                    consultTab === t.key ? 'bg-[#CC0000] text-white shadow-sm' : `${ts} ${isDark ? 'hover:text-gray-200 hover:bg-white/5' : 'hover:text-gray-800 hover:bg-white'}`
                  }`}>
                  {t.label}
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${consultTab === t.key ? 'bg-white/20 text-white' : isDark ? 'bg-white/8 text-gray-500' : 'bg-gray-200 text-gray-500'}`}>
                    {t.count}
                  </span>
                </button>
              ))}
            </div>

            {(consultTab === 'active' ? activeTabConsultations : pastTabConsultations).length === 0 ? (
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
                {(consultTab === 'active' ? activeTabConsultations : pastTabConsultations).map(c => (
                  <div key={c.id} className={`rounded-2xl p-5 transition-colors ${card} ${isDark ? 'hover:border-white/10' : 'hover:border-gray-300'}`}>
                    <div className="flex items-start gap-4">
                      <button type="button" onClick={() => setProfileCard({ id: c.professor_id, role: 'professor' })}
                        className="flex-shrink-0 hover:opacity-75 transition-opacity rounded-full focus:outline-none" title="View profile">
                        <Avatar name={c.professor_name} />
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
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.mode === 'F2F' ? 'bg-purple-400' : 'bg-cyan-400'}`} />
                          <span className={`text-sm font-medium ${c.mode === 'F2F' ? (isDark ? 'text-purple-300' : 'text-purple-600') : (isDark ? 'text-cyan-300' : 'text-cyan-600')}`}>
                            {c.mode === 'F2F' ? 'Face-to-Face' : 'Online'}
                          </span>
                        </div>
                        {c.mode === 'F2F' && c.location && (
                          <p className={`text-xs mt-0.5 ${ts}`}>{c.location}</p>
                        )}
                        {c.mode === 'OL' && c.status === 'confirmed' && (
                          c.meeting_link
                            ? <a href={c.meeting_link} target="_blank" rel="noopener noreferrer" className={`text-xs mt-0.5 block hover:underline truncate ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>Join Meeting →</a>
                            : <p className={`text-xs mt-0.5 italic ${tm}`}>No meeting link added yet</p>
                        )}
                      </div>
                    </div>

                    <div className={`mt-3.5 pt-3.5 border-t ${isDark ? 'border-white/5' : 'border-gray-100'} flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={handleDownloadSlip} disabled={downloadingSlip === -1}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${isDark ? 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'}`}>
                          {downloadingSlip === -1
                            ? <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                            : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0-3-3m3 3 3-3M3 17V7a2 2 0 0 1 2-2h6l2 2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>}
                          Download Form
                        </button>

                        {(c.status === 'pending' || c.status === 'confirmed') && (
                          <button onClick={() => triggerUpload(c.id)} disabled={uploadingId === c.id}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                              c.uploaded_form_path
                                ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 hover:bg-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20 hover:bg-amber-500/20'
                            }`}>
                            {uploadingId === c.id ? (
                              <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                            ) : c.uploaded_form_path ? (
                              <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>Form Uploaded · Replace</>
                            ) : (
                              <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-8-4-4m0 0L8 8m4-4v12" /></svg>Upload Signed Form</>
                            )}
                          </button>
                        )}

                        {c.status === 'completed' && (
                          <button onClick={() => handleDownloadReceipt(c)} disabled={downloadingReceipt === c.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                            {downloadingReceipt === c.id
                              ? <span className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" />
                              : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>}
                            Download Receipt
                          </button>
                        )}

                        {c.status !== 'pending' && c.status !== 'confirmed' && c.uploaded_form_path && (
                          <span className="flex items-center gap-1.5 text-xs text-emerald-500">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            Form submitted
                          </span>
                        )}
                      </div>

                      {(c.status === 'pending' || c.status === 'confirmed') && (
                        <button onClick={() => handleCancel(c.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors">
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Booking modal */}
      {bookingSlot && (
        <Modal title={`Book Slot — ${bookingSlot.professor_name}`} onClose={() => setBookingSlot(null)} isDark={isDark}>
          <div className="px-5 py-5 space-y-4">
            <div className={`flex items-center gap-3 p-3 rounded-xl border ${isDark ? 'bg-white/[0.03] border-white/5' : 'bg-gray-50 border-gray-100'}`}>
              <Avatar name={bookingSlot.professor_name} />
              <div>
                <p className={`text-sm font-semibold ${tp}`}>{bookingSlot.professor_name}</p>
                <p className={`text-xs mt-0.5 ${ts}`}>
                  {bookingSlot.department} · {bookingSlot.day}{' '}
                  {(bookingSlot.time_ranges?.length
                    ? bookingSlot.time_ranges
                    : [{ time_start: bookingSlot.time_start, time_end: bookingSlot.time_end }]
                  ).map(r => `${r.time_start?.slice(0, 5)}–${r.time_end?.slice(0, 5)}`).join(', ')}
                </p>
              </div>
            </div>

            <div>
              <p className={`text-xs mb-2 ${ts}`}>Nature of Advising <span className={tm}>(select all that apply)</span></p>
              <div className="space-y-1.5">
                {NATURE_OPTIONS.map(opt => {
                  const checked = bookForm.nature_of_advising.includes(opt);
                  return (
                    <label key={opt}
                      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                        checked ? 'bg-[#CC0000]/10 ring-1 ring-[#CC0000]/30' : isDark ? 'bg-[#1a1a1a] hover:bg-white/5' : 'bg-gray-100 hover:bg-gray-200'
                      }`}>
                      <span className={`mt-0.5 w-3.5 h-3.5 rounded flex-shrink-0 border flex items-center justify-center ${checked ? 'border-[#CC0000] bg-[#CC0000]' : isDark ? 'border-gray-600' : 'border-gray-400'}`}>
                        {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </span>
                      <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{opt}</span>
                      <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleNature(opt)} />
                    </label>
                  );
                })}
              </div>
              {bookForm.nature_of_advising.includes('Others (Please Specify)') && (
                <input
                  className={`mt-2 w-full rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-[#CC0000]/50 border ${
                    isDark ? 'bg-[#1a1a1a] border-white/10 text-white placeholder-gray-600' : 'bg-gray-100 border-gray-200 text-gray-900 placeholder-gray-400'
                  }`}
                  placeholder="Please specify…"
                  value={bookForm.nature_of_advising_specify}
                  onChange={e => setBookForm(f => ({ ...f, nature_of_advising_specify: e.target.value }))}
                />
              )}
            </div>

            <div>
              <p className={`text-xs mb-1.5 ${ts}`}>Mode</p>
              <select value={bookForm.mode} onChange={e => setBookForm(f => ({ ...f, mode: e.target.value }))}
                className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:border-[#CC0000]/50 ${isDark ? 'bg-[#1a1a1a] border-white/10 text-white' : 'bg-gray-100 border-gray-200 text-gray-900'}`}>
                <option value="F2F">Face-to-Face (F2F)</option>
                <option value="OL">Online (OL)</option>
              </select>
              {bookForm.mode === 'OL' && <p className="text-cyan-500 text-xs mt-1">A meeting link will be generated for you.</p>}
              {bookForm.mode === 'F2F' && bookingSlot.location && <p className="text-purple-500 text-xs mt-1">Location: {bookingSlot.location}</p>}
            </div>

            <div>
              <p className={`text-xs mb-1.5 ${ts}`}>Select Date
                <span className={`ml-1 ${tm}`}>
                  {bookingSlot.date
                    ? `(${new Date(bookingSlot.date + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })})`
                    : `(${bookingSlot.day}s only)`}
                </span>
              </p>
              <BookingCalendar
                specificDate={bookingSlot.date}
                bookedDates={bookedDates[bookingSlot.id] || []}
                selected={bookForm.date}
                isDark={isDark}
                onSelect={dateStr => {
                  setBookForm(f => ({ ...f, date: dateStr, time: '' }));
                  const key = `${bookingSlot!.id}-${dateStr}`;
                  if (bookedTimes[key] === undefined) {
                    api.get(`/api/schedules/${bookingSlot!.id}/booked-times?date=${dateStr}`, token!)
                      .then(data => { if (Array.isArray(data)) setBookedTimes(prev => ({ ...prev, [key]: data })); });
                  }
                }}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className={`text-xs ${ts}`}>Preferred Start Time</p>
                {!bookForm.date && <p className={`text-xs italic ${tm}`}>Select a date first</p>}
              </div>
              {(() => {
                const ranges = bookingSlot.time_ranges?.length
                  ? bookingSlot.time_ranges
                  : [{ time_start: bookingSlot.time_start, time_end: bookingSlot.time_end }];
                const taken  = bookedTimes[`${bookingSlot.id}-${bookForm.date}`] || [];
                const noDate = !bookForm.date;
                return (
                  <div className={`relative transition-opacity ${noDate ? 'opacity-40' : ''}`}>
                    <select value={bookForm.time} disabled={noDate}
                      onChange={e => setBookForm(f => ({ ...f, time: e.target.value }))}
                      className={`w-full px-3 py-2.5 pr-9 rounded-lg text-sm border focus:outline-none focus:border-[#CC0000]/50 appearance-none transition-colors ${
                        isDark
                          ? `bg-[#0f0f0f] border-white/10 ${noDate ? 'cursor-not-allowed text-gray-600' : bookForm.time ? 'text-white' : 'text-gray-500'}`
                          : `bg-gray-100 border-gray-200 ${noDate ? 'cursor-not-allowed text-gray-400' : bookForm.time ? 'text-gray-900' : 'text-gray-500'}`
                      }`}>
                      <option value="" disabled>— Select a time —</option>
                      {ranges.map((range, i) => {
                        const slots    = getTimeSlots(range.time_start.slice(0, 5), range.time_end.slice(0, 5));
                        const startHour = parseInt(range.time_start.slice(0, 2), 10);
                        const session   = startHour < 12 ? 'Morning Session' : 'Afternoon Session';
                        const label     = `${session} (${formatTime12(range.time_start.slice(0, 5))} – ${formatTime12(range.time_end.slice(0, 5))})`;
                        return (
                          <optgroup key={i} label={label}>
                            {slots.map(slot => {
                              const isTaken = taken.includes(slot);
                              return <option key={slot} value={slot} disabled={isTaken}>{formatTime12(slot)}{isTaken ? ' — Taken' : ''}</option>;
                            })}
                          </optgroup>
                        );
                      })}
                    </select>
                    <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                );
              })()}
            </div>

            {bookError && <p className="text-red-400 text-xs">{bookError}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setBookingSlot(null)} className={`flex-1 py-2.5 rounded-lg text-sm transition-colors ${isDark ? 'text-gray-400 hover:bg-white/5' : 'text-gray-500 hover:bg-gray-100'}`}>
                Cancel
              </button>
              <button onClick={handleBook} className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-[#CC0000] text-white hover:bg-[#aa0000] transition-colors shadow-lg shadow-red-900/20">
                Confirm Booking
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Profile card popup */}
      {profileCard && token && (
        <UserProfileCard
          profileId={profileCard.id}
          profileRole={profileCard.role}
          token={token}
          onClose={() => setProfileCard(null)}
        />
      )}

        <ChatbotWidget token={token} role="student" />
      </div>{/* /content area */}

    </div>
  );
}
