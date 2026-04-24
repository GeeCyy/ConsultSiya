'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const REFERRAL_OPTIONS = [
  'Peer Advising (W501-Intramuros / R203-Makati)',
  'Counseling of Personal Concerns (Center for Guidance and Counseling)',
  'Career Advising (Center for Career Services)',
  'Other Office (Please Specify)',
];

type Consultation = {
  id: number;
  student_name: string;
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
  uploaded_form_path: string | null;
  action_taken: string | null;
  referral: string | null;
  referral_specify: string | null;
};

type Schedule = {
  id: number;
  day: string;
  time_start: string;
  time_end: string;
  is_available: boolean;
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

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className={`rounded-full bg-red-950 border border-red-900/50 flex items-center justify-center text-red-300 font-semibold flex-shrink-0 ${size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'}`}>
      {initials}
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
        active ? 'bg-[#CC0000] text-white shadow-lg shadow-red-900/30' : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'
      }`}>
      {icon}{label}
    </button>
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

export default function ProfessorDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<'consultations' | 'schedules' | 'export' | 'history'>('consultations');
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const [completingId, setCompletingId] = useState<number | null>(null);
  const [completeForm, setCompleteForm] = useState({
    action_taken: '',
    referral: '',
    referral_specify: '',
    remarks: '',
  });
  const [completeError, setCompleteError] = useState('');

  const [newSched, setNewSched] = useState({ day: 'Monday', time_start: '', time_end: '' });
  const [schedError, setSchedError] = useState('');
  const [downloadingForm, setDownloadingForm] = useState<number | null>(null);

  useEffect(() => {
    if (!token) { router.push('/login'); return; }
    fetchAll();
  }, []);

  const fetchAll = async () => {
    const [c, s] = await Promise.all([
      api.get('/api/consultations', token!),
      api.get('/api/schedules/mine', token!),
    ]);
    setConsultations(Array.isArray(c) ? c : []);
    setSchedules(Array.isArray(s) ? s : []);
    setLoading(false);
  };

  const handleConfirm = async (id: number) => {
    const data = await api.patch(`/api/consultations/${id}/confirm`, {}, token!);
    if (data.error) { alert(data.error); return; }
    fetchAll();
  };

  const toggleCompleting = (id: number) => {
    if (completingId === id) { setCompletingId(null); return; }
    setCompletingId(id);
    setCompleteForm({ action_taken: '', referral: '', referral_specify: '', remarks: '' });
    setCompleteError('');
  };

  const handleComplete = async (id: number) => {
    if (!completeForm.action_taken) { setCompleteError('Please select an action taken.'); return; }
    if (completeForm.action_taken === 'Referred to' && !completeForm.referral) {
      setCompleteError('Please select a referral option.'); return;
    }
    if (completeForm.referral === 'Other Office (Please Specify)' && !completeForm.referral_specify.trim()) {
      setCompleteError('Please specify the other office.'); return;
    }
    setCompleteError('');
    const data = await api.patch(`/api/consultations/${id}/complete`, completeForm, token!);
    if (data.error) { setCompleteError(data.error); return; }
    setConsultations(prev => prev.map(c =>
      c.id === id ? { ...c, status: 'completed', action_taken: completeForm.action_taken, referral: completeForm.referral || null } : c
    ));
    setCompletingId(null);
    fetchAll();
  };

  const handleDownloadStudentForm = async (id: number) => {
    setDownloadingForm(id);
    try {
      const res = await fetch(`${API_URL}/api/forms/download/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const e = await res.json(); alert(e.error || 'Download failed.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `student-form-${id}`; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingForm(null);
    }
  };

  const handleAddSchedule = async () => {
    setSchedError('');
    if (!newSched.time_start || !newSched.time_end) { setSchedError('Please fill in all time fields.'); return; }
    const data = await api.post('/api/schedules', newSched, token!);
    if (data.error) { setSchedError(data.error); return; }
    setNewSched({ day: 'Monday', time_start: '', time_end: '' });
    fetchAll();
  };

  const handleDeleteSchedule = async (id: number) => {
    if (!confirm('Delete this schedule slot?')) return;
    const data = await api.delete(`/api/schedules/${id}`, token!);
    if (data.error) { alert(data.error); return; }
    fetchAll();
  };

  const handleExport = async (format: 'excel' | 'pdf') => {
    const endpoint = format === 'excel' ? '/api/reports/excel' : '/api/reports/pdf';
    try {
      const res = await fetch(`${API_URL}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const e = await res.json(); alert(e.error || 'Export failed.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `advising-report.${format === 'excel' ? 'xlsx' : 'pdf'}`; a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Export failed. Please try again.'); }
  };

  const handleLogout = () => { localStorage.clear(); router.push('/login'); };

  const stats = {
    total: consultations.length,
    pending: consultations.filter(c => c.status === 'pending').length,
    completed: consultations.filter(c => c.status === 'completed').length,
  };

  const natureLabel = (c: Consultation) =>
    c.nature_of_advising === 'Others (Please Specify)' && c.nature_of_advising_specify
      ? `Others: ${c.nature_of_advising_specify}`
      : c.nature_of_advising;

  const radioCls = (selected: boolean) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
      selected ? 'bg-[#CC0000]/10 ring-1 ring-[#CC0000]/30 text-white' : 'bg-[#1a1a1a] text-gray-400 hover:bg-white/5'
    }`;

  const radioBtn = (selected: boolean) => (
    <span className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center ${
      selected ? 'border-[#CC0000] bg-[#CC0000]' : 'border-gray-600'
    }`}>
      {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
    </span>
  );

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
          <span className="text-[10px] font-semibold text-[#CC0000] uppercase tracking-widest">Professor</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavItem active={tab === 'consultations'} onClick={() => setTab('consultations')} label="My Consultations"
            icon={<svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" /></svg>}
          />
          <NavItem active={tab === 'schedules'} onClick={() => setTab('schedules')} label="Manage Schedules"
            icon={<svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>}
          />
          <NavItem active={tab === 'export'} onClick={() => setTab('export')} label="Export Report"
            icon={<svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4-4 4m0 0-4-4m4 4V4" /></svg>}
          />
          <NavItem active={tab === 'history'} onClick={() => setTab('history')} label="History"
            icon={<svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>}
          />
        </nav>

        <div className="px-3 py-4 border-t border-white/5">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:text-gray-200 hover:bg-white/5 transition-all">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1" /></svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-8 h-8 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600 text-sm">Loading...</p>
          </div>

        ) : tab === 'consultations' ? (
          <div className="max-w-3xl mx-auto px-8 py-8">
            <div className="mb-7">
              <h1 className="text-white text-2xl font-bold">My Consultations</h1>
              <p className="text-gray-500 text-sm mt-1">Review and manage student consultation requests</p>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-7">
              {[
                { label: 'Total', value: stats.total, color: 'text-white' },
                { label: 'Pending', value: stats.pending, color: 'text-amber-400' },
                { label: 'Completed', value: stats.completed, color: 'text-emerald-400' },
              ].map(s => (
                <div key={s.label} className="rounded-xl border border-white/5 bg-[#161616] px-4 py-3">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-gray-600 text-xs mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {consultations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-white/5 bg-[#161616]">
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" /></svg>
                </div>
                <p className="text-gray-400 font-medium text-sm">No consultations yet</p>
                <p className="text-gray-600 text-xs mt-1">Students will appear here once they book a slot</p>
              </div>
            ) : (
              <div className="space-y-3">
                {consultations.map(c => (
                  <div key={c.id} className="rounded-2xl border border-white/5 bg-[#161616] overflow-hidden transition-colors hover:border-white/10">
                    <div className="p-5">
                      <div className="flex items-start gap-4">
                        <Avatar name={c.student_name} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <h3 className="text-white font-semibold text-sm">{c.student_name}</h3>
                            <StatusBadge status={c.status} />
                          </div>
                          <p className="text-gray-500 text-xs mt-0.5">{c.student_number} · {c.program}</p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2.5">
                        <div className="rounded-lg bg-white/3 border border-white/5 px-3 py-2.5">
                          <p className="text-gray-600 text-[10px] uppercase tracking-wide mb-1">Date & Time</p>
                          <p className="text-gray-200 text-sm font-medium">{new Date(c.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                          <p className="text-gray-500 text-xs mt-0.5">{c.day} · {c.time_start?.slice(0, 5)}–{c.time_end?.slice(0, 5)}</p>
                        </div>
                        <div className="rounded-lg bg-white/3 border border-white/5 px-3 py-2.5">
                          <p className="text-gray-600 text-[10px] uppercase tracking-wide mb-1">Nature of Advising</p>
                          <p className="text-gray-200 text-sm line-clamp-2">{natureLabel(c)}</p>
                        </div>
                      </div>

                      <div className="mt-3.5 flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs ${c.mode === 'F2F' ? 'text-purple-400' : 'text-cyan-400'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${c.mode === 'F2F' ? 'bg-purple-400' : 'bg-cyan-400'}`} />
                            {c.mode === 'F2F' ? 'Face-to-Face' : 'Online'}
                          </span>

                          {/* Download student's uploaded form */}
                          {c.uploaded_form_path && (
                            <button
                              onClick={() => handleDownloadStudentForm(c.id)}
                              disabled={downloadingForm === c.id}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20 hover:bg-blue-500/20 transition-colors disabled:opacity-50">
                              {downloadingForm === c.id ? (
                                <span className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0-3-3m3 3 3-3M3 17V7a2 2 0 0 1 2-2h6l2 2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                              )}
                              Student Form
                            </button>
                          )}
                        </div>

                        {(c.status === 'pending' || c.status === 'confirmed') && (
                          <div className="flex items-center gap-2">
                            {c.status === 'pending' && (
                              <button onClick={() => handleConfirm(c.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">
                                Confirm
                              </button>
                            )}
                            <button onClick={() => toggleCompleting(c.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${completingId === c.id ? 'bg-white/5 text-gray-400' : 'bg-[#CC0000]/10 text-[#ff5555] hover:bg-[#CC0000]/20'}`}>
                              {completingId === c.id ? 'Close' : 'Mark Completed'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Completion form */}
                    {completingId === c.id && (
                      <div className="border-t border-white/5 bg-[#0f0f0f] px-5 py-5 space-y-4">
                        <p className="text-white text-sm font-semibold">Completion Details</p>

                        {/* Action Taken */}
                        <div>
                          <p className="text-gray-500 text-xs mb-2">Action Taken</p>
                          <div className="space-y-1.5">
                            {['Resolved', 'For Follow-up', 'Referred to'].map(opt => (
                              <label key={opt} className={radioCls(completeForm.action_taken === opt)}>
                                {radioBtn(completeForm.action_taken === opt)}
                                {opt}
                                <input type="radio" className="sr-only"
                                  checked={completeForm.action_taken === opt}
                                  onChange={() => { setCompleteForm(f => ({ ...f, action_taken: opt, referral: '', referral_specify: '' })); setCompleteError(''); }} />
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* Referral sub-choices */}
                        {completeForm.action_taken === 'Referred to' && (
                          <div>
                            <p className="text-gray-500 text-xs mb-2">Referred To</p>
                            <div className="space-y-1.5">
                              {REFERRAL_OPTIONS.map(opt => (
                                <label key={opt} className={radioCls(completeForm.referral === opt)}>
                                  {radioBtn(completeForm.referral === opt)}
                                  {opt}
                                  <input type="radio" className="sr-only"
                                    checked={completeForm.referral === opt}
                                    onChange={() => { setCompleteForm(f => ({ ...f, referral: opt, referral_specify: '' })); setCompleteError(''); }} />
                                </label>
                              ))}
                            </div>
                            {completeForm.referral === 'Other Office (Please Specify)' && (
                              <input
                                className="mt-2 w-full rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-[#CC0000]/50 placeholder-gray-600"
                                placeholder="Please specify the office…"
                                value={completeForm.referral_specify}
                                onChange={e => { setCompleteForm(f => ({ ...f, referral_specify: e.target.value })); setCompleteError(''); }}
                              />
                            )}
                          </div>
                        )}

                        {/* Remarks */}
                        <div>
                          <Label className="text-gray-500 text-xs mb-1.5 block">Remarks (optional)</Label>
                          <textarea
                            value={completeForm.remarks}
                            onChange={e => setCompleteForm(f => ({ ...f, remarks: e.target.value }))}
                            rows={2}
                            className="w-full rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-[#CC0000]/50 resize-none placeholder-gray-600"
                            placeholder="Additional remarks…"
                          />
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          {completeError
                            ? <p className="text-red-400 text-xs flex-1">{completeError}</p>
                            : <span />
                          }
                          <button onClick={() => handleComplete(c.id)}
                            className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors flex-shrink-0">
                            Submit & Mark Completed
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        ) : tab === 'schedules' ? (
          <div className="max-w-3xl mx-auto px-8 py-8">
            <div className="mb-7">
              <h1 className="text-white text-2xl font-bold">Manage Schedules</h1>
              <p className="text-gray-500 text-sm mt-1">Add or remove your available consultation time slots</p>
            </div>

            <div className="rounded-2xl border border-white/5 bg-[#161616] p-5 mb-6">
              <p className="text-white text-sm font-semibold mb-4">Add New Slot</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-gray-500 text-xs mb-1.5 block">Day</Label>
                  <select value={newSched.day} onChange={e => setNewSched(s => ({ ...s, day: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-white text-sm bg-[#0f0f0f] border border-white/10 focus:outline-none focus:border-[#CC0000]/50">
                    {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-gray-500 text-xs mb-1.5 block">Start Time</Label>
                  <Input type="time" value={newSched.time_start}
                    onChange={e => setNewSched(s => ({ ...s, time_start: e.target.value }))}
                    className="bg-[#0f0f0f] border-white/10 text-white text-sm focus:border-[#CC0000]/50 focus:ring-0" />
                </div>
                <div>
                  <Label className="text-gray-500 text-xs mb-1.5 block">End Time</Label>
                  <Input type="time" value={newSched.time_end}
                    onChange={e => setNewSched(s => ({ ...s, time_end: e.target.value }))}
                    className="bg-[#0f0f0f] border-white/10 text-white text-sm focus:border-[#CC0000]/50 focus:ring-0" />
                </div>
              </div>
              {schedError && <p className="text-red-400 text-xs mt-2">{schedError}</p>}
              <button onClick={handleAddSchedule}
                className="mt-4 px-4 py-2 rounded-lg text-sm font-medium bg-[#CC0000] text-white hover:bg-[#aa0000] transition-colors shadow-lg shadow-red-900/20">
                Add Slot
              </button>
            </div>

            <p className="text-gray-600 text-[10px] font-semibold uppercase tracking-widest mb-3">Your Slots ({schedules.length})</p>
            {schedules.length === 0 ? (
              <div className="text-center py-12 rounded-2xl border border-white/5 bg-[#161616]">
                <p className="text-gray-500 text-sm">No slots yet. Add one above.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {schedules.map(s => (
                  <div key={s.id} className="flex items-center justify-between px-4 py-3.5 rounded-xl border border-white/5 bg-[#161616] hover:border-white/10 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.is_available ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      <span className="text-white text-sm font-medium w-24">{s.day}</span>
                      <span className="text-gray-400 text-sm font-mono">{s.time_start?.slice(0, 5)} – {s.time_end?.slice(0, 5)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs ${s.is_available ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {s.is_available ? 'Available' : 'Booked'}
                      </span>
                      <button onClick={() => handleDeleteSchedule(s.id)}
                        className="px-2.5 py-1 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors">
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        ) : tab === 'history' ? (
          <div className="max-w-4xl mx-auto px-8 py-8">
            <div className="mb-7">
              <h1 className="text-white text-2xl font-bold">History</h1>
              <p className="text-gray-500 text-sm mt-1">Past advising records grouped by term</p>
            </div>
            {(() => {
              const historyItems = consultations.filter(c => c.status === 'completed' || c.status === 'cancelled');
              const natureLabel = (c: Consultation) =>
                c.nature_of_advising === 'Others (Please Specify)' && c.nature_of_advising_specify
                  ? `Others: ${c.nature_of_advising_specify}`
                  : c.nature_of_advising;
              if (historyItems.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-white/5 bg-[#161616]">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                      <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>
                    </div>
                    <p className="text-gray-400 font-medium text-sm">No history yet</p>
                    <p className="text-gray-600 text-xs mt-1">Completed advising sessions will appear here</p>
                  </div>
                );
              }
              return (
                <div className="space-y-8">
                  {groupByQuarter(historyItems).map(([quarter, items]) => (
                    <div key={quarter}>
                      <div className="flex items-center gap-3 mb-3">
                        <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-widest">{quarter}</p>
                        <span className="text-gray-700 text-xs">{items.length} session{items.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="rounded-2xl border border-white/5 bg-[#161616] overflow-hidden">
                        <table className="w-full table-fixed">
                          <thead>
                            <tr className="border-b border-white/5">
                              <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[110px]">Date</th>
                              <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[160px]">Student</th>
                              <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Purpose</th>
                              <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[170px]">Action Taken</th>
                              <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[100px]">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {items.map(c => (
                              <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                                <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">
                                  {new Date(c.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </td>
                                <td className="px-4 py-3 text-gray-300 text-xs">
                                  <p className="truncate font-medium">{c.student_name}</p>
                                  <p className="text-gray-600 text-[10px] mt-0.5">{c.student_number}</p>
                                </td>
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
          </div>

        ) : (
          <div className="max-w-3xl mx-auto px-8 py-8">
            <div className="mb-7">
              <h1 className="text-white text-2xl font-bold">Export Report</h1>
              <p className="text-gray-500 text-sm mt-1">Download your faculty academic advising report</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => handleExport('excel')}
                className="rounded-2xl border border-white/5 bg-[#161616] hover:border-emerald-500/20 hover:bg-emerald-500/5 p-6 text-left transition-all group">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4 group-hover:bg-emerald-500/20 transition-colors">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2z" />
                  </svg>
                </div>
                <p className="text-white font-semibold text-sm">Excel Spreadsheet</p>
                <p className="text-gray-600 text-xs mt-1">Download full data as .xlsx</p>
              </button>
              <button onClick={() => handleExport('pdf')}
                className="rounded-2xl border border-white/5 bg-[#161616] hover:border-blue-500/20 hover:bg-blue-500/5 p-6 text-left transition-all group">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
                  <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 0 0 2-2V9.414a1 1 0 0 0-.293-.707l-5.414-5.414A1 1 0 0 0 12.586 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z" />
                  </svg>
                </div>
                <p className="text-white font-semibold text-sm">PDF Document</p>
                <p className="text-gray-600 text-xs mt-1">Download formatted report as .pdf</p>
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
