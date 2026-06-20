'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [_isDark, setIsDark] = useState(false);
  const isDark = mounted ? _isDark : false;

  useEffect(() => {
    setMounted(true);
    setIsDark(localStorage.getItem('consulta-theme') === 'dark');
    const handler = (e: Event) => setIsDark((e as CustomEvent<{ dark: boolean }>).detail.dark);
    window.addEventListener('consulta-theme-change', handler);
    return () => window.removeEventListener('consulta-theme-change', handler);
  }, []);

  const handleSubmit = async () => {
    setError('');
    if (!email.trim()) { setError('Email is required.'); return; }

    setLoading(true);
    const data = await api.post('/api/auth/forgot-password', { email: email.trim() });
    setLoading(false);

    if (data.error) {
      setError(data.error);
    } else {
      setSent(true);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center px-3 sm:px-4 transition-colors duration-200 ${isDark ? 'bg-[#1e1f22]' : 'bg-[#EEF2FF]'}`}>
      <div className={`w-full max-w-md px-5 sm:px-8 py-8 sm:py-10 rounded-2xl border transition-colors duration-200 ${
        isDark
          ? 'bg-[#2b2d31] border-white/10'
          : 'bg-white border-gray-200 shadow-lg'
      }`}>
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold" style={{ color: '#CC0000' }}>Consulta</h1>
          <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Reset your password</p>
          <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Mapúa University SOIT</p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Check your email</p>
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              If <span className={isDark ? 'text-white' : 'text-gray-900'}>{email}</span> is registered, a password reset link has been sent.
              Check your inbox and follow the instructions.
            </p>
            <p className={`text-xs mt-2 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Didn't receive it? Check your spam folder or try again.</p>
            <Link href="/login" className="block text-[#CC0000] text-sm hover:underline mt-4">
              Back to Sign In
            </Link>
          </div>
        ) : (
          <>
            <p className={`text-sm mb-6 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Enter the email address associated with your account and we'll send you a link to reset your password.
            </p>

            {error && (
              <div className={`mb-4 px-4 py-3 rounded-xl text-sm border ${
                isDark
                  ? 'bg-[#3a0000] text-[#ff6b6b] border-[#7f1d1d]'
                  : 'bg-red-50 text-red-600 border-red-200'
              }`}>
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-1">
                <Label className={isDark ? 'text-gray-300' : 'text-gray-700'}>Email</Label>
                <Input
                  type="email"
                  placeholder="you@mymapua.edu.ph"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  className={`border ${isDark ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`}
                  style={isDark
                    ? { backgroundColor: '#383a40', borderColor: 'rgba(255,255,255,0.1)' }
                    : { backgroundColor: '#fff', borderColor: '#d1d5db' }
                  }
                />
              </div>

              <Button
                className="w-full text-white font-semibold"
                style={{ backgroundColor: '#CC0000' }}
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </Button>
            </div>

            <p className={`text-center text-sm mt-5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              Remember your password?{' '}
              <Link href="/login" className="text-[#CC0000] hover:underline">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
