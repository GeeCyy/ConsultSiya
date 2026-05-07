'use client';

import { useState } from 'react';
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
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#1e1f22' }}>
      <div
        className="w-full max-w-md px-8 py-10 rounded-2xl border border-white/10"
        style={{ backgroundColor: '#2b2d31' }}
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold" style={{ color: '#CC0000' }}>ConsultSiya</h1>
          <p className="text-gray-400 text-sm mt-1">Reset your password</p>
          <p className="text-gray-500 text-xs mt-1">Mapúa University SOIT</p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-white font-semibold">Check your email</p>
            <p className="text-gray-400 text-sm">
              If <span className="text-white">{email}</span> is registered, a password reset link has been sent.
              Check your inbox and follow the instructions.
            </p>
            <p className="text-gray-600 text-xs mt-2">Didn't receive it? Check your spam folder or try again.</p>
            <Link href="/login" className="block text-[#CC0000] text-sm hover:underline mt-4">
              Back to Sign In
            </Link>
          </div>
        ) : (
          <>
            <p className="text-gray-400 text-sm mb-6">
              Enter the email address associated with your account and we'll send you a link to reset your password.
            </p>

            {error && (
              <div className="mb-4 px-4 py-3 rounded-xl text-sm border" style={{ backgroundColor: '#3a0000', color: '#ff6b6b', borderColor: '#7f1d1d' }}>
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-gray-300">Email</Label>
                <Input
                  type="email"
                  placeholder="you@mymapua.edu.ph"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  className="border text-white placeholder-gray-500"
                  style={{ backgroundColor: '#383a40', borderColor: 'rgba(255,255,255,0.1)' }}
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

            <p className="text-center text-sm text-gray-500 mt-5">
              Remember your password?{' '}
              <Link href="/login" className="text-[#CC0000] hover:underline">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
