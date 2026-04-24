'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

        {/* Error */}
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
              className="bg-gray-800 border-gray-600 text-white placeholder-gray-500"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="password" className="text-gray-300">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-gray-800 border-gray-600 text-white placeholder-gray-500"
            />
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

        <p className="text-center text-gray-600 text-xs mt-6">
          © 2026 Mapúa University SOIT
        </p>
      </div>
    </div>
  );
}