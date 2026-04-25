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

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0 1 12 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 0 1 1.563-3.029m5.858.908a3 3 0 1 1 4.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532 3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0 1 12 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 0 1-4.132 4.411m0 0L21 21" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
    </svg>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<'student' | 'professor'>('student');
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirm_password: '',
    full_name: '',
    student_number: '',
    program: '',
    year_level: '',
    department: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={set('password')}
                  className={`${inputCls} pr-10`}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className={labelCls}>Confirm</Label>
              <div className="relative">
                <Input
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.confirm_password}
                  onChange={set('confirm_password')}
                  className={`${inputCls} pr-10`}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                  <EyeIcon open={showConfirm} />
                </button>
              </div>
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
