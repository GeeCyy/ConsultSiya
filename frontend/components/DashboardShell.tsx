'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CURRENT_TERM, getAcademicWeek, getWeekMode } from '@/lib/academicCalendar';
import { FAQ_ROOT, type FaqNode } from '@/lib/faqData';

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

// ── FAQ Panel ─────────────────────────────────────────────────────────────────

// Breadcrumb trail: array of visited nodes leading to current state.
type Trail = FaqNode[];

function formatAnswer(text: string): React.ReactNode {
  return text.split('\n').map((line, i) => (
    <span key={i} className={`block ${line === '' ? 'h-2' : ''}`}>{line}</span>
  ));
}

function FaqPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  // trail[trail.length - 1] is the currently viewed node (or undefined for root)
  const [trail, setTrail] = useState<Trail>([]);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [trail]);

  const currentNode = trail[trail.length - 1];
  // What to show as buttons at this level
  const currentChildren: FaqNode[] =
    currentNode
      ? currentNode.children ?? []
      : FAQ_ROOT;

  const isRoot = trail.length === 0;
  const isLeaf = currentNode && (!currentNode.children || currentNode.children.length === 0);

  const goInto = (node: FaqNode) => setTrail(t => [...t, node]);
  const goBack = () => setTrail(t => t.slice(0, -1));
  const goRoot = () => setTrail([]);

  return (
    <div
      className="fixed bottom-20 right-6 z-50 flex flex-col rounded-2xl shadow-2xl border border-white/10 overflow-hidden"
      style={{ width: 340, height: 480, backgroundColor: '#2b2d31' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0 border-b border-white/10"
        style={{ backgroundColor: '#1e1f22' }}
      >
        <div className="flex items-center gap-2">
          {!isRoot && (
            <button
              onClick={goBack}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors mr-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #0369A1, #0EA5E9)' }}
          >
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white leading-tight">FAQ</p>
            <p className="text-[10px] text-gray-500 truncate">
              {isRoot ? 'Choose a topic' : currentNode?.label}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!isRoot && (
            <button
              onClick={goRoot}
              title="Back to topics"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-200 hover:bg-white/10 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-200 hover:bg-white/10 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Breadcrumb ──────────────────────────────────────────────────────── */}
      {!isRoot && (
        <div className="flex items-center gap-1 px-4 py-2 flex-shrink-0 border-b border-white/5 overflow-x-auto">
          <button onClick={goRoot} className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors whitespace-nowrap">
            Topics
          </button>
          {trail.map((node, i) => (
            <span key={node.id} className="flex items-center gap-1">
              <svg className="w-2.5 h-2.5 text-gray-700 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <button
                onClick={() => setTrail(trail.slice(0, i + 1))}
                className={`text-[10px] whitespace-nowrap transition-colors ${
                  i === trail.length - 1 ? 'text-white font-medium' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {node.label.length > 28 ? node.label.slice(0, 28) + '…' : node.label}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">

        {/* Root view — topic buttons */}
        {isRoot && (
          <>
            <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
              Select a topic to get an instant answer.
            </p>
            {FAQ_ROOT.map(node => (
              <button
                key={node.id}
                onClick={() => goInto(node)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-left text-sm font-medium text-white hover:bg-white/10 transition-colors border border-white/5 hover:border-white/10"
                style={{ backgroundColor: '#383a40' }}
              >
                <span className="leading-snug">{node.label}</span>
                <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </>
        )}

        {/* Branch view — sub-topic buttons */}
        {!isRoot && currentNode && !isLeaf && (
          <>
            {currentNode.answer && (
              <div className="text-sm text-gray-300 leading-relaxed mb-3 pb-3 border-b border-white/10">
                {formatAnswer(currentNode.answer)}
              </div>
            )}
            {currentChildren.map(child => (
              <button
                key={child.id}
                onClick={() => goInto(child)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-left text-sm font-medium text-white hover:bg-white/10 transition-colors border border-white/5 hover:border-white/10"
                style={{ backgroundColor: '#383a40' }}
              >
                <span className="leading-snug">{child.label}</span>
                <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </>
        )}

        {/* Leaf view — answer + action buttons */}
        {isLeaf && currentNode.answer && (
          <>
            <div
              className="rounded-xl px-4 py-3 text-sm text-gray-300 leading-relaxed border border-white/5"
              style={{ backgroundColor: '#383a40' }}
            >
              {formatAnswer(currentNode.answer)}
            </div>

            {currentNode.actions && currentNode.actions.length > 0 && (
              <div className="space-y-2 pt-1">
                {currentNode.actions.map(action => (
                  action.route ? (
                    <button
                      key={action.label}
                      onClick={() => { router.push(action.route!); onClose(); }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors hover:opacity-90"
                      style={{ backgroundColor: '#CC0000' }}
                    >
                      {action.label}
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ) : (
                    <div
                      key={action.label}
                      className="w-full py-2.5 px-4 rounded-xl text-sm text-gray-400 border border-white/10 text-center"
                    >
                      {action.label}
                    </div>
                  )
                ))}
              </div>
            )}

            <button
              onClick={goBack}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors mt-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to previous topic
            </button>
          </>
        )}

        {/* Leaf with no answer (shouldn't happen if data is correct) */}
        {isLeaf && !currentNode.answer && (
          <p className="text-sm text-gray-500 text-center py-6">No answer configured for this topic.</p>
        )}
      </div>

      {/* ── Footer hint ─────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 px-4 py-2 border-t border-white/5 flex items-center justify-between"
        style={{ backgroundColor: '#1e1f22' }}
      >
        <span className="text-[10px] text-gray-600">
          {isRoot ? `${FAQ_ROOT.length} topics available` : 'Tap any topic for an answer'}
        </span>
        <button onClick={goRoot} className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
          All topics
        </button>
      </div>
    </div>
  );
}

// ── DashboardShell (public export) ────────────────────────────────────────────

function FaqButton({ onClick, open }: { onClick: () => void; open: boolean }) {
  return (
    <button
      onClick={onClick}
      title="FAQ"
      aria-label={open ? 'Close FAQ' : 'Open FAQ'}
      className="fixed bottom-6 right-6 z-50 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 hover:-translate-y-0.5"
      style={{ background: 'linear-gradient(135deg, #0369A1, #0EA5E9)', width: 52, height: 52, boxShadow: '0 4px 20px rgba(14,165,233,0.4), 0 2px 8px rgba(14,165,233,0.2)' }}
    >
      {open ? (
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      ) : (
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )}
    </button>
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
  const [faqOpen, setFaqOpen] = useState(false);
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
    localStorage.clear();
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
                  onClick={() => { setFaqOpen(true); close(); }}
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
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1" />
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

      <FaqButton onClick={() => setFaqOpen(v => !v)} open={faqOpen} />
      {faqOpen && <FaqPanel onClose={() => setFaqOpen(false)} />}
    </div>
  );
}
