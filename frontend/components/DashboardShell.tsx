'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CURRENT_TERM, getAcademicWeek, getWeekMode } from '@/lib/academicCalendar';
import ChatbotWidget from '@/components/ChatbotWidget';

// ── Week badge ────────────────────────────────────────────────────────────────

function WeekBadge() {
  const [info, setInfo] = useState<{ week: number; mode: string } | null>(null);

  useEffect(() => {
    const week = getAcademicWeek(CURRENT_TERM);
    if (week) setInfo({ week, mode: getWeekMode(CURRENT_TERM, week) });
  }, []);

  if (!info) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#2b2d31] border border-white/10 select-none">
      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      <span className="text-xs font-semibold text-gray-200 tracking-wide">WEEK {info.week}</span>
      <span className="text-xs text-gray-500">·</span>
      <span className={`text-xs font-medium ${info.mode === 'Online' ? 'text-blue-400' : 'text-emerald-400'}`}>
        {info.mode}
      </span>
    </div>
  );
}

function getInitials(name: string, role: string): string {
  if (name) return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return role?.[0]?.toUpperCase() || '?';
}

function roleLabel(role: string): string {
  if (role === 'admin') return 'Administrator';
  if (role === 'professor') return 'Professor';
  return 'Student';
}


export default function DashboardShell({
  children,
  weekBadge = true,
  hideTopBar = false,
  onMenuToggle,
}: {
  children: React.ReactNode;
  weekBadge?: boolean;
  hideTopBar?: boolean;
  onMenuToggle?: () => void;
}) {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [isDark, setIsDark] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [navAvatar, setNavAvatar] = useState<string | null>(null);
  const [navName, setNavName] = useState('');
  const [navRole, setNavRole] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('consulta-theme');
    const dark = saved === 'dark';
    setIsDark(dark);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');

    const storedAvatar = localStorage.getItem('consulta-avatar') || null;
    if (storedAvatar?.startsWith('/uploads/')) {
      localStorage.removeItem('consulta-avatar');
      setNavAvatar(null);
    } else {
      setNavAvatar(storedAvatar);
    }
    setNavName(localStorage.getItem('consulta-name') || '');
    setNavRole(localStorage.getItem('role') || '');
    setToken(localStorage.getItem('token') || '');

    const savedMotion = localStorage.getItem('consulta-reduce-motion') === 'true';
    document.body.classList.toggle('reduce-motion', savedMotion);
    const onMotionChange = (e: Event) => {
      const val = (e as CustomEvent<boolean>).detail;
      document.body.classList.toggle('reduce-motion', val);
    };
    window.addEventListener('consulta-reduce-motion-change', onMotionChange);

    const onAvatarChange = (e: Event) => {
      const url = (e as CustomEvent<{ url: string }>).detail?.url ?? null;
      setNavAvatar(url && !url.startsWith('/uploads/') ? url : null);
    };
    const onNameChange = (e: Event) => {
      setNavName((e as CustomEvent<{ name: string }>).detail?.name ?? '');
    };
    window.addEventListener('consulta-avatar-change', onAvatarChange);
    window.addEventListener('consulta-name-change', onNameChange);

    const onMouseDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDropdownOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('consulta-avatar-change', onAvatarChange);
      window.removeEventListener('consulta-name-change', onNameChange);
      window.removeEventListener('consulta-reduce-motion-change', onMotionChange);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    localStorage.setItem('consulta-theme', next ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    window.dispatchEvent(new CustomEvent('consulta-theme-change', { detail: { dark: next } }));
    setIsDark(next);
  };

  const handleLogout = () => {
    const tourStudent = localStorage.getItem('consulta-tour-done-student');
    const tourProf    = localStorage.getItem('consulta-tour-done-professor');
    const tourAdmin   = localStorage.getItem('consulta-tour-done-admin');
    localStorage.clear();
    if (tourStudent) localStorage.setItem('consulta-tour-done-student', tourStudent);
    if (tourProf)    localStorage.setItem('consulta-tour-done-professor', tourProf);
    if (tourAdmin)   localStorage.setItem('consulta-tour-done-admin', tourAdmin);
    setNavAvatar(null);
    setNavName('');
    setNavRole('');
    router.push('/login');
  };

  const close = () => setDropdownOpen(false);

  const initials = getInitials(navName, navRole);

  return (
    <div className={`flex flex-col h-screen overflow-hidden ${isDark ? 'bg-[#0c0c0c]' : 'bg-[#f2f3f5]'}`}>
      {/* ── Global top bar ─────────────────────────────────────────────────── */}
      {!hideTopBar && <div className={`flex-shrink-0 flex items-center justify-between px-4 py-2.5 z-30 border-b ${isDark ? 'bg-[#111] border-white/5' : 'bg-white border-black/10'}`}>
        <div className="flex items-center gap-2">
          {onMenuToggle && (
            <button
              onClick={onMenuToggle}
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Toggle menu"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
          {weekBadge && <WeekBadge />}
        </div>

        {/* ── Profile avatar + dropdown ───────────────────────────────────── */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setDropdownOpen(o => !o)}
            className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-[#7a0000] ring-2 ring-[#CC0000]/30 hover:ring-[#CC0000]/70 transition-all focus:outline-none"
            aria-label="Open profile menu"
          >
            {navAvatar
              ? <img src={navAvatar} alt="avatar" className="w-full h-full object-cover" />
              : <span className="text-[11px] font-bold text-white leading-none">{initials}</span>
            }
          </button>

          {dropdownOpen && (
            <div className={`absolute right-0 top-full mt-2 w-56 rounded-xl shadow-2xl overflow-hidden z-50 border ${isDark ? 'bg-[#2b2d31] border-white/10' : 'bg-white border-black/10'}`}>

              {/* Header — not clickable */}
              <div className={`flex items-center gap-3 px-4 py-3.5 border-b ${isDark ? 'bg-[#1e1f22] border-white/10' : 'bg-[#f2f3f5] border-black/10'}`}>
                <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-[#7a0000] flex items-center justify-center ring-2 ring-[#CC0000]/30">
                  {navAvatar
                    ? <img src={navAvatar} alt="avatar" className="w-full h-full object-cover" />
                    : <span className="text-sm font-bold text-white">{initials}</span>
                  }
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{navName || 'User'}</p>
                  <p className="text-[11px] text-gray-500">{roleLabel(navRole)}</p>
                </div>
              </div>

              {/* Menu items */}
              <div className="py-1">
                <button
                  onClick={() => { router.push('/settings'); close(); }}
                  className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors text-left ${isDark ? 'text-gray-300 hover:text-white hover:bg-white/5' : 'text-gray-700 hover:text-gray-900 hover:bg-black/5'}`}
                >
                  <svg className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Settings
                </button>

                <button
                  onClick={() => { toggleTheme(); close(); }}
                  className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors text-left ${isDark ? 'text-gray-300 hover:text-white hover:bg-white/5' : 'text-gray-700 hover:text-gray-900 hover:bg-black/5'}`}
                >
                  {isDark ? (
                    <svg className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364-.707-.707M6.343 6.343l-.707-.707m12.728 0-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" />
                    </svg>
                  ) : (
                    <svg className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 0 1 8.646 3.646 9.003 9.003 0 0 0 12 21a9.003 9.003 0 0 0 8.354-5.646z" />
                    </svg>
                  )}
                  {isDark ? 'Light Mode' : 'Dark Mode'}
                </button>

                <button
                  onClick={() => { router.push('/dashboard/help'); close(); }}
                  className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors text-left ${isDark ? 'text-gray-300 hover:text-white hover:bg-white/5' : 'text-gray-700 hover:text-gray-900 hover:bg-black/5'}`}
                >
                  <svg className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Help
                </button>
              </div>

              {/* Sign out */}
              <div className={`border-t ${isDark ? 'border-white/10' : 'border-black/10'} py-1`}>
                <button
                  onClick={handleLogout}
                  className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:text-red-300 transition-colors text-left ${isDark ? 'hover:bg-red-500/10' : 'hover:bg-red-50'}`}
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9" />
                  </svg>
                  Sign Out
                </button>
              </div>

            </div>
          )}
        </div>
      </div>}

      {/* ── Page content ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>

      <ChatbotWidget token={token} role={navRole as 'professor' | 'student'} />
    </div>
  );
}
