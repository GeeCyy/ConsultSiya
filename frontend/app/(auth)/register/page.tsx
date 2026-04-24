'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const PROGRAMS = [
  'BS Computer Science',
  'BS Information Technology',
  'BS Computer Engineering',
  'BS Electronics Engineering',
  'BS Electrical Engineering',
  'BS Industrial Engineering',
  'BS Mechanical Engineering',
  'BS Civil Engineering',
  'BS Chemical Engineering',
  'Other',
];

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];

const DEPARTMENTS = [
  'Computer Science',
  'Information Technology',
  'Computer Engineering',
  'Electronics Engineering',
  'Electrical Engineering',
  'Industrial Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Chemical Engineering',
  'Other',
];

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<'student' | 'professor'>('student');
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirm_password: '',
    full_name: '',
    // student
    student_number: '',
    program: '',
    year_level: '',
    // professor
    department: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const handleRegister = async () => {
    setError('');

    if (!form.email || !form.password || !form.full_name) {
      setError('Email, password, and full name are required.');
      return;
    }
    if (form.password !== form.confirm_password) {
      setError('Passwords do not match.');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (role === 'student' && (!form.student_number || !form.program || !form.year_level)) {
      setError('All student fields are required.');
      return;
    }
    if (role === 'professor' && !form.department) {
      setError('Department is required.');
      return;
    }

    setLoading(true);

    const payload: Record<string, string> = {
      email: form.email,
      password: form.password,
      role,
      full_name: form.full_name,
    };

    if (role === 'student') {
      payload.student_number = form.student_number;
      payload.program = form.program;
      payload.year_level = form.year_level;
    } else {
      payload.department = form.department;
    }

    const data = await api.post('/api/auth/register', payload);
    setLoading(false);

    if (data.error) {
      setError(data.error);
      return;
    }

    router.push('/login?registered=1');
  };

  const inputCls = 'bg-[#2a2a2a] border-[#3a3a3a] text-white placeholder-gray-600 focus:border-[#CC0000] focus:ring-0';
  const labelCls = 'text-gray-300 text-sm';
  const selectCls = `w-full rounded-md border px-3 py-2 text-sm ${inputCls} appearance-none`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a1a1a] py-10">
      <div className="w-full max-w-md px-8 py-10 rounded-xl bg-[#222222]">

        {/* Header */}
        <div className="text-center mb-7">
          <h1 className="text-3xl font-bold text-[#CC0000]">ConsultSiya</h1>
          <p className="text-gray-400 text-sm mt-1">Create your account</p>
          <p className="text-gray-600 text-xs mt-0.5">Mapúa University SOIT</p>
        </div>

        {/* Role toggle */}
        <div className="flex rounded-lg overflow-hidden border border-[#3a3a3a] mb-6">
          {(['student', 'professor'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                role === r ? 'bg-[#CC0000] text-white' : 'bg-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-2 rounded-md text-sm bg-[#3a0000] text-[#ff6b6b]">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Common fields */}
          <div className="space-y-1">
            <Label className={labelCls}>Full Name</Label>
            <Input placeholder="Juan dela Cruz" value={form.full_name} onChange={set('full_name')} className={inputCls} />
          </div>

          <div className="space-y-1">
            <Label className={labelCls}>Email</Label>
            <Input type="email" placeholder="you@mymapua.edu.ph" value={form.email} onChange={set('email')} className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className={labelCls}>Password</Label>
              <Input type="password" placeholder="••••••••" value={form.password} onChange={set('password')} className={inputCls} />
            </div>
            <div className="space-y-1">
              <Label className={labelCls}>Confirm</Label>
              <Input type="password" placeholder="••••••••" value={form.confirm_password} onChange={set('confirm_password')} className={inputCls} />
            </div>
          </div>

          {/* Student-specific */}
          {role === 'student' && (
            <>
              <div className="space-y-1">
                <Label className={labelCls}>Student Number</Label>
                <Input placeholder="2021XXXXX" value={form.student_number} onChange={set('student_number')} className={inputCls} />
              </div>

              <div className="space-y-1">
                <Label className={labelCls}>Program</Label>
                <select value={form.program} onChange={set('program')} className={selectCls}>
                  <option value="">Select program…</option>
                  {PROGRAMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <Label className={labelCls}>Year Level</Label>
                <select value={form.year_level} onChange={set('year_level')} className={selectCls}>
                  <option value="">Select year…</option>
                  {YEAR_LEVELS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </>
          )}

          {/* Professor-specific */}
          {role === 'professor' && (
            <div className="space-y-1">
              <Label className={labelCls}>Department</Label>
              <select value={form.department} onChange={set('department')} className={selectCls}>
                <option value="">Select department…</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}

          <Button
            className="w-full text-white font-semibold mt-2 bg-[#CC0000] hover:bg-[#aa0000]"
            onClick={handleRegister}
            disabled={loading}
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </Button>
        </div>

        <p className="text-center text-sm text-gray-500 mt-5">
          Already have an account?{' '}
          <Link href="/login" className="text-[#CC0000] hover:underline">Sign in</Link>
        </p>

        <p className="text-center text-gray-600 text-xs mt-4">© 2026 Mapúa University SOIT</p>
      </div>
    </div>
  );
}
