'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export type NavItem = { key: string; label: string };

type PendingConsult = {
  id: number;
  student_name: string;
  date: string;
  time: string | null;
  time_start: string;
};

type AnnItem = {
  id: number;
  title: string;
  body: string;
  type: string;
  created_at: string;
};

type Notif =
  | { kind: 'consultation'; key: string; sortKey: string; consult: PendingConsult }
  | { kind: 'announcement'; key: string; sortKey: string; ann: AnnItem };

export interface DashboardNavbarProps {
  role: 'professor' | 'student' | 'admin';
  navItems: NavItem[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  profileName: string;
  profileAvatar: string | null;
  isDark: boolean;
  onToggleTheme: () => void;
  notificationCount?: number;
  // Full notification dropdown (professor-style, all three required together)
  pendingConsultations?: PendingConsult[];
  announcements?: AnnItem[];
  storageKey?: string;
}

function relTime(iso: string): string {
  const ms = new Date(iso).getTime();
  if (!iso || isNaN(ms)) return '';
  const diff = Date.now() - ms;
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(h / 24);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  if (d === 1) return 'Yesterday';
  return `${d} days ago`;
}

function fmtNotifDate(date: string, time: string | null, timeStart: string): string {
  const d = new Date(date + 'T12:00:00');
  const dow = d.toLocaleDateString('en-PH', { weekday: 'short' });
  const mon = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  const t = (time || timeStart)?.slice(0, 5);
  let t12 = '';
  if (t) {
    const [h, m] = t.split(':').map(Number);
    t12 = ` at ${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }
  return `${dow}, ${mon}${t12}`;
}

export default function DashboardNavbar({
  role,
  navItems,
  activeTab,
  onTabChange,
  profileName,
  profileAvatar,
  isDark,
  onToggleTheme,
  notificationCount,
  pendingConsultations: pendingProp,
  announcements: annProp,
  storageKey: storageKeyProp,
}: DashboardNavbarProps) {
  const router = useRouter();

  const pendingConsultations = pendingProp ?? [];
  const announcements        = annProp ?? [];
  const storageKey           = storageKeyProp ?? `dashboard-notif-${role}`;

  // Profile dropdown
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Mobile menu
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Notification dropdown
  const [notifOpen, setNotifOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try { return new Set(JSON.parse(localStorage.getItem(storageKey) || '[]')); }
    catch { return new Set(); }
  });
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try { return new Set(JSON.parse(localStorage.getItem(storageKey + '_dismissed') || '[]')); }
    catch { return new Set(); }
  });
  const [expandedAnn, setExpandedAnn] = useState<number | null>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const persistRead = (ids: Set<string>) => {
    setReadIds(ids);
    try { localStorage.setItem(storageKey, JSON.stringify([...ids])); } catch { /* */ }
  };

  const persistDismissed = (ids: Set<string>) => {
    setDismissedIds(ids);
    try { localStorage.setItem(storageKey + '_dismissed', JSON.stringify([...ids])); } catch { /* */ }
  };

  const dismissNotif = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    const next = new Set(dismissedIds); next.add(key);
    persistDismissed(next);
    const nextRead = new Set(readIds); nextRead.add(key);
    persistRead(nextRead);
  };

  const notifications: Notif[] = [
    ...pendingConsultations.map(c => ({
      kind: 'consultation' as const,
      key: `consultation-${c.id}`,
      sortKey: `${c.date}T${c.time || c.time_start || '00:00'}`,
      consult: c,
    })),
    ...announcements.map(a => ({
      kind: 'announcement' as const,
      key: `announcement-${a.id}`,
      sortKey: a.created_at,
      ann: a,
    })),
  ].sort((a, b) => b.sortKey.localeCompare(a.sortKey))
    .filter(n => !dismissedIds.has(n.key));

  const unreadCount = notifications.filter(n => !readIds.has(n.key)).length;
  const badgeCount  = unreadCount > 0 ? unreadCount : (notificationCount ?? 0);
  const hasFullData = pendingProp !== undefined && annProp !== undefined;

  const markAllRead = () => {
    const next = new Set(readIds);
    notifications.forEach(n => next.add(n.key));
    persistRead(next);
  };

  useEffect(() => {
    if (!notifOpen || unreadCount === 0) return;
    const t = setTimeout(markAllRead, 3000);
    return () => clearTimeout(t);
  }, [notifOpen, unreadCount]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const h = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [dropdownOpen]);

  useEffect(() => {
    if (!notifOpen) return;
    const h = (e: MouseEvent) => {
      if (!notifRef.current?.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [notifOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const h = (e: MouseEvent) => {
      if (!mobileMenuRef.current?.contains(e.target as Node)) setMobileMenuOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [mobileMenuOpen]);

  // Close mobile menu on resize past mobile breakpoint
  useEffect(() => {
    const h = () => { if (window.innerWidth >= 768) setMobileMenuOpen(false); };
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  const handleLogout = () => { localStorage.clear(); router.push('/login'); };

  const initials = profileName.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?';
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  // Style tokens
  const bg        = isDark ? 'bg-[#1f1f1f] border-b border-white/5'   : 'bg-white border-b border-gray-200 shadow-sm';
  const text      = isDark ? 'text-gray-400'                          : 'text-gray-600';
  const textHover = isDark ? 'hover:text-white hover:bg-white/5'      : 'hover:text-gray-900 hover:bg-gray-100';
  const iconBtn   = `w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg transition-colors ${
    isDark ? 'text-gray-500 hover:text-white hover:bg-white/5' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
  }`;
  const dropBg     = isDark ? 'bg-[#303030] border-white/10' : 'bg-white border-black/10';
  const dropHeader = isDark ? 'bg-[#262626] border-white/10' : 'bg-[#f2f3f5] border-black/10';
  const dropItem   = `flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors text-left ${
    isDark ? 'text-gray-300 hover:text-white hover:bg-white/5' : 'text-gray-700 hover:text-gray-900 hover:bg-black/5'
  }`;
  const dropIcon   = `w-4 h-4 flex-shrink-0 ${isDark ? 'text-gray-500' : 'text-gray-400'}`;
  const mobileBg   = isDark ? 'bg-[#1f1f1f] border-white/5' : 'bg-white border-gray-200';
  const mobileItem = `w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors text-left`;

  const handleTabChange = (key: string) => {
    onTabChange(key);
    setMobileMenuOpen(false);
  };

  return (
    <header className={`sticky top-0 z-40 ${bg}`}>
      <div className="flex items-center gap-2 sm:gap-4 px-3 sm:px-6 h-14">
        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <img src="/consulta-logo.png" alt="Consulta" className="h-12 sm:h-14 w-auto object-contain" />
          <div className="hidden sm:block">
            <p className={`font-bold text-sm leading-none ${isDark ? 'text-white' : 'text-gray-900'}`}>Consulta</p>
            <p className={`text-[10px] leading-none mt-0.5 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>MAPUA SOIT</p>
          </div>
        </div>

        {/* Role badge */}
        <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold border border-[#CC0000]/40 text-[#CC0000]">
          {role.toUpperCase()}
        </span>

        {/* Desktop nav items */}
        <nav className="hidden md:flex items-center gap-0.5 flex-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {navItems.map(item => (
            <button
              key={item.key}
              onClick={() => onTabChange(item.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                activeTab === item.key ? 'bg-[#CC0000] text-white shadow-sm' : `${text} ${textHover}`
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Spacer on mobile */}
        <div className="flex-1 md:hidden" />

        {/* Right side */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">

          {/* Notification bell */}
          <div ref={notifRef} className="relative">
            <button
              onClick={() => setNotifOpen(o => !o)}
              className={`${iconBtn} relative`}
              title="Notifications"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
              </svg>
              {badgeCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-[#CC0000] text-white text-[9px] font-bold flex items-center justify-center leading-none">
                  {badgeCount > 9 ? '9+' : badgeCount}
                </span>
              )}
            </button>

            {/* Notification dropdown — full-width on mobile */}
            {notifOpen && (
              <div className={`absolute right-0 top-full mt-2 rounded-xl shadow-2xl overflow-hidden z-[60] border ${dropBg}
                w-[calc(100vw-24px)] sm:w-80
                max-w-sm
                -right-2 sm:right-0`}
                style={{ right: 'calc(-1 * (100vw - 100% - 12px))' }}
              >
                {/* Header */}
                <div className={`flex items-center justify-between px-4 py-3 border-b ${dropHeader}`}>
                  <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Notifications
                    {unreadCount > 0 && (
                      <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#CC0000] text-white">
                        {unreadCount} new
                      </span>
                    )}
                  </p>
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="text-[11px] text-[#CC0000] hover:underline transition-colors">
                      Mark all as read
                    </button>
                  )}
                </div>

                {/* List */}
                <div className="overflow-y-auto max-h-72 sm:max-h-80">
                  {!hasFullData || notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No notifications</p>
                    </div>
                  ) : notifications.map(n => {
                    const isUnread = !readIds.has(n.key);
                    const unreadBg = isUnread
                      ? isDark ? 'bg-white/[0.03]' : 'bg-blue-50/60'
                      : '';

                    const dismissBtn = (
                      <button
                        onClick={(e) => dismissNotif(e, n.key)}
                        title="Dismiss"
                        className={`absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded text-sm leading-none ${
                          isDark ? 'text-gray-500 hover:text-red-400 hover:bg-red-500/10' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                        }`}
                      >
                        ×
                      </button>
                    );

                    if (n.kind === 'consultation') {
                      return (
                        <div
                          key={n.key}
                          className={`relative group border-b ${isDark ? 'border-white/5' : 'border-gray-100'} ${unreadBg}`}
                        >
                          <button
                            onClick={() => {
                              const next = new Set(readIds); next.add(n.key); persistRead(next);
                              setNotifOpen(false);
                              onTabChange('consultations');
                            }}
                            className={`w-full flex items-start gap-3 px-4 py-3 pr-8 text-left transition-colors ${
                              isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'
                            }`}
                          >
                            <span className="text-base flex-shrink-0 mt-0.5">📅</span>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-medium leading-snug ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                                <span className="font-semibold">{n.consult.student_name}</span> booked a consultation
                              </p>
                              <p className={`text-[11px] mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                {fmtNotifDate(n.consult.date, n.consult.time, n.consult.time_start)}
                              </p>
                            </div>
                            {isUnread && <span className="w-2 h-2 rounded-full bg-[#CC0000] flex-shrink-0 mt-1.5" />}
                          </button>
                          {dismissBtn}
                        </div>
                      );
                    }

                    // Announcement
                    const expanded = expandedAnn === n.ann.id;
                    return (
                      <div
                        key={n.key}
                        className={`relative group border-b transition-colors ${
                          isDark ? 'border-white/5' : 'border-gray-100'
                        } ${unreadBg}`}
                      >
                        <button
                          onClick={() => {
                            const next = new Set(readIds); next.add(n.key); persistRead(next);
                            setExpandedAnn(expanded ? null : n.ann.id);
                          }}
                          className={`w-full flex items-start gap-3 px-4 py-3 pr-8 text-left transition-colors ${
                            isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'
                          }`}
                        >
                          <span className="text-base flex-shrink-0 mt-0.5">
                            {n.ann.type === 'warning' ? '⚠️' : '📢'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-medium leading-snug ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                              {n.ann.title || n.ann.body.slice(0, 60)}
                            </p>
                            <p className={`text-[11px] mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                              {relTime(n.ann.created_at)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                            {isUnread && <span className="w-2 h-2 rounded-full bg-[#CC0000]" />}
                            <svg
                              className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''} ${isDark ? 'text-gray-500' : 'text-gray-400'}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>
                        {expanded && (
                          <div className={`px-4 pb-3 pt-0 text-[11px] leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                            {n.ann.body}
                          </div>
                        )}
                        {dismissBtn}
                      </div>
                    );
                  })}
                </div>

                {/* Footer */}
                {hasFullData && notifications.length > 0 && (
                  <div className={`px-4 py-2.5 border-t ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                    <button
                      onClick={() => { onTabChange('consultations'); setNotifOpen(false); }}
                      className="text-[11px] text-[#CC0000] hover:underline"
                    >
                      View all consultations →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Theme toggle — hidden on very small screens, visible sm+ */}
          <button onClick={onToggleTheme} className={`${iconBtn} hidden sm:flex`} title="Toggle theme">
            {isDark ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998z" />
              </svg>
            )}
          </button>

          {/* Avatar + dropdown */}
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setDropdownOpen(o => !o)}
              className="w-9 h-9 sm:w-8 sm:h-8 rounded-full bg-[#7a0000] flex items-center justify-center text-white text-xs font-bold flex-shrink-0 overflow-hidden ring-2 ring-[#CC0000]/20 hover:ring-[#CC0000]/60 transition-all focus:outline-none"
              aria-label="Open profile menu"
            >
              {profileAvatar && !profileAvatar.startsWith('/uploads/')
                ? <img src={profileAvatar} alt={profileName} className="w-full h-full object-cover" />
                : initials}
            </button>

            {dropdownOpen && (
              <div className={`absolute right-0 top-full mt-2 w-56 rounded-xl shadow-2xl overflow-hidden z-50 border ${dropBg}`}>
                {/* Header */}
                <div className={`flex items-center gap-3 px-4 py-3.5 border-b ${dropHeader}`}>
                  <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-[#7a0000] flex items-center justify-center ring-2 ring-[#CC0000]/30">
                    {profileAvatar && !profileAvatar.startsWith('/uploads/')
                      ? <img src={profileAvatar} alt={profileName} className="w-full h-full object-cover" />
                      : <span className="text-sm font-bold text-white">{initials}</span>}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {profileName || roleLabel}
                    </p>
                    <p className="text-[11px] text-gray-500">{roleLabel}</p>
                  </div>
                </div>

                {/* Menu items */}
                <div className="py-1">
                  <button onClick={() => { router.push('/settings'); setDropdownOpen(false); }} className={dropItem}>
                    <svg className={dropIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Settings
                  </button>
                  <button onClick={() => { onToggleTheme(); setDropdownOpen(false); }} className={dropItem}>
                    {isDark ? (
                      <svg className={dropIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364-.707-.707M6.343 6.343l-.707-.707m12.728 0-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" />
                      </svg>
                    ) : (
                      <svg className={dropIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998z" />
                      </svg>
                    )}
                    {isDark ? 'Light Mode' : 'Dark Mode'}
                  </button>
                </div>

                {/* Sign out */}
                <div className={`border-t ${isDark ? 'border-white/10' : 'border-black/10'} py-1`}>
                  <button
                    onClick={handleLogout}
                    className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:text-red-300 transition-colors text-left ${
                      isDark ? 'hover:bg-red-500/10' : 'hover:bg-red-50'
                    }`}
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

          {/* Hamburger — mobile only */}
          <button
            onClick={() => setMobileMenuOpen(o => !o)}
            className={`md:hidden ${iconBtn}`}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div
          ref={mobileMenuRef}
          className={`md:hidden border-t ${mobileBg} shadow-lg`}
        >
          <nav className="py-1">
            {navItems.map(item => (
              <button
                key={item.key}
                onClick={() => handleTabChange(item.key)}
                className={`${mobileItem} ${
                  activeTab === item.key
                    ? 'bg-[#CC0000] text-white'
                    : isDark
                      ? 'text-gray-300 hover:text-white hover:bg-white/5'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {activeTab === item.key && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white flex-shrink-0" />
                )}
                {item.label}
              </button>
            ))}
            <div className={`border-t mt-1 pt-1 ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
              <button
                onClick={() => { onToggleTheme(); setMobileMenuOpen(false); }}
                className={`${mobileItem} ${isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
              >
                {isDark ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998z" />
                  </svg>
                )}
                {isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
