'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

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
  mode: string;
  status: string;
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

export default function AdminDashboard() {
  const router = useRouter();
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [stats, setStats] = useState({ total: 0, pending: 0, confirmed: 0, completed: 0, cancelled: 0 });
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  useEffect(() => {
    if (!token) { router.push('/login'); return; }
    fetchData();
  }, []);

  const fetchData = async () => {
    const data = await api.get('/api/consultations', token!);
    const list: Consultation[] = Array.isArray(data) ? data : [];
    setConsultations(list);
    setStats({
      total: list.length,
      pending: list.filter(c => c.status === 'pending').length,
      confirmed: list.filter(c => c.status === 'confirmed').length,
      completed: list.filter(c => c.status === 'completed').length,
      cancelled: list.filter(c => c.status === 'cancelled').length,
    });
    setLoading(false);
  };

  const handleLogout = () => { localStorage.clear(); router.push('/login'); };

  const filtered = filter === 'all' ? consultations : consultations.filter(c => c.status === filter);

  const statCards = [
    { key: 'all',       label: 'Total',     value: stats.total,     color: 'text-white',        accent: 'border-white/10',     activeBg: 'bg-white/10' },
    { key: 'pending',   label: 'Pending',   value: stats.pending,   color: 'text-amber-400',    accent: 'border-amber-500/20', activeBg: 'bg-amber-500/10' },
    { key: 'confirmed', label: 'Confirmed', value: stats.confirmed, color: 'text-blue-400',     accent: 'border-blue-500/20',  activeBg: 'bg-blue-500/10' },
    { key: 'completed', label: 'Completed', value: stats.completed, color: 'text-emerald-400',  accent: 'border-emerald-500/20',activeBg: 'bg-emerald-500/10' },
    { key: 'cancelled', label: 'Cancelled', value: stats.cancelled, color: 'text-red-400',      accent: 'border-red-500/20',   activeBg: 'bg-red-500/10' },
  ];

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
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium bg-[#CC0000] text-white shadow-lg shadow-red-900/30">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
            </svg>
            All Consultations
          </button>
        </nav>

        {/* System info */}
        <div className="px-5 py-4 border-t border-white/5 space-y-2">
          <div className="rounded-lg bg-white/3 border border-white/5 px-3 py-2.5">
            <p className="text-gray-600 text-[10px] uppercase tracking-wide">Total Records</p>
            <p className="text-white font-bold text-lg mt-0.5">{stats.total}</p>
          </div>
        </div>

        <div className="px-3 py-4 border-t border-white/5">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:text-gray-200 hover:bg-white/5 transition-all">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1" /></svg>
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
            {/* Header */}
            <div className="mb-7">
              <h1 className="text-white text-2xl font-bold">Overview</h1>
              <p className="text-gray-500 text-sm mt-1">All consultation records across the system</p>
            </div>

            {/* Stat cards — double as filter buttons */}
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

            {/* Filter label */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-gray-600 text-[10px] font-semibold uppercase tracking-widest">
                {filter === 'all' ? 'All Records' : `${filter.charAt(0).toUpperCase() + filter.slice(1)}`} ({filtered.length})
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
          </div>
        )}
      </main>
    </div>
  );
}
