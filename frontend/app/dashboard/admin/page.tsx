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
};

type Professor = {
  id: number;
  full_name: string;
  department: string;
  consultation_count: number;
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { ring: string; text: string; dot: string; label: string }> = {
    pending:   { ring: 'ring-amber-500/30',   text: 'text-amber-400',   dot: 'bg-amber-400',   label: 'Pending' },
    confirmed: { ring: 'ring-blue-500/30',    text: 'text-blue-400',    dot: 'bg-blue-400',    label: 'Confirmed' },
    completed: { ring: 'ring-emerald-500/30', text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'Completed' },
    cancelled: { ring: 'ring-red-500/30',     text: 'text-red-400',     dot: 'bg-red-400',     label: 'Cancelled' },
  };
  const s = styles[status] ?? { ring: 'ring-gray-500/30', text: 'text-gray-400', dot: 'bg-gray-400', label: status };
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

function actionLabel(action_taken: string | null, referral: string | null, referral_specify: string | null): string {
  if (!action_taken) return '—';
  if (action_taken === 'Referred to' && referral) {
    if (referral === 'Other Office (Please Specify)' && referral_specify) return `Referred to: ${referral_specify}`;
    return `Referred to: ${referral.split(' (')[0]}`;
  }
  return action_taken;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<'consultations' | 'schedules' | 'reports' | 'history'>('consultations');
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [stats, setStats] = useState({ total: 0, pending: 0, confirmed: 0, completed: 0, cancelled: 0 });
  const [exporting, setExporting] = useState<string | null>(null);
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  useEffect(() => {
    if (!token) { router.push('/login'); return; }
    fetchAll();
  }, []);

  const fetchAll = async () => {
    const [consultData, schedData, profData] = await Promise.all([
      api.get('/api/consultations', token!),
      api.get('/api/schedules/all', token!),
      api.get('/api/reports/professors', token!),
    ]);

    const list: Consultation[] = Array.isArray(consultData) ? consultData : [];
    setConsultations(list);
    setStats({
      total: list.length,
      pending: list.filter(c => c.status === 'pending').length,
      confirmed: list.filter(c => c.status === 'confirmed').length,
      completed: list.filter(c => c.status === 'completed').length,
      cancelled: list.filter(c => c.status === 'cancelled').length,
    });

    setSchedules(Array.isArray(schedData) ? schedData : []);
    setProfessors(Array.isArray(profData) ? profData : []);
    setLoading(false);
  };

  const handleLogout = () => { localStorage.clear(); router.push('/login'); };

  const handleDownload = async (url: string, filename: string, key: string) => {
    setExporting(key);
    try {
      const res = await fetch(`${API_URL}${url}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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

  const filtered = filter === 'all' ? consultations : consultations.filter(c => c.status === filter);

  // Group schedules by professor
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
    { key: 'completed', label: 'Completed', value: stats.completed, color: 'text-emerald-400', accent: 'border-emerald-500/20',activeBg: 'bg-emerald-500/10' },
    { key: 'cancelled', label: 'Cancelled', value: stats.cancelled, color: 'text-red-400',     accent: 'border-red-500/20',    activeBg: 'bg-red-500/10' },
  ];

  const navItems = [
    {
      key: 'consultations',
      label: 'Consultations',
      count: stats.total,
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
        </svg>
      ),
    },
    {
      key: 'schedules',
      label: 'Schedules',
      count: schedules.length,
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
        </svg>
      ),
    },
    {
      key: 'reports',
      label: 'Reports',
      count: professors.length,
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0-3-3m3 3 3-3M3 17V7a2 2 0 0 1 2-2h6l2 2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
      ),
    },
    {
      key: 'history',
      label: 'History',
      count: consultations.filter(c => c.status === 'completed' || c.status === 'cancelled').length,
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
        </svg>
      ),
    },
  ] as const;

  return (
    <div className="flex h-screen bg-[#0c0c0c] overflow-hidden">

      {/* ── Sidebar ── */}
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
              <span className="flex items-center gap-3">
                {item.icon}
                {item.label}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded-md ${
                tab === item.key ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-600'
              }`}>
                {item.count}
              </span>
            </button>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-white/5 space-y-2">
          <div className="rounded-lg bg-white/3 border border-white/5 px-3 py-2.5">
            <p className="text-gray-600 text-[10px] uppercase tracking-wide">Total Records</p>
            <p className="text-white font-bold text-lg mt-0.5">{stats.total}</p>
          </div>
        </div>

        <div className="px-3 py-4 border-t border-white/5">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:text-gray-200 hover:bg-white/5 transition-all">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-8 h-8 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600 text-sm">Loading...</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-8 py-8">

            {/* ── Consultations tab ── */}
            {tab === 'consultations' && (
              <>
                <div className="mb-7">
                  <h1 className="text-white text-2xl font-bold">Overview</h1>
                  <p className="text-gray-500 text-sm mt-1">All consultation records across the system</p>
                </div>

                <div className="grid grid-cols-5 gap-3 mb-8">
                  {statCards.map(s => (
                    <button key={s.key} onClick={() => setFilter(s.key)}
                      className={`rounded-2xl border p-4 text-left transition-all ${
                        filter === s.key
                          ? `${s.activeBg} ${s.accent}`
                          : 'bg-[#161616] border-white/5 hover:border-white/10'
                      }`}>
                      <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-gray-600 text-xs mt-1">{s.label}</p>
                      {filter === s.key && <div className={`w-4 h-0.5 rounded-full mt-2 ${s.color.replace('text-', 'bg-')}`} />}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between mb-4">
                  <p className="text-gray-600 text-[10px] font-semibold uppercase tracking-widest">
                    {filter === 'all' ? 'All Records' : filter.charAt(0).toUpperCase() + filter.slice(1)} ({filtered.length})
                  </p>
                  {filter !== 'all' && (
                    <button onClick={() => setFilter('all')} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                      Clear filter ×
                    </button>
                  )}
                </div>

                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-white/5 bg-[#161616]">
                    <p className="text-gray-400 font-medium text-sm">No records found</p>
                    <p className="text-gray-600 text-xs mt-1">No consultations match this filter</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {filtered.map(c => (
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
                                  <span className="text-gray-600 text-xs">·</span>
                                  <span className="text-gray-500 text-xs">{c.program}</span>
                                </div>
                                <p className="text-gray-600 text-xs mt-0.5">with {c.professor_name}</p>
                              </div>
                              <StatusBadge status={c.status} />
                            </div>
                            <div className="mt-3 flex flex-wrap gap-4">
                              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" /></svg>
                                {new Date(c.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                <span className="text-gray-700">·</span>
                                {c.day} {c.time_start?.slice(0, 5)}–{c.time_end?.slice(0, 5)}
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" /></svg>
                                {c.nature_of_advising}
                              </div>
                              <span className={`inline-flex items-center gap-1 text-xs ${c.mode === 'F2F' ? 'text-purple-400' : 'text-cyan-400'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${c.mode === 'F2F' ? 'bg-purple-400' : 'bg-cyan-400'}`} />
                                {c.mode === 'F2F' ? 'Face-to-Face' : 'Online'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── Schedules tab ── */}
            {tab === 'schedules' && (
              <>
                <div className="mb-7">
                  <h1 className="text-white text-2xl font-bold">Schedules</h1>
                  <p className="text-gray-500 text-sm mt-1">All professor availability slots</p>
                </div>

                {Object.keys(schedulesByProf).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-white/5 bg-[#161616]">
                    <p className="text-gray-400 font-medium text-sm">No schedules found</p>
                    <p className="text-gray-600 text-xs mt-1">No professors have set up availability slots yet</p>
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
                                <div className="flex items-center gap-3 text-sm text-gray-400">
                                  <span className="text-gray-300 font-medium w-24">{slot.day}</span>
                                  <span>{slot.time_start?.slice(0, 5)} – {slot.time_end?.slice(0, 5)}</span>
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

            {/* ── Reports tab ── */}
            {tab === 'reports' && (
              <>
                <div className="mb-7">
                  <h1 className="text-white text-2xl font-bold">Reports</h1>
                  <p className="text-gray-500 text-sm mt-1">Download advising reports per professor or combined</p>
                </div>

                {/* Combined download */}
                <div className="rounded-2xl border border-white/5 bg-[#161616] px-5 py-4 mb-6">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-white font-semibold text-sm">All Professors — Combined Report</p>
                      <p className="text-gray-600 text-xs mt-0.5">One file with all {professors.length} professor{professors.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDownload('/api/reports/excel?professor_id=all', 'advising-report-all.xlsx', 'all-excel')}
                        disabled={exporting === 'all-excel'}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                        {exporting === 'all-excel' ? (
                          <span className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0-3-3m3 3 3-3M3 17V7a2 2 0 0 1 2-2h6l2 2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                        )}
                        Excel
                      </button>
                      <button
                        onClick={() => handleDownload('/api/reports/pdf?professor_id=all', 'advising-report-all.pdf', 'all-pdf')}
                        disabled={exporting === 'all-pdf'}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 ring-1 ring-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50">
                        {exporting === 'all-pdf' ? (
                          <span className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0-3-3m3 3 3-3M3 17V7a2 2 0 0 1 2-2h6l2 2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                        )}
                        PDF
                      </button>
                    </div>
                  </div>
                </div>

                {/* Per-professor list */}
                <p className="text-gray-600 text-[10px] font-semibold uppercase tracking-widest mb-3">By Professor</p>

                {professors.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-white/5 bg-[#161616]">
                    <p className="text-gray-400 font-medium text-sm">No professors found</p>
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
                              <p className="text-gray-600 text-xs mt-0.5">
                                {prof.department} · {prof.consultation_count} consultation{Number(prof.consultation_count) !== 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDownload(
                                `/api/reports/excel?professor_id=${prof.id}`,
                                `advising-report-${prof.full_name}.xlsx`,
                                `excel-${prof.id}`
                              )}
                              disabled={exporting === `excel-${prof.id}`}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                              {exporting === `excel-${prof.id}` ? (
                                <span className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0-3-3m3 3 3-3M3 17V7a2 2 0 0 1 2-2h6l2 2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                              )}
                              Excel
                            </button>
                            <button
                              onClick={() => handleDownload(
                                `/api/reports/pdf?professor_id=${prof.id}`,
                                `advising-report-${prof.full_name}.pdf`,
                                `pdf-${prof.id}`
                              )}
                              disabled={exporting === `pdf-${prof.id}`}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 ring-1 ring-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50">
                              {exporting === `pdf-${prof.id}` ? (
                                <span className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0-3-3m3 3 3-3M3 17V7a2 2 0 0 1 2-2h6l2 2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                              )}
                              PDF
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── History tab ── */}
            {tab === 'history' && (
              <>
                <div className="mb-7">
                  <h1 className="text-white text-2xl font-bold">History</h1>
                  <p className="text-gray-500 text-sm mt-1">All past consultation records grouped by term</p>
                </div>
                {(() => {
                  const historyItems = consultations.filter(c => c.status === 'completed' || c.status === 'cancelled');
                  const natureLabel = (c: Consultation) =>
                    c.nature_of_advising === 'Others (Please Specify)' && c.nature_of_advising_specify
                      ? `Others: ${c.nature_of_advising_specify}`
                      : c.nature_of_advising;
                  if (historyItems.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-white/5 bg-[#161616]">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>
                        </div>
                        <p className="text-gray-400 font-medium text-sm">No history yet</p>
                        <p className="text-gray-600 text-xs mt-1">Completed and cancelled consultations will appear here</p>
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
                                  <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[105px]">Date</th>
                                  <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[140px]">Student</th>
                                  <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[140px]">Adviser</th>
                                  <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Purpose</th>
                                  <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[155px]">Action Taken</th>
                                  <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[95px]">Status</th>
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
