'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

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

  const handleLogin = async () => {
    setLoading(true);
    setError('');

    const data = await api.post('/api/auth/login', { email, password });

    if (data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.role);

      if (data.role === 'student') router.push('/dashboard/student');
      else if (data.role === 'professor') router.push('/dashboard/professor');
      else if (data.role === 'admin') router.push('/dashboard/admin');
    } else {
      setError(data.error || 'Login failed. Please try again.');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
      <div className="w-full max-w-md px-8 py-10 rounded-xl" style={{ backgroundColor: '#222222' }}>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold" style={{ color: '#CC0000' }}>
            ConsultSiya
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            SOIT Academic Consultation System
          </p>
          <p className="text-gray-500 text-xs mt-1">
            Mapúa University
          </p>
        </div>

        {/* Success / Error */}
        {success && (
          <div className="mb-4 px-4 py-2 rounded-md text-sm" style={{ backgroundColor: '#003a0e', color: '#6bff9e' }}>
            {success}
          </div>
        )}
        {error && (
          <div className="mb-4 px-4 py-2 rounded-md text-sm" style={{ backgroundColor: '#3a0000', color: '#ff6b6b' }}>
            {error}
          </div>
        )}

        {/* Form */}
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="email" className="text-gray-300">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@mymapua.edu.ph"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="bg-gray-800 border-gray-600 text-white placeholder-gray-500"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="password" className="text-gray-300">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                className="bg-gray-800 border-gray-600 text-white placeholder-gray-500 pr-10"
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

          <Button
            className="w-full text-white font-semibold mt-2"
            style={{ backgroundColor: '#CC0000' }}
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Sign In'}
          </Button>
        </div>

        <p className="text-center text-sm text-gray-500 mt-5">
          No account yet?{' '}
          <Link href="/register" className="text-[#CC0000] hover:underline">Register</Link>
        </p>

        <p className="text-center text-gray-600 text-xs mt-4">
          © 2026 Mapúa University SOIT
        </p>
      </div>
    </div>
  );
}
