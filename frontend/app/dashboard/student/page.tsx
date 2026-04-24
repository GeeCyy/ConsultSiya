'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Schedule = {
  id: number;
  professor_id: number;
  professor_name: string;
  department: string;
  day: string;
  time_start: string;
  time_end: string;
};

type Consultation = {
  id: number;
  professor_name: string;
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
    <div className="w-10 h-10 rounded-full bg-red-950 border border-red-900/50 flex items-center justify-center text-red-300 text-sm font-semibold flex-shrink-0">
      {initials}
    </div>
  );
}

function NavItem({ icon, label, active, count, onClick }: { icon: React.ReactNode; label: string; active: boolean; count?: number; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
        active ? 'bg-[#CC0000] text-white shadow-lg shadow-red-900/30' : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'
      }`}>
      <span className="flex items-center gap-3">{icon}{label}</span>
      {count !== undefined && count > 0 && (
        <span className={`text-xs px-1.5 py-0.5 rounded-md ${active ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-500'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

export default function StudentDashboard() {
  const router = useRouter();
  const [view, setView] = useState<'book' | 'my'>('book');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const [bookingSlotId, setBookingSlotId] = useState<number | null>(null);
  const [bookForm, setBookForm] = useState({ nature_of_advising: '', mode: 'F2F', date: '' });
  const [bookError, setBookError] = useState('');

  useEffect(() => {
    if (!token) { router.push('/login'); return; }
    fetchData();
  }, []);

  const fetchData = async () => {
    const [sched, consult] = await Promise.all([
      api.get('/api/schedules', token!),
      api.get('/api/consultations', token!),
    ]);
    setSchedules(Array.isArray(sched) ? sched : []);
    setConsultations(Array.isArray(consult) ? consult : []);
    setLoading(false);
  };

  const toggleBooking = (id: number) => {
    if (bookingSlotId === id) { setBookingSlotId(null); return; }
    setBookingSlotId(id);
    setBookForm({ nature_of_advising: '', mode: 'F2F', date: '' });
    setBookError('');
  };

  const handleBook = async (schedule: Schedule) => {
    setBookError('');
    if (!bookForm.nature_of_advising || !bookForm.date) { setBookError('Please fill in all fields.'); return; }
    const data = await api.post('/api/consultations', {
      professor_id: schedule.professor_id,
      schedule_id: schedule.id,
      date: bookForm.date,
      nature_of_advising: bookForm.nature_of_advising,
      mode: bookForm.mode,
    }, token!);
    if (data.error) { setBookError(data.error); return; }
    setBookingSlotId(null);
    await fetchData();
    setView('my');
  };

  const handleCancel = async (id: number) => {
    if (!confirm('Cancel this consultation?')) return;
    const data = await api.patch(`/api/consultations/${id}/cancel`, {}, token!);
    if (data.error) { alert(data.error); return; }
    fetchData();
  };

  const handleLogout = () => { localStorage.clear(); router.push('/login'); };

  const activeConsults = consultations.filter(c => c.status === 'pending' || c.status === 'confirmed').length;

  return (
    <div className="flex h-screen bg-[#0c0c0c] overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className="w-60 flex-shrink-0 flex flex-col bg-[#111] border-r border-white/5">
        {/* Brand */}
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
          <span className="text-[10px] font-semibold text-[#CC0000] uppercase tracking-widest">Student</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavItem active={view === 'book'} onClick={() => setView('book')} label="Book a Slot"
            count={schedules.length}
            icon={<svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>}
          />
          <NavItem active={view === 'my'} onClick={() => setView('my')} label="My Consultations"
            count={activeConsults || undefined}
            icon={<svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" /></svg>}
          />
        </nav>

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

        ) : view === 'book' ? (
          <div className="max-w-3xl mx-auto px-8 py-8">
            <div className="mb-7">
              <h1 className="text-white text-2xl font-bold">Book a Consultation</h1>
              <p className="text-gray-500 text-sm mt-1">{schedules.length} slot{schedules.length !== 1 ? 's' : ''} available</p>
            </div>

            {schedules.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-white/5 bg-[#161616]">
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>
                </div>
                <p className="text-gray-400 font-medium text-sm">No slots available</p>
                <p className="text-gray-600 text-xs mt-1">Check back later when professors post their schedules</p>
              </div>
            ) : (
              <div className="space-y-3">
                {schedules.map(s => (
                  <div key={s.id} className="rounded-2xl border border-white/5 bg-[#161616] overflow-hidden hover:border-white/10 transition-colors">
                    <div className="p-5">
                      <div className="flex items-start gap-4">
                        <Avatar name={s.professor_name} />
                        <div className="flex-1">
                          <h3 className="text-white font-semibold text-sm">{s.professor_name}</h3>
                          <p className="text-gray-500 text-xs mt-0.5">{s.department}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-gray-200 text-sm font-medium">{s.day}</p>
                          <p className="text-gray-500 text-xs mt-0.5 font-mono">{s.time_start?.slice(0, 5)} – {s.time_end?.slice(0, 5)}</p>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Available
                        </span>
                        <button onClick={() => toggleBooking(s.id)}
                          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            bookingSlotId === s.id
                              ? 'bg-white/5 text-gray-400'
                              : 'bg-[#CC0000] text-white hover:bg-[#aa0000] shadow-lg shadow-red-900/20'
                          }`}>
                          {bookingSlotId === s.id ? 'Close' : 'Book this slot'}
                        </button>
                      </div>
                    </div>

                    {bookingSlotId === s.id && (
                      <div className="border-t border-white/5 bg-[#0f0f0f] px-5 py-5 space-y-4">
                        <p className="text-white text-sm font-semibold">Booking Details</p>
                        <div>
                          <Label className="text-gray-500 text-xs mb-1.5 block">Nature of Advising</Label>
                          <Input value={bookForm.nature_of_advising}
                            onChange={e => setBookForm(f => ({ ...f, nature_of_advising: e.target.value }))}
                            className="bg-[#1a1a1a] border-white/10 text-white text-sm focus:border-[#CC0000]/50 focus:ring-0 placeholder:text-gray-600"
                            placeholder="e.g. Thesis / Design Subject concerns" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-gray-500 text-xs mb-1.5 block">Mode</Label>
                            <select value={bookForm.mode}
                              onChange={e => setBookForm(f => ({ ...f, mode: e.target.value }))}
                              className="w-full px-3 py-2 rounded-lg text-white text-sm bg-[#1a1a1a] border border-white/10 focus:outline-none focus:border-[#CC0000]/50">
                              <option value="F2F">Face-to-Face (F2F)</option>
                              <option value="OL">Online (OL)</option>
                            </select>
                          </div>
                          <div>
                            <Label className="text-gray-500 text-xs mb-1.5 block">Date</Label>
                            <Input type="date" value={bookForm.date}
                              onChange={e => setBookForm(f => ({ ...f, date: e.target.value }))}
                              className="bg-[#1a1a1a] border-white/10 text-white text-sm focus:border-[#CC0000]/50 focus:ring-0" />
                          </div>
                        </div>
                        {bookError && <p className="text-red-400 text-xs">{bookError}</p>}
                        <div className="flex justify-end">
                          <button onClick={() => handleBook(s)}
                            className="px-4 py-2 rounded-lg text-sm font-medium bg-[#CC0000] text-white hover:bg-[#aa0000] transition-colors shadow-lg shadow-red-900/20">
                            Confirm Booking
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        ) : (
          <div className="max-w-3xl mx-auto px-8 py-8">
            <div className="mb-7">
              <h1 className="text-white text-2xl font-bold">My Consultations</h1>
              <p className="text-gray-500 text-sm mt-1">{consultations.length} total · {activeConsults} active</p>
            </div>

            {consultations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-white/5 bg-[#161616]">
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" /></svg>
                </div>
                <p className="text-gray-400 font-medium text-sm">No consultations yet</p>
                <p className="text-gray-600 text-xs mt-1">Book a slot to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {consultations.map(c => (
                  <div key={c.id} className="rounded-2xl border border-white/5 bg-[#161616] p-5 hover:border-white/10 transition-colors">
                    <div className="flex items-start gap-4">
                      <Avatar name={c.professor_name} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <h3 className="text-white font-semibold text-sm">{c.professor_name}</h3>
                          <StatusBadge status={c.status} />
                        </div>
                        <p className="text-gray-500 text-xs mt-0.5">{c.nature_of_advising}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2.5">
                      <div className="rounded-lg bg-white/3 border border-white/5 px-3 py-2.5">
                        <p className="text-gray-600 text-[10px] uppercase tracking-wide mb-1">Date & Time</p>
                        <p className="text-gray-200 text-sm font-medium">{new Date(c.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                        <p className="text-gray-500 text-xs mt-0.5">{c.day} · {c.time_start?.slice(0, 5)}–{c.time_end?.slice(0, 5)}</p>
                      </div>
                      <div className="rounded-lg bg-white/3 border border-white/5 px-3 py-2.5 flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.mode === 'F2F' ? 'bg-purple-400' : 'bg-cyan-400'}`} />
                        <div>
                          <p className="text-gray-600 text-[10px] uppercase tracking-wide mb-0.5">Mode</p>
                          <p className={`text-sm font-medium ${c.mode === 'F2F' ? 'text-purple-300' : 'text-cyan-300'}`}>
                            {c.mode === 'F2F' ? 'Face-to-Face' : 'Online'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {(c.status === 'pending' || c.status === 'confirmed') && (
                      <div className="mt-3.5 flex justify-end">
                        <button onClick={() => handleCancel(c.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors">
                          Cancel Consultation
                        </button>
                      </div>
                    )}
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
