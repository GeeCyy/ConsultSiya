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

  const isStudent = profile?.role === 'student';

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4">
        <div className="pointer-events-auto w-full max-w-[480px] rounded-2xl shadow-2xl border border-white/10 overflow-hidden bg-[#1e1f22]">

          {/* Banner */}
          <div className="relative h-28 bg-gradient-to-br from-[#5a0000] via-[#8b0000] to-[#1a0000] flex-shrink-0">
            {/* Subtle texture overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-lg bg-black/30 text-white/70 hover:text-white hover:bg-black/50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Avatar — overlaps into body */}
            {!loading && profile && (
              <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-[#7a0000] flex items-center justify-center ring-4 ring-[#1e1f22] shadow-xl flex-shrink-0">
                  {profile.avatar && !profile.avatar.startsWith('/uploads/')
                    ? <img src={profile.avatar} alt={profile.full_name} className="w-full h-full object-cover" />
                    : <span className="text-2xl font-bold text-white">{initials}</span>
                  }
                </div>
              </div>
            )}
          </div>

          {/* Body */}
          <div className="px-6 pb-6 pt-14">
            {loading && (
              <div className="flex justify-center py-8">
                <span className="w-6 h-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
              </div>
            )}
            {!loading && error && (
              <p className="text-red-400 text-sm text-center py-6">{error}</p>
            )}
            {!loading && profile && (
              <>
                {/* Name + role badge */}
                <div className="text-center mb-5">
                  <p className="text-white font-bold text-lg leading-tight">{profile.full_name}</p>
                  <span className={`inline-flex mt-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wide ${
                    isStudent
                      ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20'
                      : 'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/20'
                  }`}>
                    {isStudent ? 'Student' : 'Professor'}
                  </span>
                </div>

                {/* Info cards */}
                <div className="space-y-2.5">
                  {profile.role === 'professor' && profile.department && (
                    <div className="flex items-center gap-3 bg-[#161616] rounded-xl px-4 py-3 border border-white/5">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-gray-500 text-[10px] uppercase tracking-widest font-semibold">Department</p>
                        <p className="text-gray-100 text-sm font-medium mt-0.5">{profile.department}</p>
                      </div>
                    </div>
                  )}

                  {isStudent && profile.program && (
                    <div className="flex items-center gap-3 bg-[#161616] rounded-xl px-4 py-3 border border-white/5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-gray-500 text-[10px] uppercase tracking-widest font-semibold">Program</p>
                        <p className="text-gray-100 text-sm font-medium mt-0.5">{profile.program}</p>
                      </div>
                    </div>
                  )}

                  {isStudent && (profile.year_level != null || profile.student_number) && (
                    <div className="grid grid-cols-2 gap-2.5">
                      {profile.year_level != null && (
                        <div className="flex items-center gap-3 bg-[#161616] rounded-xl px-4 py-3 border border-white/5">
                          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-gray-500 text-[10px] uppercase tracking-widest font-semibold">Year</p>
                            <p className="text-gray-100 text-sm font-medium mt-0.5">Year {profile.year_level}</p>
                          </div>
                        </div>
                      )}
                      {profile.student_number && (
                        <div className="flex items-center gap-3 bg-[#161616] rounded-xl px-4 py-3 border border-white/5">
                          <div className="w-8 h-8 rounded-lg bg-[#CC0000]/10 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-[#CC0000]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-gray-500 text-[10px] uppercase tracking-widest font-semibold">Student No.</p>
                            <p className="text-gray-100 text-sm font-medium mt-0.5">{profile.student_number}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
