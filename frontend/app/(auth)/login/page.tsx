'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type Announcement = {
  id: number;
  title: string;
  body: string;
  type: 'info' | 'warning';
  created_at: string;
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
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

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [annLoading, setAnnLoading] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem('consulta-theme-v2')) {
      localStorage.setItem('consulta-theme-v2', '1');
      localStorage.setItem('consulta-theme', 'light');
    }
    setIsDark(localStorage.getItem('consulta-theme') === 'dark');
  }, []);

  useEffect(() => {
    if (searchParams.get('registered') === '1') {
      setSuccess('Account created! Please wait for admin approval before logging in.');
      const timer = setTimeout(() => setSuccess(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(''), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    fetch(`${API_URL}/api/announcements`)
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
      .then((data: Announcement[]) => { setAnnouncements(Array.isArray(data) ? data : []); setAnnLoading(false); });
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    localStorage.setItem('consulta-theme', next ? 'dark' : 'light');
    window.dispatchEvent(new CustomEvent('consulta-theme-change', { detail: { dark: next } }));
    setIsDark(next);
  };

  const handleLogin = async () => {
    setError('');
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) { setError('Email is required.'); return; }
    if (!emailRe.test(email)) { setError('Please enter a valid email address.'); return; }
    if (!password) { setError('Password is required.'); return; }

    setLoading(true);
    const data = await api.post('/api/auth/login', { email: email.trim(), password });

    if (data.token) {
      setLocked(false);
      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.role);
      const dest = data.role === 'admin' ? '/dashboard/admin' : data.role === 'professor' ? '/dashboard/professor' : '/dashboard/student';
      router.push(dest);
    } else {
      if (data.locked) setLocked(true);
      setError(data.error || 'Login failed. Please try again.');
    }
    setLoading(false);
  };

  // Theme tokens
  const pageBg      = isDark ? '#1a1a1a' : '#f2f3f5';
  const cardBg      = isDark ? '#252525' : '#ffffff';
  const cardBorder  = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
  const headerBg    = isDark ? '#1a1a1a' : '#f0f0f0';
  const headerBorder= isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const inputBg     = isDark ? '#2d2d2d' : '#f5f5f5';
  const inputBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.14)';
  const inputText   = isDark ? 'text-white' : 'text-gray-900';
  const labelCls    = isDark ? 'text-gray-300' : 'text-gray-700';
  const placeholderCls = isDark ? 'placeholder-gray-500' : 'placeholder-gray-400';
  const subText     = isDark ? 'text-gray-400' : 'text-gray-500';
  const muteText    = isDark ? 'text-gray-500' : 'text-gray-400';
  const eyeCls      = isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600';
  const badgeBg     = isDark ? '#2d2d2d' : '#ebebeb';
  const dividerClr  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
  const itemText    = isDark ? 'text-gray-400' : 'text-gray-600';
  const updateTitle = isDark ? 'text-white' : 'text-gray-900';
  const toggleCls   = isDark
    ? 'text-gray-300 hover:text-white hover:bg-white/10 border border-white/10 hover:border-white/20'
    : 'text-gray-600 hover:text-gray-900 hover:bg-black/8 border border-black/10 hover:border-black/20';

  return (
    <div className="min-h-screen flex items-center justify-center px-3 sm:px-4 py-8 sm:py-10 transition-colors duration-200" style={{ backgroundColor: pageBg }}>

      {/* Theme toggle — top right */}
      <button
        onClick={toggleTheme}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        className={`fixed top-3 right-3 sm:top-4 sm:right-4 p-2.5 sm:p-3 rounded-xl transition-all duration-200 ${toggleCls}`}
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

      <div className="flex flex-col lg:flex-row w-full max-w-4xl gap-4 sm:gap-6">

        {/* ── Login Form ──────────────────────────────────────────────────── */}
        <div
          className="w-full lg:max-w-md flex-shrink-0 px-5 sm:px-8 py-8 sm:py-10 rounded-2xl flex flex-col justify-center transition-colors duration-200"
          style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
        >
          <div className="text-center mb-8">
            <div className="flex justify-center mb-2">
              <img
                src="/consulta-logo.png"
                alt="Consulta"
                className="w-full object-contain"
                style={{ maxHeight: '320px' }}
              />
            </div>
            <p className={`text-sm mt-1 ${subText}`}>SOIT Academic Consultation System</p>
            <p className={`text-xs mt-1 ${muteText}`}>Mapúa University</p>
          </div>

          {success && (
            <div className="mb-4 px-4 py-2 rounded-md text-sm" style={{ backgroundColor: '#003a0e', color: '#6bff9e' }}>
              {success}
            </div>
          )}
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl text-sm border" style={{ backgroundColor: '#3a0000', color: '#ff6b6b', borderColor: '#7f1d1d' }}>
              {locked && <p className="font-semibold mb-0.5">Account Locked</p>}
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={e => { e.preventDefault(); handleLogin(); }}>
            <div className="space-y-1">
              <Label htmlFor="email" className={labelCls}>Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`border ${inputText} ${placeholderCls}`}
                style={{ backgroundColor: inputBg, borderColor: inputBorder }}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="password" className={labelCls}>Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`border ${inputText} ${placeholderCls} pr-10`}
                  style={{ backgroundColor: inputBg, borderColor: inputBorder }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(v => !v)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${eyeCls}`}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full text-white font-semibold mt-2"
              style={{ backgroundColor: '#CC0000' }}
              disabled={loading}
            >
              {loading ? 'Logging in...' : 'Sign In'}
            </Button>
          </form>

          <p className="text-center text-sm mt-3">
            <Link href="/forgot-password" className={`hover:text-[#CC0000] transition-colors text-xs ${muteText}`}>
              Forgot password?
            </Link>
          </p>

          <p className={`text-center text-sm mt-3 ${subText}`}>
            No account yet?{' '}
            <Link href="/register" className="text-[#CC0000] hover:underline">Register</Link>
          </p>
          <p className={`text-center text-xs mt-4 ${muteText}`}>© 2026 Mapúa University SOIT</p>
        </div>

        {/* ── System Updates Board — hidden on mobile ─────────────────────── */}
        <div
          className="hidden lg:flex flex-col flex-1 rounded-2xl overflow-hidden transition-colors duration-200"
          style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
        >
          {/* Header */}
          <div
            className="px-6 py-4 flex items-center gap-3 transition-colors duration-200"
            style={{ backgroundColor: headerBg, borderBottom: `1px solid ${headerBorder}` }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: '#CC0000' }}
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className={`text-sm font-semibold ${updateTitle}`}>Announcements</p>
              <p className={`text-[11px] ${muteText}`}>Latest updates from SOIT</p>
            </div>
            <span
              className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: '#CC0000', color: 'white' }}
            >
              LIVE
            </span>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {annLoading ? (
              <p className={`text-sm text-center py-8 ${muteText}`}>Loading…</p>
            ) : announcements.length === 0 ? (
              <p className={`text-sm text-center py-8 ${muteText}`}>No announcements at this time.</p>
            ) : (
              announcements.map(ann => (
                <div key={ann.id} style={{ borderBottom: `1px solid ${dividerClr}`, paddingBottom: '1rem' }}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className={`text-sm font-semibold leading-snug ${updateTitle}`}>{ann.title}</p>
                    {ann.type === 'warning' && (
                      <span
                        className="flex-shrink-0 flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                        style={{ backgroundColor: '#7f1d1d', color: '#fca5a5' }}
                      >
                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm0 5a1 1 0 011 1v5a1 1 0 11-2 0V8a1 1 0 011-1zm0 10a1.25 1.25 0 110-2.5A1.25 1.25 0 0112 17z"/>
                        </svg>
                        Important
                      </span>
                    )}
                  </div>
                  <p className={`text-sm line-clamp-3 ${itemText}`}>{ann.body}</p>
                  <p className={`text-[11px] mt-1.5 ${muteText}`}>{timeAgo(ann.created_at)}</p>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div
            className="px-6 py-3 flex items-center justify-between transition-colors duration-200"
            style={{ backgroundColor: headerBg, borderTop: `1px solid ${headerBorder}` }}
          >
            <span className={`text-[10px] ${muteText}`}>Consulta © 2026 Mapúa University SOIT</span>
            <span className={`text-[10px] ${muteText}`}>Build 2026.05</span>
          </div>
        </div>

      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
