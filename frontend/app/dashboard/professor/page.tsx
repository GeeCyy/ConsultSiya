'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
  mode: string;
  status: string;
};

type Schedule = {
  id: number;
  day: string;
  time_start: string;
  time_end: string;
  is_available: boolean;
};

const statusColor = (status: string) =>
  status === 'completed' ? '#166534' :
  status === 'confirmed' ? '#1e3a5f' :
  status === 'cancelled' ? '#4a0000' : '#854d0e';

export default function ProfessorDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<'consultations' | 'schedules' | 'export'>('consultations');
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const [completingId, setCompletingId] = useState<number | null>(null);
  const [completeForm, setCompleteForm] = useState({ action_taken: '', referral: '', remarks: '' });

  const [newSched, setNewSched] = useState({ day: 'Monday', time_start: '', time_end: '' });
  const [schedError, setSchedError] = useState('');

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
    if (completingId === id) {
      setCompletingId(null);
    } else {
      setCompletingId(id);
      setCompleteForm({ action_taken: '', referral: '', remarks: '' });
    }
  };

  const handleComplete = async (id: number) => {
    const data = await api.patch(`/api/consultations/${id}/complete`, completeForm, token!);
    if (data.error) { alert(data.error); return; }
    setCompletingId(null);
    setCompleteForm({ action_taken: '', referral: '', remarks: '' });
    fetchAll();
  };

  const handleAddSchedule = async () => {
    setSchedError('');
    if (!newSched.time_start || !newSched.time_end) {
      setSchedError('Please fill in all time fields.');
      return;
    }
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
    const ext = format === 'excel' ? 'xlsx' : 'pdf';
    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Export failed.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `advising-report.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Export failed. Please try again.');
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push('/login');
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#1a1a1a' }}>
      {/* Navbar */}
      <div className="flex items-center justify-between px-8 py-4" style={{ backgroundColor: '#CC0000' }}>
        <h1 className="text-white font-bold text-xl">ConsultSiya</h1>
        <div className="flex items-center gap-4">
          <span className="text-white text-sm">Professor Dashboard</span>
          <Button variant="outline" size="sm" onClick={handleLogout}
            className="border-white text-white hover:bg-white hover:text-red-700">
            Logout
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-8 pt-6">
        {(['consultations', 'schedules', 'export'] as const).map(t => (
          <Button key={t} size="sm" onClick={() => setTab(t)}
            style={{ backgroundColor: tab === t ? '#CC0000' : '#333', color: 'white' }}>
            {t === 'consultations' ? 'My Consultations' : t === 'schedules' ? 'Manage Schedules' : 'Export Report'}
          </Button>
        ))}
      </div>

      <div className="px-8 py-6">
        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : tab === 'consultations' ? (
          <>
            <h2 className="text-white text-2xl font-bold mb-6">My Consultations</h2>
            {consultations.length === 0 ? (
              <p className="text-gray-400">No consultations yet.</p>
            ) : (
              <div className="grid gap-4">
                {consultations.map(c => (
                  <Card key={c.id} style={{ backgroundColor: '#222222', borderColor: '#333333' }}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-lg">{c.student_name}</CardTitle>
                        <Badge style={{ backgroundColor: statusColor(c.status), color: 'white' }}>
                          {c.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      <p className="text-gray-400 text-sm">
                        📅 {new Date(c.date).toLocaleDateString()} — {c.day} {c.time_start?.slice(0, 5)} to {c.time_end?.slice(0, 5)}
                      </p>
                      <p className="text-gray-400 text-sm">📋 {c.nature_of_advising}</p>
                      <p className="text-gray-400 text-sm">🎓 {c.student_number} · {c.program}</p>
                      <p className="text-gray-400 text-sm">📍 Mode: {c.mode}</p>

                      {(c.status === 'pending' || c.status === 'confirmed') && (
                        <div className="flex gap-2 mt-3 flex-wrap">
                          {c.status === 'pending' && (
                            <Button size="sm" style={{ backgroundColor: '#1e3a5f', color: 'white' }}
                              onClick={() => handleConfirm(c.id)}>
                              Confirm
                            </Button>
                          )}
                          <Button size="sm" style={{ backgroundColor: '#CC0000', color: 'white' }}
                            onClick={() => toggleCompleting(c.id)}>
                            {completingId === c.id ? 'Cancel' : 'Mark as Completed'}
                          </Button>
                        </div>
                      )}

                      {completingId === c.id && (
                        <div className="mt-4 space-y-3 p-4 rounded-lg" style={{ backgroundColor: '#1a1a1a' }}>
                          <div>
                            <Label className="text-gray-300 text-sm">Action Taken</Label>
                            <Input
                              value={completeForm.action_taken}
                              onChange={e => setCompleteForm(f => ({ ...f, action_taken: e.target.value }))}
                              className="bg-gray-800 border-gray-600 text-white mt-1"
                              placeholder="Describe action taken..."
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300 text-sm">Referral</Label>
                            <Input
                              value={completeForm.referral}
                              onChange={e => setCompleteForm(f => ({ ...f, referral: e.target.value }))}
                              className="bg-gray-800 border-gray-600 text-white mt-1"
                              placeholder="Referral (if any)"
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300 text-sm">Remarks</Label>
                            <Input
                              value={completeForm.remarks}
                              onChange={e => setCompleteForm(f => ({ ...f, remarks: e.target.value }))}
                              className="bg-gray-800 border-gray-600 text-white mt-1"
                              placeholder="Additional remarks..."
                            />
                          </div>
                          <Button size="sm" style={{ backgroundColor: '#166534', color: 'white' }}
                            onClick={() => handleComplete(c.id)}>
                            Submit Completion
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        ) : tab === 'schedules' ? (
          <>
            <h2 className="text-white text-2xl font-bold mb-6">Manage Schedules</h2>

            <Card className="mb-6" style={{ backgroundColor: '#222222', borderColor: '#333333' }}>
              <CardHeader>
                <CardTitle className="text-white text-lg">Add New Schedule Slot</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-gray-300 text-sm">Day</Label>
                    <select
                      value={newSched.day}
                      onChange={e => setNewSched(s => ({ ...s, day: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 rounded-md text-white text-sm"
                      style={{ backgroundColor: '#333', border: '1px solid #555' }}
                    >
                      {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-gray-300 text-sm">Time Start</Label>
                    <Input
                      type="time"
                      value={newSched.time_start}
                      onChange={e => setNewSched(s => ({ ...s, time_start: e.target.value }))}
                      className="bg-gray-800 border-gray-600 text-white mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-300 text-sm">Time End</Label>
                    <Input
                      type="time"
                      value={newSched.time_end}
                      onChange={e => setNewSched(s => ({ ...s, time_end: e.target.value }))}
                      className="bg-gray-800 border-gray-600 text-white mt-1"
                    />
                  </div>
                </div>
                {schedError && <p className="text-red-400 text-sm">{schedError}</p>}
                <Button style={{ backgroundColor: '#CC0000', color: 'white' }} onClick={handleAddSchedule}>
                  Add Schedule
                </Button>
              </CardContent>
            </Card>

            {schedules.length === 0 ? (
              <p className="text-gray-400">No schedules yet.</p>
            ) : (
              <div className="grid gap-3">
                {schedules.map(s => (
                  <div key={s.id} className="flex items-center justify-between px-4 py-3 rounded-lg"
                    style={{ backgroundColor: '#222222', border: '1px solid #333333' }}>
                    <div className="flex items-center gap-4">
                      <span className="text-white font-medium w-28">{s.day}</span>
                      <span className="text-gray-400 text-sm">
                        {s.time_start?.slice(0, 5)} – {s.time_end?.slice(0, 5)}
                      </span>
                      <Badge style={{
                        backgroundColor: s.is_available ? '#166534' : '#854d0e',
                        color: 'white',
                        fontSize: '0.7rem',
                      }}>
                        {s.is_available ? 'Available' : 'Booked'}
                      </Badge>
                    </div>
                    <Button size="sm" variant="destructive" onClick={() => handleDeleteSchedule(s.id)}>
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <h2 className="text-white text-2xl font-bold mb-6">Export Report</h2>
            <Card style={{ backgroundColor: '#222222', borderColor: '#333333' }}>
              <CardContent className="pt-6 space-y-4">
                <p className="text-gray-400 text-sm">
                  Download your academic advising report with all consultation records.
                </p>
                <div className="flex gap-4 flex-wrap">
                  <Button style={{ backgroundColor: '#166534', color: 'white' }}
                    onClick={() => handleExport('excel')}>
                    Download Excel Report
                  </Button>
                  <Button style={{ backgroundColor: '#1e3a5f', color: 'white' }}
                    onClick={() => handleExport('pdf')}>
                    Download PDF Report
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
