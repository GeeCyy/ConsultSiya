'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

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
  email: string;
  role: 'student' | 'professor';
  is_approved: boolean;
  created_at: string;
  full_name: string;
  student_number?: string;
  program?: string;
  year_level?: number;
  department?: string;
};

type AdminUser = {
  id: number;
  email: string;
  role: string;
  created_at: string;
};

const STATUS_STYLES: Record<string, { ring: string; text: string; dot: string; label: string }> = {
  pending:     { ring: 'ring-amber-500/30',   text: 'text-amber-400',   dot: 'bg-amber-400',   label: 'Pending' },
  confirmed:   { ring: 'ring-blue-500/30',    text: 'text-blue-400',    dot: 'bg-blue-400',    label: 'Confirmed' },
  completed:   { ring: 'ring-emerald-500/30', text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'Completed' },
  cancelled:   { ring: 'ring-red-500/30',     text: 'text-red-400',     dot: 'bg-red-400',     label: 'Cancelled' },
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

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-red-950 border border-red-900/50 flex items-center justify-center text-red-300 text-xs font-semibold flex-shrink-0">
      {initials}
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

type Tab = 'consultations' | 'accounts' | 'schedules' | 'reports' | 'history';
type ReportPeriod = '' | 'week' | 'year' | 'semester';

export default function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('consultations');
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

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('consultsiya-theme') !== 'light';
    return true;
  });

  const toggleTheme = () => {
    setIsDark(d => {
      const next = !d;
      localStorage.setItem('consultsiya-theme', next ? 'dark' : 'light');
      return next;
    });
  };

  const stats = {
    total: consultations.length,
    pending: consultations.filter(c => c.status === 'pending').length,
    confirmed: consultations.filter(c => c.status === 'confirmed').length,
    completed: consultations.filter(c => c.status === 'completed').length,
  };

  useEffect(() => {
    if (!token) { router.push('/login'); return; }
    fetchAll();
  }, []);

  const fetchAll = async () => {
    const [consultData, schedData, profData, usersData, adminsData] = await Promise.all([
      api.get('/api/consultations', token!),
      api.get('/api/schedules/all', token!),
      api.get('/api/reports/professors', token!),
      api.get('/api/admin/users', token!),
      api.get('/api/admin/admins', token!),
    ]);

    const list: Consultation[] = Array.isArray(consultData) ? consultData : [];
    setConsultations(list);
    setSchedules(Array.isArray(schedData) ? schedData : []);
    setProfessors(Array.isArray(profData) ? profData : []);
    setUsers(Array.isArray(usersData) ? usersData : []);
    setAdmins(Array.isArray(adminsData) ? adminsData : []);
    setLoading(false);
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
    if (!confirm('Reject this account? The user will be unable to log in.')) return;
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

  // Filtered consultations
  const filteredConsultations = consultations.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
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
  });

  const filteredUsers = users.filter(u => {
    if (accountRoleFilter !== 'all' && u.role !== accountRoleFilter) return false;
    return true;
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

  const statCards = [
    { key: 'all',       label: 'Total',     value: stats.total,     color: 'text-white',       accent: 'border-white/10',      activeBg: 'bg-white/10' },
    { key: 'pending',   label: 'Pending',   value: stats.pending,   color: 'text-amber-400',   accent: 'border-amber-500/20',  activeBg: 'bg-amber-500/10' },
    { key: 'confirmed', label: 'Confirmed', value: stats.confirmed, color: 'text-blue-400',    accent: 'border-blue-500/20',   activeBg: 'bg-blue-500/10' },
    { key: 'completed', label: 'Completed', value: stats.completed, color: 'text-emerald-400', accent: 'border-emerald-500/20', activeBg: 'bg-emerald-500/10' },
  ];

  const navItems: { key: Tab; label: string; count?: number; icon: React.ReactNode }[] = [
    {
      key: 'consultations',
      label: 'Consultations',
      count: stats.total,
      icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" /></svg>,
    },
    {
      key: 'accounts',
      label: 'Accounts',
      count: pendingUsers.length || undefined,
      icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 0 0-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 0 1 5.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 0 1 9.288 0M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" /></svg>,
    },
    {
      key: 'schedules',
      label: 'Schedules',
      count: schedules.length,
      icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" /></svg>,
    },
    {
      key: 'reports',
      label: 'Reports',
      count: professors.length,
      icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0-3-3m3 3 3-3M3 17V7a2 2 0 0 1 2-2h6l2 2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>,
    },
    {
      key: 'history',
      label: 'History',
      count: consultations.filter(c => c.status === 'completed').length,
      icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>,
    },
  ];

  const inputCls = 'w-full px-3 py-2 rounded-lg text-white text-sm bg-[#0f0f0f] border border-white/10 focus:outline-none focus:border-[#CC0000]/50 placeholder-gray-600';

  return (
    <div data-theme={isDark ? 'dark' : 'light'} className="flex h-screen bg-[#0c0c0c] overflow-hidden">

      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 flex flex-col bg-[#111] border-r border-white/5">
        <div className="px-5 py-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#CC0000] flex items-center justify-center shadow-lg shadow-red-900/40">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-none">ConsultSiya</p>
              <p className="text-gray-600 text-xs mt-0.5">Mapúa SOIT</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-white/5">
          <span className="text-[10px] font-semibold text-[#CC0000] uppercase tracking-widest">Administrator</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(item => (
            <button key={item.key} onClick={() => setTab(item.key)}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                tab === item.key
                  ? 'bg-[#CC0000] text-white shadow-lg shadow-red-900/30'
                  : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'
              }`}>
              <span className="flex items-center gap-3">{item.icon}{item.label}</span>
              {item.count !== undefined && (
                <span className={`text-xs px-1.5 py-0.5 rounded-md ${
                  tab === item.key ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-600'
                }`}>
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-white/5 space-y-1">
          <button onClick={toggleTheme} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:text-gray-200 hover:bg-white/5 transition-all">
            {isDark ? (
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364-.707-.707M6.343 6.343l-.707-.707m12.728 0-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" /></svg>
            ) : (
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 0 1 8.646 3.646 9.003 9.003 0 0 0 12 21a9.003 9.003 0 0 0 8.354-5.646z" /></svg>
            )}
            {isDark ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:text-gray-200 hover:bg-white/5 transition-all">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-[#0c0c0c]">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-8 h-8 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600 text-sm">Loading...</p>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto px-8 py-8">

            {/* ── Consultations ── */}
            {tab === 'consultations' && (
              <>
                <div className="mb-7">
                  <h1 className="text-white text-2xl font-bold">Overview</h1>
                  <p className="text-gray-500 text-sm mt-1">All consultation records across the system</p>
                </div>

                <div className="grid grid-cols-4 gap-3 mb-6">
                  {statCards.map(s => (
                    <button key={s.key} onClick={() => setStatusFilter(s.key)}
                      className={`rounded-2xl border p-4 text-left transition-all ${
                        statusFilter === s.key ? `${s.activeBg} ${s.accent}` : 'bg-[#161616] border-white/5 hover:border-white/10'
                      }`}>
                      <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-gray-600 text-xs mt-1">{s.label}</p>
                    </button>
                  ))}
                </div>

                {/* Search */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="relative flex-1">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" /></svg>
                    <input
                      type="text"
                      placeholder="Search by name, date, or ID…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-lg text-white text-sm bg-[#161616] border border-white/5 focus:outline-none focus:border-[#CC0000]/30 placeholder-gray-600"
                    />
                  </div>
                  {statusFilter !== 'all' && (
                    <button onClick={() => setStatusFilter('all')} className="text-xs text-gray-500 hover:text-gray-300 whitespace-nowrap">
                      Clear filter ×
                    </button>
                  )}
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
                                {c.day} {c.time_start?.slice(0, 5)}–{c.time_end?.slice(0, 5)}
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
                <div className="mb-7 flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-white text-2xl font-bold">Account Management</h1>
                    <p className="text-gray-500 text-sm mt-1">Approve registrations, add or remove accounts</p>
                  </div>
                  <button onClick={() => setShowAddUser(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#CC0000] text-white hover:bg-[#aa0000] transition-colors shadow-lg shadow-red-900/20 flex-shrink-0">
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
                        className="text-xs text-[#CC0000] hover:text-red-400 transition-colors">
                        Promote user to admin →
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {admins.map(a => (
                      <div key={a.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#CC0000]/5 ring-1 ring-[#CC0000]/20">
                        <div className="flex items-center gap-3">
                          <Avatar name={a.email} />
                          <div>
                            <p className="text-white text-sm font-medium">{a.email}</p>
                            <p className="text-gray-600 text-xs">Admin · since {new Date(a.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <span className="text-[10px] text-[#CC0000] font-semibold uppercase tracking-wide">Admin</span>
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
                        <div key={u.id} className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-3">
                            <Avatar name={u.full_name || u.email} />
                            <div>
                              <p className="text-white text-sm font-medium">{u.full_name}</p>
                              <p className="text-gray-500 text-xs">{u.email} · {u.role}</p>
                              {u.role === 'student' && u.student_number && (
                                <p className="text-gray-600 text-xs">{u.student_number} {u.program ? `· ${u.program}` : ''}</p>
                              )}
                              {u.role === 'professor' && u.department && (
                                <p className="text-gray-600 text-xs">{u.department}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleApprove(u.id)}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                              Approve
                            </button>
                            <button onClick={() => handleReject(u.id)}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
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
                      <div key={u.id} className="rounded-xl border border-white/5 bg-[#161616] px-4 py-3 flex items-center justify-between gap-3 flex-wrap hover:border-white/10 transition-colors">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.full_name || u.email} />
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-white text-sm font-medium">{u.full_name}</p>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                u.role === 'professor' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'
                              }`}>
                                {u.role}
                              </span>
                            </div>
                            <p className="text-gray-500 text-xs">{u.email}</p>
                            {u.role === 'student' && u.student_number && (
                              <p className="text-gray-600 text-xs">{u.student_number}{u.program ? ` · ${u.program}` : ''}</p>
                            )}
                            {u.role === 'professor' && u.department && (
                              <p className="text-gray-600 text-xs">{u.department}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {u.is_approved ? (
                            <span className="text-xs text-emerald-500 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Approved
                            </span>
                          ) : (
                            <span className="text-xs text-amber-500 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Pending
                            </span>
                          )}
                          {!u.is_approved && (
                            <button onClick={() => handleApprove(u.id)}
                              className="px-2.5 py-1 rounded-lg text-xs text-emerald-400 hover:bg-emerald-500/10 transition-colors">
                              Approve
                            </button>
                          )}
                          <button onClick={() => handleDeleteUser(u.id, u.full_name)}
                            className="px-2.5 py-1 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors">
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
                                addForm.role === r ? 'bg-[#CC0000] text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
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
                            className="flex-1 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 transition-colors">Cancel</button>
                          <button onClick={handleAddUser} disabled={addLoading}
                            className="flex-1 py-2 rounded-lg text-sm font-medium bg-[#CC0000] text-white hover:bg-[#aa0000] transition-colors disabled:opacity-50">
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
                          className="flex-1 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 transition-colors">Cancel</button>
                        <button onClick={handleTransferAdmin}
                          className="flex-1 py-2 rounded-lg text-sm font-medium bg-[#CC0000] text-white hover:bg-[#aa0000] transition-colors">
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
                <div className="mb-7">
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
                              <div key={slot.id} className="px-5 py-3 flex items-center justify-between">
                                <div className="flex items-center gap-4 text-sm text-gray-400">
                                  <span className="text-gray-300 font-medium w-24">{slot.day}</span>
                                  <span className="font-mono">{slot.time_start?.slice(0, 5)} – {slot.time_end?.slice(0, 5)}</span>
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
                <div className="mb-7">
                  <h1 className="text-white text-2xl font-bold">Reports</h1>
                  <p className="text-gray-500 text-sm mt-1">Download advising reports per professor or combined</p>
                </div>

                {/* Time period filter */}
                <div className="flex items-center gap-2 mb-6">
                  <p className="text-gray-600 text-xs mr-1">Period:</p>
                  {([['', 'All Time'], ['week', 'This Week'], ['semester', 'This Semester'], ['year', 'This Year']] as [ReportPeriod, string][]).map(([val, label]) => (
                    <button key={val} onClick={() => setReportPeriod(val)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        reportPeriod === val ? 'bg-[#CC0000] text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200'
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
                <div className="mb-7">
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
                            <table className="w-full table-fixed">
                              <thead>
                                <tr className="border-b border-white/5">
                                  <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[100px]">Date</th>
                                  <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[130px]">Student</th>
                                  <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[130px]">Adviser</th>
                                  <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Purpose</th>
                                  <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[145px]">Action Taken</th>
                                  <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[100px]">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                {items.map(c => (
                                  <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">
                                      {new Date(c.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </td>
                                    <td className="px-4 py-3 text-gray-300 text-xs truncate">{c.student_name}</td>
                                    <td className="px-4 py-3 text-gray-300 text-xs truncate">{c.professor_name}</td>
                                    <td className="px-4 py-3 text-gray-400 text-xs">
                                      <span className="line-clamp-2">{natureLabel(c)}</span>
                                    </td>
                                    <td className="px-4 py-3 text-gray-400 text-xs">
                                      <span className="line-clamp-2">{actionLabel(c.action_taken, c.referral, c.referral_specify)}</span>
                                    </td>
                                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </>
            )}

          </div>
        )}
      </main>
    </div>
  );
}
