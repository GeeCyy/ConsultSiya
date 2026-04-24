'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

const statusColor = (status: string) =>
  status === 'completed' ? '#166534' :
  status === 'confirmed' ? '#1e3a5f' :
  status === 'cancelled' ? '#4a0000' : '#854d0e';

export default function StudentDashboard() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'book' | 'my'>('book');
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
    if (bookingSlotId === id) {
      setBookingSlotId(null);
    } else {
      setBookingSlotId(id);
      setBookForm({ nature_of_advising: '', mode: 'F2F', date: '' });
      setBookError('');
    }
  };

  const handleBook = async (schedule: Schedule) => {
    setBookError('');
    if (!bookForm.nature_of_advising || !bookForm.mode || !bookForm.date) {
      setBookError('Please fill in all fields.');
      return;
    }

    const data = await api.post('/api/consultations', {
      professor_id: schedule.professor_id,
      schedule_id: schedule.id,
      date: bookForm.date,
      nature_of_advising: bookForm.nature_of_advising,
      mode: bookForm.mode,
    }, token!);

    if (data.error) {
      setBookError(data.error);
      return;
    }

    setBookingSlotId(null);
    setBookForm({ nature_of_advising: '', mode: 'F2F', date: '' });
    await fetchData();
    setView('my');
  };

  const handleCancel = async (id: number) => {
    if (!confirm('Cancel this consultation?')) return;
    const data = await api.patch(`/api/consultations/${id}/cancel`, {}, token!);
    if (data.error) { alert(data.error); return; }
    fetchData();
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
          <span className="text-white text-sm">Student Dashboard</span>
          <Button variant="outline" size="sm" onClick={handleLogout}
            className="border-white text-white hover:bg-white hover:text-red-700">
            Logout
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-8 pt-6">
        <Button size="sm" onClick={() => setView('book')}
          style={{ backgroundColor: view === 'book' ? '#CC0000' : '#333', color: 'white' }}>
          Book a Consultation
        </Button>
        <Button size="sm" onClick={() => setView('my')}
          style={{ backgroundColor: view === 'my' ? '#CC0000' : '#333', color: 'white' }}>
          My Consultations
        </Button>
      </div>

      {/* Content */}
      <div className="px-8 py-6">
        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : view === 'book' ? (
          <>
            <h2 className="text-white text-2xl font-bold mb-6">Available Schedules</h2>
            {schedules.length === 0 ? (
              <p className="text-gray-400">No available schedules at the moment.</p>
            ) : (
              <div className="grid gap-4">
                {schedules.map((s: Schedule) => (
                  <Card key={s.id} style={{ backgroundColor: '#222222', borderColor: '#333333' }}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-white text-lg">{s.professor_name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      <p className="text-gray-400 text-sm">🏫 {s.department}</p>
                      <p className="text-gray-400 text-sm">
                        📅 {s.day} · {s.time_start?.slice(0, 5)} to {s.time_end?.slice(0, 5)}
                      </p>

                      <Button className="mt-3 text-white" size="sm"
                        style={{ backgroundColor: bookingSlotId === s.id ? '#555' : '#CC0000' }}
                        onClick={() => toggleBooking(s.id)}>
                        {bookingSlotId === s.id ? 'Cancel' : 'Book this slot'}
                      </Button>

                      {bookingSlotId === s.id && (
                        <div className="mt-4 space-y-3 p-4 rounded-lg" style={{ backgroundColor: '#1a1a1a' }}>
                          <div>
                            <Label className="text-gray-300 text-sm">Nature of Advising</Label>
                            <Input
                              value={bookForm.nature_of_advising}
                              onChange={e => setBookForm(f => ({ ...f, nature_of_advising: e.target.value }))}
                              className="bg-gray-800 border-gray-600 text-white mt-1"
                              placeholder="e.g. Thesis / Design Subject concerns"
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300 text-sm">Mode</Label>
                            <select
                              value={bookForm.mode}
                              onChange={e => setBookForm(f => ({ ...f, mode: e.target.value }))}
                              className="w-full mt-1 px-3 py-2 rounded-md text-white text-sm"
                              style={{ backgroundColor: '#333', border: '1px solid #555' }}
                            >
                              <option value="F2F">Face-to-Face (F2F)</option>
                              <option value="OL">Online (OL)</option>
                            </select>
                          </div>
                          <div>
                            <Label className="text-gray-300 text-sm">Date</Label>
                            <Input
                              type="date"
                              value={bookForm.date}
                              onChange={e => setBookForm(f => ({ ...f, date: e.target.value }))}
                              className="bg-gray-800 border-gray-600 text-white mt-1"
                            />
                          </div>
                          {bookError && <p className="text-red-400 text-sm">{bookError}</p>}
                          <Button size="sm" style={{ backgroundColor: '#CC0000', color: 'white' }}
                            onClick={() => handleBook(s)}>
                            Confirm Booking
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <h2 className="text-white text-2xl font-bold mb-6">My Consultations</h2>
            {consultations.length === 0 ? (
              <p className="text-gray-400">No consultations yet.</p>
            ) : (
              <div className="grid gap-4">
                {consultations.map((c: Consultation) => (
                  <Card key={c.id} style={{ backgroundColor: '#222222', borderColor: '#333333' }}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-lg">{c.professor_name}</CardTitle>
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
                      <p className="text-gray-400 text-sm">📍 Mode: {c.mode}</p>
                      {(c.status === 'pending' || c.status === 'confirmed') && (
                        <Button size="sm" className="mt-3"
                          style={{ backgroundColor: '#4a0000', color: 'white' }}
                          onClick={() => handleCancel(c.id)}>
                          Cancel
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
