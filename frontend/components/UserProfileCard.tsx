'use client';

import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type PublicProfile = {
  role: 'professor' | 'student';
  full_name: string;
  avatar: string | null;
  department?: string;
  program?: string;
  year_level?: number | null;
  student_number?: string;
};

export default function UserProfileCard({
  profileId,
  profileRole,
  token,
  onClose,
}: {
  profileId: number;
  profileRole: 'professor' | 'student';
  token: string;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setProfile(null);
    setError(null);
    fetch(`${API_BASE}/api/settings/profile/public?role=${profileRole}&profile_id=${profileId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setProfile(data);
      })
      .catch(() => setError('Failed to load profile.'))
      .finally(() => setLoading(false));
  }, [profileId, profileRole, token]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const initials = profile?.full_name
    ? profile.full_name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : '?';

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto w-72 rounded-2xl shadow-2xl border border-white/10 overflow-hidden bg-[#2b2d31]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#1e1f22]">
            <p className="text-sm font-semibold text-white">Profile</p>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-5">
            {loading && (
              <div className="flex justify-center py-8">
                <span className="w-6 h-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
              </div>
            )}
            {!loading && error && (
              <p className="text-red-400 text-sm text-center py-6">{error}</p>
            )}
            {!loading && profile && (
              <div className="flex flex-col items-center text-center">
                {/* Avatar */}
                <div className="w-16 h-16 rounded-full overflow-hidden bg-[#7a0000] flex items-center justify-center ring-2 ring-[#CC0000]/30 mb-3 flex-shrink-0">
                  {profile.avatar
                    ? <img src={`${API_BASE}${profile.avatar}`} alt={profile.full_name} className="w-full h-full object-cover" />
                    : <span className="text-xl font-bold text-white">{initials}</span>
                  }
                </div>
                <p className="text-white font-bold text-base leading-tight">{profile.full_name}</p>
                <span className={`inline-flex mt-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  profile.role === 'professor'
                    ? 'bg-indigo-500/20 text-indigo-300'
                    : 'bg-emerald-500/20 text-emerald-300'
                }`}>
                  {profile.role === 'professor' ? 'Professor' : 'Student'}
                </span>

                {/* Details */}
                <div className="mt-4 w-full space-y-3 text-left">
                  {profile.role === 'professor' && profile.department && (
                    <div>
                      <p className="text-gray-600 text-[10px] uppercase tracking-wide font-semibold">Department</p>
                      <p className="text-gray-200 text-sm mt-0.5">{profile.department}</p>
                    </div>
                  )}
                  {profile.role === 'student' && (
                    <>
                      {profile.program && (
                        <div>
                          <p className="text-gray-600 text-[10px] uppercase tracking-wide font-semibold">Program</p>
                          <p className="text-gray-200 text-sm mt-0.5">{profile.program}</p>
                        </div>
                      )}
                      <div className="flex gap-5">
                        {profile.year_level != null && (
                          <div>
                            <p className="text-gray-600 text-[10px] uppercase tracking-wide font-semibold">Year</p>
                            <p className="text-gray-200 text-sm mt-0.5">Year {profile.year_level}</p>
                          </div>
                        )}
                        {profile.student_number && (
                          <div>
                            <p className="text-gray-600 text-[10px] uppercase tracking-wide font-semibold">Student No.</p>
                            <p className="text-gray-200 text-sm mt-0.5">{profile.student_number}</p>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
