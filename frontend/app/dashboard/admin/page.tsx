'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
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
import UserProfileCard from '@/components/UserProfileCard';
import LeftSidebar, { type NavItem } from '@/components/LeftSidebar';
import LeaderboardCard, { type LeaderboardItem } from '@/components/LeaderboardCard';
import { Ban, Trash2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type Consultation = {
  id: number;
  student_name: string;
  professor_name: string;
  student_number: string;
  program: string;
  date: string;
  day: string;
  time_start: string;
  time_end: string;
  nature_of_advising: string;
  nature_of_advising_specify: string | null;
  mode: string;
  status: string;
  action_taken: string | null;
  referral: string | null;
  referral_specify: string | null;
};

type Schedule = {
  id: number;
  professor_id: number;
  professor_name: string;
  department: string;
  day: string;
  time_start: string;
  time_end: string;
  is_available: boolean;
  location?: string;
};

type Professor = {
  id: number;
  full_name: string;
  department: string;
  consultation_count: number;
};

type UserAccount = {
  id: number;
  profile_id: number;
  email: string;
  role: 'student' | 'professor';
  is_approved: boolean;
  is_active: boolean;
  locked_until?: string | null;
  failed_attempts?: number;
  created_at: string;
  full_name: string;
  student_number?: string;
  program?: string;
  year_level?: number;
  department?: string;
  avatar?: string | null;
};

type AdminUser = {
  id: number;
  email: string;
  role: string;
  created_at: string;
};

type Announcement = {
  id: number;
  title: string;
  body: string;
  type: 'info' | 'warning';
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

const STATUS_STYLES: Record<string, { ring: string; text: string; dot: string; label: string }> = {
  pending:     { ring: 'ring-amber-500/30',   text: 'text-amber-400',   dot: 'bg-amber-400',   label: 'Pending' },
  confirmed:   { ring: 'ring-blue-500/30',    text: 'text-blue-400',    dot: 'bg-blue-400',    label: 'Confirmed' },
  completed:   { ring: 'ring-emerald-500/30', text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'Completed' },
  cancelled:   { ring: 'ring-red-500/30',     text: 'text-red-400',     dot: 'bg-red-400',     label: 'Cancelled' },
  missed:      { ring: 'ring-red-500/30',     text: 'text-red-400',     dot: 'bg-red-400',     label: 'Missed' },
  rescheduled: { ring: 'ring-orange-500/30',  text: 'text-orange-400',  dot: 'bg-orange-400',  label: 'Rescheduled' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { ring: 'ring-gray-500/30', text: 'text-gray-400', dot: 'bg-gray-400', label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/5 ring-1 ${s.ring} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const initials = name.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const validUrl = avatarUrl?.startsWith('https://') ? avatarUrl : null;
  return (
    <div className="w-9 h-9 rounded-full bg-red-950 border border-red-900/50 flex items-center justify-center text-red-300 text-xs font-semibold flex-shrink-0 overflow-hidden">
      {validUrl ? <img src={validUrl} alt={name} className="w-full h-full object-cover" /> : initials}
    </div>
  );
}

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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

function parseNature(natureStr: string | null): string[] {
  if (!natureStr) return [];
  try {
    const parsed = JSON.parse(natureStr);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [natureStr];
  }
}

function natureLabel(c: { nature_of_advising: string; nature_of_advising_specify: string | null }): string {
  const items = parseNature(c.nature_of_advising);
  return items.map(i =>
    i === 'Others (Please Specify)' && c.nature_of_advising_specify
      ? `Others: ${c.nature_of_advising_specify}` : i
  ).join(', ') || '—';
}

function actionLabel(action_taken: string | null, referral: string | null, referral_specify: string | null): string {
  if (!action_taken) return '—';
  if (action_taken === 'Referred to' && referral) {
    if (referral === 'Other Office (Please Specify)' && referral_specify) return `Referred to: ${referral_specify}`;
    return `Referred to: ${referral.split(' (')[0]}`;
  }
  return action_taken;
}

function ActionBadge({ action_taken, referral, referral_specify }: { action_taken: string | null; referral: string | null; referral_specify: string | null }) {
  const label = actionLabel(action_taken, referral, referral_specify);
  if (label === '—') return <span className="text-gray-600 text-xs">—</span>;
  const isReferred = label.startsWith('Referred to');
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold ${
      isReferred
        ? 'bg-violet-500/20 text-violet-400'
        : 'bg-green-500/20 text-green-500'
    }`}>
      {isReferred ? (
        <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      ) : (
        <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      )}
      <span className="line-clamp-2">{label}</span>
    </span>
  );
}

function formatTime(t?: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtDateTime(isoStr: string): string {
  const d = new Date(isoStr);
  const date = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${date} · ${time}`;
}

type Tab = 'home' | 'consultations' | 'accounts' | 'schedules' | 'reports' | 'history' | 'calendar';
type ReportPeriod = '' | 'week' | 'year' | 'semester';

export default function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('home');
  const [adminName, setAdminName] = useState('Administrator');
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Consultation filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Report period
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('');
  const [exporting, setExporting] = useState<string | null>(null);

  // Account management
  const [accountRoleFilter, setAccountRoleFilter] = useState<string>('all');
  const [showAddUser, setShowAddUser] = useState(false);
  const [profileCard, setProfileCard] = useState<{ id: number; role: 'professor' | 'student' } | null>(null);
  const [addForm, setAddForm] = useState({
    email: '', password: '', role: 'student', full_name: '',
    student_number: '', program: '', year_level: '', department: '',
  });
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  // Admin transfer
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferError, setTransferError] = useState('');

  // Calendar overrides
  const [calOverrides, setCalOverrides] = useState<CalendarOverride[]>([]);
  const [calSaving, setCalSaving] = useState<string | null>(null);
  const [calError, setCalError] = useState<string | null>(null);
  const [calViewYear, setCalViewYear] = useState(() => new Date().getFullYear());
  const [calViewMonth, setCalViewMonth] = useState(() => new Date().getMonth());
  const [calSelectedDates, setCalSelectedDates] = useState<Set<string>>(new Set());
  const [calShiftAnchor, setCalShiftAnchor] = useState<string | null>(null);
  const [calHiddenFilters, setCalHiddenFilters] = useState<Set<string>>(new Set());

  const [calAuditLog, setCalAuditLog] = useState<{ id: number; ts: Date; action: string; target: string; from: string; to: string; deleteInfo?: { type: string; date?: string; weekNumber?: number } }[]>([]);
  const [calUndoStack, setCalUndoStack] = useState<{ desc: string; fn: () => Promise<void> }[]>([]);
  const [calBulkLabel, setCalBulkLabel] = useState('');
  const [calPendingMode, setCalPendingMode] = useState<'In-Person' | 'Online' | null>(null);
  const [calPendingLabel, setCalPendingLabel] = useState('');
  const [calPendingColor, setCalPendingColor] = useState('red');
  const [calPendingBlocked, setCalPendingBlocked] = useState<boolean | null>(null);
  const [calLabelEditing, setCalLabelEditing] = useState(false);
  const [calPendingBlockReason, setCalPendingBlockReason] = useState('');

  // Leaderboards
  const [lbProfs, setLbProfs]       = useState<LeaderboardItem[]>([]);
  const [lbStudents, setLbStudents] = useState<LeaderboardItem[]>([]);
  const [lbTopics, setLbTopics]     = useState<LeaderboardItem[]>([]);

  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [annSaving, setAnnSaving] = useState(false);
  const [annError, setAnnError] = useState<string | null>(null);
  const [annForm, setAnnForm] = useState({ title: '', body: '', type: 'info' as 'info' | 'warning', pinned: false });
  const [annEditId, setAnnEditId] = useState<number | null>(null);
  const [annFormOpen, setAnnFormOpen] = useState(false);
  const [annDeleteId, setAnnDeleteId] = useState<number | null>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  // ── Term configuration ────────────────────────────────────────────────────────
  const [term, setTerm] = useState<TermConfig>(CURRENT_TERM);
  const [termForm, setTermForm] = useState<RawTermConfig>({
    term_label: CURRENT_TERM.label,
    term_start: CURRENT_TERM.start.toISOString().slice(0, 10),
    term_total_weeks: String(CURRENT_TERM.totalWeeks),
    term_midterm_week: String(CURRENT_TERM.midtermWeek),
    term_finals_week: String(CURRENT_TERM.finalsWeek),
  });
  const [termSaving, setTermSaving] = useState(false);
  const [termError, setTermError] = useState<string | null>(null);
  const [termSuccess, setTermSuccess] = useState(false);

  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const dark = localStorage.getItem('consulta-theme') !== 'light';
    setIsDark(dark);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    setAdminName(localStorage.getItem('consulta-name') || 'Administrator');
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    localStorage.setItem('consulta-theme', next ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    window.dispatchEvent(new CustomEvent('consulta-theme-change', { detail: { dark: next } }));
    setIsDark(next);
  };

  const stats = {
    total: consultations.length,
    pending: consultations.filter(c => c.status === 'pending').length,
    confirmed: consultations.filter(c => c.status === 'confirmed').length,
    completed: consultations.filter(c => c.status === 'completed').length,
  };

  useEffect(() => {
    if (!token) { router.push('/login'); return; }
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab') as Tab;
    const valid: Tab[] = ['home', 'consultations', 'accounts', 'schedules', 'reports', 'history', 'calendar'];
    if (t && valid.includes(t)) setTab(t);
    fetchAll();
  }, []);

  useEffect(() => {
    const arr = [...calSelectedDates];
    const single = arr.length === 1 ? arr[0] : null;
    setCalPendingMode(null);
    setCalPendingBlocked(null);
    setCalLabelEditing(false);
    const found = single
      ? calOverrides.find((o: CalendarOverride) => o.type === 'date_label' && o.date === single)
      : undefined;
    setCalPendingLabel(found?.value ?? '');
    setCalPendingColor(found?.color ?? 'red');
    const blockedEntry = single
      ? calOverrides.find((o: CalendarOverride) => o.type === 'blocked_date' && o.date === single)
      : undefined;
    setCalPendingBlockReason(blockedEntry?.label ?? '');
  }, [calSelectedDates]);

  const fetchAll = async () => {
    const [consultData, schedData, profData, usersData, adminsData, calData, annData, termData, lbP, lbS, lbT] = await Promise.all([
      api.get('/api/consultations', token!),
      api.get('/api/schedules/all', token!),
      api.get('/api/reports/professors', token!),
      api.get('/api/admin/users', token!),
      api.get('/api/admin/admins', token!),
      api.get('/api/calendar', token!),
      fetch(`${API_URL}/api/announcements`).then(r => r.ok ? r.json() : []).catch(() => []),
      api.get('/api/settings/term', token!),
      api.get('/api/leaderboard/professors', token!),
      api.get('/api/leaderboard/students', token!),
      api.get('/api/leaderboard/topics', token!),
    ]);

    const list: Consultation[] = Array.isArray(consultData) ? consultData : [];
    setConsultations(list);
    setSchedules(Array.isArray(schedData) ? schedData : []);
    setProfessors(Array.isArray(profData) ? profData : []);
    setUsers(Array.isArray(usersData) ? usersData : []);
    setAdmins(Array.isArray(adminsData) ? adminsData : []);
    setCalOverrides(Array.isArray(calData) ? calData : []);
    setAnnouncements(Array.isArray(annData) ? annData : []);
    if (termData && !termData.error) {
      const built = buildTermFromConfig(termData as RawTermConfig);
      setTerm(built);
      setTermForm(termData as RawTermConfig);
    }
    setLbProfs(Array.isArray(lbP) ? lbP.map((r: any) => ({ rank: r.rank, label: r.name, count: r.count })) : []);
    setLbStudents(Array.isArray(lbS) ? lbS.map((r: any) => ({ rank: r.rank, label: r.name, count: r.count })) : []);
    setLbTopics(Array.isArray(lbT) ? lbT : []);
    setLoading(false);
  };

  const refreshCalOverrides = async () => {
    // Read token fresh from localStorage so stale closures never block state updates
    const t = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!t) return;
    const data = await api.get('/api/calendar', t);
    if (Array.isArray(data)) setCalOverrides(data);
  };

  const handleLogout = () => { localStorage.clear(); router.push('/login'); };

  const handleDownload = async (url: string, filename: string, key: string) => {
    setExporting(key);
    try {
      const res = await fetch(`${API_URL}${url}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setExporting(null); return; }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl; a.download = filename; a.click();
      URL.revokeObjectURL(objUrl);
    } finally {
      setExporting(null);
    }
  };

  const handleApprove = async (id: number) => {
    const data = await api.patch(`/api/admin/users/${id}/approve`, {}, token!);
    if (data.error) { alert(data.error); return; }
    fetchAll();
  };

  const handleReject = async (id: number) => {
    if (!confirm('Reject this account? The registration will be deleted and the user must re-register.')) return;
    const data = await api.patch(`/api/admin/users/${id}/reject`, {}, token!);
    if (data.error) { alert(data.error); return; }
    fetchAll();
  };

  const handleDeleteUser = async (id: number, name: string) => {
    if (!confirm(`Delete account for "${name}"? This cannot be undone.`)) return;
    const data = await api.delete(`/api/admin/users/${id}`, token!);
    if (data.error) { alert(data.error); return; }
    fetchAll();
  };

  const handleDeactivate = async (id: number, name: string) => {
    if (!confirm(`Deactivate account for "${name}"? They will not be able to log in until reactivated.`)) return;
    const data = await api.patch(`/api/admin/users/${id}/deactivate`, {}, token!);
    if (data.error) { alert(data.error); return; }
    fetchAll();
  };

  const handleActivate = async (id: number) => {
    const data = await api.patch(`/api/admin/users/${id}/activate`, {}, token!);
    if (data.error) { alert(data.error); return; }
    fetchAll();
  };

  const handleUnlock = async (id: number) => {
    const data = await api.patch(`/api/admin/users/${id}/unlock`, {}, token!);
    if (data.error) { alert(data.error); return; }
    fetchAll();
  };

  const handleAddUser = async () => {
    setAddError('');
    if (!addForm.email || !addForm.full_name) { setAddError('Email and full name are required.'); return; }
    if (addForm.role === 'student' && !addForm.student_number) { setAddError('Student number is required.'); return; }
    setAddLoading(true);
    const data = await api.post('/api/admin/users', {
      ...addForm,
      year_level: addForm.year_level ? parseInt(addForm.year_level) : undefined,
    }, token!);
    setAddLoading(false);
    if (data.error) { setAddError(data.error); return; }
    setShowAddUser(false);
    setAddForm({ email: '', password: '', role: 'student', full_name: '', student_number: '', program: '', year_level: '', department: '' });
    fetchAll();
  };

  const handleTransferAdmin = async () => {
    setTransferError('');
    if (!transferTargetId) { setTransferError('Please select a user.'); return; }
    const data = await api.patch('/api/admin/transfer-admin', { target_user_id: parseInt(transferTargetId) }, token!);
    if (data.error) { setTransferError(data.error); return; }
    setShowTransfer(false);
    setTransferTargetId('');
    fetchAll();
  };

  // Tab counts for consultations
  const consultTabCounts = useMemo(() => ({
    all: consultations.length,
    pending: consultations.filter(c => ['pending', 'confirmed', 'rescheduled'].includes((c.status ?? '').toLowerCase().trim())).length,
    missed: consultations.filter(c => (c.status ?? '').toLowerCase().trim() === 'missed').length,
    completed: consultations.filter(c => (c.status ?? '').toLowerCase().trim() === 'completed').length,
    cancelled: consultations.filter(c => (c.status ?? '').toLowerCase().trim() === 'cancelled').length,
  }), [consultations]);

  // Filtered consultations
  const filteredConsultations = useMemo(() => consultations.filter(c => {
    const status = (c.status ?? '').toLowerCase().trim();
    const tabMatch =
      statusFilter === 'all' ? true :
      statusFilter === 'pending' ? ['pending', 'confirmed', 'rescheduled'].includes(status) :
      statusFilter === 'missed' ? status === 'missed' :
      statusFilter === 'completed' ? status === 'completed' :
      statusFilter === 'cancelled' ? status === 'cancelled' :
      true;
    if (!tabMatch) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !c.student_name?.toLowerCase().includes(q) &&
        !c.professor_name?.toLowerCase().includes(q) &&
        !String(c.id).includes(q) &&
        !c.date?.includes(q)
      ) return false;
    }
    return true;
  }), [consultations, statusFilter, search]);

  const filteredUsers = users
    .filter(u => {
      if (accountRoleFilter !== 'all' && u.role !== accountRoleFilter) return false;
      return true;
    })
    .sort((a, b) => {
      // Unapproved accounts sink to the bottom
      if (a.is_approved !== b.is_approved) return a.is_approved ? -1 : 1;
      return 0;
    });

  const pendingUsers = users.filter(u => !u.is_approved);

  const schedulesByProf = schedules.reduce<Record<string, { name: string; dept: string; slots: Schedule[] }>>(
    (acc, s) => {
      const key = String(s.professor_id);
      if (!acc[key]) acc[key] = { name: s.professor_name, dept: s.department, slots: [] };
      acc[key].slots.push(s);
      return acc;
    },
    {}
  );

  // ── Calendar computed state (shared between Home and Calendar tabs) ──────────
  const CAL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const CAL_DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const EVENT_COLORS = [
    { id: 'red',    dot: 'bg-red-500',     pill: 'bg-red-500',     pillText: 'text-white'     },
    { id: 'blue',   dot: 'bg-blue-500',    pill: 'bg-blue-500',    pillText: 'text-white'     },
    { id: 'green',  dot: 'bg-emerald-500', pill: 'bg-emerald-500', pillText: 'text-white'     },
    { id: 'yellow', dot: 'bg-yellow-400',  pill: 'bg-yellow-400',  pillText: 'text-gray-900'  },
    { id: 'orange', dot: 'bg-orange-500',  pill: 'bg-orange-500',  pillText: 'text-white'     },
    { id: 'purple', dot: 'bg-purple-500',  pill: 'bg-purple-500',  pillText: 'text-white'     },
  ] as const;

  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const todayStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth()+1).padStart(2,'0')}-${String(todayDate.getDate()).padStart(2,'0')}`;
  const currentAcademicWeek = getAcademicWeek(CURRENT_TERM, todayDate);

  const prevCalMonth = () => {
    if (calViewMonth === 0) { setCalViewMonth(11); setCalViewYear((y: number) => y - 1); }
    else setCalViewMonth((m: number) => m - 1);
  };
  const nextCalMonth = () => {
    if (calViewMonth === 11) { setCalViewMonth(0); setCalViewYear((y: number) => y + 1); }
    else setCalViewMonth((m: number) => m + 1);
  };

  const modeMap         = new Map(calOverrides.filter(o => o.type === 'mode_override' && o.week_number && o.value).map(o => [o.week_number!, o.value!]));
  const blockedDates    = calOverrides.filter(o => o.type === 'blocked_date' && o.date);
  const blockedSet      = new Set(blockedDates.map(o => o.date!));
  const dateLabelMap    = new Map(calOverrides.filter(o => o.type === 'date_label' && o.date).map(o => [o.date!, o.value ?? '']));
  const dateColorMap    = new Map(calOverrides.filter(o => o.type === 'date_label' && o.date).map(o => [o.date!, o.color ?? 'red']));

  const effectiveMode = (w: number): string => modeMap.get(w) ?? getWeekMode(CURRENT_TERM, w);

  const applyModeChange = async (w: number, targetMode: string, date?: string) => {
    const current = effectiveMode(w);
    if (current === targetMode) return;
    const dbEntry = calOverrides.find(o => o.type === 'mode_override' && o.week_number === w);
    const staticMode = getWeekMode(CURRENT_TERM, w);
    let result;
    if (dbEntry) {
      if (targetMode === staticMode) {
        result = await api.delete(`/api/admin/calendar-overrides/${dbEntry.id}`, token!);
      } else {
        result = await api.patch(`/api/admin/calendar-overrides/${dbEntry.id}`, { value: targetMode }, token!);
      }
    } else if (targetMode !== staticMode) {
      result = await api.post('/api/admin/calendar-overrides', { type: 'mode_override', week_number: w, value: targetMode, date: date ?? null }, token!);
    }
    if (result?.error) throw new Error(result.error);
  };

  const handleModeToggle = async (w: number) => {
    setCalSaving(`mode-${w}`);
    try {
      const current = effectiveMode(w);
      const newMode = current === 'Online' ? 'In-Person' : 'Online';
      await applyModeChange(w, newMode);
      await refreshCalOverrides();
    } catch (err) {
      setCalError(err instanceof Error ? err.message : 'Failed to update mode');
    } finally {
      setCalSaving(null);
    }
  };

  const handleSaveDate = async (date: string, week: number | null) => {
    setCalSaving('save'); setCalError(null);
    const auditEntries: typeof calAuditLog = [];
    try {
      // Mode change (throws on API error via applyModeChange)
      if (week && calPendingMode !== null) {
        const prev = effectiveMode(week);
        await applyModeChange(week, calPendingMode, date);
        auditEntries.push({ id: Date.now(), ts: new Date(), action: 'Mode changed', target: `Week ${week}`, from: prev, to: calPendingMode, deleteInfo: { type: 'mode_override', weekNumber: week } });
      }
      // Event label + color
      const existingLabel = calOverrides.find((o: CalendarOverride) => o.type === 'date_label' && o.date === date);
      const newLabel = calPendingLabel.trim();
      const labelChanged = newLabel !== (existingLabel?.value ?? '');
      const colorChanged = !!existingLabel && calPendingColor !== (existingLabel.color ?? 'red');
      if (newLabel && (labelChanged || colorChanged)) {
        const r = existingLabel
          ? await api.patch(`/api/admin/calendar-overrides/${existingLabel.id}`, { value: newLabel, color: calPendingColor }, token!)
          : await api.post('/api/admin/calendar-overrides', { type: 'date_label', date, value: newLabel, color: calPendingColor }, token!);
        if (r?.error) throw new Error(r.error);
        auditEntries.push({ id: Date.now() + 1, ts: new Date(), action: 'Event set', target: date, from: existingLabel?.value ?? '—', to: newLabel, deleteInfo: { type: 'date_label', date } });
      } else if (!newLabel && existingLabel) {
        const r = await api.delete(`/api/admin/calendar-overrides/${existingLabel.id}`, token!);
        if (r?.error) throw new Error(r.error);
        auditEntries.push({ id: Date.now() + 1, ts: new Date(), action: 'Event removed', target: date, from: existingLabel.value ?? '', to: '—' });
      }
      // Blocked status (and reason)
      const isCurrentlyBlocked = blockedSet.has(date);
      const savedBlockReason = blockedDates.find((o: CalendarOverride) => o.date === date)?.label ?? '';
      const blockReasonChanged = isCurrentlyBlocked && calPendingBlockReason.trim() !== savedBlockReason;
      if (calPendingBlocked !== null || blockReasonChanged) {
        const shouldBlock = calPendingBlocked !== null ? calPendingBlocked : isCurrentlyBlocked;
        if (shouldBlock && (!isCurrentlyBlocked || blockReasonChanged)) {
          const r = await api.post('/api/admin/blocked-dates', { date, label: calPendingBlockReason.trim() || null }, token!);
          if (r?.error) throw new Error(r.error);
          const isNew = !isCurrentlyBlocked;
          auditEntries.push({ id: Date.now() + 2, ts: new Date(), action: isNew ? 'Blocked' : 'Block reason updated', target: date, from: isNew ? 'Normal' : (savedBlockReason || '(none)'), to: isNew ? (calPendingBlockReason.trim() || 'Blocked') : (calPendingBlockReason.trim() || '(none)'), deleteInfo: isNew ? { type: 'blocked_date', date } : undefined });
        } else if (!shouldBlock && isCurrentlyBlocked) {
          const entry = blockedDates.find((o: CalendarOverride) => o.date === date);
          if (entry) {
            const r = await api.delete(`/api/admin/blocked-dates/${entry.id}`, token!);
            if (r?.error) throw new Error(r.error);
          }
          auditEntries.push({ id: Date.now() + 2, ts: new Date(), action: 'Unblocked', target: date, from: 'Blocked', to: 'Normal' });
        }
      }
      // Re-fetch fresh data from backend and update local state
      await refreshCalOverrides();
      if (auditEntries.length > 0) setCalAuditLog(log => [...auditEntries, ...log].slice(0, 20));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save. Please try again.';
      if (msg.includes('Insufficient permissions')) {
        localStorage.clear();
        router.push('/login');
        return;
      }
      setCalError(msg);
    } finally {
      setCalSaving(null);
      setCalPendingMode(null);
      setCalPendingBlocked(null);
    }
  };

  const handleDeleteOverride = async (id: number, type?: string) => {
    setCalError(null);
    const endpoint = type === 'blocked_date'
      ? `/api/admin/blocked-dates/${id}`
      : `/api/admin/calendar-overrides/${id}`;
    const result = await api.delete(endpoint, token!);
    if (result?.error) {
      setCalError(`Failed to delete: ${result.error}`);
    } else {
      await refreshCalOverrides();
    }
  };

  const handleDeleteFromHistory = async (entryId: number, deleteInfo: { type: string; date?: string; weekNumber?: number }) => {
    setCalError(null);
    let override: CalendarOverride | undefined;
    if (deleteInfo.type === 'date_label' && deleteInfo.date) {
      override = calOverrides.find((o: CalendarOverride) => o.type === 'date_label' && o.date === deleteInfo.date);
    } else if (deleteInfo.type === 'blocked_date' && deleteInfo.date) {
      override = calOverrides.find((o: CalendarOverride) => o.type === 'blocked_date' && o.date === deleteInfo.date);
    } else if (deleteInfo.type === 'mode_override' && deleteInfo.weekNumber) {
      override = calOverrides.find((o: CalendarOverride) => o.type === 'mode_override' && o.week_number === deleteInfo.weekNumber);
    }
    if (override) {
      await handleDeleteOverride(override.id, override.type);
    }
    setCalAuditLog(log => log.filter(e => e.id !== entryId));
  };

  // ── Announcement handlers ────────────────────────────────────────────────────
  const handleSaveAnn = async () => {
    if (!annForm.title.trim() || !annForm.body.trim()) return;
    setAnnSaving(true);
    setAnnError(null);
    const result = annEditId
      ? await api.patch(`/api/announcements/${annEditId}`, annForm, token!)
      : await api.post('/api/announcements', annForm, token!);
    setAnnSaving(false);
    if (result?.error) { setAnnError(result.error); return; }
    setAnnForm({ title: '', body: '', type: 'info', pinned: false });
    setAnnEditId(null);
    setAnnFormOpen(false);
    await fetchAll();
  };

  const handleDeleteAnn = async () => {
    if (annDeleteId === null) return;
    const result = await api.delete(`/api/announcements/${annDeleteId}`, token!);
    setAnnDeleteId(null);
    if (result?.error) { setAnnError(result.error); return; }
    await fetchAll();
  };

  // ── Term stats (used by Home tab) ────────────────────────────────────────────
  const now = new Date();
  const currentWeek = getAcademicWeek(term, now);
  const currentMode = currentWeek ? getWeekMode(term, currentWeek) : null;
  const { finalsDate, endDate } = getTermDates(term);
  const daysToFinals = daysUntil(finalsDate, now);
  const daysToEnd = daysUntil(endDate, now);
  const termProgress = getTermProgress(term, now);
  const nextWeek = currentWeek ? currentWeek + 1 : null;
  const nextWeekMode = nextWeek && nextWeek <= term.totalWeeks ? getWeekMode(term, nextWeek) : null;

  const adminNavItems: NavItem[] = [
    { key: 'home',          label: 'Home' },
    { key: 'consultations', label: 'Consultations' },
    { key: 'accounts',      label: 'Accounts' },
    { key: 'schedules',     label: 'Schedules' },
    { key: 'reports',       label: 'Reports' },
    { key: 'history',       label: 'History' },
    { key: 'calendar',      label: 'Calendar' },
  ];

  const inputCls = 'w-full px-3 py-2 rounded-lg text-white text-sm bg-[#0f0f0f] border border-white/10 focus:outline-none focus:border-[#0EA5E9]/50 placeholder-gray-600';

  const btnPrimary = 'bg-[linear-gradient(135deg,#0369A1,#0EA5E9)] text-white font-semibold rounded-[10px] transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(14,165,233,0.4)] shadow-[0_2px_8px_rgba(14,165,233,0.2)]';
  const btnSecondary = 'border-2 border-[#0EA5E9] text-[#0EA5E9] bg-transparent font-medium rounded-[10px] transition-all duration-200 hover:scale-[1.02] hover:bg-[linear-gradient(135deg,#0369A1,#0EA5E9)] hover:text-white hover:border-transparent';
  const btnDanger = 'bg-[linear-gradient(135deg,#EF4444,#DC2626)] text-white font-semibold rounded-[10px] transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(239,68,68,0.4)] shadow-sm';
  const btnDeactivate = 'bg-[linear-gradient(135deg,#F97316,#EA580C)] text-white font-semibold rounded-[10px] transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(249,115,22,0.4)] shadow-sm';
  const btnSuccess = 'bg-[linear-gradient(135deg,#10B981,#059669)] text-white font-semibold rounded-[10px] transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(16,185,129,0.4)]';

  return (
    <div className={`h-screen flex overflow-hidden ${isDark ? 'bg-[#1e2235]' : 'bg-[#EEF2FF]'}`}>

      <LeftSidebar
        role="admin"
        navItems={adminNavItems}
        activeTab={tab}
        onTabChange={(t) => setTab(t as Tab)}
        profileName={adminName}
        profileAvatar={null}
        isDark={isDark}
        onToggleTheme={toggleTheme}
      />

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="lg:hidden h-14 flex-shrink-0" />
        <main className={`flex-1 overflow-y-auto ${isDark ? 'bg-[#1e2235]' : 'bg-[#EEF2FF]'}`}>
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-8 h-8 border-2 border-[#0EA5E9] border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600 text-sm">Loading...</p>
          </div>
        ) : (
          <div className="px-3 sm:px-8 py-5 sm:py-8">

            {/* ── Consultations ── */}
            {tab === 'consultations' && (
              <>
                <div className="mb-6">
                  <h1 className="text-white text-2xl font-bold">Consultations</h1>
                  <p className="text-gray-500 text-sm mt-1">All consultation records across the system</p>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 mb-5 bg-[#161616] border border-white/5 rounded-xl p-1 w-full sm:w-fit overflow-x-auto">
                  {([
                    { key: 'all',       label: 'All',       color: 'text-white'       },
                    { key: 'pending',   label: 'Pending',   color: 'text-amber-400'   },
                    { key: 'missed',    label: 'Missed',    color: 'text-red-400'     },
                    { key: 'completed', label: 'Completed', color: 'text-emerald-400' },
                    { key: 'cancelled', label: 'Cancelled', color: 'text-rose-400'    },
                  ] as const).map(t => (
                    <button key={t.key} onClick={() => setStatusFilter(t.key)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        statusFilter === t.key
                          ? 'bg-[#0EA5E9] text-white shadow-sm shadow-sky-500/30'
                          : `text-gray-500 hover:text-gray-200 hover:bg-white/5`
                      }`}>
                      {t.label}
                      <span className={`text-xs px-1.5 py-0.5 rounded-md ${
                        statusFilter === t.key ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-600'
                      }`}>
                        {consultTabCounts[t.key]}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Search */}
                <div className="relative mb-4">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" /></svg>
                  <input
                    type="text"
                    placeholder="Search by name, date, or ID…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg text-white text-sm bg-[#161616] border border-white/5 focus:outline-none focus:border-[#0EA5E9]/30 placeholder-gray-600"
                  />
                </div>

                <p className="text-gray-600 text-[10px] font-semibold uppercase tracking-widest mb-3">
                  {filteredConsultations.length} record{filteredConsultations.length !== 1 ? 's' : ''}
                </p>

                {filteredConsultations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-white/5 bg-[#161616]">
                    <p className="text-gray-400 font-medium text-sm">No records found</p>
                    <p className="text-gray-600 text-xs mt-1">Try adjusting your filters</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {filteredConsultations.map(c => (
                      <div key={c.id} className="rounded-2xl border border-white/5 bg-[#161616] px-5 py-4 hover:border-white/10 transition-colors">
                        <div className="flex items-start gap-4">
                          <Avatar name={c.student_name} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-white font-semibold text-sm">{c.student_name}</span>
                                  <span className="text-gray-600 text-xs">·</span>
                                  <span className="text-gray-500 text-xs">{c.student_number}</span>
                                  {c.program && <><span className="text-gray-600 text-xs">·</span><span className="text-gray-500 text-xs">{c.program}</span></>}
                                </div>
                                <p className="text-gray-600 text-xs mt-0.5">with {c.professor_name}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-600 text-xs">#{c.id}</span>
                                <StatusBadge status={c.status} />
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-4">
                              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" /></svg>
                                {new Date(c.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                <span className="text-gray-700">·</span>
                                {c.day} {formatTime(c.time_start)}–{formatTime(c.time_end)}
                              </div>
                              <span className={`inline-flex items-center gap-1 text-xs ${c.mode === 'F2F' ? 'text-purple-400' : 'text-cyan-400'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${c.mode === 'F2F' ? 'bg-purple-400' : 'bg-cyan-400'}`} />
                                {c.mode === 'F2F' ? 'Face-to-Face' : 'Online'}
                              </span>
                              <span className="text-gray-500 text-xs line-clamp-1">{natureLabel(c)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── Accounts ── */}
            {tab === 'accounts' && (
              <>
                <div className="mb-7 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <h1 className="text-white text-2xl font-bold">Account Management</h1>
                    <p className="text-gray-500 text-sm mt-1">Approve registrations, add or remove accounts</p>
                  </div>
                  <button onClick={() => setShowAddUser(true)}
                    className={`flex items-center justify-center gap-2 px-4 py-2 text-sm sm:flex-shrink-0 min-h-[44px] sm:min-h-0 ${btnPrimary}`}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                    Add Account
                  </button>
                </div>

                {/* Admin section */}
                <div className="rounded-2xl border border-white/5 bg-[#161616] p-4 mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest">Admin Accounts ({admins.length}/2)</p>
                    {admins.length < 2 && (
                      <button onClick={() => setShowTransfer(true)}
                        className="text-xs text-sky-400 hover:text-sky-300 transition-colors">
                        Promote user to admin →
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {admins.map(a => (
                      <div key={a.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-sky-500/5 ring-1 ring-sky-500/20">
                        <div className="flex items-center gap-3">
                          <Avatar name={a.email} />
                          <div>
                            <p className="text-white text-sm font-medium">{a.email}</p>
                            <p className="text-gray-600 text-xs">Admin · joined {fmtDateTime(a.created_at)}</p>
                          </div>
                        </div>
                        <span className="text-[10px] text-sky-400 font-semibold uppercase tracking-wide">Admin</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pending approvals */}
                {pendingUsers.length > 0 && (
                  <div className="mb-6">
                    <p className="text-amber-400 text-[10px] font-semibold uppercase tracking-widest mb-3">
                      Pending Approval ({pendingUsers.length})
                    </p>
                    <div className="space-y-2">
                      {pendingUsers.map(u => (
                        <div key={u.id} className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <button type="button" onClick={() => setProfileCard({ id: u.profile_id, role: u.role })} className="flex-shrink-0 hover:opacity-75 transition-opacity rounded-full focus:outline-none" title="View profile">
                              <Avatar name={u.full_name || u.email} avatarUrl={u.avatar} />
                            </button>
                            <div>
                              <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {u.full_name || <span className="italic text-gray-500">(No name)</span>}
                              </p>
                              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>{u.email} · {u.role}</p>
                              {u.role === 'student' && u.student_number && (
                                <p className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-500'}`}>{u.student_number} {u.program ? `· ${u.program}` : ''}</p>
                              )}
                              {u.role === 'professor' && u.department && (
                                <p className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-500'}`}>{u.department}</p>
                              )}
                              <p className={`text-[10px] mt-0.5 ${isDark ? 'text-gray-700' : 'text-gray-400'}`}>Registered {fmtDateTime(u.created_at)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button onClick={() => handleApprove(u.id)}
                              className={`px-3 py-2 sm:py-1.5 text-xs min-h-[40px] sm:min-h-0 ${btnSuccess}`}>
                              Approve
                            </button>
                            <button onClick={() => handleReject(u.id)}
                              className={`px-3 py-2 sm:py-1.5 text-xs min-h-[40px] sm:min-h-0 ${btnDanger}`}>
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Role filter */}
                <div className="flex items-center gap-2 mb-4">
                  {['all', 'student', 'professor'].map(r => (
                    <button key={r} onClick={() => setAccountRoleFilter(r)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        accountRoleFilter === r ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                      }`}>
                      {r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1) + 's'}
                    </button>
                  ))}
                </div>

                <p className="text-gray-600 text-[10px] font-semibold uppercase tracking-widest mb-3">
                  All Accounts ({filteredUsers.length})
                </p>

                {filteredUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-white/5 bg-[#161616]">
                    <p className="text-gray-400 text-sm">No accounts found</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredUsers.map(u => (
                      <div key={u.id} className={`rounded-xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-colors ${
                        !u.is_active
                          ? 'border-white/5 bg-[#111] opacity-60'
                          : 'border-white/5 bg-[#161616] hover:border-white/10'
                      }`}>
                        <div className="flex items-center gap-3">
                          <button type="button" onClick={() => setProfileCard({ id: u.profile_id, role: u.role })} className="flex-shrink-0 hover:opacity-75 transition-opacity rounded-full focus:outline-none" title="View profile">
                            <Avatar name={u.full_name || u.email} avatarUrl={u.avatar} />
                          </button>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-white text-sm font-medium">
                                {u.full_name || <span className="italic text-gray-500">(No name)</span>}
                              </p>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                u.role === 'professor' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'
                              }`}>
                                {u.role}
                              </span>
                              {!u.is_active && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-500">
                                  deactivated
                                </span>
                              )}
                              {u.locked_until && new Date(u.locked_until) > new Date() && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400">
                                  locked
                                </span>
                              )}
                            </div>
                            <p className="text-gray-500 text-xs">{u.email}</p>
                            {u.role === 'student' && u.student_number && (
                              <p className="text-gray-600 text-xs">{u.student_number}{u.program ? ` · ${u.program}` : ''}</p>
                            )}
                            {u.role === 'professor' && u.department && (
                              <p className="text-gray-600 text-xs">{u.department}</p>
                            )}
                            <p className="text-gray-700 text-[10px] mt-0.5">Joined {fmtDateTime(u.created_at)}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {!u.is_active ? (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />Deactivated
                            </span>
                          ) : u.is_approved ? (
                            <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Approved
                            </span>
                          ) : (
                            <span className="text-xs text-amber-500 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Pending
                            </span>
                          )}
                          {!u.is_approved && u.is_active && (
                            <button onClick={() => handleApprove(u.id)}
                              className={`px-2.5 py-1 text-xs ${btnSuccess}`}>
                              Approve
                            </button>
                          )}
                          {u.locked_until && new Date(u.locked_until) > new Date() && (
                            <button onClick={() => handleUnlock(u.id)}
                              className={`px-2.5 py-1 text-xs ${btnSuccess}`}>
                              Unlock
                            </button>
                          )}
                          {u.is_active ? (
                            <button onClick={() => handleDeactivate(u.id, u.full_name)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs ${btnDeactivate}`}>
                              <Ban className="w-3.5 h-3.5" />
                              Deactivate
                            </button>
                          ) : (
                            <button onClick={() => handleActivate(u.id)}
                              className={`px-2.5 py-1 text-xs ${btnSuccess}`}>
                              Activate
                            </button>
                          )}
                          <button onClick={() => handleDeleteUser(u.id, u.full_name)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs ${btnDanger}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add User Modal */}
                {showAddUser && (
                  <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-[#161616] border border-white/10 rounded-2xl p-6 w-full max-w-md">
                      <div className="flex items-center justify-between mb-5">
                        <h2 className="text-white font-bold text-lg">Add New Account</h2>
                        <button onClick={() => { setShowAddUser(false); setAddError(''); }}
                          className="text-gray-500 hover:text-gray-300 transition-colors">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          {['student', 'professor'].map(r => (
                            <button key={r} onClick={() => setAddForm(f => ({ ...f, role: r }))}
                              className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                                addForm.role === r ? 'bg-[#0EA5E9] text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                              }`}>
                              {r.charAt(0).toUpperCase() + r.slice(1)}
                            </button>
                          ))}
                        </div>
                        <input className={inputCls} placeholder="Full Name *" value={addForm.full_name} onChange={e => setAddForm(f => ({ ...f, full_name: e.target.value }))} />
                        <input className={inputCls} placeholder="Email *" type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} />
                        <input className={inputCls} placeholder="Password (default: Welcome@123)" type="password" value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} />
                        {addForm.role === 'student' ? (
                          <>
                            <input className={inputCls} placeholder="Student Number *" value={addForm.student_number} onChange={e => setAddForm(f => ({ ...f, student_number: e.target.value }))} />
                            <input className={inputCls} placeholder="Program" value={addForm.program} onChange={e => setAddForm(f => ({ ...f, program: e.target.value }))} />
                            <input className={inputCls} placeholder="Year Level" type="number" value={addForm.year_level} onChange={e => setAddForm(f => ({ ...f, year_level: e.target.value }))} />
                          </>
                        ) : (
                          <input className={inputCls} placeholder="Department" value={addForm.department} onChange={e => setAddForm(f => ({ ...f, department: e.target.value }))} />
                        )}
                        {addError && <p className="text-red-400 text-xs">{addError}</p>}
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => { setShowAddUser(false); setAddError(''); }}
                            className={`flex-1 py-2 text-sm ${btnSecondary}`}>Cancel</button>
                          <button onClick={handleAddUser} disabled={addLoading}
                            className={`flex-1 py-2 text-sm disabled:opacity-50 ${btnPrimary}`}>
                            {addLoading ? 'Creating…' : 'Create Account'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Transfer Admin Modal */}
                {showTransfer && (
                  <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-[#161616] border border-white/10 rounded-2xl p-6 w-full max-w-sm">
                      <div className="flex items-center justify-between mb-5">
                        <h2 className="text-white font-bold text-lg">Promote to Admin</h2>
                        <button onClick={() => { setShowTransfer(false); setTransferError(''); }}
                          className="text-gray-500 hover:text-gray-300">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                      <p className="text-gray-500 text-xs mb-4">Max 2 admins allowed. Currently: {admins.length}/2.</p>
                      <select
                        value={transferTargetId}
                        onChange={e => setTransferTargetId(e.target.value)}
                        className={inputCls + ' mb-3'}>
                        <option value="">Select a user…</option>
                        {users.filter(u => u.is_approved).map(u => (
                          <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                        ))}
                      </select>
                      {transferError && <p className="text-red-400 text-xs mb-3">{transferError}</p>}
                      <div className="flex gap-2">
                        <button onClick={() => { setShowTransfer(false); setTransferError(''); }}
                          className={`flex-1 py-2 text-sm ${btnSecondary}`}>Cancel</button>
                        <button onClick={handleTransferAdmin}
                          className={`flex-1 py-2 text-sm ${btnPrimary}`}>
                          Promote
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Schedules ── */}
            {tab === 'schedules' && (
              <>
                <div className="mb-5 sm:mb-7">
                  <h1 className="text-white text-2xl font-bold">Schedules</h1>
                  <p className="text-gray-500 text-sm mt-1">All professor availability slots</p>
                </div>
                {Object.keys(schedulesByProf).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-white/5 bg-[#161616]">
                    <p className="text-gray-400 font-medium text-sm">No schedules found</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.values(schedulesByProf).map((prof) => (
                      <div key={prof.name} className="rounded-2xl border border-white/5 bg-[#161616] overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Avatar name={prof.name} />
                            <div>
                              <p className="text-white font-semibold text-sm">{prof.name}</p>
                              <p className="text-gray-600 text-xs">{prof.dept}</p>
                            </div>
                          </div>
                          <span className="text-gray-600 text-xs">{prof.slots.length} slot{prof.slots.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="divide-y divide-white/5">
                          {[...prof.slots]
                            .sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.time_start.localeCompare(b.time_start))
                            .map(slot => (
                              <div key={slot.id} className="px-5 py-3 flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-3 sm:gap-4 text-sm text-gray-400 flex-wrap">
                                  <span className="text-gray-300 font-medium w-20 sm:w-24">{slot.day}</span>
                                  <span className="font-mono text-xs sm:text-sm">{formatTime(slot.time_start)} – {formatTime(slot.time_end)}</span>
                                  {slot.location && (
                                    <span className="text-gray-600 text-xs">{slot.location}</span>
                                  )}
                                </div>
                                <span className={`inline-flex items-center gap-1.5 text-xs ${slot.is_available ? 'text-emerald-400' : 'text-gray-600'}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${slot.is_available ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                                  {slot.is_available ? 'Available' : 'Booked'}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── Reports ── */}
            {tab === 'reports' && (
              <>
                <div className="mb-5 sm:mb-7">
                  <h1 className="text-white text-2xl font-bold">Reports</h1>
                  <p className="text-gray-500 text-sm mt-1">Download advising reports per professor or combined</p>
                </div>

                {/* Time period filter */}
                <div className="flex flex-wrap items-center gap-2 mb-6">
                  <p className="text-gray-600 text-xs mr-1">Period:</p>
                  {([['', 'All Time'], ['week', 'This Week'], ['semester', 'This Semester'], ['year', 'This Year']] as [ReportPeriod, string][]).map(([val, label]) => (
                    <button key={val} onClick={() => setReportPeriod(val)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        reportPeriod === val ? 'bg-[#0EA5E9] text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>

                <div className="rounded-2xl border border-white/5 bg-[#161616] px-5 py-4 mb-6">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-white font-semibold text-sm">All Professors — Combined Report</p>
                      <p className="text-gray-600 text-xs mt-0.5">{professors.length} professor{professors.length !== 1 ? 's' : ''} · {reportPeriod || 'all time'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDownload(`/api/reports/excel?professor_id=all${reportPeriod ? `&period=${reportPeriod}` : ''}`, 'advising-report-all.xlsx', 'all-excel')}
                        disabled={exporting === 'all-excel'}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                        {exporting === 'all-excel' ? <span className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" /> : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0-3-3m3 3 3-3M3 17V7a2 2 0 0 1 2-2h6l2 2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>}
                        Excel
                      </button>
                      <button
                        onClick={() => handleDownload(`/api/reports/pdf?professor_id=all${reportPeriod ? `&period=${reportPeriod}` : ''}`, 'advising-report-all.pdf', 'all-pdf')}
                        disabled={exporting === 'all-pdf'}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 ring-1 ring-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50">
                        {exporting === 'all-pdf' ? <span className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" /> : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0-3-3m3 3 3-3M3 17V7a2 2 0 0 1 2-2h6l2 2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>}
                        PDF
                      </button>
                    </div>
                  </div>
                </div>

                <p className="text-gray-600 text-[10px] font-semibold uppercase tracking-widest mb-3">By Professor</p>
                {professors.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-white/5 bg-[#161616]">
                    <p className="text-gray-400 text-sm">No professors found</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {professors.map(prof => (
                      <div key={prof.id} className="rounded-2xl border border-white/5 bg-[#161616] px-5 py-4 hover:border-white/10 transition-colors">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <div className="flex items-center gap-3">
                            <Avatar name={prof.full_name} />
                            <div>
                              <p className="text-white font-semibold text-sm">{prof.full_name}</p>
                              <p className="text-gray-600 text-xs mt-0.5">{prof.department} · {prof.consultation_count} consultation{Number(prof.consultation_count) !== 1 ? 's' : ''}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDownload(`/api/reports/excel?professor_id=${prof.id}${reportPeriod ? `&period=${reportPeriod}` : ''}`, `advising-${prof.full_name}.xlsx`, `excel-${prof.id}`)}
                              disabled={exporting === `excel-${prof.id}`}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                              {exporting === `excel-${prof.id}` ? <span className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" /> : 'Excel'}
                            </button>
                            <button
                              onClick={() => handleDownload(`/api/reports/pdf?professor_id=${prof.id}${reportPeriod ? `&period=${reportPeriod}` : ''}`, `advising-${prof.full_name}.pdf`, `pdf-${prof.id}`)}
                              disabled={exporting === `pdf-${prof.id}`}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 ring-1 ring-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50">
                              {exporting === `pdf-${prof.id}` ? <span className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" /> : 'PDF'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── History ── */}
            {tab === 'history' && (
              <>
                <div className="mb-5 sm:mb-7">
                  <h1 className="text-white text-2xl font-bold">History</h1>
                  <p className="text-gray-500 text-sm mt-1">All completed consultation records grouped by term</p>
                </div>
                {(() => {
                  const historyItems = consultations.filter(c => c.status === 'completed' || c.status === 'rescheduled');
                  if (historyItems.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-white/5 bg-[#161616]">
                        <p className="text-gray-400 font-medium text-sm">No history yet</p>
                        <p className="text-gray-600 text-xs mt-1">Completed consultations will appear here</p>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-8">
                      {groupByQuarter(historyItems).map(([quarter, items]) => (
                        <div key={quarter}>
                          <div className="flex items-center gap-3 mb-3">
                            <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-widest">{quarter}</p>
                            <span className="text-gray-700 text-xs">{items.length} record{items.length !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="rounded-2xl border border-white/5 bg-[#161616] overflow-hidden">
                            <div className="overflow-x-auto">
                            <table className="w-full table-fixed min-w-[640px]">
                              <thead>
                                <tr className="border-b border-white/5">
                                  <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[100px]">Date</th>
                                  <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[130px]">Student</th>
                                  <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[130px]">Adviser</th>
                                  <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Purpose</th>
                                  <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[145px]">Action Taken</th>
                                  <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[130px]">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                {items.map(c => (
                                  <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="px-4 py-3 text-gray-300 text-xs font-semibold whitespace-nowrap">
                                      {new Date(c.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </td>
                                    <td className="px-4 py-3 text-gray-300 text-xs font-semibold truncate">{c.student_name}</td>
                                    <td className="px-4 py-3 text-gray-300 text-xs font-semibold truncate">{c.professor_name}</td>
                                    <td className="px-4 py-3 text-gray-400 text-xs font-semibold">
                                      <span className="line-clamp-2">{natureLabel(c)}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                      <ActionBadge action_taken={c.action_taken} referral={c.referral} referral_specify={c.referral_specify} />
                                    </td>
                                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
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
              </>
            )}

            {/* ── Home ── */}
            {tab === 'home' && (
              <>
                <div className="mb-5 sm:mb-7">
                  <h1 className="text-white text-2xl font-bold">Dashboard</h1>
                  <p className="text-gray-500 text-sm mt-1">{term.label} · Admin Overview</p>
                </div>

                {/* Term stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="md:col-span-2 rounded-2xl p-6 border border-white/5 bg-[#161616] flex items-center gap-6 shadow-[0_10px_40px_rgba(0,0,0,0.60)] hover:shadow-[0_20px_60px_rgba(0,0,0,0.75)] hover:-translate-y-0.5 transition-all duration-200">
                    <div className="flex-shrink-0 w-20 h-20 rounded-2xl flex flex-col items-center justify-center bg-gradient-to-br from-[#0369A1] to-[#0EA5E9] shadow-lg shadow-sky-900/30">
                      <span className="text-white text-2xl font-black leading-none">{currentWeek ?? '–'}</span>
                      <span className="text-sky-100 text-[10px] font-semibold uppercase tracking-wider mt-0.5">Week</span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Current Academic Week</p>
                      <h2 className="text-2xl font-bold text-white">
                        {currentWeek ? `Week ${currentWeek} of ${term.totalWeeks}` : 'Term Not Active'}
                      </h2>
                      {currentMode && (
                        <span className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-semibold ${
                          currentMode === 'Online'
                            ? `bg-blue-500/20 ring-1 ring-blue-500/30 ${isDark ? 'text-blue-300' : 'text-blue-700'}`
                            : `bg-emerald-500/20 ring-1 ring-emerald-500/30 ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${currentMode === 'Online' ? (isDark ? 'bg-blue-400' : 'bg-blue-600') : (isDark ? 'bg-emerald-400' : 'bg-emerald-600')}`} />
                          {currentMode}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-2xl p-5 border border-white/5 bg-[#161616] flex flex-col justify-between">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Next Week</p>
                    {nextWeek && nextWeekMode ? (
                      <>
                        <div className="mt-3">
                          <p className="text-xl font-bold text-white">Week {nextWeek}</p>
                          <span className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            nextWeekMode === 'Online' ? 'bg-blue-500/15 text-blue-400' : 'bg-emerald-500/15 text-emerald-400'
                          }`}>{nextWeekMode}</span>
                        </div>
                        <p className="text-[11px] text-gray-600 mt-3">Plan ahead for upcoming consultations</p>
                      </>
                    ) : (
                      <p className="text-gray-500 text-sm mt-3">End of term</p>
                    )}
                  </div>
                </div>

                {/* Countdown cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {([
                    {
                      label: 'Days to Finals', value: daysToFinals,
                      numColor: '#EA580C', darkNumColor: '#FDBA74',
                      lightBg: 'linear-gradient(135deg, #FFF7ED, #FFEDD5)', lightBorder: '#FED7AA',
                      darkBg: 'linear-gradient(135deg, rgba(234,88,12,0.25), rgba(234,88,12,0.12))', darkBorder: 'rgba(251,146,60,0.2)',
                      shadow: '0 10px 40px rgba(234,88,12,0.20), 0 4px 12px rgba(234,88,12,0.12)',
                      hoverShadow: '0 20px 60px rgba(234,88,12,0.30), 0 8px 20px rgba(234,88,12,0.18)',
                    },
                    {
                      label: 'Days to End', value: daysToEnd,
                      numColor: '#DB2777', darkNumColor: '#F9A8D4',
                      lightBg: 'linear-gradient(135deg, #FDF2F8, #FCE7F3)', lightBorder: '#FBCFE8',
                      darkBg: 'linear-gradient(135deg, rgba(219,39,119,0.25), rgba(219,39,119,0.12))', darkBorder: 'rgba(249,168,212,0.2)',
                      shadow: '0 10px 40px rgba(219,39,119,0.20), 0 4px 12px rgba(219,39,119,0.12)',
                      hoverShadow: '0 20px 60px rgba(219,39,119,0.30), 0 8px 20px rgba(219,39,119,0.18)',
                    },
                    {
                      label: 'Weeks Left', value: currentWeek ? Math.max(0, term.totalWeeks - currentWeek) : '–',
                      numColor: '#0EA5E9', darkNumColor: '#7DD3FC',
                      lightBg: 'linear-gradient(135deg, #EEF2FF, #DBEAFE)', lightBorder: '#BFDBFE',
                      darkBg: 'linear-gradient(135deg, rgba(14,165,233,0.25), rgba(14,165,233,0.12))', darkBorder: 'rgba(56,189,248,0.2)',
                      shadow: '0 10px 40px rgba(14,165,233,0.20), 0 4px 12px rgba(14,165,233,0.12)',
                      hoverShadow: '0 20px 60px rgba(14,165,233,0.30), 0 8px 20px rgba(14,165,233,0.18)',
                    },
                    {
                      label: 'Progress', value: `${Math.round(termProgress)}%`,
                      numColor: '#059669', darkNumColor: '#6EE7B7',
                      lightBg: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)', lightBorder: '#A7F3D0',
                      darkBg: 'linear-gradient(135deg, rgba(5,150,105,0.25), rgba(5,150,105,0.12))', darkBorder: 'rgba(52,211,153,0.2)',
                      shadow: '0 10px 40px rgba(5,150,105,0.20), 0 4px 12px rgba(5,150,105,0.12)',
                      hoverShadow: '0 20px 60px rgba(5,150,105,0.30), 0 8px 20px rgba(5,150,105,0.18)',
                    },
                  ] as const).map(s => (
                    <div
                      key={s.label}
                      className="rounded-2xl p-3 border transition-all duration-200 hover:-translate-y-0.5 flex flex-col items-center justify-center text-center"
                      style={{
                        background: isDark ? s.darkBg : s.lightBg,
                        borderColor: isDark ? s.darkBorder : s.lightBorder,
                        boxShadow: s.shadow,
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = s.hoverShadow; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = s.shadow; }}
                    >
                      <p className="text-2xl sm:text-3xl font-black leading-none tracking-tight" style={{ color: isDark ? s.darkNumColor : s.numColor }}>{s.value}</p>
                      <p className={`text-xs font-semibold mt-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Progress bar */}
                <div className="rounded-2xl p-6 border border-white/5 bg-[#161616] mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-semibold text-white">Term Progress</p>
                    <p className="text-xs text-gray-500">{term.label}</p>
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-600 mb-1">
                    <span>Start</span>
                    <span>Midterm (W{term.midtermWeek})</span>
                    <span>Finals (W{term.finalsWeek})</span>
                    <span>End</span>
                  </div>
                  <div className="relative h-3 rounded-full overflow-hidden bg-white/5">
                    <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-700 bg-gradient-to-r from-[#0369A1] to-[#0EA5E9]" style={{ width: `${termProgress}%` }} />
                    <div className="absolute top-0 h-full w-0.5 bg-amber-400/60" style={{ left: `${((term.midtermWeek - 1) / term.totalWeeks) * 100}%` }} />
                    <div className="absolute top-0 h-full w-0.5 bg-orange-400/60" style={{ left: `${((term.finalsWeek - 1) / term.totalWeeks) * 100}%` }} />
                  </div>
                  {currentWeek && (
                    <p className="text-xs text-gray-500 mt-2 text-center">
                      Currently at <span className="text-white font-semibold">Week {currentWeek}</span> of {term.totalWeeks} weeks
                    </p>
                  )}
                </div>

                {/* ── Term Configuration ── */}
                <div className="rounded-2xl border border-white/5 bg-[#161616] p-6 mb-6">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <p className="text-white font-semibold text-sm">Term Configuration</p>
                      <p className="text-gray-500 text-xs mt-0.5">Edit the current academic term settings</p>
                    </div>
                    {termSuccess && <span className="text-emerald-400 text-xs font-medium">Saved successfully</span>}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="text-gray-500 text-xs mb-1.5 block">Term Label</label>
                      <input
                        type="text"
                        value={termForm.term_label}
                        onChange={e => setTermForm(f => ({ ...f, term_label: e.target.value }))}
                        placeholder="e.g. 3rd Trimester, A.Y. 2025–2026"
                        className="w-full px-3 py-2 rounded-lg text-white text-sm bg-[#0f0f0f] border border-white/10 focus:outline-none focus:border-[#0EA5E9]/50 placeholder-gray-600"
                      />
                    </div>
                    <div>
                      <label className="text-gray-500 text-xs mb-1.5 block">Term Start Date</label>
                      <input
                        type="date"
                        value={termForm.term_start}
                        onChange={e => setTermForm(f => ({ ...f, term_start: e.target.value }))}
                        className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:border-[#0EA5E9]/50 ${isDark ? 'text-white bg-[#0f0f0f] border-white/10 [color-scheme:dark]' : 'text-gray-900 bg-white border-gray-300 [color-scheme:light]'}`}
                      />
                    </div>
                    <div>
                      <label className="text-gray-500 text-xs mb-1.5 block">Total Weeks</label>
                      <input
                        type="number" min={1} max={52}
                        value={termForm.term_total_weeks}
                        onChange={e => setTermForm(f => ({ ...f, term_total_weeks: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg text-white text-sm bg-[#0f0f0f] border border-white/10 focus:outline-none focus:border-[#0EA5E9]/50"
                      />
                    </div>
                    <div>
                      <label className="text-gray-500 text-xs mb-1.5 block">Midterm Week</label>
                      <input
                        type="number" min={1} max={parseInt(termForm.term_total_weeks) || 52}
                        value={termForm.term_midterm_week}
                        onChange={e => setTermForm(f => ({ ...f, term_midterm_week: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg text-white text-sm bg-[#0f0f0f] border border-white/10 focus:outline-none focus:border-[#0EA5E9]/50"
                      />
                    </div>
                    <div>
                      <label className="text-gray-500 text-xs mb-1.5 block">Finals Week</label>
                      <input
                        type="number" min={1} max={parseInt(termForm.term_total_weeks) || 52}
                        value={termForm.term_finals_week}
                        onChange={e => setTermForm(f => ({ ...f, term_finals_week: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg text-white text-sm bg-[#0f0f0f] border border-white/10 focus:outline-none focus:border-[#0EA5E9]/50"
                      />
                    </div>
                  </div>
                  {termError && <p className="text-red-400 text-xs mt-3">{termError}</p>}
                  <div className="flex justify-end mt-4">
                    <button
                      onClick={async () => {
                        setTermSaving(true); setTermError(null); setTermSuccess(false);
                        const tw = parseInt(termForm.term_total_weeks);
                        const mw = parseInt(termForm.term_midterm_week);
                        const fw = parseInt(termForm.term_finals_week);
                        if (!termForm.term_label.trim()) { setTermError('Term label is required.'); setTermSaving(false); return; }
                        if (!termForm.term_start) { setTermError('Start date is required.'); setTermSaving(false); return; }
                        if (isNaN(tw) || tw < 1) { setTermError('Total weeks must be a positive number.'); setTermSaving(false); return; }
                        if (isNaN(mw) || mw < 1 || mw >= fw) { setTermError('Midterm week must be before finals week.'); setTermSaving(false); return; }
                        if (isNaN(fw) || fw < 1 || fw > tw) { setTermError('Finals week must be within total weeks.'); setTermSaving(false); return; }
                        const result = await api.put('/api/settings/term', termForm, token!);
                        setTermSaving(false);
                        if (result?.error) { setTermError(result.error); return; }
                        setTerm(buildTermFromConfig(termForm));
                        setTermSuccess(true);
                        setTimeout(() => setTermSuccess(false), 3000);
                      }}
                      disabled={termSaving}
                      className={`px-4 py-2 text-sm disabled:opacity-50 ${btnPrimary}`}
                    >
                      {termSaving ? 'Saving…' : 'Save Term Settings'}
                    </button>
                  </div>
                </div>

                {/* Calendar + Announcements */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                  {/* Compact read-only calendar */}
                  <div className="lg:col-span-3 rounded-2xl border border-white/5 bg-[#161616] overflow-hidden">
                    <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                      <p className="text-white font-semibold text-sm">Academic Calendar</p>
                      <div className="flex items-center gap-1">
                        <button onClick={prevCalMonth} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <span className="text-gray-300 text-sm font-medium min-w-[120px] text-center">{CAL_MONTHS[calViewMonth]} {calViewYear}</span>
                        <button onClick={nextCalMonth} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        </button>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="grid grid-cols-7 mb-2">
                        {CAL_DAYS_SHORT.map(d => (
                          <div key={d} className="text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wider py-1">{d}</div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-y-1">
                        {(() => {
                          const fd = new Date(calViewYear, calViewMonth, 1).getDay();
                          const dim = new Date(calViewYear, calViewMonth + 1, 0).getDate();
                          const cells: (Date | null)[] = [
                            ...Array(fd).fill(null),
                            ...Array.from({ length: dim }, (_, i) => new Date(calViewYear, calViewMonth, i + 1)),
                          ];
                          return cells.map((date, i) => {
                            if (!date) return <div key={`he-${i}`} />;
                            const dStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
                            const dWeek = getAcademicWeek(CURRENT_TERM, date);
                            const isToday = dStr === todayStr;
                            const isBlocked = blockedSet.has(dStr);
                            const adminMode = dWeek ? (modeMap.get(dWeek) ?? null) : null;
                            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                            const eventTitle = dateLabelMap.get(dStr);
                            const eventColorId = dateColorMap.get(dStr) ?? 'red';
                            const ec = EVENT_COLORS.find(x => x.id === eventColorId) ?? EVENT_COLORS[0];
                            let cellBg = '';
                            let numCls = 'text-gray-200';
                            if (!dWeek) { numCls = 'text-gray-600'; }
                            else if (isBlocked) { cellBg = 'bg-red-500/25'; numCls = 'text-red-300'; }
                            else if (adminMode === 'Online' && !isWeekend) { cellBg = 'bg-blue-500/15'; numCls = 'text-blue-200'; }
                            else if (adminMode === 'In-Person' && !isWeekend) { cellBg = 'bg-emerald-500/10'; numCls = 'text-emerald-300'; }
                            return (
                              <div
                                key={date.toISOString()}
                                className={`relative flex flex-col items-center justify-center min-h-[38px] pb-0.5 rounded-lg text-xs ${cellBg}`}
                              >
                                {isToday ? (
                                  <span className="w-6 h-6 rounded-full bg-[#0EA5E9] flex items-center justify-center text-[11px] font-bold text-white shadow shadow-sky-900/50">
                                    {date.getDate()}
                                  </span>
                                ) : (
                                  <span className={numCls}>{date.getDate()}</span>
                                )}
                                {eventTitle && (
                                  <span className={`text-[6px] font-bold px-1 py-px rounded-full ${ec.pill} ${ec.pillText} truncate max-w-[90%] leading-tight`}>
                                    {eventTitle}
                                  </span>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-4 pt-3 border-t border-white/5">
                        {([
                          { cls: 'bg-emerald-500/25', label: 'In-Person' },
                          { cls: 'bg-blue-500/25', label: 'Online' },
                          { cls: 'bg-amber-500/25', label: 'Exam' },
                          { cls: 'bg-red-500/30', label: 'Blocked' },
                        ] as { cls: string; label: string }[]).map(({ cls, label }) => (
                          <span key={label} className="flex items-center gap-1 text-[10px] text-gray-500">
                            <span className={`w-2.5 h-2.5 rounded-sm ${cls}`} />{label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Announcements CRUD */}
                  <div className="lg:col-span-2 rounded-2xl border border-white/5 bg-[#161616] flex flex-col overflow-hidden">
                    <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                      <p className="text-white font-semibold text-sm">Announcements</p>
                      <button
                        onClick={() => {
                          setAnnEditId(null);
                          setAnnForm({ title: '', body: '', type: 'info', pinned: false });
                          setAnnError(null);
                          setAnnFormOpen(f => !f);
                        }}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium ${
                          annFormOpen
                            ? 'rounded-[10px] bg-white/10 text-gray-300 hover:bg-white/15 transition-all duration-200'
                            : btnPrimary
                        }`}
                      >
                        {annFormOpen ? (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        ) : (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                        )}
                        {annFormOpen ? 'Cancel' : '+ Add'}
                      </button>
                    </div>

                    {/* Add/edit form */}
                    {annFormOpen && (
                      <div className="px-5 py-4 border-b border-white/5 space-y-3 bg-white/[0.02]">
                        {/* Type selector */}
                        <div className="flex gap-2">
                          {(['info', 'warning'] as const).map(t => (
                            <button key={t} onClick={() => setAnnForm(f => ({ ...f, type: t }))}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                annForm.type === t
                                  ? t === 'info' ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30' : 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30'
                                  : 'bg-white/5 text-gray-500 hover:bg-white/10'
                              }`}>
                              {t === 'info' ? 'Info' : 'Warning'}
                            </button>
                          ))}
                        </div>
                        {/* Pin toggle */}
                        <button
                          type="button"
                          onClick={() => setAnnForm(f => ({ ...f, pinned: !f.pinned }))}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                            annForm.pinned
                              ? 'bg-yellow-500/15 text-yellow-300 ring-1 ring-yellow-500/30'
                              : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill={annForm.pinned ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                            </svg>
                            Pin to top
                          </span>
                          <span className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${annForm.pinned ? 'bg-yellow-500' : 'bg-white/10'}`}>
                            <span className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${annForm.pinned ? 'translate-x-4' : 'translate-x-0'}`} />
                          </span>
                        </button>
                        <input
                          className="w-full px-3 py-2 rounded-lg text-white text-xs bg-[#0f0f0f] border border-white/10 focus:outline-none focus:border-[#0EA5E9]/50 placeholder-gray-700"
                          placeholder="Title *"
                          value={annForm.title}
                          onChange={e => setAnnForm(f => ({ ...f, title: e.target.value }))}
                        />
                        <textarea
                          rows={3}
                          className="w-full px-3 py-2 rounded-lg text-white text-xs bg-[#0f0f0f] border border-white/10 focus:outline-none focus:border-[#0EA5E9]/50 placeholder-gray-700 resize-none"
                          placeholder="Body / message *"
                          value={annForm.body}
                          onChange={e => setAnnForm(f => ({ ...f, body: e.target.value }))}
                        />
                        {annError && <p className="text-red-400 text-xs">{annError}</p>}
                        <button
                          onClick={handleSaveAnn}
                          disabled={annSaving || !annForm.title.trim() || !annForm.body.trim()}
                          className={`w-full py-2 text-xs disabled:opacity-40 ${btnPrimary}`}
                        >
                          {annSaving ? 'Saving…' : annEditId ? 'Update Announcement' : 'Post Announcement'}
                        </button>
                      </div>
                    )}

                    <div className="overflow-y-auto max-h-[320px] divide-y divide-white/5">
                      {announcements.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12">
                          <p className="text-gray-600 text-sm">No announcements yet</p>
                          <p className="text-gray-700 text-xs mt-1">Click "+ Add" to create one</p>
                        </div>
                      ) : announcements.map(a => (
                        <div key={a.id} className={`px-5 py-4 hover:bg-white/[0.02] transition-colors ${a.pinned ? 'border-l-2 border-l-yellow-500/50' : ''}`}>
                          <div className="flex items-start gap-2.5">
                            {a.type === 'warning' ? (
                              <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                            ) : (
                              <svg className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-sm font-semibold text-white leading-tight">{a.title}</p>
                                {a.pinned && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/25">
                                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                                    Pinned
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed line-clamp-2">{a.body}</p>
                              <p className="text-[10px] text-gray-600 mt-1">
                                {new Date(a.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => {
                                  setAnnEditId(a.id);
                                  setAnnForm({ title: a.title, body: a.body, type: a.type, pinned: a.pinned });
                                  setAnnError(null);
                                  setAnnFormOpen(true);
                                }}
                                title="Edit"
                                className="p-1.5 rounded-lg text-gray-600 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                              <button
                                onClick={() => setAnnDeleteId(a.id)}
                                title="Delete"
                                className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Delete confirmation modal */}
                {annDeleteId !== null && (
                  <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-[#161616] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </div>
                        <div>
                          <p className="text-white font-semibold text-sm">Delete Announcement</p>
                          <p className="text-gray-500 text-xs mt-0.5">
                            {(() => {
                              const a = announcements.find(x => x.id === annDeleteId);
                              return a ? `"${a.title}"` : 'This announcement';
                            })()} will be permanently removed.
                          </p>
                        </div>
                      </div>
                      {annError && <p className="text-red-400 text-xs mb-3">{annError}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setAnnDeleteId(null); setAnnError(null); }}
                          className={`flex-1 py-2 text-xs ${btnSecondary}`}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleDeleteAnn}
                          className={`flex-1 py-2 text-xs ${btnDanger}`}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Leaderboards ── */}
            {tab === 'home' && (
              <div className="px-4 sm:px-6 pt-6 pb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <LeaderboardCard title="Top Professors" items={lbProfs} isDark={isDark} />
                  <LeaderboardCard title="Top Students"   items={lbStudents} isDark={isDark} />
                  <LeaderboardCard title="Top Topics"     items={lbTopics} isDark={isDark} />
                </div>
              </div>
            )}

            {/* ── Calendar ── */}
            {tab === 'calendar' && (() => {
              const firstDow = new Date(calViewYear, calViewMonth, 1).getDay();
              const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
              const rawCells: (Date | null)[] = [
                ...Array(firstDow).fill(null),
                ...Array.from({ length: daysInMonth }, (_, i) => new Date(calViewYear, calViewMonth, i + 1)),
              ];
              while (rawCells.length % 7 !== 0) rawCells.push(null);
              const calWeeks: (Date | null)[][] = [];
              for (let i = 0; i < rawCells.length; i += 7) calWeeks.push(rawCells.slice(i, i + 7));

              const calSelectedArr = [...calSelectedDates];
              const calSingle = calSelectedArr.length === 1 ? calSelectedArr[0] : null;
              const detailDate = calSingle ? new Date(calSingle + 'T12:00:00') : null;
              const detailWeek = detailDate ? getAcademicWeek(CURRENT_TERM, detailDate) : null;
              const detailMode = detailWeek ? effectiveMode(detailWeek) : null;
              const detailIsBlocked = calSingle ? blockedSet.has(calSingle) : false;

              const CAL_LEGEND = [
                { key: 'inPerson', cls: 'bg-emerald-500/25', label: 'In-Person' },
                { key: 'online',   cls: 'bg-blue-500/25',    label: 'Online' },
                { key: 'blocked',  cls: 'bg-red-500/30',     label: 'Blocked' },
              ];

              // Semantic color tokens — swap on isDark so every element adapts
              const c = {
                panelBg:          isDark ? 'bg-[#161616]'     : 'bg-white',
                panelBorder:      isDark ? 'border-white/5'   : 'border-gray-200',
                navBg:            isDark ? 'bg-[#1a1a1a]'     : 'bg-white',
                navBorder:        isDark ? 'border-white/5'   : 'border-gray-200',
                innerBg:          isDark ? 'bg-white/5'       : 'bg-gray-100',
                deepBg:           isDark ? 'bg-[#0f0f0f]'     : 'bg-gray-50',
                deepBorder:       isDark ? 'border-white/10'  : 'border-gray-300',
                divider:          isDark ? 'divide-white/5'   : 'divide-gray-100',
                rowHover:         isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-gray-50',
                heading:          isDark ? 'text-white'       : 'text-gray-900',
                body:             isDark ? 'text-gray-300'    : 'text-gray-700',
                label:            isDark ? 'text-gray-400'    : 'text-gray-600',
                sub:              isDark ? 'text-gray-500'    : 'text-gray-500',
                muted:            isDark ? 'text-gray-600'    : 'text-gray-400',
                faint:            isDark ? 'text-gray-700'    : 'text-gray-400',
                dayHeader:        isDark ? 'text-gray-400'    : 'text-gray-400',
                cellBorder:       isDark ? 'border-white/5'   : 'border-gray-100',
                cellNumDefault:   isDark ? 'text-gray-200'    : 'text-gray-700',
                cellNumFaded:     isDark ? 'text-gray-600'    : 'text-gray-300',
                cellNumSunday:    isDark ? 'text-red-700'     : 'text-red-400',
                cellNumBlocked:   isDark ? 'text-red-300'     : 'text-red-700',
                cellNumOnline:    isDark ? 'text-blue-200'    : 'text-blue-700',
                cellNumInPerson:  isDark ? 'text-emerald-300' : 'text-emerald-700',
                cellEventLabel:   isDark ? 'text-amber-400/80': 'text-amber-600',
                weekNumBase:      isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-white/10' : 'text-gray-400 hover:text-gray-700 hover:bg-black/5',
                weekNumActive:    isDark ? 'text-emerald-400 hover:bg-white/10' : 'text-emerald-600 hover:bg-black/5',
                legendBtn:        isDark ? 'bg-[#252525] border-[#3a3a3a] text-gray-200 hover:text-white hover:bg-[#2e2e2e] hover:border-[#4a4a4a]' : 'bg-gray-100 border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-200/60',
                legendBtnHidden:  isDark ? 'opacity-30 bg-[#1e1e1e] border-[#2a2a2a] text-gray-500' : 'opacity-30 bg-gray-100 border-gray-200 text-gray-400',
                modeInPersonActive: isDark ? 'bg-emerald-500/30 text-emerald-300 ring-1 ring-emerald-500/40' : 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400/50',
                modeOnlineActive:   isDark ? 'bg-blue-500/30 text-blue-300 ring-1 ring-blue-500/40'     : 'bg-blue-100 text-blue-700 ring-1 ring-blue-400/50',
                modeInPersonIdle:   isDark ? 'bg-white/5 text-gray-500 hover:bg-emerald-500/10 hover:text-emerald-400' : 'bg-gray-100 text-gray-600 hover:bg-emerald-50 hover:text-emerald-700',
                modeOnlineIdle:     isDark ? 'bg-white/5 text-gray-500 hover:bg-blue-500/10 hover:text-blue-400'   : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-700',
                modeDot:          isDark ? 'bg-gray-600'    : 'bg-gray-400',
                input:            isDark ? 'text-white bg-[#1a1a1a] border-[#3a3a3a] placeholder-gray-500' : 'text-gray-900 bg-white border-gray-300 placeholder-gray-400',
                navArrow:         isDark ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100',
                clearBtn:         isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-white/5' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
                countBadge:       isDark ? 'text-gray-600 bg-white/5'  : 'text-gray-500 bg-gray-100',
                kbdBg:            isDark ? 'bg-white/10'   : 'bg-gray-200',
                removeBtn:        isDark ? 'text-gray-600 hover:text-red-400 hover:bg-red-500/10' : 'text-gray-400 hover:text-red-500 hover:bg-red-50',
                bulkInPerson:     isDark ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
                bulkOnline:       isDark ? 'bg-blue-500/15 text-blue-300 hover:bg-blue-500/25'     : 'bg-blue-100 text-blue-700 hover:bg-blue-200',
                bulkBlock:        isDark ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25'       : 'bg-red-100 text-red-600 hover:bg-red-200',
                bulkUnblock:      isDark ? 'bg-white/5 text-gray-400 hover:bg-white/10' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                historyAction:    isDark ? 'text-gray-200' : 'text-gray-800',
                historyTrash:     isDark ? 'text-gray-700 hover:text-red-400' : 'text-gray-400 hover:text-red-500',
                toggleOff:        isDark ? 'bg-white/10'   : 'bg-gray-200',
                unsavedNote:      isDark ? 'text-amber-300/80' : 'text-amber-700',
                blockWarning:     isDark ? 'text-red-400/60'   : 'text-red-500/80',
                unsavedHint:      isDark ? 'text-amber-500/60' : 'text-amber-600/80',
              };

              return (
                <>
                  {/* Error banner */}
                  {calError && (
                    <div className="mb-4 flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                      <span>{calError}</span>
                      <button onClick={() => setCalError(null)} className="ml-auto text-red-400/60 hover:text-red-400">✕</button>
                    </div>
                  )}

                  {/* Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                    <div>
                      <h1 className={`${c.heading} text-2xl font-bold`}>Academic Calendar</h1>
                      <p className={`${c.sub} text-sm mt-0.5`}>
                        {CURRENT_TERM.label} · {CURRENT_TERM.totalWeeks} weeks
                        {calSelectedArr.length > 0 && (
                          <span className="ml-2 text-sky-400 font-medium">· {calSelectedArr.length} date{calSelectedArr.length !== 1 ? 's' : ''} selected</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <div className={`flex items-center gap-1 ${c.navBg} rounded-xl border ${c.navBorder} px-3 py-2`}>
                        <button onClick={prevCalMonth} className={`w-7 h-7 flex items-center justify-center rounded-lg ${c.navArrow} transition-colors`}>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <span className={`${c.heading} font-semibold text-sm min-w-[130px] text-center`}>{CAL_MONTHS[calViewMonth]} {calViewYear}</span>
                        <button onClick={nextCalMonth} className={`w-7 h-7 flex items-center justify-center rounded-lg ${c.navArrow} transition-colors`}>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        </button>
                      </div>
                      {calUndoStack.length > 0 && (
                        <button
                          onClick={async () => {
                            const last = calUndoStack[calUndoStack.length - 1];
                            setCalUndoStack(s => s.slice(0, -1));
                            await last.fn();
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs ${c.clearBtn} border ${c.panelBorder} transition-colors`}
                          title={calUndoStack[calUndoStack.length - 1]?.desc}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                          Undo
                        </button>
                      )}
                      {calSelectedArr.length > 0 && (
                        <button onClick={() => setCalSelectedDates(new Set())} className={`text-xs ${c.clearBtn} px-2 py-1.5 rounded-lg transition-colors`}>
                          Clear ×
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Two-panel layout */}
                  <div className="flex flex-col lg:flex-row gap-4 items-start">

                    {/* Left: Calendar + blocked list */}
                    <div className="flex-1 min-w-0 w-full">

                      {/* Filter legend (clickable toggles) */}
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        {CAL_LEGEND.map(({ key, cls, label }) => (
                          <button key={key}
                            onClick={() => setCalHiddenFilters(prev => {
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key); else next.add(key);
                              return next;
                            })}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-all ${
                              calHiddenFilters.has(key) ? c.legendBtnHidden : c.legendBtn
                            }`}>
                            <span className={`w-2.5 h-2.5 rounded-sm ${cls}`} />
                            {label}
                          </button>
                        ))}
                        <span className={`flex items-center gap-1.5 text-[10px] ${c.label}`}>
                          <span className="w-5 h-5 rounded-full bg-[#0EA5E9] flex items-center justify-center text-[9px] text-white font-bold leading-none">T</span>
                          Today
                        </span>
                        <span className={`ml-auto text-[10px] ${c.sub} hidden lg:block`}>Ctrl+click multi · Shift+click range · W# selects week</span>
                      </div>

                      {/* Calendar grid */}
                      <div className={`rounded-2xl border ${c.panelBorder} ${c.panelBg} overflow-hidden mb-4`}>
                        <div className={`grid grid-cols-[44px_repeat(7,1fr)] border-b ${c.cellBorder}`}>
                          <div className={`py-2.5 border-r ${c.cellBorder}`} />
                          {CAL_DAYS_SHORT.map((d: string) => (
                            <div key={d} className={`py-2.5 text-center text-[11px] font-semibold ${c.dayHeader} uppercase tracking-wider`}>{d}</div>
                          ))}
                        </div>
                        {calWeeks.map((weekDays, rowIdx) => {
                          const firstInMonth = weekDays.find(d => d && d.getMonth() === calViewMonth);
                          const wNum = firstInMonth ? getAcademicWeek(CURRENT_TERM, firstInMonth) : null;
                          const isCurrentRow = wNum !== null && wNum === currentAcademicWeek;
                          return (
                            <div key={rowIdx} className={`grid grid-cols-[44px_repeat(7,1fr)] border-b ${c.cellBorder} last:border-0`}>
                              <div className={`flex items-center justify-center border-r ${c.cellBorder} ${isCurrentRow ? (isDark ? 'bg-white/[0.02]' : 'bg-gray-50') : ''}`}>
                                {wNum ? (
                                  <button
                                    onClick={() => {
                                      const wkDates = weekDays
                                        .filter((d): d is Date => d !== null && d.getMonth() === calViewMonth)
                                        .map(d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
                                      setCalSelectedDates(new Set(wkDates));
                                    }}
                                    title="Select whole week"
                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${isCurrentRow ? c.weekNumActive : c.weekNumBase}`}
                                  >W{wNum}</button>
                                ) : <span className={`text-[10px] ${c.cellNumFaded}`}>·</span>}
                              </div>
                              {weekDays.map((date, di) => {
                                if (!date) return <div key={di} className={`min-h-[52px] border-r ${c.cellBorder} last:border-0`} />;
                                const dStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
                                const dWeek = getAcademicWeek(CURRENT_TERM, date);
                                const inMonth = date.getMonth() === calViewMonth;
                                const isToday = dStr === todayStr;
                                const isSelected = calSelectedDates.has(dStr);
                                const isBlocked = blockedSet.has(dStr);
                                const dMode = dWeek ? effectiveMode(dWeek) : null;
                                const hasExplicitMode = dWeek ? modeMap.has(dWeek) : false;
                                const isSunday = date.getDay() === 0;
                                let cellBg = '';
                                let numCls = c.cellNumDefault;
                                if (isSunday) { numCls = c.cellNumSunday; }
                                else if (!dWeek) { numCls = c.cellNumFaded; }
                                else if (isBlocked && !calHiddenFilters.has('blocked')) { cellBg = 'bg-red-500/25'; numCls = c.cellNumBlocked; }
                                else if (hasExplicitMode && dMode === 'Online' && !calHiddenFilters.has('online')) { cellBg = 'bg-blue-500/15'; numCls = c.cellNumOnline; }
                                else if (hasExplicitMode && !calHiddenFilters.has('inPerson')) { cellBg = 'bg-emerald-500/10'; numCls = c.cellNumInPerson; }
                                return (
                                  <button key={di}
                                    onClick={(e) => {
                                      if (!inMonth || isSunday) return;
                                      if (e.ctrlKey || e.metaKey) {
                                        setCalSelectedDates(prev => {
                                          const next = new Set(prev);
                                          if (next.has(dStr)) next.delete(dStr); else next.add(dStr);
                                          return next;
                                        });
                                        setCalShiftAnchor(dStr);
                                      } else if (e.shiftKey && calShiftAnchor) {
                                        const a = new Date(Math.min(+new Date(calShiftAnchor + 'T12:00'), +new Date(dStr + 'T12:00')));
                                        const b = new Date(Math.max(+new Date(calShiftAnchor + 'T12:00'), +new Date(dStr + 'T12:00')));
                                        const range: string[] = [];
                                        const cur = new Date(a);
                                        while (cur <= b) {
                                          range.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`);
                                          cur.setDate(cur.getDate() + 1);
                                        }
                                        setCalSelectedDates(new Set(range));
                                      } else {
                                        setCalSelectedDates(new Set([dStr]));
                                        setCalShiftAnchor(dStr);
                                      }
                                    }}
                                    className={`relative flex flex-col items-center min-h-[72px] pt-2.5 pb-1.5 px-0.5 border-r ${c.cellBorder} last:border-0 transition-all ${cellBg} ${
                                      isSelected ? 'ring-2 ring-inset ring-sky-400/80 bg-sky-500/20 z-10' : ''
                                    } ${!inMonth ? 'opacity-20 cursor-default' : isSunday ? 'cursor-default' : 'cursor-pointer hover:bg-sky-500/10 hover:z-10'}`}
                                    title={inMonth ? `${dStr}${dWeek ? ` · W${dWeek}` : ''}${dateLabelMap.get(dStr) ? ` · ${dateLabelMap.get(dStr)}` : ''}` : undefined}
                                  >
                                    {isToday ? (
                                      <span className="w-7 h-7 rounded-full bg-[#0EA5E9] flex items-center justify-center text-xs font-bold text-white shadow-lg shadow-sky-900/50">
                                        {date.getDate()}
                                      </span>
                                    ) : (
                                      <span className={`text-xs font-medium ${numCls}`}>{date.getDate()}</span>
                                    )}
                                    {inMonth && dateLabelMap.get(dStr) && (() => {
                                      const ec = EVENT_COLORS.find(x => x.id === (dateColorMap.get(dStr) ?? 'red')) ?? EVENT_COLORS[0];
                                      return (
                                        <span className={`mt-1.5 w-full text-[9px] font-semibold px-1 py-0.5 rounded-sm ${ec.pill} ${ec.pillText} truncate text-center leading-tight`}>
                                          {dateLabelMap.get(dStr)}
                                        </span>
                                      );
                                    })()}
                                    {isSelected && !isToday && (
                                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-sky-400" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>

                      {/* Blocked dates list */}
                      {blockedDates.length > 0 && (
                        <div className={`rounded-2xl border ${c.panelBorder} ${c.panelBg} overflow-hidden`}>
                          <div className={`px-5 py-3.5 border-b ${c.cellBorder} flex items-center justify-between`}>
                            <div>
                              <p className={`${c.heading} font-semibold text-sm`}>Blocked / Special Dates</p>
                              <p className={`${c.muted} text-xs mt-0.5`}>Click to jump to date</p>
                            </div>
                            <span className={`text-xs ${c.countBadge} px-2 py-0.5 rounded`}>{blockedDates.length}</span>
                          </div>
                          <div className={`divide-y ${c.divider}`}>
                            {blockedDates.map((o: CalendarOverride) => (
                              <div key={o.id}
                                className={`px-5 py-3 flex items-center justify-between gap-4 cursor-pointer ${c.rowHover} transition-colors ${o.date && calSelectedDates.has(o.date) ? 'bg-sky-500/5' : ''}`}
                                onClick={() => {
                                  if (o.date) {
                                    const d = new Date(o.date + 'T12:00:00');
                                    setCalViewYear(d.getFullYear());
                                    setCalViewMonth(d.getMonth());
                                    setCalSelectedDates(new Set([o.date]));
                                    setCalShiftAnchor(o.date);
                                  }
                                }}
                              >
                                <div className="flex items-center gap-3">
                                  <span className="w-2.5 h-2.5 rounded-sm bg-red-500/30 border border-red-500/30 flex-shrink-0" />
                                  <span className={`${c.body} text-sm font-medium`}>
                                    {o.date ? new Date(o.date + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : o.date}
                                  </span>
                                  {o.label && <span className={`${c.sub} text-xs`}>— {o.label}</span>}
                                </div>
                                <button
                                  onClick={async (e) => { e.stopPropagation(); await handleDeleteOverride(o.id, o.type); }}
                                  className={`${c.removeBtn} transition-colors text-xs px-2 py-1 rounded`}
                                >Remove</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right: Control panel */}
                    <div className="w-full lg:w-72 lg:flex-shrink-0 space-y-3">

                      {/* Empty state */}
                      {calSelectedArr.length === 0 && (
                        <div className={`rounded-2xl border ${c.panelBorder} ${c.panelBg} p-5`}>
                          <p className={`${c.body} text-sm font-semibold mb-1`}>Select a date</p>
                          <p className={`${c.muted} text-xs leading-relaxed mb-4`}>
                            Click any date to configure it. Use <kbd className={`px-1 py-0.5 rounded ${c.kbdBg} font-mono text-[10px]`}>Ctrl</kbd>+click for multi-select, <kbd className={`px-1 py-0.5 rounded ${c.kbdBg} font-mono text-[10px]`}>Shift</kbd>+click for ranges, or click a week number to select the full week.
                          </p>
                          <div className={`space-y-2 pt-3 border-t ${c.cellBorder}`}>
                            {[
                              { label: 'Blocked dates', value: blockedDates.length, color: 'text-red-500' },
                              { label: 'Calendar overrides', value: calOverrides.length, color: 'text-amber-500' },
                              { label: 'Current week', value: currentAcademicWeek ?? '–', color: 'text-emerald-500' },
                            ].map(({ label, value, color }) => (
                              <div key={label} className="flex items-center justify-between text-xs">
                                <span className={c.sub}>{label}</span>
                                <span className={`font-bold ${color}`}>{value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Single date detail */}
                      {calSingle && (() => {
                        const isSaving = calSaving === 'save';
                        const displayDate = detailDate?.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                        const pendingMode = calPendingMode ?? detailMode;
                        const pendingBlocked = calPendingBlocked !== null ? calPendingBlocked : detailIsBlocked;
                        const savedLabel = dateLabelMap.get(calSingle) ?? '';
                        const savedColor = dateColorMap.get(calSingle) ?? 'red';
                        const savedBlockReason = blockedDates.find((o: CalendarOverride) => o.date === calSingle)?.label ?? '';
                        const hasPendingChanges =
                          calPendingMode !== null ||
                          calPendingLabel.trim() !== savedLabel ||
                          (!!savedLabel && calPendingColor !== savedColor) ||
                          calPendingBlocked !== null ||
                          (detailIsBlocked && calPendingBlockReason.trim() !== savedBlockReason);
                        return (
                          <div className={`rounded-2xl border ${c.panelBorder} ${c.panelBg} overflow-hidden`}>
                            <div className={`px-5 py-4 border-b ${c.cellBorder} bg-sky-500/5`}>
                              <p className={`${c.heading} font-bold text-sm leading-snug`}>{displayDate}</p>
                              {detailWeek ? (
                                <p className={`${c.sub} text-xs mt-0.5`}>Week {detailWeek} of {CURRENT_TERM.totalWeeks}</p>
                              ) : (
                                <p className={`${c.muted} text-xs mt-0.5`}>Outside current term</p>
                              )}
                            </div>
                            {detailWeek ? (
                              <div className="p-4 space-y-3">
                                {/* Event */}
                                <div className={`px-4 py-3 rounded-xl ${c.innerBg}`}>
                                  <div className="flex items-center justify-between mb-2.5">
                                    <p className={`${c.label} text-sm`}>Event</p>
                                    {savedLabel && !calLabelEditing && (
                                      <button
                                        onClick={() => { setCalLabelEditing(true); setCalPendingLabel(savedLabel); setCalPendingColor(savedColor); }}
                                        disabled={isSaving}
                                        className="text-[10px] text-sky-400/70 hover:text-sky-400 transition-colors disabled:opacity-40"
                                      >Edit</button>
                                    )}
                                    {calLabelEditing && (
                                      <button
                                        onClick={() => { setCalLabelEditing(false); setCalPendingLabel(savedLabel); setCalPendingColor(savedColor); }}
                                        disabled={isSaving}
                                        className={`text-[10px] ${c.muted} transition-colors disabled:opacity-40`}
                                      >Cancel</button>
                                    )}
                                  </div>
                                  {savedLabel && !calLabelEditing ? (
                                    /* Saved event pill preview */
                                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${c.deepBg} border ${c.deepBorder}`}>
                                      {(() => {
                                        const ec = EVENT_COLORS.find(x => x.id === savedColor) ?? EVENT_COLORS[0];
                                        return (
                                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${ec.pill} ${ec.pillText} shadow-sm`}>
                                            {savedLabel}
                                          </span>
                                        );
                                      })()}
                                    </div>
                                  ) : (
                                    <div className="space-y-2.5">
                                      {/* Event title input */}
                                      <input
                                        type="text"
                                        placeholder="e.g. No Classes, Holiday, Lab Activity…"
                                        value={calPendingLabel}
                                        onChange={e => setCalPendingLabel(e.target.value)}
                                        maxLength={40}
                                        disabled={isSaving}
                                        autoFocus={calLabelEditing || !savedLabel}
                                        className={`w-full px-3 py-2 rounded-lg text-xs border focus:outline-none focus:border-[#0EA5E9]/50 disabled:opacity-40 ${c.input}`}
                                      />
                                      {/* Color picker */}
                                      <div className="flex items-center gap-2">
                                        <span className={`text-[10px] ${c.label} flex-shrink-0`}>Color</span>
                                        <div className="flex items-center gap-1.5">
                                          {EVENT_COLORS.map(ec => (
                                            <button
                                              key={ec.id}
                                              onClick={() => setCalPendingColor(ec.id)}
                                              disabled={isSaving}
                                              title={ec.id}
                                              className={`w-5 h-5 rounded-full ${ec.dot} transition-all disabled:opacity-40 ${
                                                calPendingColor === ec.id
                                                  ? 'ring-2 ring-offset-2 ring-offset-transparent scale-110 ' + (isDark ? 'ring-white/60' : 'ring-gray-500/60')
                                                  : 'opacity-60 hover:opacity-100 hover:scale-110'
                                              }`}
                                            />
                                          ))}
                                        </div>
                                        {calPendingLabel && (
                                          <span className={`ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${EVENT_COLORS.find(x => x.id === calPendingColor)?.pill ?? 'bg-red-500'} ${EVENT_COLORS.find(x => x.id === calPendingColor)?.pillText ?? 'text-white'} opacity-80`}>
                                            {calPendingLabel}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                                {/* Mode */}
                                <div className={`px-4 py-3 rounded-xl ${c.innerBg}`}>
                                  <div className="flex items-center justify-between mb-2.5">
                                    <p className={`${c.label} text-sm`}>Mode</p>
                                    <span className={`text-[10px] ${c.muted}`}>whole Week {detailWeek}</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    {(['In-Person', 'Online'] as const).map(mode => {
                                      const isActive = pendingMode === mode;
                                      const activecls = mode === 'In-Person' ? c.modeInPersonActive : c.modeOnlineActive;
                                      const idlecls   = mode === 'In-Person' ? c.modeInPersonIdle   : c.modeOnlineIdle;
                                      return (
                                        <button
                                          key={mode}
                                          onClick={() => {
                                            if (isActive) return;
                                            if (mode === detailMode) setCalPendingMode(null);
                                            else setCalPendingMode(mode);
                                          }}
                                          disabled={isSaving}
                                          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${isActive ? activecls : idlecls}`}
                                        >
                                          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? (mode === 'In-Person' ? 'bg-emerald-400' : 'bg-blue-400') : c.modeDot}`} />
                                          {mode}
                                          {isActive && calPendingMode !== null && <span className="text-[9px] opacity-50 ml-0.5">✦</span>}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  {calPendingMode !== null && (
                                    <p className={`text-[10px] ${c.unsavedHint} mt-1.5`}>Unsaved · applies to all days in Week {detailWeek}</p>
                                  )}
                                </div>
                                {/* Blocked */}
                                <div className={`px-4 py-3 rounded-xl ${c.innerBg}`}>
                                  <div className="flex items-center justify-between">
                                    <p className={`${c.label} text-sm`}>Blocked Day</p>
                                    <button
                                      onClick={() => {
                                        const desired = !pendingBlocked;
                                        if (desired === detailIsBlocked) setCalPendingBlocked(null);
                                        else setCalPendingBlocked(desired);
                                      }}
                                      disabled={isSaving}
                                      aria-label="Toggle blocked"
                                      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-40 ${pendingBlocked ? 'bg-red-500' : c.toggleOff}`}
                                    >
                                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${pendingBlocked ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                  </div>
                                  {pendingBlocked && (
                                    <div className="mt-2.5 space-y-1.5">
                                      <input
                                        type="text"
                                        placeholder="Reason (e.g. Independence Day, No Classes)"
                                        value={calPendingBlockReason}
                                        onChange={e => setCalPendingBlockReason(e.target.value)}
                                        maxLength={100}
                                        disabled={isSaving}
                                        className={`w-full px-3 py-2 rounded-lg text-xs border focus:outline-none focus:border-red-500/50 disabled:opacity-40 ${c.input}`}
                                      />
                                      <p className={`${c.blockWarning} text-[10px]`}>No consultations on this day</p>
                                    </div>
                                  )}
                                  {(calPendingBlocked !== null || (detailIsBlocked && calPendingBlockReason.trim() !== savedBlockReason)) && (
                                    <p className={`text-[10px] ${c.unsavedHint} mt-1`}>Unsaved change</p>
                                  )}
                                </div>
                                {/* Save */}
                                <button
                                  onClick={() => handleSaveDate(calSingle!, detailWeek)}
                                  disabled={isSaving || !hasPendingChanges}
                                  className={`w-full py-2.5 text-sm disabled:opacity-30 ${btnPrimary}`}
                                >
                                  {isSaving ? 'Saving…' : hasPendingChanges ? 'Save Changes' : 'No Changes'}
                                </button>
                                {calError && <p className="text-center text-xs text-red-400 mt-1">{calError}</p>}
                              </div>
                            ) : (
                              <div className="p-4">
                                <p className={`${c.muted} text-sm`}>Outside the current academic term. No edits available.</p>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Multi-select bulk panel */}
                      {calSelectedArr.length > 1 && (() => {
                        const selectedWeeks = [...new Set(
                          calSelectedArr
                            .map(d => getAcademicWeek(CURRENT_TERM, new Date(d + 'T12:00:00')))
                            .filter((w): w is number => w !== null)
                        )];
                        const isSaving = calSaving !== null;
                        return (
                          <div className={`rounded-2xl border ${c.panelBorder} ${c.panelBg} overflow-hidden`}>
                            <div className={`px-5 py-4 border-b ${c.cellBorder} bg-sky-500/5`}>
                              <p className={`${c.heading} font-bold text-sm`}>{calSelectedArr.length} dates selected</p>
                              <p className={`${c.sub} text-xs mt-0.5`}>{selectedWeeks.length} week{selectedWeeks.length !== 1 ? 's' : ''} affected</p>
                            </div>
                            <div className="p-4 space-y-4">
                              {/* Bulk mode */}
                              <div>
                                <p className={`${c.sub} text-[10px] font-semibold uppercase tracking-wider mb-2`}>Set Mode (all affected weeks)</p>
                                <div className="grid grid-cols-2 gap-2">
                                  <button
                                    onClick={async () => {
                                      for (const w of selectedWeeks) { if (effectiveMode(w) !== 'In-Person') await handleModeToggle(w); }
                                      setCalAuditLog(log => [{ id: Date.now(), ts: new Date(), action: 'Bulk In-Person', target: `W${selectedWeeks.join(',')}`, from: 'Mixed', to: 'In-Person' }, ...log.slice(0, 19)]);
                                    }}
                                    disabled={isSaving}
                                    className={`py-2 rounded-lg text-xs font-semibold ${c.bulkInPerson} transition-colors disabled:opacity-40`}
                                  >In-Person</button>
                                  <button
                                    onClick={async () => {
                                      for (const w of selectedWeeks) { if (effectiveMode(w) !== 'Online') await handleModeToggle(w); }
                                      setCalAuditLog(log => [{ id: Date.now(), ts: new Date(), action: 'Bulk Online', target: `W${selectedWeeks.join(',')}`, from: 'Mixed', to: 'Online' }, ...log.slice(0, 19)]);
                                    }}
                                    disabled={isSaving}
                                    className={`py-2 rounded-lg text-xs font-semibold ${c.bulkOnline} transition-colors disabled:opacity-40`}
                                  >Online</button>
                                </div>
                              </div>
                              {/* Bulk block */}
                              <div>
                                <p className={`${c.sub} text-[10px] font-semibold uppercase tracking-wider mb-2`}>Block / Unblock</p>
                                <input
                                  type="text"
                                  placeholder="Label (optional)"
                                  value={calBulkLabel}
                                  onChange={e => setCalBulkLabel(e.target.value)}
                                  className={`w-full px-3 py-2 mb-2 rounded-lg text-xs border focus:outline-none focus:border-[#0EA5E9]/50 ${c.input}`}
                                />
                                <div className="grid grid-cols-2 gap-2">
                                  <button
                                    onClick={async () => {
                                      setCalSaving('blocked');
                                      const lbl = calBulkLabel.trim();
                                      for (const d of calSelectedArr) {
                                        if (!blockedSet.has(d)) await api.post('/api/admin/blocked-dates', { date: d, label: lbl || null }, token!);
                                      }
                                      await refreshCalOverrides();
                                      setCalAuditLog(log => [{ id: Date.now(), ts: new Date(), action: 'Bulk Blocked', target: `${calSelectedArr.length} dates`, from: 'Normal', to: lbl || 'Blocked' }, ...log.slice(0, 19)]);
                                      setCalBulkLabel(''); setCalSaving(null);
                                    }}
                                    disabled={isSaving}
                                    className={`py-2 rounded-lg text-xs font-semibold ${c.bulkBlock} transition-colors disabled:opacity-40`}
                                  >Block All</button>
                                  <button
                                    onClick={async () => {
                                      for (const d of calSelectedArr) {
                                        const entry = blockedDates.find(o => o.date === d);
                                        if (entry) await handleDeleteOverride(entry.id, 'blocked_date');
                                      }
                                      setCalAuditLog(log => [{ id: Date.now(), ts: new Date(), action: 'Bulk Unblocked', target: `${calSelectedArr.length} dates`, from: 'Blocked', to: 'Normal' }, ...log.slice(0, 19)]);
                                    }}
                                    disabled={isSaving}
                                    className={`py-2 rounded-lg text-xs font-semibold ${c.bulkUnblock} transition-colors disabled:opacity-40`}
                                  >Unblock All</button>
                                </div>
                              </div>
                              {isSaving && <p className={`text-center text-xs ${c.muted} animate-pulse`}>Applying…</p>}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Change history / audit trail */}
                      <div className={`rounded-2xl border ${c.panelBorder} ${c.panelBg} overflow-hidden`}>
                        <div className={`px-5 py-3.5 border-b ${c.cellBorder} flex items-center justify-between`}>
                          <p className={`${c.sub} text-[10px] font-semibold uppercase tracking-widest`}>Change History</p>
                          {calAuditLog.length > 0 && (
                            <button onClick={() => setCalAuditLog([])} className={`text-[10px] ${c.muted} hover:${isDark ? 'text-gray-400' : 'text-gray-600'} transition-colors`}>Clear</button>
                          )}
                        </div>
                        {calAuditLog.length === 0 ? (
                          <div className="px-5 py-6 text-center">
                            <p className={`${c.faint} text-xs`}>No changes this session</p>
                          </div>
                        ) : (
                          <div className={`divide-y ${c.divider} max-h-60 overflow-y-auto`}>
                            {calAuditLog.map(entry => (
                              <div key={entry.id} className="px-5 py-2.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p className={`${c.historyAction} text-xs font-medium`}>{entry.action}</p>
                                    <p className={`${c.sub} text-[11px] truncate`}>{entry.target}</p>
                                    <p className={`${c.faint} text-[10px]`}>{entry.from} → {entry.to}</p>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                                    <p className={`text-[10px] ${c.faint}`}>
                                      {entry.ts.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                    {entry.deleteInfo && (
                                      <button
                                        onClick={() => handleDeleteFromHistory(entry.id, entry.deleteInfo!)}
                                        title="Delete this override"
                                        className={`${c.historyTrash} transition-colors`}
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                </>
              );
            })()}


          </div>
        )}
        </main>
      </div>

      {profileCard && token && (
        <UserProfileCard
          profileId={profileCard.id}
          profileRole={profileCard.role}
          token={token}
          onClose={() => setProfileCard(null)}
        />
      )}
    </div>
  );
}
