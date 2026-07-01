'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const PROGRAMS = [
  'BS Computer Science',
  'BS Entertainment and Multimedia Computing',
  'BS Information Technology',
  'BS Information Systems',
  'BS Data Science',
  'BS Cybersecurity',
  'Others',
];

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];


async function sha1Hex(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

async function isPwnedPassword(password: string): Promise<boolean> {
  const hash = await sha1Hex(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { 'Add-Padding': 'true' },
  });
  if (!res.ok) throw new Error(`HIBP ${res.status}`);
  const text = await res.text();
  return text.split('\r\n').some(line => line.split(':')[0] === suffix);
}

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
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [pwnedError, setPwnedError] = useState('');
  const [checkingPwned, setCheckingPwned] = useState(false);
  const lastCheckedPwd = useRef('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('consulta-theme-v2')) {
      localStorage.setItem('consulta-theme-v2', '1');
      localStorage.setItem('consulta-theme', 'light');
    }
    setIsDark(localStorage.getItem('consulta-theme') === 'dark');
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    localStorage.setItem('consulta-theme', next ? 'dark' : 'light');
    window.dispatchEvent(new CustomEvent('consulta-theme-change', { detail: { dark: next } }));
    setIsDark(next);
  };

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const passwordChecks = {
    length:    form.password.length >= 8,
    uppercase: /[A-Z]/.test(form.password),
    lowercase: /[a-z]/.test(form.password),
    number:    /[0-9]/.test(form.password),
    special:   /[^A-Za-z0-9]/.test(form.password),
  };
  const passwordValid = Object.values(passwordChecks).every(Boolean);

  const handlePasswordBlur = async () => {
    const pwd = form.password;
    if (!pwd || lastCheckedPwd.current === pwd) return;
    setCheckingPwned(true);
    try {
      const breached = await isPwnedPassword(pwd);
      lastCheckedPwd.current = pwd;
      setPwnedError(breached ? 'This password has appeared in a data breach. Please choose a different one.' : '');
    } catch (e) {
      console.warn('[HIBP] Breach check failed:', e);
      lastCheckedPwd.current = pwd;
    } finally {
      setCheckingPwned(false);
    }
  };

  const handleRegister = async () => {
    setError('');
    setConfirmError('');

    if (!form.email || !form.password || !form.full_name) {
      setError('Email, password, and full name are required.');
      return;
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(form.email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!passwordValid) {
      setError('Password does not meet all requirements.');
      return;
    }
    if (form.password !== form.confirm_password) {
      setError('Passwords do not match.');
      return;
    }
    if (!form.full_name.trim()) {
      setError('Full name cannot be blank.');
      return;
    }
    if (role === 'student' && (!form.student_number || !form.program || !form.year_level)) {
      setError('All student fields are required.');
      return;
    }
    if (role === 'student' && !/^\d{10}$/.test(form.student_number)) {
      setError('Student number must be exactly 10 digits.');
      return;
    }

    // Pwned password check — use cached result or run now if blur was skipped
    if (pwnedError) return;
    if (lastCheckedPwd.current !== form.password) {
      setCheckingPwned(true);
      try {
        const breached = await isPwnedPassword(form.password);
        lastCheckedPwd.current = form.password;
        if (breached) {
          setPwnedError('This password has appeared in a data breach. Please choose a different one.');
          setCheckingPwned(false);
          return;
        }
      } catch (e) {
        console.warn('[HIBP] Breach check failed, allowing submission:', e);
        lastCheckedPwd.current = form.password;
      } finally {
        setCheckingPwned(false);
      }
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
    }

    const data = await api.post('/api/auth/register', payload);
    setLoading(false);

    if (data.error) {
      setError(data.error);
      return;
    }

    router.push(data.requires_approval ? '/login?registered=1&approval=1' : '/login?registered=1');
  };

  // Theme tokens
  const pageBg      = isDark ? '#1a1a1a' : '#EEF2FF';
  const cardBg      = isDark ? '#252525' : '#ffffff';
  const cardBorder  = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
  const inputBg     = isDark ? '#2d2d2d' : '#f5f5f5';
  const inputBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.14)';
  const inputText   = isDark ? 'text-white' : 'text-gray-900';
  const labelCls    = isDark ? 'text-gray-300' : 'text-gray-700';
  const placeholderCls = isDark ? 'placeholder-gray-500' : 'placeholder-gray-400';
  const subText     = isDark ? 'text-gray-400' : 'text-gray-500';
  const muteText    = isDark ? 'text-gray-500' : 'text-gray-400';
  const eyeCls      = isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600';
  const toggleCls   = isDark
    ? 'text-gray-300 hover:text-white hover:bg-white/10 border border-white/10 hover:border-white/20'
    : 'text-gray-600 hover:text-gray-900 hover:bg-black/8 border border-black/10 hover:border-black/20';
  const tabBorder   = isDark ? 'border-white/10' : 'border-black/10';
  const tabInactive = isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-700';
  const headingCls  = isDark ? 'text-white' : 'text-gray-900';

  const inputCls = `border ${inputText} ${placeholderCls} focus:border-[#4F6BED] focus:ring-0`;
  const selectCls = `w-full rounded-md border px-3 py-2 text-sm appearance-none focus:outline-none focus:border-[#4F6BED] ${inputText}`;

  return (
    <div className="min-h-screen flex transition-colors duration-200" style={{ backgroundColor: pageBg }}>

      {/* Theme toggle — top right */}
      <button
        onClick={toggleTheme}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        className={`fixed top-3 right-3 sm:top-4 sm:right-4 p-2.5 sm:p-3 rounded-xl transition-all duration-200 z-50 ${toggleCls}`}
      >
        {isDark ? (
          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0z" />
          </svg>
        ) : (
          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998z" />
          </svg>
        )}
      </button>

      {/* ── Left branding panel (desktop only) ── */}
      <div className="hidden lg:flex w-[42%] flex-col items-center justify-center bg-[#4F6BED] relative overflow-hidden min-h-screen">
        {/* Decorative circles */}
        <div className="absolute -top-28 -right-28 w-96 h-96 rounded-full bg-white/10" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-white/10" />
        <div className="absolute top-1/2 right-10 w-28 h-28 rounded-full bg-white/5" />
        <div className="absolute top-16 left-12 w-16 h-16 rounded-full bg-white/5" />

        {/* Logo in white card */}
        <div className="bg-white rounded-2xl p-8 mb-8 shadow-2xl relative z-10">
          <img
            src="/consulta-logo.png"
            alt="Consulta Logo"
            style={{ height: '140px', width: 'auto' }}
          />
        </div>

        <h1 className="text-5xl font-bold text-white mb-4 relative z-10 tracking-tight">Consulta</h1>
        <p className="text-white/75 text-base text-center max-w-[280px] relative z-10 leading-relaxed">
          Book consultations with your professors seamlessly.
        </p>

        <div className="mt-10 flex items-center gap-3 relative z-10">
          <div className="w-8 h-px bg-white/50 rounded" />
          <p className="text-white text-xs tracking-widest uppercase font-bold">© Mapúa University SOIT</p>
          <div className="w-8 h-px bg-white/50 rounded" />
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center px-5 sm:px-10 py-10 overflow-y-auto">
        <div className="w-full max-w-md">

          {/* Mobile-only header */}
          <div className="lg:hidden text-center mb-6">
            <img
              src="/consulta-logo.png"
              alt="Consulta Logo"
              className="mx-auto mb-3"
              style={{ height: '90px', width: 'auto' }}
            />
            <p className={`text-base font-medium ${subText}`}>Create your account</p>
            <p className={`text-xs mt-0.5 ${muteText}`}>Mapúa University SOIT</p>
          </div>

          {/* Desktop form heading */}
          <div className="hidden lg:block mb-7">
            <h2 className={`text-2xl font-bold ${headingCls}`}>Create your account</h2>
            <p className={`text-sm mt-1 ${subText}`}>Fill in your details to get started</p>
          </div>

          {/* Role toggle */}
          <div className={`flex rounded-lg overflow-hidden border ${tabBorder} mb-6`}>
            {(['student', 'professor'] as const).map(r => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  role === r ? 'bg-[#4F6BED] text-white' : `bg-transparent ${tabInactive}`
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
              <Input
                placeholder="Juan dela Cruz"
                value={form.full_name}
                onChange={set('full_name')}
                className={inputCls}
                style={{ backgroundColor: inputBg, borderColor: inputBorder }}
              />
            </div>

            <div className="space-y-1">
              <Label className={labelCls}>Email</Label>
              <Input
                type="email"
                placeholder="you@mymapua.edu.ph"
                value={form.email}
                onChange={set('email')}
                className={inputCls}
                style={{ backgroundColor: inputBg, borderColor: inputBorder }}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className={labelCls}>Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={form.password}
                    onChange={e => {
                      const val = e.target.value;
                      setForm(f => ({ ...f, password: val }));
                      if (form.confirm_password && form.confirm_password !== val) {
                        setConfirmError('Passwords do not match.');
                      } else {
                        setConfirmError('');
                      }
                      if (val !== lastCheckedPwd.current) {
                        setPwnedError('');
                        lastCheckedPwd.current = '';
                      }
                    }}
                    onBlur={handlePasswordBlur}
                    className={`${inputCls} pr-10`}
                    style={{ backgroundColor: inputBg, borderColor: inputBorder }}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword(v => !v)}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${eyeCls}`}>
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
                {form.password.length > 0 && (
                  <div className={`mt-1.5 border-l-[3px] rounded-r-md px-3 py-2 ${
                    passwordValid
                      ? isDark ? 'bg-green-950/30 border-green-500' : 'bg-green-50 border-green-500'
                      : isDark ? 'bg-red-950/30 border-red-500'     : 'bg-red-50 border-red-500'
                  }`}>
                    <p className={`text-[10px] font-semibold ${
                      passwordValid
                        ? isDark ? 'text-green-400' : 'text-green-700'
                        : isDark ? 'text-red-400'   : 'text-red-700'
                    }`}>
                      {passwordValid ? 'Password looks strong' : 'Password too weak'}
                    </p>
                    {!passwordValid && (
                      <p className={`text-[10px] mt-0.5 ${isDark ? 'text-red-300/80' : 'text-red-600'}`}>
                        {'Missing: ' + [
                          !passwordChecks.length    && '8+ characters',
                          !passwordChecks.uppercase && 'uppercase letter',
                          !passwordChecks.lowercase && 'lowercase letter',
                          !passwordChecks.number    && 'number',
                          !passwordChecks.special   && 'special character',
                        ].filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>
                )}
                {checkingPwned && <p className={`text-[10px] mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Checking password safety…</p>}
                {pwnedError && <p className="text-red-500 text-[10px] mt-1">{pwnedError}</p>}
              </div>
              <div className="space-y-1">
                <Label className={labelCls}>Confirm</Label>
                <div className="relative">
                  <Input
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={form.confirm_password}
                    onChange={e => {
                      const val = e.target.value;
                      setForm(f => ({ ...f, confirm_password: val }));
                      if (val && val !== form.password) {
                        setConfirmError('Passwords do not match.');
                      } else {
                        setConfirmError('');
                      }
                    }}
                    className={`${inputCls} pr-10`}
                    style={{ backgroundColor: inputBg, borderColor: inputBorder }}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowConfirm(v => !v)}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${eyeCls}`}>
                    <EyeIcon open={showConfirm} />
                  </button>
                </div>
                {confirmError && <p className="text-red-500 text-[10px] mt-1">{confirmError}</p>}
              </div>
            </div>

            {/* Student-specific */}
            {role === 'student' && (
              <>
                <div className="space-y-1">
                  <Label className={labelCls}>Student Number</Label>
                  <Input
                    placeholder="2021XXXXXX"
                    inputMode="numeric"
                    maxLength={10}
                    value={form.student_number}
                    onChange={e => setForm(f => ({ ...f, student_number: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                    className={inputCls}
                    style={{ backgroundColor: inputBg, borderColor: inputBorder }}
                  />
                </div>

                <div className="space-y-1">
                  <Label className={labelCls}>Program</Label>
                  <select
                    value={form.program}
                    onChange={set('program')}
                    className={selectCls}
                    style={{ backgroundColor: inputBg, borderColor: inputBorder }}
                  >
                    <option value="">Select program…</option>
                    {PROGRAMS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className={labelCls}>Year Level</Label>
                  <select
                    value={form.year_level}
                    onChange={set('year_level')}
                    className={selectCls}
                    style={{ backgroundColor: inputBg, borderColor: inputBorder }}
                  >
                    <option value="">Select year…</option>
                    {YEAR_LEVELS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </>
            )}


            <Button
              className="w-full text-white font-semibold mt-2 bg-[#4F6BED] hover:bg-[#3D57D6]"
              onClick={handleRegister}
              disabled={loading || checkingPwned}
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </Button>
          </div>

          <p className={`text-center text-sm mt-5 ${subText}`}>
            Already have an account?{' '}
            <Link href="/login" className="text-[#4F6BED] hover:underline">Sign in</Link>
          </p>

          <p className={`text-center text-xs mt-4 ${muteText}`}>© 2026 Mapúa University SOIT</p>
        </div>
      </div>
    </div>
  );
}
