'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';

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

function ProfessorAvatar({ name, avatarUrl, size = 'md' }: { name: string; avatarUrl?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const validUrl = avatarUrl?.startsWith('https://') ? avatarUrl : null;
  const sz = size === 'sm' ? 'w-10 h-10 text-sm' : size === 'lg' ? 'w-16 h-16 text-xl' : 'w-12 h-12 text-base';
  return (
    <div className={`rounded-2xl bg-red-950 border border-red-900/50 flex items-center justify-center text-red-300 font-semibold flex-shrink-0 overflow-hidden ${sz}`}>
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
          <div key={d} className={`text-center text-[10px] font-medium py-1 ${i === specificDow ? 'text-[#0EA5E9]' : isDark ? 'text-gray-700' : 'text-gray-400'}`}>{d}</div>
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
                isSelected ? 'bg-sky-500 text-white' :
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
        <p className={`text-[10px] text-center mt-2.5 font-medium ${isDark ? 'text-sky-400' : 'text-sky-600'}`}>
          {new Date(selected + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      )}
    </div>
  );
}

export default function BookSlotPage() {
  const router = useRouter();
  const params = useParams();
  const slotId = params?.slotId as string;

  const [authReady, setAuthReady]   = useState(false);
  const [token, setToken]           = useState<string | null>(null);
  const [slot, setSlot]             = useState<Schedule | null>(null);
  const [loadingSlot, setLoadingSlot] = useState(true);
  const [notFound, setNotFound]     = useState(false);

  const [bookForm, setBookForm] = useState({
    nature_of_advising: [] as string[],
    nature_of_advising_specify: '',
    mode: 'F2F',
    date: '',
    time: '',
  });
  const [bookError, setBookError]   = useState('');
  const [isBooking, setIsBooking]   = useState(false);
  const [bookedDates, setBookedDates] = useState<string[]>([]);
  type SlotInfo = { booked_count: number; topics: string[] };
  type BookedTimesData = { booked: Record<string, SlotInfo>; blocked: string[] };
  const [bookedTimes, setBookedTimes] = useState<Record<string, BookedTimesData>>({});

  const [mounted, setMounted] = useState(false);
  const [_isDark, setIsDark]  = useState(false);
  const isDark = mounted ? _isDark : false;

  const preferredTimeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
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
    setAuthReady(true);
  }, []);

  useEffect(() => {
    if (!authReady || !token || !slotId) return;
    api.get('/api/schedules', token).then(data => {
      if (Array.isArray(data)) {
        const found = data.find((s: Schedule) => String(s.id) === slotId);
        if (found) {
          setSlot(found);
          api.get(`/api/consultations/booked-dates?schedule_id=${found.id}`, token).then(d => {
            if (Array.isArray(d)) setBookedDates(d);
          }).catch(() => {});
        } else {
          setNotFound(true);
        }
      } else {
        setNotFound(true);
      }
      setLoadingSlot(false);
    }).catch(() => { setNotFound(true); setLoadingSlot(false); });
  }, [authReady, token, slotId]);

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
    if (!slot || isBooking) return;
    setBookError('');
    if (bookForm.nature_of_advising.length === 0) { setBookError('Please select at least one nature of advising.'); return; }
    if (bookForm.nature_of_advising.includes('Others (Please Specify)') && !bookForm.nature_of_advising_specify.trim()) {
      setBookError('Please specify the nature of advising.'); return;
    }
    if (!bookForm.date) { setBookError('Please select a date.'); return; }
    if (!bookForm.time) { setBookError('Please select a preferred time.'); return; }
    setIsBooking(true);
    try {
      const data = await api.post('/api/consultations', {
        professor_id: slot.professor_id,
        schedule_id: slot.id,
        date: bookForm.date,
        time: bookForm.time,
        nature_of_advising: bookForm.nature_of_advising,
        nature_of_advising_specify: bookForm.nature_of_advising_specify || undefined,
        mode: bookForm.mode,
      }, token!);
      if (data.error) { setBookError(data.error); return; }
      router.push('/dashboard/student?view=my');
    } finally {
      setIsBooking(false);
    }
  };

  // Style tokens
  const pageBg  = isDark ? '#1e2235' : '#EEF2FF';
  const card    = isDark
    ? 'bg-[#252525] border-white/5 shadow-[0_10px_40px_rgba(0,0,0,0.60),0_4px_12px_rgba(0,0,0,0.40)] hover:shadow-[0_20px_60px_rgba(0,0,0,0.75),0_8px_20px_rgba(0,0,0,0.50)] hover:-translate-y-0.5 transition-all duration-200'
    : 'bg-white border-sky-100 shadow-[0_10px_40px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_20px_60px_rgba(0,0,0,0.16),0_8px_20px_rgba(0,0,0,0.10)] hover:-translate-y-0.5 transition-all duration-200';
  const tp      = isDark ? 'text-white'    : 'text-gray-900';
  const ts      = isDark ? 'text-gray-400' : 'text-gray-500';
  const inputCls = isDark
    ? 'bg-[#1a1a1a] border-white/10 text-white focus:border-[#0EA5E9]/50'
    : 'bg-gray-100 border-gray-200 text-gray-900 focus:border-[#0EA5E9]/50';

  if (!authReady || loadingSlot) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: pageBg }}>
        <div className="w-8 h-8 border-2 border-[#0EA5E9] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !slot) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ backgroundColor: pageBg }}>
        <p className={`text-lg font-semibold ${tp}`}>Slot not found</p>
        <button onClick={() => router.push('/dashboard/student?view=book')}
          className="px-5 py-2.5 rounded-xl text-sm font-medium bg-[#0EA5E9] text-white hover:bg-[#0284C7] transition-colors">
          Back to Book a Slot
        </button>
      </div>
    );
  }

  const timeRanges = slot.time_ranges?.length
    ? slot.time_ranges
    : [{ time_start: slot.time_start, time_end: slot.time_end }];

  const takenInfo = bookedTimes[`${slot.id}-${bookForm.date}`] ?? { booked: {} as Record<string, { booked_count: number; topics: string[] }>, blocked: [] as string[] };

  return (
    <div className="min-h-screen" style={{ backgroundColor: pageBg }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">

        {/* Back button */}
        <button
          onClick={() => router.push('/dashboard/student?view=book')}
          className={`inline-flex items-center gap-2 text-sm font-medium mb-6 transition-colors ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Book a Slot
        </button>

        {/* Page title */}
        <div className="mb-6">
          <h1 className={`text-2xl sm:text-3xl font-bold ${tp}`}>Book a Consultation</h1>
          <p className={`text-sm mt-1 ${ts}`}>Fill in the details below to request a consultation session.</p>
        </div>

        {/* Professor header card */}
        <div className={`rounded-2xl border p-5 mb-6 ${card}`}>
          <div className="flex items-center gap-4">
            <ProfessorAvatar name={slot.professor_name} avatarUrl={slot.professor_avatar} size="lg" />
            <div className="min-w-0 flex-1">
              <h2 className={`text-lg sm:text-xl font-bold ${tp}`}>{slot.professor_name}</h2>
              <p className={`text-sm font-medium mt-0.5 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{slot.department}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                  <svg className="w-3.5 h-3.5 text-[#0EA5E9]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" /></svg>
                  {slot.date
                    ? new Date(slot.date + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
                    : slot.day + 's'}
                </span>
                {timeRanges.map((r, i) => (
                  <span key={i} className={`inline-flex items-center gap-1.5 text-sm font-semibold ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                    <svg className="w-3.5 h-3.5 text-[#0EA5E9]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>
                    {formatTime12(r.time_start.slice(0, 5))}–{formatTime12(r.time_end.slice(0, 5))}
                  </span>
                ))}
                {slot.location && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-purple-400">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 0 1-2.827 0l-4.244-4.243a8 8 0 1 1 11.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" /></svg>
                    {slot.location}
                  </span>
                )}
              </div>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1.5 self-start mt-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Available
            </span>
          </div>
        </div>

        {/* Form grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Left: Nature of Advising */}
          <div className={`rounded-2xl border p-5 ${card}`}>
            <h3 className={`text-sm font-bold mb-0.5 ${tp}`}>Nature of Advising</h3>
            <p className={`text-xs mb-3 ${ts}`}>Select all that apply</p>
            <div className="space-y-1.5">
              {NATURE_OPTIONS.map(opt => {
                const checked = bookForm.nature_of_advising.includes(opt);
                return (
                  <label key={opt}
                    className={`flex items-start gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                      checked ? 'bg-[#0EA5E9]/10 ring-1 ring-[#0EA5E9]/30' : isDark ? 'bg-white/[0.03] hover:bg-white/[0.06]' : 'bg-gray-50 hover:bg-gray-100'
                    }`}>
                    <span className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
                      checked ? 'border-[#0EA5E9] bg-[#0EA5E9]' : isDark ? 'border-gray-600' : 'border-gray-300'
                    }`}>
                      {checked && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className={`text-sm leading-snug ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{opt}</span>
                    <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleNature(opt)} />
                  </label>
                );
              })}
            </div>
            {bookForm.nature_of_advising.includes('Others (Please Specify)') && (
              <input
                className={`mt-3 w-full rounded-xl text-sm px-3 py-2.5 border focus:outline-none placeholder-gray-400 ${inputCls}`}
                placeholder="Please specify…"
                value={bookForm.nature_of_advising_specify}
                onChange={e => setBookForm(f => ({ ...f, nature_of_advising_specify: e.target.value }))}
              />
            )}
          </div>

          {/* Right: Mode + Date + Time + Submit */}
          <div className="space-y-4">

            {/* Mode */}
            <div className={`rounded-2xl border p-5 ${card}`}>
              <h3 className={`text-sm font-bold mb-3 ${tp}`}>Consultation Mode</h3>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'F2F', label: 'Face-to-Face', icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0z" /></svg>
                  )},
                  { value: 'OL', label: 'Online', icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9A2.25 2.25 0 0 0 4.5 18.75z" /></svg>
                  )},
                ] as const).map(m => {
                  const active = bookForm.mode === m.value;
                  return (
                    <button key={m.value} type="button" onClick={() => setBookForm(f => ({ ...f, mode: m.value }))}
                      className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 font-medium text-sm transition-all ${
                        active
                          ? 'border-[#0EA5E9] bg-[#0EA5E9]/10 text-[#0EA5E9]'
                          : isDark ? 'border-white/10 bg-white/[0.03] text-gray-400 hover:border-white/20 hover:text-gray-200' : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                      }`}>
                      {m.icon}
                      {m.label}
                    </button>
                  );
                })}
              </div>
              {bookForm.mode === 'OL' && (
                <p className="mt-2.5 text-xs text-cyan-500 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>
                  A meeting link will be provided once confirmed.
                </p>
              )}
              {bookForm.mode === 'F2F' && slot.location && (
                <p className="mt-2.5 text-xs text-purple-400 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 0 1-2.827 0l-4.244-4.243a8 8 0 1 1 11.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" /></svg>
                  Location: {slot.location}
                </p>
              )}
            </div>

            {/* Date picker */}
            <div className={`rounded-2xl border p-5 ${card}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-sm font-bold ${tp}`}>Select Date</h3>
                <span className={`text-xs ${ts}`}>
                  {slot.date
                    ? new Date(slot.date + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                    : `${slot.day}s only`}
                </span>
              </div>
              <BookingCalendar
                specificDate={slot.date}
                bookedDates={bookedDates}
                selected={bookForm.date}
                isDark={isDark}
                onSelect={dateStr => {
                  setBookForm(f => ({ ...f, date: dateStr, time: '' }));
                  const key = `${slot.id}-${dateStr}`;
                  if (bookedTimes[key] === undefined) {
                    api.get(`/api/schedules/${slot.id}/booked-times?date=${dateStr}`, token!)
                      .then(data => {
                        if (data && typeof data === 'object' && !Array.isArray(data)) {
                          const entry: BookedTimesData = { booked: data.booked ?? {}, blocked: data.blocked ?? [] };
                          setBookedTimes(prev => ({ ...prev, [key]: entry }));
                        }
                      })
                      .catch(() => {});
                  }
                  setTimeout(() => {
                    preferredTimeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 300);
                }}
              />
            </div>

            {/* Time picker */}
            <div ref={preferredTimeRef} className={`rounded-2xl border p-5 ${card}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-sm font-bold ${tp}`}>Preferred Start Time</h3>
                {!bookForm.date && <span className={`text-xs italic ${ts}`}>Select a date first</span>}
              </div>
              {!bookForm.date ? (
                <p className={`text-xs text-center py-4 ${ts}`}>Select a date to view available time slots.</p>
              ) : (
                <div className="space-y-4">
                  {timeRanges.map((range, ri) => {
                    const slots = getTimeSlots(range.time_start.slice(0, 5), range.time_end.slice(0, 5));
                    const session = parseInt(range.time_start.slice(0, 2), 10) < 12 ? 'Morning' : 'Afternoon';
                    return (
                      <div key={ri}>
                        <p className={`text-[11px] font-semibold mb-2 uppercase tracking-wide ${ts}`}>
                          {session} · {formatTime12(range.time_start.slice(0, 5))}–{formatTime12(range.time_end.slice(0, 5))}
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {slots.map(t => {
                            const info = takenInfo.booked[t];
                            const isBlocked = takenInfo.blocked.includes(t);
                            const isBooked = !!info && !isBlocked;
                            const isSelected = bookForm.time === t;
                            const topics = info?.topics ?? [];
                            const firstTopic = topics[0] ?? null;
                            return (
                              <button
                                key={t}
                                type="button"
                                disabled={isBlocked}
                                onClick={() => setBookForm(f => ({ ...f, time: t }))}
                                className={`group relative flex flex-col p-2.5 rounded-xl border-2 text-left transition-all ${
                                  isBlocked
                                    ? `cursor-not-allowed opacity-40 ${isDark ? 'border-white/5 bg-white/[0.02]' : 'border-gray-100 bg-gray-50'}`
                                    : isSelected
                                      ? 'border-sky-500 bg-sky-500/10'
                                      : isBooked
                                        ? isDark
                                          ? 'border-amber-500/40 bg-amber-500/10 hover:border-amber-500/60 hover:bg-amber-500/15'
                                          : 'border-amber-300 bg-amber-50 hover:border-amber-400 hover:bg-amber-100'
                                        : isDark
                                          ? 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
                                          : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-white'
                                }`}
                              >
                                <span className={`text-xs font-bold leading-none ${
                                  isBlocked ? isDark ? 'text-gray-700' : 'text-gray-300'
                                  : isSelected ? 'text-sky-400'
                                  : isBooked ? isDark ? 'text-amber-300' : 'text-amber-700'
                                  : isDark ? 'text-white' : 'text-gray-900'
                                }`}>{formatTime12(t)}</span>
                                {isBlocked && <span className={`text-[9px] mt-1 ${isDark ? 'text-gray-700' : 'text-gray-300'}`}>Unavailable</span>}
                                {isBooked && (
                                  <span className={`text-[9px] mt-1 leading-snug ${isSelected ? 'text-sky-400/80' : isDark ? 'text-amber-400/70' : 'text-amber-600'}`}>
                                    {info.booked_count} {info.booked_count === 1 ? 'student' : 'students'} booked
                                    {firstTopic ? ` · "${firstTopic.length > 22 ? firstTopic.slice(0, 22) + '…' : firstTopic}"` : ''}
                                  </span>
                                )}
                                {!isBooked && !isBlocked && (
                                  <span className={`text-[9px] mt-1 ${isSelected ? 'text-sky-400/60' : isDark ? 'text-gray-700' : 'text-gray-300'}`}>Open</span>
                                )}
                                {isBooked && topics.length > 0 && (
                                  <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-lg bg-[#1E293B] px-3 py-2 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 min-w-[160px] max-w-[220px]">
                                    <p className="text-[10px] font-semibold text-white whitespace-nowrap">
                                      {info.booked_count} {info.booked_count === 1 ? 'student' : 'students'} booked
                                    </p>
                                    <p className="text-[10px] mt-0.5 text-slate-400 uppercase tracking-wide">Topics</p>
                                    {topics.map((t2, i) => (
                                      <p key={i} className="text-[10px] text-slate-300 break-words leading-snug">· {t2}</p>
                                    ))}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1E293B]" />
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {bookForm.time && takenInfo.booked[bookForm.time] && !takenInfo.blocked.includes(bookForm.time) && (
                <div className={`mt-3 flex items-start gap-2.5 px-3.5 py-3 rounded-xl border ${isDark ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
                  <svg className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                  </svg>
                  <p className={`text-xs leading-relaxed ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                    You will be joining an existing session at this time.{' '}
                    {takenInfo.booked[bookForm.time].booked_count} other {takenInfo.booked[bookForm.time].booked_count === 1 ? 'student has' : 'students have'} booked this slot.
                  </p>
                </div>
              )}
            </div>

            {/* Error + Submit */}
            {bookError && (
              <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                <p className="text-sm text-red-400">{bookError}</p>
              </div>
            )}

            <button
              onClick={handleBook}
              disabled={isBooking}
              className="w-full py-3.5 rounded-xl text-sm font-semibold bg-[#0EA5E9] text-white hover:bg-[#0284C7] shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isBooking ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>
                  Confirm Booking
                </>
              )}
            </button>

          </div>
        </div>

      </div>
    </div>
  );
}
