'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications, type LiveNotif } from '@/hooks/useNotifications';

export type NavItem = { key: string; label: string };

type PendingConsult = {
  id: number;
  student_name: string;
  professor_name?: string;
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

// ── Live notification helpers ──────────────────────────────────────────────────

function liveNotifIcon(type: string): string {
  switch (type) {
    case 'new_slot':         return '📅';
    case 'new_booking':      return '👤';
    case 'new_request':      return '🔔';
    case 'status_update':    return '✅';
    case 'cancelled':        return '❌';
    case 'new_registration': return '🧑‍💻';
    default:                 return '🔔';
  }
}

function liveNotifTitle(type: string): string {
  switch (type) {
    case 'new_slot':         return 'New slot available';
    case 'new_booking':      return 'New booking';
    case 'new_request':      return 'New request';
    case 'status_update':    return 'Status update';
    case 'cancelled':        return 'Consultation cancelled';
    case 'new_registration': return 'New registration';
    default:                 return 'Notification';
  }
}

function liveNotifDot(type: string): string {
  switch (type) {
    case 'new_slot':         return 'bg-blue-500';
    case 'new_booking':      return 'bg-green-500';
    case 'new_request':      return 'bg-amber-500';
    case 'status_update':    return 'bg-emerald-500';
    case 'cancelled':        return 'bg-red-500';
    case 'new_registration': return 'bg-purple-500';
    default:                 return 'bg-blue-500';
  }
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
    case 'accounts':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>;
    case 'reports':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>;
    case 'announcements':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 1 8.835-2.535m0 0A23.74 23.74 0 0 1 18.795 3m.38 1.125a23.91 23.91 0 0 1 1.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 0 0 1.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 0 1 0 3.46" /></svg>;
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
  const [token, setToken] = useState<string | null>(null);

  const {
    notifs: liveNotifs,
    unreadCount: liveUnread,
    markAllRead: markLiveAllRead,
    markRead: markLiveRead,
    toast: liveToast,
    dismissToast,
  } = useNotifications(token);

  const notifRef       = useRef<HTMLDivElement>(null); // desktop bell button area
  const notifPanelRef  = useRef<HTMLDivElement>(null); // desktop dropdown panel
  const notifMobileRef = useRef<HTMLDivElement>(null); // mobile dropdown panel
  const overlayRef     = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    try { setReadIds(new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'))); } catch { /* */ }
    try { setDismissedIds(new Set(JSON.parse(localStorage.getItem(storageKey + '_dismissed') || '[]'))); } catch { /* */ }
    setToken(localStorage.getItem('token') || null);
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

  const propUnreadCount = notifications.filter(n => n.kind === 'consultation' && !readIds.has(n.key)).length;
  const unreadCount = propUnreadCount + liveUnread;
  const unreadConsultCount = unreadCount;

  const consultNotifs = notifications.filter(n => n.kind === 'consultation');
  const annNotifs     = notifications.filter(n => n.kind === 'announcement');

  const markAllRead = () => {
    const next = new Set(readIds);
    notifications.forEach(n => next.add(n.key));
    persistRead(next);
    markLiveAllRead();
  };

  useEffect(() => {
    if (!notifOpen) return;
    const next = new Set(readIds);
    let changed = false;
    notifications.forEach(n => {
      if (n.kind === 'consultation' && !next.has(n.key)) { next.add(n.key); changed = true; }
    });
    if (changed) persistRead(next);
    // Also mark live notifications read when panel is opened
    if (liveUnread > 0) markLiveAllRead();
  }, [notifOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!notifOpen) return;
    const h = (e: MouseEvent) => {
      const inBtn    = notifRef.current?.contains(e.target as Node);
      const inPanel  = notifPanelRef.current?.contains(e.target as Node);
      const inMobile = notifMobileRef.current?.contains(e.target as Node);
      if (!inBtn && !inPanel && !inMobile) setNotifOpen(false);
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

  const sbBg    = isDark ? 'bg-[#1e1f22]'  : 'bg-white';
  const sbBdr   = isDark ? 'border-white/5' : 'border-gray-200';
  const sbText  = isDark ? 'text-gray-400'  : 'text-gray-600';
  const sbHover = isDark ? 'hover:text-gray-200 hover:bg-white/5' : 'hover:text-gray-900 hover:bg-gray-100';
  const sbName  = isDark ? 'text-white'     : 'text-gray-900';
  const sbSub   = isDark ? 'text-gray-500'  : 'text-gray-400';

  const SidebarContent = () => (
    <div className={`flex flex-col h-full ${sbBg}`}>

      {/* ── Logo ── */}
      <div className="flex items-center gap-3 px-4 py-4 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #0369A1, #0EA5E9)', borderBottom: '1px solid rgba(0,0,0,0.15)' }}>
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-white flex items-center justify-center overflow-hidden">
          <img src="/consulta-logo.png" alt="Consulta" className="h-8 w-auto object-contain" />
        </div>
        <div>
          <p className="font-bold text-sm leading-none" style={{ color: '#fff' }}>Consulta</p>
          <p className="text-[10px] mt-0.5 leading-none" style={{ color: 'rgba(255,255,255,0.75)' }}>MAPUA SOIT</p>
        </div>
        <span
          className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0 text-white bg-gradient-to-r from-orange-500 to-amber-400"
        >
          {role.toUpperCase()}
        </span>
      </div>

      {/* ── Notification bell ── */}
      <div ref={notifRef} className="px-2 pt-2 pb-1">
        <button
          onClick={() => setNotifOpen(o => !o)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${sbText} ${sbHover}`}
        >
          <svg className={`w-4 h-4 flex-shrink-0 ${unreadConsultCount > 0 ? 'bell-ringing' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
          </svg>
          <span className="flex-1">Notifications</span>
          {unreadCount > 0 && (
            <span className={`text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full text-white flex items-center justify-center bg-[#0EA5E9]`}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Nav items ── */}
      <nav className="flex-1 px-2 py-1 space-y-0.5 overflow-y-auto">
        {navItems.map(item => {
          const isActive = activeTab === item.key;
          const pendingCount = item.key === 'consultations' ? pendingConsultations.length : 0;
          const hasBadge = pendingCount > 0;
          return (
            <button
              key={item.key}
              onClick={() => handleTabChange(item.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left group ${
                isActive
                  ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                  : `${sbText} ${sbHover}`
              }`}
            >
              <NavIcon tabKey={item.key} />
              <span className="flex-1 truncate">{item.label}</span>
              {hasBadge && (
                <span className={`text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center ${
                  isActive ? 'bg-white/20 text-white' : 'bg-[#0EA5E9] text-white'
                }`}>
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Bottom actions ── */}
      <div className={`border-t ${sbBdr} px-2 py-3 space-y-0.5 flex-shrink-0`}>
        <button
          onClick={onToggleTheme}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${sbText} ${sbHover}`}
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
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${sbText} ${sbHover}`}
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
      <div className={`flex items-center gap-3 px-4 py-3 flex-shrink-0 border-t ${sbBdr} ${sbBg}`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 overflow-hidden ring-2 bg-[#0369A1] ring-[#0EA5E9]/30`}>
          {profileAvatar && !profileAvatar.startsWith('/uploads/')
            ? <img src={profileAvatar} alt={profileName} className="w-full h-full object-cover" />
            : initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-semibold truncate ${sbName}`}>{profileName || roleLabel}</p>
          <p className={`text-[10px] ${sbSub}`}>{roleLabel}</p>
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
      <div className={`lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center gap-3 px-4 h-14 border-b shadow-lg ${sbBg} ${sbBdr}`}>
        <button
          onClick={() => setMobileOpen(o => !o)}
          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${sbText} ${sbHover}`}
          aria-label="Toggle navigation"
        >
          {mobileOpen ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
          )}
        </button>
        <img src="/consulta-logo.png" alt="Consulta" className="h-9 w-auto object-contain" />
        <p className={`font-bold text-sm ${sbName}`}>Consulta</p>
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold border border-[#0EA5E9]/40 text-[#0EA5E9]`}>
          {role.toUpperCase()}
        </span>
        <div className="flex-1" />
        {/* Notification badge in mobile header */}
        <button
          onClick={() => { setNotifOpen(o => !o); setMobileOpen(false); }}
          className={`relative w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${sbText} ${sbHover}`}
        >
          <svg className={`w-4 h-4 ${unreadConsultCount > 0 ? 'bell-ringing' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
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

      {/* ── Desktop notification panel ── */}
      {notifOpen && (
        <div ref={notifPanelRef} className={`hidden lg:block fixed top-[72px] left-60 z-50 w-80 rounded-xl shadow-2xl overflow-hidden border notif-dropdown ${
          isDark ? 'bg-[#252525] border-white/10' : 'bg-white border-gray-200 shadow-[0_8px_30px_rgba(0,0,0,0.12)]'
        }`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b ${
            isDark ? 'bg-[#1e1e1e] border-white/10' : 'bg-gray-50 border-gray-200'
          }`}>
            <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#CC0000] text-white">
                  {unreadCount} new
                </span>
              )}
            </p>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-[11px] text-[#CC0000] hover:underline">
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setNotifOpen(false)}
                className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${isDark ? 'text-gray-500 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="overflow-y-auto max-h-80">
            {/* ── Live (real-time) notifications ── */}
            {liveNotifs.length > 0 && liveNotifs.slice(0, 5).map((ln: LiveNotif) => {
              const liveDivider = isDark ? 'border-white/5' : 'border-gray-100';
              const liveHover   = isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50';
              const liveTitleCls = isDark ? 'text-gray-200' : 'text-gray-800';
              const liveSubCls   = isDark ? 'text-gray-500' : 'text-gray-400';
              const liveRoute = ln.metadata?.route as string | undefined;
              return (
                <div key={`live-${ln.id}`} className={`border-b ${liveDivider} ${!ln.is_read ? (isDark ? 'bg-white/[0.03]' : 'bg-sky-50/50') : ''}`}>
                  <button
                    onClick={() => { markLiveRead(ln.id); setNotifOpen(false); if (liveRoute) onTabChange(liveRoute); }}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left ${liveHover} transition-colors`}
                  >
                    <span className="text-base flex-shrink-0 mt-0.5">{liveNotifIcon(ln.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium leading-snug ${liveTitleCls}`}>{ln.message}</p>
                      <p className={`text-[11px] mt-0.5 ${liveSubCls}`}>{relTime(ln.created_at)}</p>
                    </div>
                    {!ln.is_read && <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${liveNotifDot(ln.type)}`} />}
                  </button>
                </div>
              );
            })}
            {/* Divider between live and prop-based consultation notifications */}
            {liveNotifs.length > 0 && consultNotifs.length > 0 && (
              <div className={`px-4 py-1 border-b ${isDark ? 'border-white/5 bg-[#1a1a1a]' : 'border-gray-100 bg-gray-50'}`}>
                <span className={`text-[9px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Pending Requests</span>
              </div>
            )}
            {/* Empty state — only when all sections are empty */}
            {liveNotifs.length === 0 && notifications.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No notifications</p>
              </div>
            )}

            {/* ── Consultation notifications ── */}
            {consultNotifs.map(n => {
              const isUnread   = !readIds.has(n.key);
              const unreadBg   = isUnread ? (isDark ? 'bg-white/[0.03]' : 'bg-blue-50/60') : '';
              const dividerCls = isDark ? 'border-white/5' : 'border-gray-100';
              const hoverCls   = isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50';
              const titleCls   = isDark ? 'text-gray-200' : 'text-gray-800';
              const subCls     = isDark ? 'text-gray-500' : 'text-gray-400';
              const dismissBtn = (
                <button
                  onClick={(e) => dismissNotif(e, n.key)}
                  title="Dismiss"
                  className={`absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded hover:text-red-400 hover:bg-red-500/10 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}
                >×</button>
              );
              const isStudentNotif = !!n.consult.professor_name;
              const consultEmoji = !isStudentNotif ? '📅'
                : n.consult.status === 'confirmed' ? '✅'
                : n.consult.status === 'rescheduled' ? '🔄'
                : n.consult.status === 'cancelled' ? '❌' : '📅';
              const consultDot = !isStudentNotif ? 'bg-[#CC0000]'
                : n.consult.status === 'confirmed' ? 'bg-blue-500'
                : n.consult.status === 'rescheduled' ? 'bg-orange-400'
                : n.consult.status === 'cancelled' ? 'bg-red-500' : 'bg-[#CC0000]';
              const displayName = isStudentNotif ? n.consult.professor_name! : n.consult.student_name;
              const actionText = !isStudentNotif ? 'booked a consultation'
                : n.consult.status === 'confirmed' ? 'confirmed your consultation'
                : n.consult.status === 'rescheduled' ? 'rescheduled your consultation'
                : n.consult.status === 'cancelled' ? 'cancelled your consultation'
                : 'updated your consultation';
              return (
                <div key={n.key} className={`relative group border-b ${dividerCls} ${unreadBg}`}>
                  <button
                    onClick={() => { const nx = new Set(readIds); nx.add(n.key); persistRead(nx); setNotifOpen(false); onTabChange(isStudentNotif ? 'my' : 'consultations'); }}
                    className={`w-full flex items-start gap-3 px-4 py-3 pr-8 text-left ${hoverCls} transition-colors`}
                  >
                    <span className="text-base flex-shrink-0 mt-0.5">{consultEmoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium leading-snug ${titleCls}`}>
                        <span className="font-semibold">{displayName}</span> {actionText}
                      </p>
                      <p className={`text-[11px] mt-0.5 ${subCls}`}>
                        {fmtNotifDate(n.consult.date, n.consult.time, n.consult.time_start)}
                      </p>
                    </div>
                    {isUnread && <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${consultDot}`} />}
                  </button>
                  {dismissBtn}
                </div>
              );
            })}

            {/* ── Announcements section ── */}
            {annNotifs.length > 0 && (
              <div className={`px-4 py-1 border-b ${isDark ? 'border-white/5 bg-[#1a1a1a]' : 'border-gray-100 bg-gray-50'}`}>
                <span className={`text-[9px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Announcements</span>
              </div>
            )}
            {annNotifs.map(n => {
              const dividerCls = isDark ? 'border-white/5' : 'border-gray-100';
              const hoverCls   = isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50';
              const titleCls   = isDark ? 'text-gray-200' : 'text-gray-800';
              const subCls     = isDark ? 'text-gray-500' : 'text-gray-400';
              const dismissBtn = (
                <button
                  onClick={(e) => dismissNotif(e, n.key)}
                  title="Dismiss"
                  className={`absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded hover:text-red-400 hover:bg-red-500/10 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}
                >×</button>
              );
              const expanded = expandedAnn === n.ann.id;
              return (
                <div key={n.key} className={`relative group border-b ${dividerCls}`}>
                  <button
                    onClick={() => setExpandedAnn(expanded ? null : n.ann.id)}
                    className={`w-full flex items-start gap-3 px-4 py-3 pr-8 text-left ${hoverCls} transition-colors`}
                  >
                    <span className="text-base flex-shrink-0 mt-0.5">{n.ann.type === 'warning' ? '⚠️' : '📢'}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium leading-snug ${titleCls}`}>{n.ann.title || n.ann.body.slice(0, 60)}</p>
                      <p className={`text-[11px] mt-0.5 ${subCls}`}>{relTime(n.ann.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                      <svg className={`w-3 h-3 transition-transform ${isDark ? 'text-gray-500' : 'text-gray-400'} ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  {expanded && (
                    <div className={`px-4 pb-3 text-[11px] leading-relaxed whitespace-pre-line ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{n.ann.body}</div>
                  )}
                  {dismissBtn}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Mobile notification panel (when opened from header) ── */}
      {notifOpen && (
        <div ref={notifMobileRef} className={`lg:hidden fixed top-14 left-3 right-3 z-50 sm:left-auto sm:right-3 sm:w-80 rounded-xl shadow-2xl overflow-hidden border notif-dropdown ${isDark ? 'bg-[#252525] border-white/10' : 'bg-white border-gray-200'}`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'bg-[#1e1e1e] border-white/10' : 'bg-gray-50 border-gray-200'}`}>
            <p className={`text-sm font-semibold ${sbName}`}>
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#CC0000] text-white">{unreadCount} new</span>
              )}
            </p>
            <button onClick={() => setNotifOpen(false)} className={`${sbText} hover:${isDark ? 'text-white' : 'text-gray-900'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="overflow-y-auto max-h-72">
            {/* Live notifications (mobile) */}
            {liveNotifs.length > 0 && liveNotifs.slice(0, 4).map((ln: LiveNotif) => {
              const liveRoute = ln.metadata?.route as string | undefined;
              return (
                <div key={`mlive-${ln.id}`} className={`border-b ${isDark ? 'border-white/5' : 'border-gray-100'} ${!ln.is_read ? (isDark ? 'bg-white/[0.03]' : 'bg-sky-50/50') : ''}`}>
                  <button
                    onClick={() => { markLiveRead(ln.id); setNotifOpen(false); if (liveRoute) onTabChange(liveRoute); }}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}
                  >
                    <span className="text-sm flex-shrink-0 mt-0.5">{liveNotifIcon(ln.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium leading-snug line-clamp-2 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{ln.message}</p>
                      <p className={`text-[10px] mt-0.5 ${sbSub}`}>{relTime(ln.created_at)}</p>
                    </div>
                    {!ln.is_read && <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${liveNotifDot(ln.type)}`} />}
                  </button>
                </div>
              );
            })}
            {liveNotifs.length > 0 && consultNotifs.length > 0 && (
              <div className={`px-4 py-1 border-b ${isDark ? 'border-white/5 bg-[#1a1a1a]' : 'border-gray-100 bg-gray-50'}`}>
                <span className={`text-[9px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Pending</span>
              </div>
            )}
            {liveNotifs.length === 0 && notifications.length === 0 && (
              <p className={`px-4 py-8 text-center text-sm ${sbSub}`}>No notifications</p>
            )}

            {/* ── Consultation notifications (mobile) ── */}
            {consultNotifs.slice(0, 6).map(n => {
              const isUnread = !readIds.has(n.key);
              const isStudentNotif = !!n.consult.professor_name;
              const mobileEmoji = !isStudentNotif ? '📅'
                : n.consult.status === 'confirmed' ? '✅'
                : n.consult.status === 'rescheduled' ? '🔄'
                : n.consult.status === 'cancelled' ? '❌' : '📅';
              const mobileDot = !isStudentNotif ? 'bg-[#CC0000]'
                : n.consult.status === 'confirmed' ? 'bg-blue-500'
                : n.consult.status === 'rescheduled' ? 'bg-orange-400'
                : n.consult.status === 'cancelled' ? 'bg-red-500' : 'bg-[#CC0000]';
              return (
                <div key={n.key} className={`border-b ${isDark ? 'border-white/5' : 'border-gray-100'} ${
                  isUnread
                    ? (isStudentNotif && n.consult.status === 'confirmed' ? 'bg-blue-500/5' : isDark ? 'bg-white/[0.03]' : 'bg-blue-50/40')
                    : ''
                }`}>
                  <button
                    onClick={() => { const nx = new Set(readIds); nx.add(n.key); persistRead(nx); onTabChange(isStudentNotif ? 'my' : 'consultations'); setNotifOpen(false); }}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}
                  >
                    <span className="text-sm flex-shrink-0 mt-0.5">{mobileEmoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium leading-snug line-clamp-2 ${
                        isStudentNotif && n.consult.status === 'confirmed'
                          ? (isDark ? 'text-blue-300' : 'text-blue-600')
                          : sbName
                      }`}>
                        {(() => {
                          const dn = isStudentNotif ? n.consult.professor_name! : n.consult.student_name;
                          const at = !isStudentNotif
                            ? (n.consult.status === 'confirmed' ? ' — approved' : ' booked a consultation')
                            : n.consult.status === 'confirmed' ? ' confirmed your consultation'
                            : n.consult.status === 'rescheduled' ? ' rescheduled your consultation'
                            : n.consult.status === 'cancelled' ? ' cancelled your consultation'
                            : ' updated your consultation';
                          return <><span className="font-semibold">{dn}</span>{at}</>;
                        })()}
                      </p>
                      <p className={`text-[10px] mt-0.5 ${sbSub}`}>{fmtNotifDate(n.consult.date, n.consult.time, n.consult.time_start)}</p>
                    </div>
                    {isUnread && <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${mobileDot}`} />}
                  </button>
                </div>
              );
            })}

            {/* ── Announcements section (mobile) ── */}
            {annNotifs.length > 0 && (
              <div className={`px-4 py-1 border-b ${isDark ? 'border-white/5 bg-[#1a1a1a]' : 'border-gray-100 bg-gray-50'}`}>
                <span className={`text-[9px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Announcements</span>
              </div>
            )}
            {annNotifs.slice(0, 4).map(n => (
              <div key={n.key} className={`border-b ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                <button
                  onClick={() => setNotifOpen(false)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}
                >
                  <span className="text-sm flex-shrink-0 mt-0.5">{n.ann.type === 'warning' ? '⚠️' : '📢'}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium leading-snug line-clamp-2 ${sbName}`}>
                      {n.ann.title || n.ann.body.slice(0, 60)}
                    </p>
                    <p className={`text-[10px] mt-0.5 ${sbSub}`}>{relTime(n.ann.created_at)}</p>
                  </div>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Real-time toast notification ── */}
      {liveToast && (
        <div
          className={`fixed top-4 right-4 z-[200] max-w-sm w-full flex items-start gap-3 px-4 py-3 rounded-xl border shadow-2xl toast-enter cursor-pointer ${
            isDark ? 'bg-[#252525] border-white/10' : 'bg-white border-gray-200 shadow-[0_8px_30px_rgba(0,0,0,0.15)]'
          }`}
          onClick={dismissToast}
        >
          <span className="text-lg flex-shrink-0 mt-0.5">{liveNotifIcon(liveToast.type)}</span>
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {liveNotifTitle(liveToast.type)}
            </p>
            <p className={`text-[11px] mt-0.5 leading-snug ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              {liveToast.message}
            </p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); dismissToast(); }}
            className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-base leading-none ${isDark ? 'text-gray-600 hover:text-white' : 'text-gray-400 hover:text-gray-700'}`}
          >×</button>
        </div>
      )}
    </>
  );
}
