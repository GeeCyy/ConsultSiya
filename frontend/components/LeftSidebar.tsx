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
  status?: string;
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

export interface LeftSidebarProps {
  role: 'professor' | 'student' | 'admin';
  navItems: NavItem[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  profileName: string;
  profileAvatar: string | null;
  isDark: boolean;
  onToggleTheme: () => void;
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
  return `${d}d ago`;
}

function fmtNotifDate(date: string, time: string | null, timeStart: string): string {
  const d = new Date(date.slice(0, 10) + 'T12:00:00');
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

// ── Nav icons ──────────────────────────────────────────────────────────────────

function NavIcon({ tabKey }: { tabKey: string }) {
  const cls = 'w-4 h-4 flex-shrink-0';
  switch (tabKey) {
    case 'home':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="m3 12 2-2m0 0 7-7 7 7M5 10v10a1 1 0 0 0 1 1h3m10-11 2 2m-2-2v10a1 1 0 0 1-1 1h-3m-6 0a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1m-6 0h6" /></svg>;
    case 'schedules':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z" /></svg>;
    case 'calendar':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>;
    case 'consultations':
    case 'my':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" /></svg>;
    case 'export':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>;
    case 'history':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>;
    case 'book':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>;
    default:
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><circle cx="12" cy="12" r="9" /></svg>;
  }
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function LeftSidebar({
  role,
  navItems,
  activeTab,
  onTabChange,
  profileName,
  profileAvatar,
  isDark,
  onToggleTheme,
  pendingConsultations: pendingProp,
  announcements: annProp,
  storageKey: storageKeyProp,
}: LeftSidebarProps) {
  const router = useRouter();
  const pendingConsultations = pendingProp ?? [];
  const announcements = annProp ?? [];
  const storageKey = storageKeyProp ?? `dashboard-notif-${role}`;

  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [expandedAnn, setExpandedAnn] = useState<number | null>(null);
  const [_mounted, setMounted] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const notifRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    try { setReadIds(new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'))); } catch { /* */ }
    try { setDismissedIds(new Set(JSON.parse(localStorage.getItem(storageKey + '_dismissed') || '[]'))); } catch { /* */ }
  }, [storageKey]);

  const persistRead = (ids: Set<string>) => {
    setReadIds(ids);
    try { localStorage.setItem(storageKey, JSON.stringify([...ids])); } catch { /* */ }
  };

  const persistDismissed = (ids: Set<string>) => {
    setDismissedIds(ids);
    try { localStorage.setItem(storageKey + '_dismissed', JSON.stringify([...ids])); } catch { /* */ }
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
    if (!notifOpen) return;
    const h = (e: MouseEvent) => {
      if (!notifRef.current?.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [notifOpen]);

  // Close mobile overlay on outside click
  useEffect(() => {
    if (!mobileOpen) return;
    const h = (e: MouseEvent) => {
      if (overlayRef.current === e.target) setMobileOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [mobileOpen]);

  // Close mobile menu on viewport resize
  useEffect(() => {
    const h = () => { if (window.innerWidth >= 1024) setMobileOpen(false); };
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  const handleLogout = () => { localStorage.clear(); router.push('/login'); };

  const handleTabChange = (key: string) => {
    onTabChange(key);
    setMobileOpen(false);
  };

  const initials = profileName.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?';
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  const dismissNotif = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    const next = new Set(dismissedIds); next.add(key);
    persistDismissed(next);
    const nextRead = new Set(readIds); nextRead.add(key);
    persistRead(nextRead);
  };

  // ── Sidebar body (reused for desktop + mobile overlay) ──────────────────────

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-[#1e1f22]">

      {/* ── Logo ── */}
      <div className="flex items-center gap-3 px-4 py-4 flex-shrink-0" style={{ backgroundColor: '#CC0000', borderBottom: '1px solid rgba(0,0,0,0.15)' }}>
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-white flex items-center justify-center overflow-hidden">
          <img src="/consulta-logo.png" alt="Consulta" className="h-8 w-auto object-contain" />
        </div>
        <div>
          <p className="font-bold text-sm leading-none" style={{ color: '#fff' }}>Consulta</p>
          <p className="text-[10px] mt-0.5 leading-none" style={{ color: 'rgba(255,255,255,0.75)' }}>MAPUA SOIT</p>
        </div>
        <span className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0" style={{ color: '#fff', border: '1px solid rgba(255,255,255,0.45)' }}>
          {role.toUpperCase()}
        </span>
      </div>

      {/* ── Notification bell ── */}
      <div ref={notifRef} className="relative px-2 pt-2 pb-1">
        <button
          onClick={() => setNotifOpen(o => !o)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
          </svg>
          <span className="flex-1">Notifications</span>
          {unreadCount > 0 && (
            <span className="text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full bg-[#CC0000] text-white flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {notifOpen && (
          <div className="fixed top-[72px] left-[248px] z-50 w-80 rounded-xl shadow-2xl overflow-hidden border border-white/10 bg-[#252525]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#1e1e1e]">
              <p className="text-sm font-semibold text-white">
                Notifications
                {unreadCount > 0 && (
                  <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#CC0000] text-white">
                    {unreadCount} new
                  </span>
                )}
              </p>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-[11px] text-[#CC0000] hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            <div className="overflow-y-auto max-h-72">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-gray-500">No notifications</p>
                </div>
              ) : notifications.map(n => {
                const isUnread = !readIds.has(n.key);
                const unreadBg = isUnread ? 'bg-white/[0.03]' : '';
                const dismissBtn = (
                  <button
                    onClick={(e) => dismissNotif(e, n.key)}
                    title="Dismiss"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                  >×</button>
                );
                if (n.kind === 'consultation') {
                  return (
                    <div key={n.key} className={`relative group border-b border-white/5 ${unreadBg}`}>
                      <button
                        onClick={() => { const nx = new Set(readIds); nx.add(n.key); persistRead(nx); setNotifOpen(false); onTabChange('consultations'); }}
                        className="w-full flex items-start gap-3 px-4 py-3 pr-8 text-left hover:bg-white/5 transition-colors"
                      >
                        <span className="text-base flex-shrink-0 mt-0.5">📅</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-200 leading-snug">
                            <span className="font-semibold">{n.consult.student_name}</span> booked a consultation
                          </p>
                          <p className="text-[11px] mt-0.5 text-gray-500">
                            {fmtNotifDate(n.consult.date, n.consult.time, n.consult.time_start)}
                          </p>
                        </div>
                        {isUnread && <span className="w-2 h-2 rounded-full bg-[#CC0000] flex-shrink-0 mt-1.5" />}
                      </button>
                      {dismissBtn}
                    </div>
                  );
                }
                const expanded = expandedAnn === n.ann.id;
                return (
                  <div key={n.key} className={`relative group border-b border-white/5 ${unreadBg}`}>
                    <button
                      onClick={() => { const nx = new Set(readIds); nx.add(n.key); persistRead(nx); setExpandedAnn(expanded ? null : n.ann.id); }}
                      className="w-full flex items-start gap-3 px-4 py-3 pr-8 text-left hover:bg-white/5 transition-colors"
                    >
                      <span className="text-base flex-shrink-0 mt-0.5">{n.ann.type === 'warning' ? '⚠️' : '📢'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-200 leading-snug">{n.ann.title || n.ann.body.slice(0, 60)}</p>
                        <p className="text-[11px] mt-0.5 text-gray-500">{relTime(n.ann.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                        {isUnread && <span className="w-2 h-2 rounded-full bg-[#CC0000]" />}
                        <svg className={`w-3 h-3 transition-transform text-gray-500 ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    {expanded && (
                      <div className="px-4 pb-3 text-[11px] leading-relaxed text-gray-400">{n.ann.body}</div>
                    )}
                    {dismissBtn}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Nav items ── */}
      <nav className="flex-1 px-2 py-1 space-y-0.5 overflow-y-auto">
        {navItems.map(item => {
          const isActive = activeTab === item.key;
          const hasBadge = item.key === 'consultations' && unreadCount > 0;
          return (
            <button
              key={item.key}
              onClick={() => handleTabChange(item.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left group ${
                isActive
                  ? 'bg-[#CC0000] text-white shadow-sm shadow-red-900/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
            >
              <NavIcon tabKey={item.key} />
              <span className="flex-1 truncate">{item.label}</span>
              {hasBadge && (
                <span className={`text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center ${
                  isActive ? 'bg-white/20 text-white' : 'bg-[#CC0000] text-white'
                }`}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Bottom actions ── */}
      <div className="border-t border-white/5 px-2 py-3 space-y-0.5 flex-shrink-0">
        <button
          onClick={onToggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
        >
          {isDark ? (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0z" /></svg>
          ) : (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998z" /></svg>
          )}
          {isDark ? 'Light Mode' : 'Dark Mode'}
        </button>
        <button
          onClick={() => { router.push('/settings'); setMobileOpen(false); }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          Settings
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1" /></svg>
          Sign Out
        </button>
      </div>

      {/* ── Profile footer ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-t border-white/5 flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-[#7a0000] flex items-center justify-center text-white text-xs font-bold flex-shrink-0 overflow-hidden ring-2 ring-[#CC0000]/20">
          {profileAvatar && !profileAvatar.startsWith('/uploads/')
            ? <img src={profileAvatar} alt={profileName} className="w-full h-full object-cover" />
            : initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate" style={{ color: '#fff' }}>{profileName || roleLabel}</p>
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.55)' }}>{roleLabel}</p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Desktop sidebar (lg+) ── */}
      <aside className="hidden lg:flex flex-col w-60 flex-shrink-0 h-screen sticky top-0 overflow-hidden">
        <SidebarContent />
      </aside>

      {/* ── Mobile top bar ── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center gap-3 px-4 h-14 bg-[#1e1f22] border-b border-white/5 shadow-lg">
        <button
          onClick={() => setMobileOpen(o => !o)}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
          aria-label="Toggle navigation"
        >
          {mobileOpen ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
          )}
        </button>
        <img src="/consulta-logo.png" alt="Consulta" className="h-9 w-auto object-contain" />
        <p className="font-bold text-sm text-white">Consulta</p>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold border border-[#CC0000]/40 text-[#CC0000]">
          {role.toUpperCase()}
        </span>
        <div className="flex-1" />
        {/* Notification badge in mobile header */}
        <button
          onClick={() => { setNotifOpen(o => !o); setMobileOpen(false); }}
          className="relative w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-[#CC0000] text-white text-[9px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Mobile overlay ── */}
      {mobileOpen && (
        <div
          ref={overlayRef}
          className="lg:hidden fixed inset-0 z-50 flex"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        >
          <div className="w-64 h-full flex flex-col shadow-2xl">
            <SidebarContent />
          </div>
        </div>
      )}

      {/* ── Mobile notification panel (when opened from header) ── */}
      {notifOpen && (
        <div ref={notifRef} className="lg:hidden fixed top-14 right-3 z-50 w-[calc(100vw-24px)] max-w-sm rounded-xl shadow-2xl overflow-hidden border border-white/10 bg-[#252525]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#1e1e1e]">
            <p className="text-sm font-semibold text-white">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#CC0000] text-white">{unreadCount} new</span>
              )}
            </p>
            <button onClick={() => setNotifOpen(false)} className="text-gray-500 hover:text-white">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="overflow-y-auto max-h-64">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">No notifications</p>
            ) : notifications.slice(0, 8).map(n => {
              const isUnread = !readIds.has(n.key);
              return (
                <div key={n.key} className={`border-b border-white/5 ${
                  isUnread && n.kind === 'consultation' && n.consult.status === 'confirmed'
                    ? 'bg-blue-500/5'
                    : isUnread ? 'bg-white/[0.03]' : ''
                }`}>
                  <button
                    onClick={() => {
                      const nx = new Set(readIds); nx.add(n.key); persistRead(nx);
                      setNotifOpen(false);
                      if (n.kind === 'consultation') onTabChange('consultations');
                    }}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
                  >
                    <span className="text-sm flex-shrink-0 mt-0.5">{n.kind === 'consultation' ? '📅' : n.kind === 'announcement' && n.ann.type === 'warning' ? '⚠️' : '📢'}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium leading-snug line-clamp-2 ${
                        n.kind === 'consultation' && n.consult.status === 'confirmed'
                          ? 'text-blue-300'
                          : 'text-gray-200'
                      }`}>
                        {n.kind === 'consultation'
                          ? <><span className="font-semibold">{n.consult.student_name}</span>{n.consult.status === 'confirmed' ? ' — consultation approved' : ' booked a consultation'}</>
                          : n.ann.title || n.ann.body.slice(0, 60)}
                      </p>
                      <p className="text-[10px] mt-0.5 text-gray-500">
                        {n.kind === 'consultation'
                          ? fmtNotifDate(n.consult.date, n.consult.time, n.consult.time_start)
                          : relTime(n.ann.created_at)}
                      </p>
                    </div>
                    {isUnread && (
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
                        n.kind === 'consultation' && n.consult.status === 'confirmed'
                          ? 'bg-blue-500'
                          : 'bg-[#CC0000]'
                      }`} />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
