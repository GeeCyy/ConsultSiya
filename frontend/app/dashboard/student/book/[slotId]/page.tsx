'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { ToastContainer, useToast } from '@/components/Toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const PROOF_LINK_PREFIXES = [
  'https://drive.google.com/',
  'https://docs.google.com/',
  'https://onedrive.live.com/',
  'https://1drv.ms/',
];
const isValidProofLink = (url: string) => PROOF_LINK_PREFIXES.some(p => url.startsWith(p));

type MyConsult = {
  id: number;
  date: string;
  time?: string | null;
  time_start?: string;
  status: string;
  nature_of_advising: string | null;
  proof_of_evidence: string | null;
  proof_type: 'file' | 'link' | null;
  professor_id: number;
};

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
  mode?: string | null;
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
    notes: '',
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
  const proofFileRef = useRef<HTMLInputElement>(null);

  const { toasts, toast, removeToast } = useToast();
  const [myConsults, setMyConsults] = useState<MyConsult[]>([]);
  const [proofPanelId, setProofPanelId] = useState<number | null>(null);
  const [proofMode, setProofMode] = useState<'link' | 'file'>('link');
  const [proofLinkValue, setProofLinkValue] = useState('');
  const [proofLinkError, setProofLinkError] = useState('');
  const [submittingProofId, setSubmittingProofId] = useState<number | null>(null);
  const [proofSelectedFile, setProofSelectedFile] = useState<File | null>(null);
  const [viewingFile, setViewingFile] = useState<number | null>(null);
  const [downloadingSlip, setDownloadingSlip] = useState(false);

  const handleDownloadSlip = async () => {
    setDownloadingSlip(true);
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
    } finally { setDownloadingSlip(false); }
  };

  useEffect(() => {
    setMounted(true);
    const dark = localStorage.getItem('consulta-theme') === 'dark';
    setIsDark(dark);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const handler = (e: Event) => setIsDark((e as CustomEvent<{ dark: boolean }>).detail.dark);
    window.addEventListener('consulta-theme-change', handler);
    return () => window.removeEventListener('consulta-theme-change', handler);
  }, []);

  const toggleTheme = () => {
    const next = !_isDark;
    setIsDark(next);
    localStorage.setItem('consulta-theme', next ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    window.dispatchEvent(new CustomEvent('consulta-theme-change', { detail: { dark: next } }));
  };

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
          if (found.mode === 'BOTH') setBookForm(f => ({ ...f, mode: 'BOTH' }));
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

  useEffect(() => {
    if (!authReady || !token || !slot) return;
    api.get('/api/consultations', token).then((data: unknown) => {
      if (Array.isArray(data)) {
        setMyConsults(data.filter((c: MyConsult) => c.professor_id === slot.professor_id && c.status !== 'cancelled'));
      }
    }).catch(() => {});
  }, [authReady, token, slot]);

  const validateProofFile = (file: File): boolean => {
    const allowedExt = ['.pdf', '.jpg', '.jpeg', '.png'];
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!allowedExt.includes(ext)) { toast.error('Only PDF, JPG, and PNG files are allowed.'); return false; }
    if (file.size > 10 * 1024 * 1024) { toast.error('File must be under 10 MB.'); return false; }
    return true;
  };

  const handleProofFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
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
      setMyConsults(prev => prev.map(c => c.id === id ? { ...c, proof_of_evidence: data.proof_of_evidence, proof_type: data.proof_type } : c));
    } finally { setSubmittingProofId(null); }
  };

  const handleProofLinkSubmit = async (id: number) => {
    const link = proofLinkValue.trim();
    if (!link) { toast.error('Please enter a valid link.'); return; }
    if (!isValidProofLink(link)) { setProofLinkError('Must be a Google Drive or OneDrive link.'); return; }
    setProofLinkError('');
    setSubmittingProofId(id);
    try {
      const data = await api.post(`/api/consultations/${id}/proof`, { link }, token!);
      if (data.error) { toast.error(data.error); return; }
      toast.success('Proof link submitted!');
      setProofPanelId(null);
      setProofLinkValue('');
      setMyConsults(prev => prev.map(c => c.id === id ? { ...c, proof_of_evidence: data.proof_of_evidence, proof_type: data.proof_type } : c));
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

  const openProofPanel = (id: number) => {
    setProofPanelId(proofPanelId === id ? null : id);
    setProofLinkValue('');
    setProofLinkError('');
    setProofSelectedFile(null);
    setProofMode('link');
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
        notes: bookForm.notes.trim() || undefined,
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
    <>
    <div className="min-h-screen" style={{ backgroundColor: pageBg }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">

        {/* Back button + theme toggle */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.push('/dashboard/student?view=book')}
            className={`inline-flex items-center gap-2 text-sm font-medium transition-colors ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Book a Slot
          </button>
          <button
            onClick={toggleTheme}
            title="Toggle theme"
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${isDark ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-900 hover:bg-black/5'}`}
          >
            {isDark ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998z" />
              </svg>
            )}
          </button>
        </div>

        {/* Page title */}
        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <h1 className={`text-2xl sm:text-3xl font-bold ${tp}`}>Book a Consultation</h1>
            <p className={`text-sm mt-1 ${ts}`}>Fill in the details below to request a consultation session.</p>
          </div>
          <button onClick={handleDownloadSlip} disabled={downloadingSlip}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${isDark ? 'bg-white/5 text-gray-300 hover:bg-white/10 ring-1 ring-white/10' : 'bg-white text-gray-600 hover:bg-gray-50 ring-1 ring-gray-200 shadow-sm'}`}>
            {downloadingSlip
              ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
              : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0-3-3m3 3 3-3M3 17V7a2 2 0 0 1 2-2h6l2 2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>}
            Download Consultation Form Template
          </button>
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

          {/* Left: Nature of Advising + Notes */}
          <div className="space-y-4">
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

            {/* Notes */}
            <div className={`rounded-2xl border p-5 ${card}`}>
              <div className="flex items-center justify-between mb-1">
                <h3 className={`text-sm font-bold ${tp}`}>Additional Notes</h3>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${isDark ? 'bg-white/5 text-gray-500' : 'bg-gray-100 text-gray-400'}`}>Optional</span>
              </div>
              <p className={`text-xs mb-3 ${ts}`}>Describe your concern so your adviser can prepare in advance.</p>
              <textarea
                rows={4}
                maxLength={500}
                placeholder="e.g. I'm struggling with my thesis topic and need guidance on narrowing down my research area…"
                value={bookForm.notes}
                onChange={e => setBookForm(f => ({ ...f, notes: e.target.value }))}
                className={`w-full rounded-xl text-sm px-3 py-2.5 border focus:outline-none resize-none placeholder-gray-400 transition-colors ${inputCls}`}
              />
              <div className="flex justify-end mt-1.5">
                <span className={`text-[10px] tabular-nums ${bookForm.notes.length > 450 ? 'text-amber-400' : isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                  {bookForm.notes.length}/500
                </span>
              </div>
            </div>
          </div>

          {/* Right: Mode + Date + Time + Submit */}
          <div className="space-y-4">

            {/* Mode */}
            <div className={`rounded-2xl border p-5 ${card}`}>
              <h3 className={`text-sm font-bold mb-3 ${tp}`}>Consultation Mode</h3>
              {(() => {
                const slotMode = slot?.mode;
                const allModes = [
                  { value: 'F2F', label: 'Face-to-Face', icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0z" /></svg>
                  )},
                  { value: 'OL', label: 'Online', icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.251 0 0 0 2.25 7.5v9A2.25 2.25 0 0 0 4.5 18.75z" /></svg>
                  )},
                ] as const;
                if (slotMode === 'BOTH') {
                  return (
                    <>
                      <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border ${isDark ? 'border-teal-500/25 bg-teal-500/10' : 'border-teal-200 bg-teal-50'}`}>
                        <span className="w-2 h-2 rounded-full bg-teal-400 flex-shrink-0" />
                        <span className={`text-sm font-medium ${isDark ? 'text-teal-300' : 'text-teal-700'}`}>Face-to-Face &amp; Online</span>
                      </div>
                      <p className={`mt-2.5 text-xs flex items-center gap-1.5 ${isDark ? 'text-teal-400/80' : 'text-teal-600'}`}>
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>
                        Both face-to-face and online are available for this slot.
                      </p>
                      {slot.location && (
                        <p className="mt-1 text-xs text-purple-400 flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 0 1-2.827 0l-4.244-4.243a8 8 0 1 1 11.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" /></svg>
                          Location: {slot.location}
                        </p>
                      )}
                    </>
                  );
                }
                const isOL = slotMode === 'OL';
                return (
                  <>
                    <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border ${isDark ? 'border-gray-700 bg-white/[0.03]' : 'border-gray-200 bg-gray-50'}`}>
                      {isOL ? allModes[1].icon : allModes[0].icon}
                      <span className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{isOL ? 'Online' : 'Face-to-Face'}</span>
                      <span className={`text-xs ml-auto ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{isOL ? 'Online only' : 'Face-to-face only'}</span>
                    </div>
                    {isOL && (
                      <p className="mt-2.5 text-xs text-cyan-500 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>
                        A meeting link will be provided once confirmed.
                      </p>
                    )}
                    {!isOL && slot.location && (
                      <p className="mt-2.5 text-xs text-purple-400 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 0 1-2.827 0l-4.244-4.243a8 8 0 1 1 11.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" /></svg>
                        Location: {slot.location}
                      </p>
                    )}
                  </>
                );
              })()}
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
                  const phtPs = new Intl.DateTimeFormat('en-CA', {
                    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', hour12: false,
                  }).formatToParts(new Date());
                  const pg2 = (t: string) => phtPs.find(p => p.type === t)?.value ?? '00';
                  const phtTodayAuto = `${pg2('year')}-${pg2('month')}-${pg2('day')}`;
                  const phtMinsAuto  = parseInt(pg2('hour'), 10) * 60 + parseInt(pg2('minute'), 10);
                  const isDateToday  = dateStr === phtTodayAuto;
                  const autoRanges   = slot.time_ranges?.length
                    ? slot.time_ranges
                    : [{ time_start: slot.time_start, time_end: slot.time_end }];
                  let autoTime = '';
                  for (const r of autoRanges) {
                    const ts = getTimeSlots(r.time_start.slice(0, 5), r.time_end.slice(0, 5));
                    const avail = isDateToday
                      ? ts.filter(t => { const [h, m] = t.split(':').map(Number); return h * 60 + m + 30 > phtMinsAuto; })
                      : ts;
                    if (avail.length > 0) { autoTime = avail[0]; break; }
                  }
                  setBookForm(f => ({ ...f, date: dateStr, time: autoTime }));
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
                  {(() => {
                    const now = new Date();
                    const phtParts = new Intl.DateTimeFormat('en-CA', {
                      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
                      hour: '2-digit', minute: '2-digit', hour12: false,
                    }).formatToParts(now);
                    const phtGet = (type: string) => phtParts.find(p => p.type === type)?.value ?? '00';
                    const todayStr = `${phtGet('year')}-${phtGet('month')}-${phtGet('day')}`;
                    const currentTimeMins = parseInt(phtGet('hour'), 10) * 60 + parseInt(phtGet('minute'), 10);
                    const isToday = bookForm.date === todayStr;
                    return timeRanges.map((range, ri) => {
                    let slots = getTimeSlots(range.time_start.slice(0, 5), range.time_end.slice(0, 5));
                    if (isToday) slots = slots.filter(t => { const [h, m] = t.split(':').map(Number); return h * 60 + m + 30 > currentTimeMins; });
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
                  });
                  })()}
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

        {/* My Consultations with this professor */}
        {myConsults.length > 0 && (
          <div className="mt-8">
            <h2 className={`text-base font-bold mb-3 ${tp}`}>My Consultations with {slot.professor_name}</h2>
            <div className="space-y-2">
              {myConsults.map(c => {
                const timeStr = (c.time || c.time_start || '').slice(0, 5);
                const dateLabel = c.date
                  ? new Date(c.date + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                  : '—';
                return (
                  <div key={c.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-xs ${ts}`}>{dateLabel}{timeStr ? ` · ${formatTime12(timeStr)}` : ''}</span>
                      {c.proof_of_evidence ? (
                        <>
                          <span className={`flex items-center gap-1 text-xs font-medium ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Proof Submitted
                          </span>
                          {c.proof_type === 'link' ? (
                            <a href={c.proof_of_evidence} target="_blank" rel="noopener noreferrer"
                              className={`text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${isDark ? 'bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20 hover:bg-sky-500/20' : 'bg-sky-50 text-sky-600 ring-1 ring-sky-200 hover:bg-sky-100'}`}>
                              View Link →
                            </a>
                          ) : (
                            <button onClick={() => handleViewFile(c.id)} disabled={viewingFile === c.id}
                              className={`text-xs font-medium px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 ${isDark ? 'bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20 hover:bg-sky-500/20' : 'bg-sky-50 text-sky-600 ring-1 ring-sky-200 hover:bg-sky-100'}`}>
                              {viewingFile === c.id ? '…' : 'View File'}
                            </button>
                          )}
                          <button onClick={() => openProofPanel(c.id)}
                            className={`text-xs px-2 py-1 rounded-lg transition-colors ${isDark ? 'text-red-400 hover:text-red-300 hover:bg-red-900/20' : 'text-red-600 hover:text-red-700 hover:bg-red-50'}`}>
                            Replace
                          </button>
                        </>
                      ) : (
                        <button onClick={() => openProofPanel(c.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isDark ? 'bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20 hover:bg-violet-500/20' : 'bg-violet-50 text-violet-600 ring-1 ring-violet-200 hover:bg-violet-100'}`}>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                          Submit Proof of Evidence
                        </button>
                      )}
                    </div>

                    {proofPanelId === c.id && (
                      <div className={`mt-2 rounded-xl p-4 ${isDark ? 'bg-white/[0.03] border border-white/5' : 'bg-gray-50 border border-gray-200'}`}>
                        <div className="flex gap-2">
                          <input type="url" value={proofLinkValue}
                            onChange={e => { const v = e.target.value; setProofLinkValue(v); setProofLinkError(v.trim() && !isValidProofLink(v.trim()) ? 'Must be a Google Drive or OneDrive link.' : ''); }}
                            placeholder="https://drive.google.com/…"
                            className={`flex-1 px-3 py-2 rounded-lg text-xs outline-none border transition-all ${
                              proofLinkError
                                ? 'border-red-500 ' + (isDark ? 'bg-white/[0.04] text-white placeholder-white/20' : 'bg-white text-gray-800 placeholder-gray-400')
                                : isDark
                                  ? 'bg-white/[0.04] border-white/[0.08] text-white placeholder-white/20 focus:border-violet-500/50'
                                  : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400 focus:border-violet-400'
                            }`}
                          />
                          <button onClick={() => handleProofLinkSubmit(c.id)}
                            disabled={submittingProofId === c.id || !proofLinkValue.trim() || !!proofLinkError}
                            className="px-3 py-2 rounded-lg text-xs font-semibold bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50 transition-colors">
                            {submittingProofId === c.id ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> : 'Submit'}
                          </button>
                        </div>
                        {proofLinkError && <p className="text-red-500 text-[10px] mt-1">{proofLinkError}</p>}
                        <p className={`text-[10px] mt-1.5 ${ts}`}>Accepted: Google Drive, Google Docs, OneDrive</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <input ref={proofFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleProofFileSelected} />

      </div>
    </div>
    <ToastContainer toasts={toasts} removeToast={removeToast} />
    </>
  );
}
