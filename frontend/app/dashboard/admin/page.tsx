'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { ConfirmModal } from '@/components/ConfirmModal';
import { Ban, Trash2, UserCheck, Users, BarChart3, ClipboardList } from 'lucide-react';
import ChatbotWidget from '@/components/ChatbotWidget';
import NavigationTour from '@/components/NavigationTour';
import DocPreviewModal from '@/components/DocPreviewModal';

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
  slot_mode?: string | null;
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

const STATUS_STYLES: Record<string, { darkBg: string; lightBg: string; darkText: string; lightText: string; dot: string; label: string }> = {
  pending:     { darkBg: 'bg-amber-500/15',   lightBg: 'bg-amber-50',    darkText: 'text-amber-400',    lightText: 'text-amber-700',    dot: 'bg-amber-400',    label: 'Pending' },
  confirmed:   { darkBg: 'bg-blue-500/15',    lightBg: 'bg-blue-50',     darkText: 'text-blue-400',     lightText: 'text-blue-700',     dot: 'bg-blue-500',     label: 'Confirmed' },
  completed:   { darkBg: 'bg-emerald-500/15', lightBg: 'bg-emerald-50',  darkText: 'text-emerald-400',  lightText: 'text-emerald-700',  dot: 'bg-emerald-500',  label: 'Completed' },
  cancelled:   { darkBg: 'bg-red-500/15',     lightBg: 'bg-red-50',      darkText: 'text-red-400',      lightText: 'text-red-700',      dot: 'bg-red-500',      label: 'Cancelled' },
  missed:      { darkBg: 'bg-purple-500/15',  lightBg: 'bg-purple-50',   darkText: 'text-purple-400',   lightText: 'text-purple-700',   dot: 'bg-purple-500',   label: 'Missed' },
  rescheduled:      { darkBg: 'bg-orange-500/15',  lightBg: 'bg-orange-50',   darkText: 'text-orange-400',   lightText: 'text-orange-700',   dot: 'bg-orange-500',   label: 'Rescheduled' },
  needs_reschedule: { darkBg: 'bg-amber-500/15',   lightBg: 'bg-amber-50',    darkText: 'text-amber-400',    lightText: 'text-amber-700',    dot: 'bg-amber-500',    label: 'Needs Reschedule' },
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

function getQuarterLabel(dateStr: string, activeTerm?: TermConfig): string {
  const d = new Date(dateStr);
  d.setHours(12, 0, 0, 0);
  // If the date falls within the admin-configured active term, use its exact label
  if (activeTerm) {
    const termEnd = new Date(activeTerm.start.getTime() + activeTerm.totalWeeks * 7 * 24 * 60 * 60 * 1000);
    if (d >= activeTerm.start && d < termEnd) return activeTerm.label;
  }
  // Fall back to month-based heuristic for older terms
  const m = d.getMonth();
  const y = d.getFullYear();
  let termName: string;
  let ay: string;
  if (m >= 7 && m <= 10) {
    termName = '1st Trimester'; ay = `A.Y. ${y}–${y + 1}`;
  } else if (m === 11) {
    termName = '2nd Trimester'; ay = `A.Y. ${y}–${y + 1}`;
  } else if (m <= 2) {
    termName = '2nd Trimester'; ay = `A.Y. ${y - 1}–${y}`;
  } else {
    termName = '3rd Trimester'; ay = `A.Y. ${y - 1}–${y}`;
  }
  return `${termName}, ${ay}`;
}

function groupByQuarter<T extends { date: string }>(items: T[], activeTerm?: TermConfig): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = getQuarterLabel(item.date, activeTerm);
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

type Tab = 'home' | 'consultations' | 'accounts' | 'schedules' | 'reports' | 'history' | 'calendar' | 'archive' | 'topics';

type Topic = {
  id: number;
  label: string;
  duration_minutes: number;
  display_order: number;
};

type ArchiveTerm = {
  term_label: string;
  total: number;
  earliest_date: string;
  latest_date: string;
};

type ArchiveConsultation = {
  id: number;
  date: string;
  status: string;
  mode: string | null;
  nature_of_advising: string | null;
  nature_of_advising_specify: string | null;
  student_name: string;
  student_number: string;
  program: string | null;
  professor_name: string;
  department: string | null;
  day: string | null;
  time_start: string | null;
  time_end: string | null;
  action_taken: string | null;
  referral: string | null;
  referral_specify: string | null;
  remarks: string | null;
  term_label: string;
};
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedSchedules, setExpandedSchedules] = useState<Set<string>>(new Set());

  // History filters
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('all');
  const [historySearch, setHistorySearch] = useState('');

  // Report period
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('');
  const [exporting, setExporting] = useState<string | null>(null);
  const [pdfPreviewModal, setPdfPreviewModal] = useState<{ fetchUrl: string; title: string; filename: string } | null>(null);

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

  // Confirm modal (replaces native confirm()/alert() for destructive account actions)
  const [confirmModalOpen, setConfirmModalOpen]   = useState(false);
  const [confirmAction, setConfirmAction]         = useState<(() => Promise<void>) | null>(null);
  const [confirmTitle, setConfirmTitle]           = useState('');
  const [confirmMessage, setConfirmMessage]       = useState('');
  const [confirmModalError, setConfirmModalError] = useState('');

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

  // Topics management
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicForm, setTopicForm] = useState({ label: '', duration_minutes: 30 });
  const [topicEditId, setTopicEditId] = useState<number | null>(null);
  const [topicSaving, setTopicSaving] = useState(false);
  const [topicError, setTopicError] = useState<string | null>(null);
  // Professor specializations panel
  const [specProfId, setSpecProfId] = useState<number | null>(null);
  const [specProfName, setSpecProfName] = useState('');
  const [specSelected, setSpecSelected] = useState<number[]>([]);
  const [specSaving, setSpecSaving] = useState(false);
  const [specLoading, setSpecLoading] = useState(false);

  // Leaderboards
  const [lbProfs, setLbProfs]       = useState<LeaderboardItem[]>([]);
  const [lbStudents, setLbStudents] = useState<LeaderboardItem[]>([]);
  const [lbTopics, setLbTopics]     = useState<LeaderboardItem[]>([]);
  // Home rankings panel toggle (Rankings ⇆ Top Topics) — matches student/professor
  const [lbView, setLbView] = useState<'rankings' | 'consulted'>('rankings');

  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [annSaving, setAnnSaving] = useState(false);
  const [annError, setAnnError] = useState<string | null>(null);
  const [annForm, setAnnForm] = useState({ title: '', body: '', type: 'info' as 'info' | 'warning', pinned: false });
  const [annEditId, setAnnEditId] = useState<number | null>(null);
  const [annFormOpen, setAnnFormOpen] = useState(false);
  const [annDeleteId, setAnnDeleteId] = useState<number | null>(null);

  // Term Archive
  const [archiveTerms, setArchiveTerms] = useState<ArchiveTerm[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveSelectedTerm, setArchiveSelectedTerm] = useState<string | null>(null);
  const [archiveRecords, setArchiveRecords] = useState<ArchiveConsultation[]>([]);
  const [archiveRecordsLoading, setArchiveRecordsLoading] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState('');

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

  const [mounted, setMounted] = useState(false);
  const [_isDark, setIsDark] = useState(false);
  const isDark = mounted ? _isDark : false;

  // Top navbar state
  const [navScrolled, setNavScrolled] = useState(false);
  const mainScrollRef = useRef<HTMLElement>(null);
  const topNavNotifRef = useRef<HTMLDivElement>(null);
  const topNavProfileRef = useRef<HTMLDivElement>(null);
  const topNavNotifPanelRef = useRef<HTMLDivElement>(null);
  const topNavProfilePanelRef = useRef<HTMLDivElement>(null);
  const [topNavNotifOpen, setTopNavNotifOpen] = useState(false);
  const [topNavProfileOpen, setTopNavProfileOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
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

  useEffect(() => {
    if (!topNavNotifOpen) return;
    const h = (e: MouseEvent) => {
      const inBtn = topNavNotifRef.current?.contains(e.target as Node);
      const inPanel = topNavNotifPanelRef.current?.contains(e.target as Node);
      if (!inBtn && !inPanel) setTopNavNotifOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [topNavNotifOpen]);

  useEffect(() => {
    if (!topNavProfileOpen) return;
    const h = (e: MouseEvent) => {
      const inBtn = topNavProfileRef.current?.contains(e.target as Node);
      const inPanel = topNavProfilePanelRef.current?.contains(e.target as Node);
      if (!inBtn && !inPanel) setTopNavProfileOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [topNavProfileOpen]);

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
    const valid: Tab[] = ['home', 'consultations', 'accounts', 'schedules', 'reports', 'history', 'calendar', 'archive', 'topics'];
    if (t && valid.includes(t)) setTab(t);
    fetchAll();
    fetchTopics();
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

  const fetchTopics = async () => {
    const t = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const data = await fetch(`${API_URL}/api/topics`, t ? { headers: { Authorization: `Bearer ${t}` } } : undefined).then(r => r.json()).catch(() => []);
    setTopics(Array.isArray(data) ? data : []);
  };

  const handleTopicSave = async () => {
    if (!topicForm.label.trim()) { setTopicError('Label is required.'); return; }
    setTopicSaving(true); setTopicError(null);
    try {
      const url = topicEditId ? `${API_URL}/api/topics/${topicEditId}` : `${API_URL}/api/topics`;
      const method = topicEditId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label: topicForm.label.trim(), duration_minutes: topicForm.duration_minutes }),
      });
      const data = await res.json();
      if (!res.ok) { setTopicError(data.error || 'Save failed.'); return; }
      await fetchTopics();
      setTopicForm({ label: '', duration_minutes: 30 });
      setTopicEditId(null);
    } catch { setTopicError('Network error.'); }
    finally { setTopicSaving(false); }
  };

  const handleTopicDelete = async (id: number) => {
    const res = await fetch(`${API_URL}/api/topics/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) fetchTopics();
  };

  const openSpecPanel = async (profId: number, profName: string) => {
    setSpecProfId(profId); setSpecProfName(profName); setSpecLoading(true); setSpecSelected([]);
    const res = await fetch(`${API_URL}/api/admin/professors/${profId}/specializations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { const d = await res.json(); setSpecSelected(d.map((t: Topic) => t.id)); }
    setSpecLoading(false);
  };

  const handleSpecSave = async () => {
    if (!specProfId) return;
    setSpecSaving(true);
    await fetch(`${API_URL}/api/admin/professors/${specProfId}/specializations`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ topic_ids: specSelected }),
    });
    setSpecSaving(false); setSpecProfId(null);
  };

  const fetchArchiveTerms = async () => {
    const t = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!t) return;
    setArchiveLoading(true);
    try {
      const data = await api.get('/api/admin/archive', t);
      setArchiveTerms(Array.isArray(data) ? data : []);
    } finally {
      setArchiveLoading(false);
    }
  };

  const fetchArchiveRecords = async (termLabel: string) => {
    const t = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!t) return;
    setArchiveRecordsLoading(true);
    try {
      const data = await api.get(`/api/admin/archive/${encodeURIComponent(termLabel)}`, t);
      setArchiveRecords(Array.isArray(data) ? data : []);
    } finally {
      setArchiveRecordsLoading(false);
    }
  };

  const handleArchiveDelete = (termLabel: string, total: number) => {
    openConfirmModal(
      'Delete Archive',
      `Permanently delete all ${total} consultation record${total !== 1 ? 's' : ''} for "${termLabel}"? This action cannot be undone.`,
      async () => {
        const t = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        if (!t) throw new Error('Not authenticated.');
        const res = await fetch(`${API_URL}/api/admin/archive/${encodeURIComponent(termLabel)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
          body: JSON.stringify({ confirmed: true }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Delete failed.');
        setArchiveTerms(prev => prev.filter(x => x.term_label !== termLabel));
        if (archiveSelectedTerm === termLabel) {
          setArchiveSelectedTerm(null);
          setArchiveRecords([]);
        }
      }
    );
  };

  const handleArchiveExport = async (termLabel: string, format: 'pdf' | 'excel') => {
    const t = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!t) return;
    const ext = format === 'pdf' ? 'pdf' : 'xlsx';
    const endpoint = format === 'pdf' ? '/api/reports/pdf' : '/api/reports/excel';
    // Find date range for this term from loaded archive terms
    const termInfo = archiveTerms.find(x => x.term_label === termLabel);
    const params = new URLSearchParams({ professor_id: 'all', status: 'all' });
    if (termInfo) {
      params.set('date_from', termInfo.earliest_date);
      params.set('date_to',   termInfo.latest_date);
    }
    const key = `archive-export-${termLabel}`;
    await handleDownload(`${endpoint}?${params.toString()}`, `archive-${termLabel.replace(/[^a-z0-9]/gi, '-')}.${ext}`, key);
  };

  const refreshCalOverrides = async () => {
    // Read token fresh from localStorage so stale closures never block state updates
    const t = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!t) return;
    const data = await api.get('/api/calendar', t);
    if (Array.isArray(data)) setCalOverrides(data);
  };

  const handleLogout = () => {
    const tourStudent = localStorage.getItem('consulta-tour-done-student');
    const tourProf    = localStorage.getItem('consulta-tour-done-professor');
    const tourAdmin   = localStorage.getItem('consulta-tour-done-admin');
    localStorage.clear();
    if (tourStudent) localStorage.setItem('consulta-tour-done-student', tourStudent);
    if (tourProf)    localStorage.setItem('consulta-tour-done-professor', tourProf);
    if (tourAdmin)   localStorage.setItem('consulta-tour-done-admin', tourAdmin);
    router.push('/login');
  };

  const handleDownload = async (url: string, filename: string, key: string) => {
    if (filename.endsWith('.pdf')) {
      setPdfPreviewModal({ fetchUrl: `${API_URL}${url}`, title: filename.replace('.pdf', '').replace(/-/g, ' '), filename });
      return;
    }
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

  const openConfirmModal = (title: string, message: string, action: () => Promise<void>) => {
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmAction(() => action);
    setConfirmModalError('');
    setConfirmModalOpen(true);
  };

  const handleConfirmModalExecute = async () => {
    if (!confirmAction) return;
    setConfirmModalError('');
    try {
      await confirmAction();
      setConfirmModalOpen(false);
    } catch (e: unknown) {
      setConfirmModalError(e instanceof Error ? e.message : 'An error occurred.');
    }
  };

  const handleApprove = async (id: number) => {
    const data = await api.patch(`/api/admin/users/${id}/approve`, {}, token!);
    if (data.error) { openConfirmModal('Error', data.error, async () => {}); }
    else fetchAll();
  };

  const handleReject = (id: number) => {
    openConfirmModal(
      'Reject Account',
      'Reject this account? The registration will be deleted and the user must re-register.',
      async () => {
        const data = await api.patch(`/api/admin/users/${id}/reject`, {}, token!);
        if (data.error) throw new Error(data.error);
        fetchAll();
      }
    );
  };

  const handleDeleteUser = (id: number, name: string) => {
    openConfirmModal(
      'Delete Account',
      `Delete account for "${name}"? This cannot be undone.`,
      async () => {
        const data = await api.delete(`/api/admin/users/${id}`, token!);
        if (data.error) throw new Error(data.error);
        fetchAll();
      }
    );
  };

  const handleDeactivate = (id: number, name: string) => {
    openConfirmModal(
      'Deactivate Account',
      `Deactivate account for "${name}"? They will not be able to log in until reactivated.`,
      async () => {
        const data = await api.patch(`/api/admin/users/${id}/deactivate`, {}, token!);
        if (data.error) throw new Error(data.error);
        fetchAll();
      }
    );
  };

  const handleActivate = async (id: number) => {
    const data = await api.patch(`/api/admin/users/${id}/activate`, {}, token!);
    if (data.error) { openConfirmModal('Error', data.error, async () => {}); }
    else fetchAll();
  };

  const handleUnlock = async (id: number) => {
    const data = await api.patch(`/api/admin/users/${id}/unlock`, {}, token!);
    if (data.error) { openConfirmModal('Error', data.error, async () => {}); }
    else fetchAll();
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

  // All bookings indexed by student key — used for full summary counts regardless of active filter
  const allBookingsByStudent = useMemo(() => {
    const map = new Map<string, Consultation[]>();
    for (const c of consultations) {
      const key = c.student_number || c.student_name;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [consultations]);

  // Filtered consultations grouped by student, sorted by most recent booking
  const groupedConsultations = useMemo(() => {
    const map = new Map<string, Consultation[]>();
    for (const c of filteredConsultations) {
      const key = c.student_number || c.student_name;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    for (const bookings of map.values()) {
      bookings.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    return Array.from(map.values()).sort((a, b) =>
      new Date(b[0].date).getTime() - new Date(a[0].date).getTime()
    );
  }, [filteredConsultations]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

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
        const tourStudent = localStorage.getItem('consulta-tour-done-student');
        const tourProf    = localStorage.getItem('consulta-tour-done-professor');
        const tourAdmin   = localStorage.getItem('consulta-tour-done-admin');
        localStorage.clear();
        if (tourStudent) localStorage.setItem('consulta-tour-done-student', tourStudent);
        if (tourProf)    localStorage.setItem('consulta-tour-done-professor', tourProf);
        if (tourAdmin)   localStorage.setItem('consulta-tour-done-admin', tourAdmin);
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
  const { finalsDate, endDate } = getTermDates(term);
  const daysToFinals = daysUntil(finalsDate, now);
  const daysToEnd = daysUntil(endDate, now);
  const termProgress = getTermProgress(term, now);

  const adminNavItems: NavItem[] = [
    { key: 'home',          label: 'Home' },
    { key: 'consultations', label: 'Consultations' },
    { key: 'accounts',      label: 'Accounts' },
    { key: 'schedules',     label: 'Schedules' },
    { key: 'reports',       label: 'Reports' },
    { key: 'history',       label: 'History' },
    { key: 'archive',       label: 'Term Archive' },
    { key: 'calendar',      label: 'Calendar' },
    { key: 'topics',        label: 'Topics' },
  ];

  const inputCls = 'w-full px-3 py-2 rounded-lg text-white text-sm bg-[#0f0f0f] border border-white/10 focus:outline-none focus:border-[#0EA5E9]/50 placeholder-gray-600';

  const btnPrimary = 'bg-[linear-gradient(135deg,#0369A1,#0EA5E9)] text-white font-semibold rounded-[10px] transition-colors duration-200 hover:shadow-[0_0_20px_rgba(14,165,233,0.4)] shadow-[0_2px_8px_rgba(14,165,233,0.2)]';
  const btnSecondary = 'border-2 border-[#0EA5E9] text-[#0EA5E9] bg-transparent font-medium rounded-[10px] transition-colors duration-200 hover:bg-[linear-gradient(135deg,#0369A1,#0EA5E9)] hover:text-white hover:border-transparent';
  const btnDanger = 'bg-[linear-gradient(135deg,#EF4444,#DC2626)] text-white font-semibold rounded-[10px] transition-colors duration-200 hover:shadow-[0_0_20px_rgba(239,68,68,0.4)] shadow-sm';
  const btnDeactivate = 'bg-[linear-gradient(135deg,#F97316,#EA580C)] text-white font-semibold rounded-[10px] transition-colors duration-200 hover:shadow-[0_0_20px_rgba(249,115,22,0.4)] shadow-sm';
  const btnSuccess = 'bg-[linear-gradient(135deg,#10B981,#059669)] text-white font-semibold rounded-[10px] transition-colors duration-200 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)]';

  return (
    <div className={`h-screen flex overflow-hidden relative ${isDark ? 'bg-[#1e2235]' : ''}`} style={!isDark ? { background: 'linear-gradient(135deg, #93c5fd 0%, #bfdbfe 45%, #eff6ff 100%)' } : undefined}>

      {/* Mapua logo full-page watermark */}
      <img
        src="/mapua-logo.png"
        alt=""
        aria-hidden
        className={`pointer-events-none select-none fixed inset-0 w-full h-full object-contain z-0 ${isDark ? 'opacity-[0.06]' : 'opacity-[0.05]'}`}
        style={isDark ? { filter: 'blur(1px) drop-shadow(0 0 80px rgba(14,165,233,0.6)) drop-shadow(0 0 40px rgba(99,102,241,0.4)) drop-shadow(0 0 120px rgba(14,165,233,0.3))' } : { filter: 'blur(1px) drop-shadow(0 0 30px rgba(99,102,241,0.15))' }}
      />

      {/* Consulta logo watermark */}
      <img
        src="/consulta-logo.png"
        alt=""
        aria-hidden
        className={`pointer-events-none select-none fixed z-0 ${isDark ? 'opacity-[0.06]' : 'opacity-[0.08]'}`}
        style={{ width: '340px', height: '340px', objectFit: 'contain', bottom: '5%', right: '4%', filter: isDark ? 'drop-shadow(0 0 40px rgba(99,102,241,0.3))' : 'drop-shadow(0 0 20px rgba(99,102,241,0.12))' }}
      />

      {/* Mobile sidebar */}
      <div className="lg:hidden">
        <LeftSidebar
          role="admin"
          navItems={adminNavItems}
          activeTab={tab}
          onTabChange={(t) => setTab(t as Tab)}
          profileName={adminName}
          profileAvatar={null}
          isDark={isDark}
          onToggleTheme={toggleTheme}
          hideDesktopSidebar={true}
        />
      </div>

      {/* ── Desktop Top Navbar — full-width, transparent at top / solid when scrolled (matches student/professor) ── */}
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

        {/* Nav links */}
        <div className="flex items-center gap-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {adminNavItems.map(item => {
            const isActive = tab === item.key;
            return (
              <button
                key={item.key}
                data-tour={`nav-${item.key}`}
                onClick={() => setTab(item.key as Tab)}
                className={`relative flex items-center gap-1.5 rounded-lg text-[14px] font-semibold whitespace-nowrap transition-colors px-2.5 pt-2 pb-3 flex-shrink-0 ${
                  isActive
                    ? isDark ? 'text-white' : (navScrolled ? 'text-[#0369A1]' : 'text-[#1e3a5f]')
                    : isDark
                      ? 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]'
                      : (navScrolled ? 'text-gray-500 hover:text-gray-800 hover:bg-gray-100' : 'text-[#2d5075]/80 hover:text-[#1e3a5f] hover:bg-white/30')
                }`}
              >
                {item.label}
                {isActive && (
                  <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 h-[3px] w-5 rounded-full ${isDark ? 'bg-white' : 'bg-[#0369A1]'}`} />
                )}
              </button>
            );
          })}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Divider right */}
        <div className="w-px h-8 flex-shrink-0 ml-2 transition-colors duration-250" style={{ background: isDark ? 'rgba(255,255,255,0.10)' : (navScrolled ? '#e5e7eb' : 'rgba(30,58,95,0.2)') }} />

        {/* Right icons */}
        <div className="flex items-center gap-1 pl-4 flex-shrink-0">

          {/* Notification bell */}
          <div className="relative" ref={topNavNotifRef}>
            <button
              data-tour="notifications"
              onClick={() => setTopNavNotifOpen(o => !o)}
              className={`relative w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
              </svg>
              {pendingUsers.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-[#CC0000] text-white text-[9px] font-bold flex items-center justify-center">
                  {pendingUsers.length > 9 ? '9+' : pendingUsers.length}
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

          {/* User dropdown trigger */}
          <div className="relative" ref={topNavProfileRef}>
            <button
              onClick={() => { setTopNavProfileOpen(o => !o); setTopNavNotifOpen(false); }}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-200 hover:bg-white/5' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              <div className="flex flex-col items-start leading-none">
                <span className="text-sm font-medium truncate max-w-[120px]">{adminName}</span>
                <span className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Administrator</span>
              </div>
              <svg className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${topNavProfileOpen ? 'rotate-180' : ''} ${isDark ? 'text-gray-400' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

        </div>
      </div>

      {/* Desktop notification dropdown — outside navbar div, fixed */}
      {topNavNotifOpen && (
        <div ref={topNavNotifPanelRef} className={`hidden lg:block fixed top-[68px] right-4 z-[9999] w-80 rounded-xl shadow-2xl overflow-hidden border ${isDark ? 'bg-[#252525] border-white/10' : 'bg-white border-gray-200 shadow-[0_8px_30px_rgba(0,0,0,0.12)]'}`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'bg-[#1e1e1e] border-white/10' : 'bg-gray-50 border-gray-200'}`}>
            <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Pending Accounts
              {pendingUsers.length > 0 && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#CC0000] text-white">{pendingUsers.length}</span>}
            </p>
            <button onClick={() => setTopNavNotifOpen(false)} className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${isDark ? 'text-gray-500 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="overflow-y-auto max-h-80">
            {pendingUsers.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No pending accounts</p>
              </div>
            ) : pendingUsers.slice(0, 6).map(u => (
              <div key={u.id} className={`border-b ${isDark ? 'border-white/5 bg-white/[0.03]' : 'border-gray-100 bg-blue-50/60'}`}>
                <button
                  onClick={() => { setTab('accounts'); setTopNavNotifOpen(false); }}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${isDark ? 'hover:bg-white/5' : 'hover:bg-blue-50'}`}
                >
                  <span className="text-base flex-shrink-0 mt-0.5">👤</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium leading-snug ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                      <span className="font-semibold">{u.full_name}</span> wants to join as {u.role}
                    </p>
                    <p className={`text-[11px] mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{u.email}</p>
                  </div>
                </button>
              </div>
            ))}
          </div>
          {pendingUsers.length > 0 && (
            <div className={`px-4 py-2.5 border-t ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
              <button onClick={() => { setTab('accounts'); setTopNavNotifOpen(false); }} className="text-[11px] text-[#CC0000] hover:underline">
                View all accounts →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Desktop profile dropdown — outside navbar div, fixed */}
      {topNavProfileOpen && (
        <div ref={topNavProfilePanelRef} className="hidden lg:block fixed top-[68px] right-4 z-[9999] min-w-[180px] rounded-xl bg-white shadow-md border border-gray-100 overflow-hidden">
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
            onClick={() => { handleLogout(); setTopNavProfileOpen(false); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors text-left"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9" />
            </svg>
            Sign Out
          </button>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <main
          ref={mainScrollRef}
          onScroll={e => setNavScrolled((e.currentTarget as HTMLElement).scrollTop > 8)}
          className={`flex-1 overflow-y-auto pt-14 lg:pt-16 ${isDark ? 'bg-[#1e2235]' : ''}`}
          style={!isDark ? { background: 'linear-gradient(135deg, #93c5fd 0%, #bfdbfe 45%, #eff6ff 100%)' } : undefined}
        >
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-8 h-8 border-2 border-[#0EA5E9] border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600 text-sm">Loading...</p>
          </div>
        ) : (
          <div className="px-3 sm:px-8 py-5 sm:py-8 relative z-[1]">

            {/* ── Consultations ── */}
            {tab === 'consultations' && (
              <>
                <div className="mb-6">
                  <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Consultations</h1>
                  <p className={`text-sm mt-1 ${isDark ? 'text-gray-500' : 'text-gray-700'}`}>All consultation records across the system</p>
                </div>

                {/* Tabs */}
                <div className={`flex items-center gap-1 mb-5 rounded-xl p-1 w-full sm:w-fit overflow-x-auto border ${isDark ? 'bg-[#161616] border-white/5' : 'bg-white border-gray-200'}`}>
                  {([
                    { key: 'all',       label: 'All'       },
                    { key: 'pending',   label: 'Pending'   },
                    { key: 'missed',    label: 'Missed'    },
                    { key: 'completed', label: 'Completed' },
                    { key: 'cancelled', label: 'Cancelled' },
                  ] as const).map(t => (
                    <button key={t.key} onClick={() => setStatusFilter(t.key)}
                      className={`flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all ${
                        statusFilter === t.key
                          ? 'bg-[#0EA5E9] text-white shadow-sm shadow-sky-500/30'
                          : isDark ? 'text-gray-500 hover:text-gray-200 hover:bg-white/5' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                      }`}>
                      {t.label}
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        statusFilter === t.key ? 'bg-white/20 text-white' : isDark ? 'bg-white/5 text-gray-600' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {consultTabCounts[t.key]}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Search */}
                <div className="relative mb-4">
                  <svg className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${isDark ? 'text-gray-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" /></svg>
                  <input
                    type="text"
                    placeholder="Search by name, date, or ID…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className={`w-full pl-9 pr-3 py-2 rounded-lg text-sm border focus:outline-none focus:border-[#0EA5E9]/50 ${isDark ? 'bg-[#161616] text-white border-white/5 placeholder-gray-600 focus:border-[#0EA5E9]/30' : 'bg-white text-gray-900 border-gray-200 placeholder-gray-400'}`}
                  />
                </div>

                <p className={`text-[10px] font-semibold uppercase tracking-widest mb-3 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                  {groupedConsultations.length} student{groupedConsultations.length !== 1 ? 's' : ''} · {filteredConsultations.length} record{filteredConsultations.length !== 1 ? 's' : ''}
                </p>

                {groupedConsultations.length === 0 ? (
                  <div className={`flex flex-col items-center justify-center py-20 rounded-2xl border ${isDark ? 'border-white/5 bg-[#161616]' : 'border-gray-200 bg-white'}`}>
                    <p className={`font-medium text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No records found</p>
                    <p className={`text-xs mt-1 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Try adjusting your filters</p>
                  </div>
                ) : (
                  <div className="columns-1 sm:columns-2 xl:columns-3 gap-4">
                    {groupedConsultations.map(bookings => {
                      const rep = bookings[0];
                      const groupKey = rep.student_number || rep.student_name;
                      const isExpanded = expandedGroups.has(groupKey) || bookings.length === 1;
                      const allBookings = allBookingsByStudent.get(groupKey) ?? bookings;
                      const totalCount = allBookings.length;
                      const statusCounts = allBookings.reduce(
                        (acc, c) => {
                          const st = (c.status ?? '').toLowerCase().trim();
                          if (['pending', 'confirmed', 'rescheduled'].includes(st)) acc.pending++;
                          else if (st === 'completed') acc.completed++;
                          else if (st === 'missed') acc.missed++;
                          else if (st === 'cancelled') acc.cancelled++;
                          return acc;
                        },
                        { pending: 0, completed: 0, missed: 0, cancelled: 0 }
                      );
                      const summaryParts = [
                        statusCounts.completed ? `${statusCounts.completed} Completed` : '',
                        statusCounts.pending   ? `${statusCounts.pending} Pending`     : '',
                        statusCounts.missed    ? `${statusCounts.missed} Missed`       : '',
                        statusCounts.cancelled ? `${statusCounts.cancelled} Cancelled` : '',
                      ].filter(Boolean);

                      const effModeRep = rep.slot_mode === 'BOTH' ? 'BOTH' : rep.mode;
                      const modeLabelRep = effModeRep === 'F2F' ? 'Face-to-Face' : effModeRep === 'BOTH' ? 'F2F & Online' : 'Online';
                      const modeClsRep = effModeRep === 'F2F'
                        ? (isDark ? 'text-purple-400' : 'text-purple-600')
                        : effModeRep === 'BOTH'
                          ? (isDark ? 'text-teal-400' : 'text-teal-600')
                          : (isDark ? 'text-cyan-400' : 'text-cyan-600');
                      const repDate = new Date((rep.date || '').slice(0, 10) + 'T12:00:00')
                        .toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

                      return (
                        <div key={groupKey} className={`break-inside-avoid mb-4 rounded-2xl border overflow-hidden flex flex-col ${isDark ? 'bg-[#161616] border-white/[0.08] shadow-[0_2px_8px_rgba(0,0,0,0.4)]' : 'bg-white border-gray-100 shadow-sm'}`}>

                          {/* ── Card header (styled like original booking card) ── */}
                          <div
                            className={`p-4 flex-1 transition-colors ${bookings.length > 1 ? 'cursor-pointer select-none' : ''} ${isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-gray-50/50'}`}
                            onClick={() => { if (bookings.length > 1) toggleGroup(groupKey); }}
                          >
                            {/* Top row: avatar + name / status badge + chevron */}
                            <div className="flex items-start justify-between gap-2 mb-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Avatar name={rep.student_name} />
                                <div className="min-w-0">
                                  <p className={`font-semibold text-sm leading-tight truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{rep.student_name}</p>
                                  <p className={`text-[11px] mt-0.5 truncate ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                    {rep.student_number}{rep.program ? ` · ${rep.program}` : ''}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <StatusBadge status={rep.status} isDark={isDark} />
                                {bookings.length > 1 && (
                                  <svg
                                    className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''} ${isDark ? 'text-gray-500' : 'text-gray-400'}`}
                                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                  </svg>
                                )}
                              </div>
                            </div>

                            {/* Details: professor, date, time, mode, topics */}
                            <div className="space-y-1.5">
                              <div className={`flex items-center gap-1.5 text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z" />
                                </svg>
                                <span className="truncate">with {rep.professor_name}</span>
                              </div>
                              <div className={`flex items-center gap-1.5 text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
                                </svg>
                                <span>{repDate}</span>
                                <span className={isDark ? 'text-gray-600' : 'text-gray-300'}>·</span>
                                <span>{rep.day}</span>
                              </div>
                              <div className={`flex items-center gap-1.5 text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                                </svg>
                                <span>{formatTime(rep.time_start)}–{formatTime(rep.time_end)}</span>
                                <span className={isDark ? 'text-gray-600' : 'text-gray-300'}>·</span>
                                <span className={modeClsRep}>{modeLabelRep}</span>
                              </div>
                              <p className={`text-[11px] line-clamp-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{natureLabel(rep)}</p>
                            </div>

                            {/* Multi-booking summary pill */}
                            {totalCount > 1 && (
                              <p className={`text-[11px] mt-2.5 font-semibold ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                {totalCount} consultations{summaryParts.length > 0 ? ` · ${summaryParts.join(' · ')}` : ''}
                              </p>
                            )}
                          </div>

                          {/* ── Expanded sub-rows ── */}
                          {isExpanded && bookings.length > 1 && (
                            <div className={`border-t max-h-80 overflow-y-auto ${isDark ? 'border-white/[0.06]' : 'border-gray-100'}`}>
                              {bookings.map((c, idx) => {
                                const effMode = c.slot_mode === 'BOTH' ? 'BOTH' : c.mode;
                                const modeLabel = effMode === 'F2F' ? 'Face-to-Face' : effMode === 'BOTH' ? 'F2F & Online' : 'Online';
                                const modeCls = effMode === 'F2F'
                                  ? (isDark ? 'text-purple-400' : 'text-purple-600')
                                  : effMode === 'BOTH'
                                    ? (isDark ? 'text-teal-400' : 'text-teal-600')
                                    : (isDark ? 'text-cyan-400' : 'text-cyan-600');
                                return (
                                  <div
                                    key={c.id}
                                    className={`px-4 py-3 flex flex-col gap-1.5 ${isDark ? 'bg-[#0f0f11]' : 'bg-gray-50'} ${idx < bookings.length - 1 ? `border-b ${isDark ? 'border-white/[0.12]' : 'border-gray-300'}` : ''}`}
                                  >
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={`font-mono text-[11px] font-bold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>#{c.id}</span>
                                      <span className={isDark ? 'text-gray-600' : 'text-gray-300'}>·</span>
                                      <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                        {new Date((c.date || '').slice(0, 10) + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                      </span>
                                      <span className={isDark ? 'text-gray-600' : 'text-gray-300'}>·</span>
                                      <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{formatTime(c.time_start)}–{formatTime(c.time_end)}</span>
                                      <div className="ml-auto flex-shrink-0">
                                        <StatusBadge status={c.status} isDark={isDark} />
                                      </div>
                                    </div>
                                    <div className={`flex items-center gap-2 text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                      <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z" />
                                      </svg>
                                      <span className="truncate">with {c.professor_name}</span>
                                      <span className={isDark ? 'text-gray-600' : 'text-gray-300'}>·</span>
                                      <span className={modeCls}>{modeLabel}</span>
                                    </div>
                                    <p className={`text-[11px] ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{natureLabel(c)}</p>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* ── Accounts ── */}
            {tab === 'accounts' && (
              <>
                <div className="mb-7 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Account Management</h1>
                    <p className={`text-sm mt-1 ${isDark ? 'text-gray-500' : 'text-gray-700'}`}>Approve registrations, add or remove accounts</p>
                  </div>
                  <button onClick={() => setShowAddUser(true)}
                    className={`flex items-center justify-center gap-2 px-4 py-2 text-sm sm:flex-shrink-0 min-h-[44px] sm:min-h-0 ${btnPrimary}`}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                    Add Account
                  </button>
                </div>

                {/* Admin section */}
                <div className={`rounded-2xl border p-4 mb-6 ${isDark ? 'border-white/5 bg-[#161616]' : 'border-gray-200 bg-white shadow-sm'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <p className={`text-xs font-semibold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Admin Accounts ({admins.length}/2)</p>
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
                            <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{a.email}</p>
                            <p className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-500'}`}>Admin · joined {fmtDateTime(a.created_at)}</p>
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
                    <p className={`text-[10px] font-semibold uppercase tracking-widest mb-3 ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                      Pending Approval ({pendingUsers.length})
                    </p>
                    <div className="space-y-2">
                      {pendingUsers.map(u => (
                        <div key={u.id} className={`rounded-xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${isDark ? 'border-amber-500/20 bg-amber-500/10' : 'border-amber-200 bg-amber-50 shadow-sm'}`}>
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
                                <p className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-600'}`}>{u.student_number} {u.program ? `· ${u.program}` : ''}</p>
                              )}
                              {u.role === 'professor' && u.department && (
                                <p className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-600'}`}>{u.department}</p>
                              )}
                              <p className={`text-[10px] mt-0.5 ${isDark ? 'text-gray-700' : 'text-gray-500'}`}>Registered {fmtDateTime(u.created_at)}</p>
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
                        accountRoleFilter === r
                          ? isDark ? 'bg-sky-500/20 text-sky-300' : 'bg-[#0EA5E9] text-white shadow-sm'
                          : isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-white/5' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      }`}>
                      {r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1) + 's'}
                    </button>
                  ))}
                </div>

                <p className={`text-[10px] font-semibold uppercase tracking-widest mb-3 ${isDark ? 'text-gray-600' : 'text-gray-700'}`}>
                  All Accounts ({filteredUsers.length})
                </p>

                {filteredUsers.length === 0 ? (
                  <div className={`flex flex-col items-center justify-center py-16 rounded-2xl border ${isDark ? 'border-white/5 bg-[#161616]' : 'border-gray-200 bg-white'}`}>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No accounts found</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredUsers.map(u => (
                      <div key={u.id} className={`rounded-xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-colors ${
                        !u.is_active
                          ? isDark ? 'border-white/5 bg-[#111] opacity-60' : 'border-gray-200 bg-gray-50 opacity-60'
                          : isDark ? 'border-white/5 bg-[#161616] hover:border-white/10' : 'border-gray-200 bg-white shadow-sm hover:border-gray-300'
                      }`}>
                        <div className="flex items-center gap-3">
                          <button type="button" onClick={() => setProfileCard({ id: u.profile_id, role: u.role })} className="flex-shrink-0 hover:opacity-75 transition-opacity rounded-full focus:outline-none" title="View profile">
                            <Avatar name={u.full_name || u.email} avatarUrl={u.avatar} />
                          </button>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
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
                            <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>{u.email}</p>
                            {u.role === 'student' && u.student_number && (
                              <p className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-600'}`}>{u.student_number}{u.program ? ` · ${u.program}` : ''}</p>
                            )}
                            {u.role === 'professor' && u.department && (
                              <p className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-600'}`}>{u.department}</p>
                            )}
                            <p className={`text-[10px] mt-0.5 ${isDark ? 'text-gray-700' : 'text-gray-500'}`}>Joined {fmtDateTime(u.created_at)}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {u.role === 'professor' && (
                            <button
                              onClick={() => openSpecPanel(u.profile_id, u.full_name || u.email)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${isDark ? 'bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 ring-1 ring-violet-500/20' : 'bg-violet-50 text-violet-700 hover:bg-violet-100 ring-1 ring-violet-200'}`}>
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                              Specializations
                            </button>
                          )}
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
                  <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Schedules</h1>
                  <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-700'}`}>All professor availability slots</p>
                </div>
                {Object.keys(schedulesByProf).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-white/5 bg-[#161616]">
                    <p className="text-gray-400 font-medium text-sm">No schedules found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Object.values(schedulesByProf).map((prof) => {
                      const filteredSlots = prof.slots.filter(s => s.is_available);
                      if (filteredSlots.length === 0) return null;
                      const isOpen = expandedSchedules.has(prof.name);
                      return (
                        <div key={prof.name} className={`rounded-2xl border overflow-hidden ${isDark ? 'border-white/5 bg-[#161616]' : 'bg-white border-gray-200 shadow-sm'}`}>
                          <button
                            onClick={() => setExpandedSchedules(prev => {
                              const next = new Set(prev);
                              isOpen ? next.delete(prof.name) : next.add(prof.name);
                              return next;
                            })}
                            className={`w-full px-5 py-3.5 flex items-center justify-between gap-4 transition-colors ${isDark ? 'hover:bg-white/[0.03]' : 'hover:bg-gray-50'}`}
                          >
                            <div className="flex items-center gap-3">
                              <Avatar name={prof.name} />
                              <div className="text-left">
                                <p className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{prof.name}</p>
                                <p className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-500'}`}>{prof.dept}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{filteredSlots.length} slot{filteredSlots.length !== 1 ? 's' : ''}</span>
                              <svg className={`w-4 h-4 transition-transform ${isDark ? 'text-gray-500' : 'text-gray-400'} ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </button>
                          {isOpen && (
                            <div className={`divide-y ${isDark ? 'divide-white/5 border-t border-white/5' : 'divide-gray-100 border-t border-gray-100'}`}>
                              {[...filteredSlots]
                                .sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.time_start.localeCompare(b.time_start))
                                .map(slot => (
                                  <div key={slot.id} className="px-5 py-3 flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-3 sm:gap-4 text-sm flex-wrap">
                                      <span className={`font-medium w-20 sm:w-24 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{slot.day}</span>
                                      <span className={`font-mono text-xs sm:text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{formatTime(slot.time_start)} – {formatTime(slot.time_end)}</span>
                                      {slot.location && (
                                        <span className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>{slot.location}</span>
                                      )}
                                    </div>
                                    <span className={`inline-flex items-center gap-1.5 text-xs ${slot.is_available ? 'text-emerald-500' : isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${slot.is_available ? 'bg-emerald-500' : isDark ? 'bg-gray-600' : 'bg-gray-300'}`} />
                                      {slot.is_available ? 'Available' : 'Booked'}
                                    </span>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* ── Reports ── */}
            {tab === 'reports' && (
              <>
                <div className="mb-5 sm:mb-7">
                  <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Reports</h1>
                  <p className={`text-sm mt-1 ${isDark ? 'text-gray-300' : 'text-gray-800'}`}>Download advising reports per professor or combined</p>
                </div>

                {/* Time period filter */}
                <div className="flex flex-wrap items-center gap-2 mb-6">
                  <p className={`text-xs mr-1 font-medium ${isDark ? 'text-gray-400' : 'text-gray-700'}`}>Period:</p>
                  {([['', 'All Time'], ['week', 'This Week'], ['semester', 'This Semester'], ['year', 'This Year']] as [ReportPeriod, string][]).map(([val, label]) => (
                    <button key={val} onClick={() => setReportPeriod(val)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        reportPeriod === val ? 'bg-[#0EA5E9] text-white' : isDark ? 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900'
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

                <p className={`text-[10px] font-semibold uppercase tracking-widest mb-3 ${isDark ? 'text-gray-400' : 'text-gray-700'}`}>By Professor</p>
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
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 sm:mb-7">
                  <div>
                    <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>History</h1>
                    <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-700'}`}>All consultation records grouped by term</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      placeholder="Search student or adviser…"
                      value={historySearch}
                      onChange={e => setHistorySearch(e.target.value)}
                      className={`h-8 px-3 rounded-lg text-xs border focus:outline-none focus:border-[#0EA5E9]/50 w-48 ${isDark ? 'bg-[#1e1e1e] border-white/10 text-gray-200 placeholder-gray-600' : 'bg-white border-gray-200 text-gray-800 placeholder-gray-400'}`}
                    />
                    <select
                      value={historyStatusFilter}
                      onChange={e => setHistoryStatusFilter(e.target.value)}
                      className={`h-8 px-3 rounded-lg text-xs border focus:outline-none focus:border-[#0EA5E9]/50 ${isDark ? 'bg-[#1e1e1e] border-white/10 text-gray-200' : 'bg-white border-gray-200 text-gray-800'}`}
                    >
                      <option value="all">All statuses</option>
                      <option value="pending">Pending</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="missed">Missed</option>
                      <option value="rescheduled">Rescheduled</option>
                      <option value="needs_reschedule">Needs Reschedule</option>
                    </select>
                  </div>
                </div>
                {(() => {
                  const q = historySearch.toLowerCase();
                  const historyItems = consultations.filter(c => {
                    if (historyStatusFilter !== 'all' && c.status !== historyStatusFilter) return false;
                    if (q && !c.student_name?.toLowerCase().includes(q) && !c.professor_name?.toLowerCase().includes(q)) return false;
                    return true;
                  });
                  if (historyItems.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-white/5 bg-[#161616]">
                        <p className="text-gray-400 font-medium text-sm">No records found</p>
                        <p className="text-gray-600 text-xs mt-1">Try adjusting your filters</p>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-8">
                      {groupByQuarter(historyItems, term).map(([quarter, items]) => (
                        <div key={quarter}>
                          <div className="flex items-center gap-3 mb-3">
                            <p className={`text-[10px] font-semibold uppercase tracking-widest ${isDark ? 'text-gray-500' : 'text-gray-700'}`}>{quarter}</p>
                            <span className={`text-xs font-semibold ${isDark ? 'text-gray-400' : 'text-gray-800'}`}>{items.length} record{items.length !== 1 ? 's' : ''}</span>
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
              </>
            )}

            {/* ── Term Archive ── */}
            {tab === 'archive' && (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 sm:mb-7">
                  <div>
                    <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Term Archive</h1>
                    <p className={`text-sm mt-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                      Long-term consultation records organized by academic term
                    </p>
                  </div>
                  {!archiveSelectedTerm && (
                    <button
                      onClick={fetchArchiveTerms}
                      disabled={archiveLoading}
                      className={`h-8 px-4 rounded-lg text-xs font-semibold transition-all ${
                        archiveLoading ? 'opacity-50 cursor-not-allowed' : ''
                      } ${isDark ? 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                    >
                      {archiveLoading ? 'Loading…' : 'Refresh'}
                    </button>
                  )}
                  {archiveSelectedTerm && (
                    <button
                      onClick={() => { setArchiveSelectedTerm(null); setArchiveRecords([]); setArchiveSearch(''); }}
                      className={`h-8 px-4 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${isDark ? 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                      All Terms
                    </button>
                  )}
                </div>

                {/* Load prompt on first visit */}
                {archiveTerms.length === 0 && !archiveLoading && !archiveSelectedTerm && (
                  <div className={`flex flex-col items-center justify-center py-20 rounded-2xl border ${isDark ? 'border-white/5 bg-[#161616]' : 'border-gray-200 bg-white'}`}>
                    <svg className="w-10 h-10 mb-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0v10l-8 4m0-10L4 7m8 4v10" />
                    </svg>
                    <p className={`font-medium text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Term archive not loaded</p>
                    <p className={`text-xs mt-1 mb-4 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Click below to load all archived terms</p>
                    <button
                      onClick={fetchArchiveTerms}
                      className="px-5 py-2 rounded-lg text-sm font-semibold bg-[linear-gradient(135deg,#0369A1,#0EA5E9)] text-white hover:scale-[1.02] transition-transform"
                    >
                      Load Archive
                    </button>
                  </div>
                )}

                {archiveLoading && (
                  <div className="flex items-center justify-center py-20">
                    <div className="w-7 h-7 border-2 border-[#0EA5E9] border-t-transparent rounded-full animate-spin" />
                  </div>
                )}

                {/* Term cards list */}
                {!archiveLoading && !archiveSelectedTerm && archiveTerms.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {archiveTerms.map(term => (
                      <div
                        key={term.term_label}
                        className={`rounded-2xl p-5 border flex flex-col gap-4 ${isDark ? 'bg-[#161616] border-white/5' : 'bg-white border-gray-200'}`}
                      >
                        <div>
                          <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Academic Term</p>
                          <p className={`text-sm font-bold leading-snug ${isDark ? 'text-white' : 'text-gray-900'}`}>{term.term_label}</p>
                          <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                            {term.total} record{term.total !== 1 ? 's' : ''} &middot; {
                              new Date(term.earliest_date).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })
                            } – {
                              new Date(term.latest_date).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })
                            }
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-auto">
                          <button
                            onClick={() => { setArchiveSelectedTerm(term.term_label); fetchArchiveRecords(term.term_label); }}
                            className={`flex-1 min-w-[80px] py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${isDark ? 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10' : 'bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100'}`}
                          >
                            View Records
                          </button>
                          <button
                            onClick={() => handleArchiveExport(term.term_label, 'excel')}
                            disabled={exporting === `archive-export-${term.term_label}`}
                            className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                              exporting === `archive-export-${term.term_label}` ? 'opacity-50 cursor-not-allowed' : ''
                            } ${isDark ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20' : 'bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100'}`}
                          >
                            Excel
                          </button>
                          <button
                            onClick={() => handleArchiveExport(term.term_label, 'pdf')}
                            disabled={exporting === `archive-export-${term.term_label}`}
                            className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                              exporting === `archive-export-${term.term_label}` ? 'opacity-50 cursor-not-allowed' : ''
                            } ${isDark ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20' : 'bg-red-50 border border-red-200 text-red-700 hover:bg-red-100'}`}
                          >
                            PDF
                          </button>
                          <button
                            onClick={() => handleArchiveDelete(term.term_label, term.total)}
                            className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Records view for selected term */}
                {archiveSelectedTerm && (
                  <>
                    <div className={`flex items-center justify-between mb-4 p-4 rounded-xl border ${isDark ? 'bg-[#161616] border-white/5' : 'bg-white border-gray-200'}`}>
                      <div>
                        <p className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Viewing</p>
                        <p className={`text-sm font-bold mt-0.5 ${isDark ? 'text-white' : 'text-gray-900'}`}>{archiveSelectedTerm}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleArchiveExport(archiveSelectedTerm, 'excel')}
                          className={`h-8 px-3 rounded-lg text-xs font-semibold ${isDark ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20' : 'bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100'}`}
                        >
                          Export Excel
                        </button>
                        <button
                          onClick={() => handleArchiveExport(archiveSelectedTerm, 'pdf')}
                          className={`h-8 px-3 rounded-lg text-xs font-semibold ${isDark ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20' : 'bg-red-50 border border-red-200 text-red-700 hover:bg-red-100'}`}
                        >
                          Export PDF
                        </button>
                        <button
                          onClick={() => {
                            const t = archiveTerms.find(x => x.term_label === archiveSelectedTerm);
                            if (t) handleArchiveDelete(t.term_label, t.total);
                          }}
                          className="h-8 px-3 rounded-lg text-xs font-semibold bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all"
                        >
                          Delete Archive
                        </button>
                      </div>
                    </div>

                    {/* Search */}
                    <div className="relative mb-4">
                      <svg className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${isDark ? 'text-gray-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" /></svg>
                      <input
                        type="text"
                        placeholder="Search student or adviser…"
                        value={archiveSearch}
                        onChange={e => setArchiveSearch(e.target.value)}
                        className={`w-full pl-9 pr-3 py-2 rounded-lg text-sm border focus:outline-none focus:border-[#0EA5E9]/50 ${isDark ? 'bg-[#161616] text-white border-white/5 placeholder-gray-600' : 'bg-white text-gray-900 border-gray-200 placeholder-gray-400'}`}
                      />
                    </div>

                    {archiveRecordsLoading ? (
                      <div className="flex items-center justify-center py-16">
                        <div className="w-7 h-7 border-2 border-[#0EA5E9] border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (() => {
                      const q = archiveSearch.toLowerCase();
                      const filtered = archiveRecords.filter(c =>
                        !q ||
                        c.student_name?.toLowerCase().includes(q) ||
                        c.professor_name?.toLowerCase().includes(q) ||
                        c.student_number?.toLowerCase().includes(q)
                      );
                      if (filtered.length === 0) {
                        return (
                          <div className={`flex flex-col items-center justify-center py-16 rounded-2xl border ${isDark ? 'border-white/5 bg-[#161616]' : 'border-gray-200 bg-white'}`}>
                            <p className={`font-medium text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No records found</p>
                          </div>
                        );
                      }
                      return (
                        <div className={`rounded-2xl border overflow-hidden ${isDark ? 'border-white/5 bg-[#161616]' : 'border-gray-200 bg-white'}`}>
                          <div className="overflow-x-auto">
                            <table className="w-full table-fixed min-w-[720px]">
                              <thead>
                                <tr className={`border-b ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                                  <th className={`text-left text-[10px] font-semibold uppercase tracking-wide px-4 py-3 w-[100px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Date</th>
                                  <th className={`text-left text-[10px] font-semibold uppercase tracking-wide px-4 py-3 w-[140px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Student</th>
                                  <th className={`text-left text-[10px] font-semibold uppercase tracking-wide px-4 py-3 w-[140px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Adviser</th>
                                  <th className={`text-left text-[10px] font-semibold uppercase tracking-wide px-4 py-3 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Purpose</th>
                                  <th className={`text-left text-[10px] font-semibold uppercase tracking-wide px-4 py-3 w-[140px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Action Taken</th>
                                  <th className={`text-left text-[10px] font-semibold uppercase tracking-wide px-4 py-3 w-[120px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Status</th>
                                </tr>
                              </thead>
                              <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
                                {filtered.map(c => (
                                  <tr key={c.id} className={`transition-colors ${isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-gray-50'}`}>
                                    <td className={`px-4 py-3 text-xs font-semibold whitespace-nowrap ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                      {new Date(c.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </td>
                                    <td className={`px-4 py-3 text-xs font-semibold truncate ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{c.student_name}</td>
                                    <td className={`px-4 py-3 text-xs font-semibold truncate ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{c.professor_name}</td>
                                    <td className={`px-4 py-3 text-xs font-semibold ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                      <span className="line-clamp-2">{natureLabel({ nature_of_advising: c.nature_of_advising ?? '', nature_of_advising_specify: c.nature_of_advising_specify })}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                      <ActionBadge action_taken={c.action_taken} referral={c.referral} referral_specify={c.referral_specify} />
                                    </td>
                                    <td className="px-4 py-3"><StatusBadge status={c.status} isDark={isDark} /></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </>
            )}

            {/* ── Home ── */}
            {/* ── Topics & Specializations ── */}
            {tab === 'topics' && (
              <>
                <div className="mb-6">
                  <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Advising Topics</h1>
                  <p className={`text-sm mt-1 ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                    Manage the nature-of-advising options available to students. Each topic has an estimated consultation duration to prevent professor overloading.
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Topic list */}
                  <div className={`rounded-2xl border p-5 ${isDark ? 'border-white/5 bg-[#161616]' : 'bg-white border-gray-200 shadow-sm'}`}>
                    <p className={`text-xs font-semibold uppercase tracking-widest mb-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Topics ({topics.length})
                    </p>
                    <div className="space-y-2 mb-5 max-h-[420px] overflow-y-auto pr-1">
                      {topics.length === 0 && (
                        <p className={`text-sm py-4 text-center ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>No topics yet.</p>
                      )}
                      {topics.map(t => (
                        <div key={t.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${isDark ? 'bg-white/[0.04] hover:bg-white/[0.07]' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{t.label}</p>
                            <p className={`text-[11px] mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{t.duration_minutes} min estimated</p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              onClick={() => { setTopicEditId(t.id); setTopicForm({ label: t.label, duration_minutes: t.duration_minutes }); setTopicError(null); }}
                              className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-400 hover:text-sky-400 hover:bg-sky-500/10' : 'text-gray-500 hover:text-sky-600 hover:bg-sky-50'}`}>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button
                              onClick={() => handleTopicDelete(t.id)}
                              className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-600 hover:text-red-400 hover:bg-red-500/10' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'}`}>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add / Edit form */}
                    <div className={`rounded-xl p-4 ${isDark ? 'bg-white/[0.03] border border-white/5' : 'bg-gray-50 border border-gray-200'}`}>
                      <p className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        {topicEditId ? 'Edit Topic' : 'Add Topic'}
                      </p>
                      <div className="space-y-2">
                        <input
                          value={topicForm.label}
                          onChange={e => setTopicForm(f => ({ ...f, label: e.target.value }))}
                          placeholder="Topic label"
                          className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none ${isDark ? 'bg-white/[0.04] border-white/10 text-white placeholder-gray-600 focus:border-sky-500/50' : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400 focus:border-sky-400'}`}
                        />
                        <div className="flex items-center gap-2">
                          <label className={`text-xs flex-shrink-0 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Duration (min):</label>
                          <input
                            type="number"
                            min={5} max={480}
                            value={topicForm.duration_minutes}
                            onChange={e => setTopicForm(f => ({ ...f, duration_minutes: Number(e.target.value) }))}
                            className={`w-20 px-3 py-2 rounded-lg text-sm border focus:outline-none ${isDark ? 'bg-white/[0.04] border-white/10 text-white focus:border-sky-500/50' : 'bg-white border-gray-300 text-gray-800 focus:border-sky-400'}`}
                          />
                        </div>
                        {topicError && <p className="text-red-500 text-xs">{topicError}</p>}
                        <div className="flex gap-2">
                          <button
                            onClick={handleTopicSave}
                            disabled={topicSaving}
                            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${btnPrimary}`}>
                            {topicSaving ? 'Saving…' : topicEditId ? 'Update' : 'Add'}
                          </button>
                          {topicEditId && (
                            <button
                              onClick={() => { setTopicEditId(null); setTopicForm({ label: '', duration_minutes: 30 }); setTopicError(null); }}
                              className={`px-3 py-2 rounded-lg text-sm transition-colors ${isDark ? 'text-gray-400 hover:text-gray-200 bg-white/5' : 'text-gray-600 hover:text-gray-800 bg-gray-100'}`}>
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Professor specializations */}
                  <div className={`rounded-2xl border p-5 ${isDark ? 'border-white/5 bg-[#161616]' : 'bg-white border-gray-200 shadow-sm'}`}>
                    <p className={`text-xs font-semibold uppercase tracking-widest mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Professor Specializations</p>
                    <p className={`text-xs mb-4 ${isDark ? 'text-gray-600' : 'text-gray-500'}`}>Assign which advising topics each professor handles. Students will see this when booking.</p>
                    <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                      {users.filter(u => u.role === 'professor' && u.is_active).map(u => (
                        <button key={u.id}
                          onClick={() => openSpecPanel(u.profile_id, u.full_name || u.email)}
                          className={`w-full text-left flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors ${isDark ? 'bg-white/[0.04] hover:bg-white/[0.07]' : 'bg-gray-50 hover:bg-gray-100'}`}>
                          <div>
                            <p className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{u.full_name || u.email}</p>
                            {u.department && <p className={`text-[11px] ${isDark ? 'text-gray-600' : 'text-gray-500'}`}>{u.department}</p>}
                          </div>
                          <svg className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-gray-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        </button>
                      ))}
                      {users.filter(u => u.role === 'professor' && u.is_active).length === 0 && (
                        <p className={`text-sm py-4 text-center ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>No active professors.</p>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── Specializations modal ── */}
            {specProfId !== null && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSpecProfId(null)} />
                <div className={`relative w-full max-w-md rounded-2xl p-6 shadow-2xl ${isDark ? 'bg-[#1a1a2e] border border-white/10' : 'bg-white border border-gray-200'}`}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Specializations</p>
                      <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{specProfName}</p>
                    </div>
                    <button onClick={() => setSpecProfId(null)} className={`p-1.5 rounded-lg ${isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-white/5' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  {specLoading ? (
                    <div className="flex justify-center py-8"><span className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" /></div>
                  ) : (
                    <>
                      <p className={`text-xs mb-3 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Select the topics this professor is qualified to handle:</p>
                      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1 mb-4">
                        {topics.map(t => (
                          <label key={t.id} className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-colors ${specSelected.includes(t.id) ? (isDark ? 'bg-violet-500/15 ring-1 ring-violet-500/30' : 'bg-violet-50 ring-1 ring-violet-200') : (isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-gray-50')}`}>
                            <input
                              type="checkbox"
                              checked={specSelected.includes(t.id)}
                              onChange={() => setSpecSelected(prev => prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id])}
                              className="w-4 h-4 rounded accent-violet-500"
                            />
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium truncate ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{t.label}</p>
                              <p className={`text-[10px] ${isDark ? 'text-gray-600' : 'text-gray-500'}`}>{t.duration_minutes} min</p>
                            </div>
                          </label>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleSpecSave} disabled={specSaving} className={`flex-1 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 ${btnPrimary}`}>
                          {specSaving ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => setSpecProfId(null)} className={`px-4 py-2 rounded-xl text-sm transition-colors ${isDark ? 'text-gray-400 hover:text-gray-200 bg-white/5' : 'text-gray-600 hover:text-gray-800 bg-gray-100'}`}>
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {tab === 'home' && (() => {
              const bh = isDark ? 'text-white' : 'text-gray-900';
              const bs = isDark ? 'text-gray-500' : 'text-gray-500';
              const inp2 = `w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:border-indigo-400/50 ${isDark ? 'text-white bg-[#0f0f0f] border-white/10 placeholder-gray-600' : 'text-gray-900 bg-gray-50 border-gray-200 placeholder-gray-400'}`;
              // Same translucent "glass" card style used on the student/professor home pages —
              // sits over the full-page Mapúa watermark so the logo subtly shows through.
              const glassCard: React.CSSProperties = isDark
                ? { background: 'rgba(30,31,34,0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 10px 40px rgba(0,0,0,0.60),0 4px 12px rgba(0,0,0,0.40)' }
                : { background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid #f1f5f9', borderRadius: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06),0 4px 16px rgba(0,0,0,0.04)' };
              const RANK_CFG = [
                { medal: '🥇', border: 'border-amber-400', rowBg: isDark ? 'bg-amber-400/[0.10]' : 'bg-amber-50', fill: 'from-amber-400 to-yellow-300', track: isDark ? 'bg-white/[0.07]' : 'bg-amber-200/60' },
                { medal: '🥈', border: 'border-slate-400',  rowBg: isDark ? 'bg-slate-400/[0.10]'  : 'bg-slate-50',  fill: 'from-slate-400 to-slate-300',  track: isDark ? 'bg-white/[0.07]' : 'bg-slate-200/60'  },
                { medal: '🥉', border: 'border-orange-400', rowBg: isDark ? 'bg-orange-400/[0.10]' : 'bg-orange-50', fill: 'from-orange-500 to-amber-400', track: isDark ? 'bg-white/[0.07]' : 'bg-orange-200/60' },
              ];
              return (
                <>
                {/* Stats pill — mirrors student/professor top-right strip */}
                <div className="flex justify-end mb-4">
                  <div
                    className={`grid grid-cols-2 sm:flex sm:items-center gap-x-5 gap-y-3 sm:gap-5 px-5 sm:px-7 py-4 sm:py-3.5 flex-shrink-0 rounded-2xl sm:rounded-full ${isDark ? 'bg-white/[0.06] border border-white/10 shadow-md shadow-black/40' : ''}`}
                    style={!isDark ? { background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.9)', borderRadius: '9999px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' } : undefined}
                  >
                    {([
                      { value: consultations.length,                                   label: 'Consultations', numColor: '#0EA5E9', darkNumColor: '#7DD3FC' },
                      { value: professors.length,                                      label: 'Professors',    numColor: '#7C3AED', darkNumColor: '#C4B5FD' },
                      { value: users.filter(u => u.role === 'student' && u.is_active).length, label: 'Students', numColor: '#059669', darkNumColor: '#6EE7B7' },
                      { value: pendingUsers.length,                                    label: 'Pending',       numColor: '#EA580C', darkNumColor: '#FDBA74' },
                    ] as const).map((s, i, arr) => (
                      <div key={s.label} className={`flex flex-col items-center ${i < arr.length - 1 ? `sm:pr-5 sm:border-r ${isDark ? 'sm:border-white/20' : 'sm:border-gray-300'}` : ''}`}>
                        <span className="text-2xl font-extrabold leading-none" style={{ color: isDark ? s.darkNumColor : s.numColor }}>{s.value}</span>
                        <span className={`text-[11px] font-medium mt-1 ${bs}`}>{s.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-12 gap-4">

                {/* ── Combined term overview card — student profile-card style ── */}
                <div className="col-span-12 lg:col-span-3 rounded-2xl overflow-hidden flex flex-col" style={glassCard}>
                  {/* Header: sky-tinted, week badge */}
                  <div className={`px-6 pt-6 pb-5 ${isDark ? 'bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-transparent' : 'bg-gradient-to-br from-sky-50 to-white'}`}>
                    <p className={`text-[11px] font-semibold uppercase tracking-wider mb-3 ${bs}`}>Admin Overview</p>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#0369A1] to-[#0EA5E9] flex flex-col items-center justify-center flex-shrink-0 shadow-lg shadow-sky-900/30">
                        <span className="text-white text-3xl font-black leading-none">{currentWeek ?? '–'}</span>
                        <span className="text-sky-100 text-[9px] font-bold uppercase tracking-wide">WK</span>
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold ${bh}`}>{currentWeek ? `Week ${currentWeek} of ${term.totalWeeks}` : 'Not active'}</p>
                        <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{term.label}</p>
                      </div>
                    </div>
                  </div>
                  {/* Body: term progress + stat list */}
                  <div className={`flex-1 px-6 pt-5 pb-6 border-t space-y-5 ${isDark ? 'border-white/15' : 'border-gray-300'}`}>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Term Progress</span>
                        <span className="text-sm font-bold text-emerald-500">{Math.round(termProgress)}%</span>
                      </div>
                      <div className={`h-2.5 rounded-full overflow-hidden ${isDark ? 'bg-white/8' : 'bg-gray-100'}`}>
                        <div className="h-full bg-gradient-to-r from-[#0369A1] to-[#0EA5E9] rounded-full transition-all duration-700" style={{ width: `${termProgress}%` }} />
                      </div>
                      <div className="flex justify-between mt-1.5">
                        <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Start</span>
                        <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Finals W{term.finalsWeek}</span>
                        <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>End</span>
                      </div>
                    </div>
                    <div className={`rounded-xl overflow-hidden divide-y ${isDark ? 'divide-white/10 border border-white/10' : 'divide-gray-200 border border-gray-200'}`}>
                      {([
                        { label: 'Days to Finals', value: daysToFinals, color: isDark ? '#FBBF24' : '#B45309' },
                        { label: 'Days to End',    value: daysToEnd,    color: isDark ? '#818CF8' : '#4338CA' },
                        { label: 'Weeks Left',     value: currentWeek ? Math.max(0, term.totalWeeks - currentWeek) : term.totalWeeks, color: isDark ? '#34D399' : '#047857' },
                      ]).map(m => (
                        <div key={m.label} className={`flex items-center justify-between px-4 py-3 ${isDark ? 'bg-white/[0.03]' : 'bg-white'}`}>
                          <div className="flex items-center gap-2.5">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />
                            <span className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{m.label}</span>
                          </div>
                          <span className="text-xl font-bold" style={{ color: m.color }}>{m.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── Term Configuration + system stats — one card ── */}
                <div id="admin-term-config" className="col-span-12 lg:col-span-9 rounded-2xl overflow-hidden flex flex-col" style={glassCard}>
                  {/* Term Configuration */}
                  <div className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <p className={`font-semibold text-sm ${bh}`}>Term Configuration</p>
                    {termSuccess && <span className="text-emerald-500 text-xs font-medium">Saved successfully</span>}
                  </div>
                  <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex-1 min-w-[180px]">
                      <label className={`text-xs mb-1.5 block ${bs}`}>Term Label</label>
                      <input type="text" value={termForm.term_label} onChange={e => setTermForm(f => ({ ...f, term_label: e.target.value }))} placeholder="e.g. 3rd Trimester, A.Y. 2025–2026" className={inp2} />
                    </div>
                    <div className="w-36">
                      <label className={`text-xs mb-1.5 block ${bs}`}>Start Date</label>
                      <input type="date" value={termForm.term_start} onChange={e => setTermForm(f => ({ ...f, term_start: e.target.value }))} className={`${inp2} ${isDark ? '[color-scheme:dark]' : '[color-scheme:light]'}`} />
                    </div>
                    <div className="w-28">
                      <label className={`text-xs mb-1.5 block ${bs}`}>Total Weeks</label>
                      <input type="number" min={1} max={52} value={termForm.term_total_weeks} onChange={e => setTermForm(f => ({ ...f, term_total_weeks: e.target.value }))} className={inp2} />
                    </div>
                    <div className="w-28">
                      <label className={`text-xs mb-1.5 block ${bs}`}>Midterm Week</label>
                      <input type="number" min={1} max={parseInt(termForm.term_total_weeks) || 52} value={termForm.term_midterm_week} onChange={e => setTermForm(f => ({ ...f, term_midterm_week: e.target.value }))} className={inp2} />
                    </div>
                    <div className="w-28">
                      <label className={`text-xs mb-1.5 block ${bs}`}>Finals Week</label>
                      <input type="number" min={1} max={parseInt(termForm.term_total_weeks) || 52} value={termForm.term_finals_week} onChange={e => setTermForm(f => ({ ...f, term_finals_week: e.target.value }))} className={inp2} />
                    </div>
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
                      className={`px-4 py-2 text-sm disabled:opacity-50 self-end ${btnPrimary}`}
                    >
                      {termSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                  {termError && <p className="text-red-500 text-xs mt-2">{termError}</p>}
                  </div>

                  {/* Quick Actions — fills the remaining space to match the left card height */}
                  <div className={`flex-1 p-5 flex flex-col`}>
                    <p className={`text-[11px] font-semibold uppercase tracking-wider mb-3 ${bs}`}>Quick Actions</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 auto-rows-fr">
                      {([
                        { label: 'Approve Pending', Icon: UserCheck,     tab: 'accounts' as Tab,      color: isDark ? '#FBBF24' : '#B45309', badge: pendingUsers.length },
                        { label: 'Manage Accounts', Icon: Users,         tab: 'accounts' as Tab,      color: isDark ? '#818CF8' : '#4338CA' },
                        { label: 'View Reports',    Icon: BarChart3,     tab: 'reports' as Tab,       color: isDark ? '#34D399' : '#047857' },
                        { label: 'Consultations',   Icon: ClipboardList, tab: 'consultations' as Tab, color: isDark ? '#7DD3FC' : '#0284C7' },
                      ]).map(a => (
                        <button
                          key={a.label}
                          onClick={() => setTab(a.tab)}
                          className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all duration-200 ${isDark ? 'bg-white/[0.03] border-white/10 hover:bg-white/[0.07] hover:border-white/20' : 'bg-white border-gray-200 hover:border-sky-300 hover:shadow-md'}`}
                        >
                          <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${a.color}1A`, color: a.color }}>
                            <a.Icon className="w-5 h-5" />
                          </span>
                          <span className={`text-sm font-semibold ${bh}`}>{a.label}</span>
                          {a.badge != null && a.badge > 0 && (
                            <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-[#CC0000] text-white text-[11px] font-bold flex items-center justify-center leading-none">{a.badge}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>{/* end Term Config + stats card */}

                {/* Row 4: Announcements (col-span-8) + Rankings (col-span-4) */}
                  {/* Rankings — combined Top Professors / Top Students / Top Topics (matches student/professor) */}
                  <div className="col-span-12 lg:col-span-4 lg:order-last p-4 rounded-2xl flex flex-col" style={glassCard}>
                    <div className="flex-shrink-0 flex gap-1.5 mb-3">
                      {(['rankings', 'consulted'] as const).map(v => (
                        <button key={v} onClick={() => setLbView(v)}
                          className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all border ${
                            lbView === v
                              ? isDark ? 'bg-sky-500/15 text-sky-300 border-sky-500/40' : 'bg-sky-50 text-sky-700 border-sky-300'
                              : isDark ? 'bg-transparent text-gray-400 border-white/15 hover:text-gray-300 hover:border-white/25' : 'bg-transparent text-gray-500 border-gray-300 hover:text-gray-700 hover:border-gray-400'
                          }`}>
                          {v === 'rankings' ? 'Professors' : 'Topics'}
                        </button>
                      ))}
                    </div>
                    {lbView === 'rankings' && (
                      <div className="overflow-y-auto flex-1 space-y-1">
                        {lbProfs.length === 0 ? (
                          <p className={`text-sm ${bs} py-1 px-2`}>No data.</p>
                        ) : lbProfs.map(item => (
                          <div key={item.rank} className={`flex items-center gap-3 py-2 px-3 rounded-xl transition-colors ${isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-gray-50'}`}>
                            <span className={`flex-1 text-sm truncate font-medium min-w-0 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{item.label}</span>
                            <span className={`text-sm font-bold tabular-nums flex-shrink-0 ${isDark ? 'text-white' : 'text-gray-900'}`}>{item.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {lbView === 'consulted' && (
                      <div className="overflow-y-auto flex-1 space-y-1">
                        {lbTopics.length === 0 ? (
                          <p className={`text-sm ${bs} py-1 px-2`}>No consultation data yet.</p>
                        ) : lbTopics.map(t => (
                          <div key={t.label} className={`flex items-center gap-3 py-2 px-3 rounded-xl transition-colors ${isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-gray-50'}`}>
                            <span className={`flex-1 text-sm truncate font-medium min-w-0 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{t.label}</span>
                            <span className={`text-sm font-bold tabular-nums flex-shrink-0 ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Announcements CRUD */}
                  <div className={`col-span-12 lg:col-span-8 rounded-2xl border flex flex-col overflow-hidden ${isDark ? 'border-white/5 bg-[#161616]' : 'bg-white border-slate-100 shadow-sm'}`}>
                    <div className={`px-5 py-4 border-b flex items-center justify-between ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                      <p className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>Announcements</p>
                      <button
                        onClick={() => {
                          setAnnEditId(null);
                          setAnnForm({ title: '', body: '', type: 'info', pinned: false });
                          setAnnError(null);
                          setAnnFormOpen(f => !f);
                        }}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-200 ${
                          annFormOpen
                            ? isDark ? 'bg-white/10 text-gray-300 hover:bg-white/15' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            : 'text-white bg-gradient-to-r from-violet-500 to-fuchsia-500 shadow-md shadow-fuchsia-500/30 hover:from-violet-600 hover:to-fuchsia-600 hover:shadow-lg hover:shadow-fuchsia-500/40 hover:scale-[1.03]'
                        }`}
                      >
                        {annFormOpen ? (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                        )}
                        {annFormOpen ? 'Cancel' : 'Add'}
                      </button>
                    </div>

                    {/* Add/edit form */}
                    {annFormOpen && (
                      <div className={`px-5 py-4 border-b space-y-3 ${isDark ? 'border-white/5 bg-white/[0.02]' : 'border-gray-100 bg-gray-50'}`}>
                        {/* Type selector */}
                        <div className="flex gap-2">
                          {(['info', 'warning'] as const).map(t => (
                            <button key={t} onClick={() => setAnnForm(f => ({ ...f, type: t }))}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                annForm.type === t
                                  ? t === 'info'
                                    ? isDark ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30' : 'bg-blue-100 text-blue-600 ring-1 ring-blue-300'
                                    : isDark ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30' : 'bg-amber-100 text-amber-600 ring-1 ring-amber-300'
                                  : isDark ? 'bg-white/5 text-gray-500 hover:bg-white/10' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
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
                              ? 'bg-yellow-500/15 text-yellow-500 ring-1 ring-yellow-500/30'
                              : isDark ? 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill={annForm.pinned ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                            </svg>
                            Pin to top
                          </span>
                          <span className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${annForm.pinned ? 'bg-yellow-500' : isDark ? 'bg-white/10' : 'bg-gray-300'}`}>
                            <span className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${annForm.pinned ? 'translate-x-4' : 'translate-x-0'}`} />
                          </span>
                        </button>
                        <input
                          className={`w-full px-3 py-2 rounded-lg text-xs border focus:outline-none focus:border-[#0EA5E9]/50 ${isDark ? 'text-white bg-[#0f0f0f] border-white/10 placeholder-gray-700' : 'text-gray-900 bg-white border-gray-300 placeholder-gray-400'}`}
                          placeholder="Title *"
                          value={annForm.title}
                          onChange={e => setAnnForm(f => ({ ...f, title: e.target.value }))}
                        />
                        <textarea
                          rows={3}
                          className={`w-full px-3 py-2 rounded-lg text-xs border focus:outline-none focus:border-[#0EA5E9]/50 resize-none ${isDark ? 'text-white bg-[#0f0f0f] border-white/10 placeholder-gray-700' : 'text-gray-900 bg-white border-gray-300 placeholder-gray-400'}`}
                          placeholder="Body / message *"
                          value={annForm.body}
                          onChange={e => setAnnForm(f => ({ ...f, body: e.target.value }))}
                        />
                        {annError && <p className="text-red-500 text-xs">{annError}</p>}
                        <button
                          onClick={handleSaveAnn}
                          disabled={annSaving || !annForm.title.trim() || !annForm.body.trim()}
                          className={`w-full py-2 text-xs disabled:opacity-40 ${btnPrimary}`}
                        >
                          {annSaving ? 'Saving…' : annEditId ? 'Update Announcement' : 'Post Announcement'}
                        </button>
                      </div>
                    )}

                    <div className={`overflow-y-auto max-h-[320px] divide-y ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
                      {announcements.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12">
                          <p className={`text-sm ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>No announcements yet</p>
                          <p className={`text-xs mt-1 ${isDark ? 'text-gray-700' : 'text-gray-300'}`}>Click "+ Add" to create one</p>
                        </div>
                      ) : announcements.map(a => (
                        <div key={a.id} className={`flex border-l-4 transition-colors ${a.type === 'warning' ? 'border-l-yellow-400' : 'border-l-blue-500'} ${isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-gray-50'}`}>
                          <div className="flex-1 px-4 py-3 min-w-0 flex items-start gap-2.5">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                <p className={`text-lg font-bold leading-tight ${bh}`}>{a.title}</p>
                                {a.pinned && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-yellow-500/15 text-yellow-500 ring-1 ring-yellow-500/25">
                                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                                    Pinned
                                  </span>
                                )}
                              </div>
                              <p className={`text-base leading-relaxed line-clamp-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{a.body}</p>
                              <p className={`text-sm mt-1 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                                {new Date(a.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-center gap-1 pr-3 pt-3 flex-shrink-0">
                              <button
                                onClick={() => {
                                  setAnnEditId(a.id);
                                  setAnnForm({ title: a.title, body: a.body, type: a.type, pinned: a.pinned });
                                  setAnnError(null);
                                  setAnnFormOpen(true);
                                }}
                                title="Edit"
                                className={`p-2 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-blue-400 hover:bg-blue-500/10' : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'}`}
                              >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                              <button
                                onClick={() => setAnnDeleteId(a.id)}
                                title="Delete"
                                className="p-2 rounded-lg text-gray-500 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                              >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>{/* end bento grid */}

                {/* Delete confirmation modal */}
                {annDeleteId !== null && (
                  <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className={`rounded-2xl p-6 w-full max-w-sm shadow-2xl border ${isDark ? 'bg-[#161616] border-white/10' : 'bg-white border-gray-200'}`}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </div>
                        <div>
                          <p className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>Delete Announcement</p>
                          <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                            {(() => {
                              const a = announcements.find(x => x.id === annDeleteId);
                              return a ? `"${a.title}"` : 'This announcement';
                            })()} will be permanently removed.
                          </p>
                        </div>
                      </div>
                      {annError && <p className="text-red-500 text-xs mb-3">{annError}</p>}
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
              );
            })()}

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
                      <p className={`text-sm mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-700'}`}>
                        {CURRENT_TERM.label} · {CURRENT_TERM.totalWeeks} weeks
                        {calSelectedArr.length > 0 && (
                          <span className={`ml-2 font-medium ${isDark ? 'text-sky-400' : 'text-sky-600'}`}>· {calSelectedArr.length} date{calSelectedArr.length !== 1 ? 's' : ''} selected</span>
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
                        <span className={`ml-auto text-[10px] font-bold ${c.sub} hidden lg:block`}>Ctrl+click multi · Shift+click range · W# selects week</span>
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
                            <span className={`text-xs font-bold ${c.countBadge} px-2 py-0.5 rounded`}>{blockedDates.length}</span>
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
                                  className={`${c.removeBtn} transition-colors text-xs font-bold px-2 py-1 rounded`}
                                >Remove</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right: Control panel */}
                    <div className="w-full lg:w-64 lg:flex-shrink-0 space-y-3">

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

      <ConfirmModal
        open={confirmModalOpen}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel="Confirm"
        variant="danger"
        errorMessage={confirmModalError || undefined}
        onConfirm={handleConfirmModalExecute}
        onCancel={() => { setConfirmModalOpen(false); setConfirmModalError(''); }}
      />

      {pdfPreviewModal && (
        <DocPreviewModal
          isOpen={!!pdfPreviewModal}
          onClose={() => setPdfPreviewModal(null)}
          title={pdfPreviewModal.title}
          fetchUrl={pdfPreviewModal.fetchUrl}
          token={token ?? ''}
          filename={pdfPreviewModal.filename}
        />
      )}

      <ChatbotWidget token={token} role="admin" />
      <NavigationTour isDark={isDark} role="admin" />
    </div>
  );
}
