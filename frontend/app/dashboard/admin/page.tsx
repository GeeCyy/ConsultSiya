'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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

const statusColor = (status: string) =>
  status === 'completed' ? '#166534' :
  status === 'confirmed' ? '#1e3a5f' :
  status === 'cancelled' ? '#4a0000' : '#854d0e';

export default function AdminDashboard() {
  const router = useRouter();
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
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
          <span className="text-white text-sm">Admin Dashboard</span>
          <Button variant="outline" size="sm" onClick={handleLogout}
            className="border-white text-white hover:bg-white hover:text-red-700">
            Logout
          </Button>
        </div>
      </div>

      <div className="px-8 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <Card style={{ backgroundColor: '#222222', borderColor: '#333333' }}>
            <CardContent className="pt-6 text-center">
              <p className="text-4xl font-bold text-white">{stats.total}</p>
              <p className="text-gray-400 text-sm mt-1">Total</p>
            </CardContent>
          </Card>
          <Card style={{ backgroundColor: '#222222', borderColor: '#333333' }}>
            <CardContent className="pt-6 text-center">
              <p className="text-4xl font-bold" style={{ color: '#f59e0b' }}>{stats.pending}</p>
              <p className="text-gray-400 text-sm mt-1">Pending</p>
            </CardContent>
          </Card>
          <Card style={{ backgroundColor: '#222222', borderColor: '#333333' }}>
            <CardContent className="pt-6 text-center">
              <p className="text-4xl font-bold" style={{ color: '#60a5fa' }}>{stats.confirmed}</p>
              <p className="text-gray-400 text-sm mt-1">Confirmed</p>
            </CardContent>
          </Card>
          <Card style={{ backgroundColor: '#222222', borderColor: '#333333' }}>
            <CardContent className="pt-6 text-center">
              <p className="text-4xl font-bold" style={{ color: '#22c55e' }}>{stats.completed}</p>
              <p className="text-gray-400 text-sm mt-1">Completed</p>
            </CardContent>
          </Card>
          <Card style={{ backgroundColor: '#222222', borderColor: '#333333' }}>
            <CardContent className="pt-6 text-center">
              <p className="text-4xl font-bold" style={{ color: '#f87171' }}>{stats.cancelled}</p>
              <p className="text-gray-400 text-sm mt-1">Cancelled</p>
            </CardContent>
          </Card>
        </div>

        {/* All Consultations */}
        <h2 className="text-white text-2xl font-bold mb-6">All Consultations</h2>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : consultations.length === 0 ? (
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
                  <p className="text-gray-400 text-sm">👨‍🏫 Professor: {c.professor_name}</p>
                  <p className="text-gray-400 text-sm">
                    📅 {new Date(c.date).toLocaleDateString()} — {c.day} {c.time_start?.slice(0, 5)} to {c.time_end?.slice(0, 5)}
                  </p>
                  <p className="text-gray-400 text-sm">📋 {c.nature_of_advising}</p>
                  <p className="text-gray-400 text-sm">🎓 {c.student_number} · {c.program}</p>
                  <p className="text-gray-400 text-sm">📍 Mode: {c.mode}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
