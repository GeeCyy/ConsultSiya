'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'profile' | 'notifications' | 'system';

type Profile = {
  role: string;
  full_name: string;
  email: string;
  phone: string;
  department?: string;
  program?: string;
  year_level?: number | string;
  student_number?: string;
  profile_picture_url?: string | null;
  created_at?: string;
  // Professor preferences
  bio?: string;
  preferred_mode?: 'Online' | 'F2F' | 'Both';
  is_available?: boolean;
};

type NotifSettings = {
  inapp_booking_confirmed: boolean;
  inapp_booking_cancelled: boolean;
  inapp_upcoming_reminder: boolean;
  email_booking_confirmed: boolean;
  email_booking_cancelled: boolean;
  email_upcoming_reminder: boolean;
};

type SystemSettings = {
  maintenance_mode: string;
  require_admin_approval: string;
  max_bookings_per_student: string;
  academic_year: string;
  current_semester: string;
};

// ── Small shared components ───────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none ${
        checked ? 'bg-[#0EA5E9]' : 'bg-[#383a40]'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function ToggleRow({
  label,
  sublabel,
  checked,
  onChange,
}: {
  label: string;
  sublabel?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
      <div>
        <p className="text-sm text-gray-200">{label}</p>
        {sublabel && <p className="text-xs text-gray-500 mt-0.5">{sublabel}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  disabled,
  required,
  isDark = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  isDark?: boolean;
}) {
  const inputCls = isDark
    ? 'bg-[#1a1f35] border border-white/10 text-gray-200 placeholder-gray-500'
    : 'bg-white border border-gray-200 text-gray-800 placeholder-gray-400';
  return (
    <div className="flex flex-col gap-1.5">
      <label className={`text-xs font-medium uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
        {label}
        {required && <span className="text-sky-400 ml-1">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0EA5E9]/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${inputCls}`}
      />
    </div>
  );
}

function StatusBanner({
  message,
  type,
  onDismiss,
}: {
  message: string;
  type: 'success' | 'error';
  onDismiss: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm ${
        type === 'success'
          ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
          : 'bg-red-500/10 border border-red-500/20 text-red-400'
      }`}
    >
      <span>{message}</span>
      <button
        onClick={onDismiss}
        className="text-current opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ── Country codes & phone formatting ─────────────────────────────────────────

const COUNTRY_CODES = [
  { code: '+63', country: 'Philippines',   iso: 'ph' },
  { code: '+1',  country: 'US / Canada',   iso: 'us' },
  { code: '+44', country: 'United Kingdom',iso: 'gb' },
  { code: '+61', country: 'Australia',     iso: 'au' },
  { code: '+81', country: 'Japan',         iso: 'jp' },
  { code: '+82', country: 'South Korea',   iso: 'kr' },
  { code: '+86', country: 'China',         iso: 'cn' },
  { code: '+91', country: 'India',         iso: 'in' },
  { code: '+65', country: 'Singapore',     iso: 'sg' },
  { code: '+60', country: 'Malaysia',      iso: 'my' },
];

// Digit-group sizes for each country's local number (drives auto-spacing)
const PHONE_FORMATS: Record<string, number[]> = {
  '+63': [3, 3, 4],  // 956 000 0000
  '+1':  [3, 3, 4],  // 555 555 5555
  '+44': [4, 3, 4],  // 7700 900 123
  '+61': [3, 3, 3],  // 412 345 678
  '+81': [2, 4, 4],  // 80 1234 5678
  '+82': [3, 4, 4],  // 010 1234 5678
  '+86': [3, 4, 4],  // 138 1234 5678
  '+91': [5, 5],     // 98765 43210
  '+65': [4, 4],     // 9123 4567
  '+60': [2, 4, 4],  // 12 3456 7890
};

// Codes sorted longest-first so "+63" is matched before "+6", etc.
const SORTED_CODES = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);

function parsePhone(value: string): { code: string; local: string } {
  if (!value) return { code: '+63', local: '' };
  for (const { code } of SORTED_CODES) {
    if (value.startsWith(code + ' ') || value === code) {
      return { code, local: value.slice(code.length).trimStart() };
    }
  }
  return { code: '+63', local: value };
}

function applyPhoneFormat(digits: string, groups: number[]): string {
  let out = '';
  let pos = 0;
  for (let i = 0; i < groups.length; i++) {
    const chunk = digits.slice(pos, pos + groups[i]);
    if (!chunk) break;
    if (i > 0) out += ' ';
    out += chunk;
    pos += groups[i];
  }
  return out;
}

// Custom dropdown — native <select> cannot render <img> inside <option>
function CountryCodeSelect({
  value,
  onChange,
  isDark = true,
}: {
  value: string;
  onChange: (code: string) => void;
  isDark?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = COUNTRY_CODES.find((c) => c.code === value) ?? COUNTRY_CODES[0];

  // Close on outside click or Escape
  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div ref={ref} className="relative flex-shrink-0 w-36">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0EA5E9]/50 transition-colors ${isDark ? 'bg-[#1a1f35] border border-white/10 text-gray-200 hover:border-white/20' : 'bg-white border border-gray-200 text-gray-800 hover:border-gray-300'}`}
      >
        <img
          src={`https://flagcdn.com/24x18/${selected.iso}.png`}
          width={24}
          height={18}
          alt={selected.country}
          className="rounded-sm flex-shrink-0"
        />
        <span className="font-mono flex-1 text-left">{selected.code}</span>
        <svg
          className={`w-3 h-3 text-gray-500 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown list */}
      {open && (
        <div className={`absolute top-full left-0 mt-1 z-50 w-56 rounded-xl border shadow-2xl overflow-hidden ${isDark ? 'bg-[#252535] border-white/10' : 'bg-white border-gray-200'}`}>
          <div className="max-h-60 overflow-y-auto">
            {COUNTRY_CODES.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => { onChange(c.code); setOpen(false); }}
                className={`flex items-center gap-3 w-full px-3 py-2.5 text-left transition-colors ${
                  c.code === value
                    ? isDark ? 'bg-sky-500/15 text-white' : 'bg-sky-50 text-sky-700'
                    : isDark ? 'text-gray-300 hover:bg-white/5' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <img
                  src={`https://flagcdn.com/24x18/${c.iso}.png`}
                  width={24}
                  height={18}
                  alt={c.country}
                  className="rounded-sm flex-shrink-0"
                />
                <span className="font-mono text-sm w-10 flex-shrink-0">{c.code}</span>
                <span className="text-xs text-gray-400 truncate">{c.country}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PhoneInput({ value, onChange, isDark = true }: { value: string; onChange: (v: string) => void; isDark?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { code: selectedCode, local: localFormatted } = parsePhone(value);
  const groups = PHONE_FORMATS[selectedCode] ?? [3, 3, 4];
  const maxDigits = groups.reduce((s, n) => s + n, 0);
  const placeholder = groups.map((n) => 'X'.repeat(n)).join(' ');

  // Always work from raw digits — formatting is purely presentational
  const rawDigits = localFormatted.replace(/\D/g, '').slice(0, maxDigits);

  const handleCode = (newCode: string) => {
    // Store just the country code (clears the local number) then focus
    onChange(newCode);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleLocal = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, maxDigits);
    const formatted = applyPhoneFormat(digits, groups);
    onChange(digits ? `${selectedCode} ${formatted}` : '');
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
        Phone Number
      </label>
      <div className="flex gap-2">
        <CountryCodeSelect value={selectedCode} onChange={handleCode} isDark={isDark} />
        <input
          ref={inputRef}
          type="tel"
          value={applyPhoneFormat(rawDigits, groups)}
          onChange={handleLocal}
          placeholder={placeholder}
          className={`flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0EA5E9]/50 transition-colors ${isDark ? 'bg-[#1a1f35] border border-white/10 text-gray-200 placeholder-gray-500' : 'bg-white border border-gray-200 text-gray-800 placeholder-gray-400'}`}
        />
      </div>
    </div>
  );
}

// ── Main settings page ────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const [role, setRole] = useState<string>('');
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [loading, setLoading] = useState(true);
  const [isDark, setIsDark] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setIsDark(localStorage.getItem('consulta-theme') === 'dark');
    const handler = (e: Event) => setIsDark((e as CustomEvent<{ dark: boolean }>).detail.dark);
    window.addEventListener('consulta-theme-change', handler);

    const savedMotion = localStorage.getItem('consulta-reduce-motion') === 'true';
    setReduceMotion(savedMotion);
    document.body.classList.toggle('reduce-motion', savedMotion);

    return () => window.removeEventListener('consulta-theme-change', handler);
  }, []);

  const handleReduceMotion = (val: boolean) => {
    setReduceMotion(val);
    localStorage.setItem('consulta-reduce-motion', String(val));
    document.body.classList.toggle('reduce-motion', val);
    window.dispatchEvent(new CustomEvent('consulta-reduce-motion-change', { detail: val }));
  };

  // Profile state
  const [profile, setProfile] = useState<Profile>({
    role: '',
    full_name: '',
    email: '',
    phone: '',
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Avatar state
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Notification state
  const [notif, setNotif] = useState<NotifSettings>({
    inapp_booking_confirmed: true,
    inapp_booking_cancelled: true,
    inapp_upcoming_reminder: true,
    email_booking_confirmed: false,
    email_booking_cancelled: false,
    email_upcoming_reminder: false,
  });
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifMsg, setNotifMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Password state — inline collapsible in Profile tab
  const [pwOpen,    setPwOpen]    = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });

  // System settings state
  const [sysSettings, setSysSettings] = useState<SystemSettings>({
    maintenance_mode: 'false',
    require_admin_approval: 'true',
    max_bookings_per_student: '5',
    academic_year: '2025-2026',
    current_semester: '2nd Semester',
  });
  const [sysSaving, setSysSaving] = useState(false);
  const [sysMsg, setSysMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // ── Auth guard + initial data load ─────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedRole = localStorage.getItem('role') || '';
    if (!token) {
      router.push('/login');
      return;
    }
    setRole(storedRole);

    const headers = { Authorization: `Bearer ${token}` };

    const loadAll = async () => {
      setLoading(true);
      try {
        const [profRes, notifRes] = await Promise.all([
          fetch(`${API_URL}/api/settings/profile`, { headers }),
          fetch(`${API_URL}/api/settings/notifications`, { headers }),
        ]);
        // Only redirect on auth errors — not on 500/network issues
        if (profRes.status === 401 || profRes.status === 403) {
          router.push('/login');
          return;
        }
        if (profRes.ok) {
          const profData = await profRes.json();
          setProfile({
            role: profData.role,
            full_name: profData.full_name || '',
            email: profData.email || '',
            phone: profData.phone || '',
            department: profData.department || '',
            program: profData.program || '',
            year_level: profData.year_level ?? '',
            student_number: profData.student_number || '',
            profile_picture_url: profData.profile_picture_url || null,
            created_at: profData.created_at,
            bio: profData.bio || '',
            preferred_mode: profData.preferred_mode || 'Both',
            is_available: profData.is_available !== false,
          });
        }
        if (notifRes.ok) {
          const n = await notifRes.json();
          setNotif({
            inapp_booking_confirmed:  n.inapp_booking_confirmed  ?? true,
            inapp_booking_cancelled:  n.inapp_booking_cancelled  ?? true,
            inapp_upcoming_reminder:  n.inapp_upcoming_reminder  ?? true,
            email_booking_confirmed:  n.email_booking_confirmed  ?? false,
            email_booking_cancelled:  n.email_booking_cancelled  ?? false,
            email_upcoming_reminder:  n.email_upcoming_reminder  ?? false,
          });
        }
        if (storedRole === 'admin') {
          const sysRes = await fetch(`${API_URL}/api/settings/system`, { headers });
          if (sysRes.ok) setSysSettings(await sysRes.json());
        }
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Avatar upload ───────────────────────────────────────────────────────────
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setProfileMsg(null);
    const formData = new FormData();
    formData.append('avatar', file);
    const token = localStorage.getItem('token') || '';
    try {
      const res = await fetch(`${API_URL}/api/settings/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setProfileMsg({ text: data.error || 'Avatar upload failed.', type: 'error' });
      } else {
        setProfile((p) => ({ ...p, profile_picture_url: data.avatar_url }));
        localStorage.setItem('consulta-avatar', data.avatar_url);
        window.dispatchEvent(new CustomEvent('consulta-avatar-change', { detail: { url: data.avatar_url } }));
        setProfileMsg({ text: 'Profile picture updated.', type: 'success' });
      }
    } catch {
      setProfileMsg({ text: 'Network error. Please try again.', type: 'error' });
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  // ── Avatar remove ───────────────────────────────────────────────────────────
  const handleRemoveAvatar = async () => {
    const token = localStorage.getItem('token') || '';
    setAvatarUploading(true);
    setProfileMsg(null);
    try {
      const res = await fetch(`${API_URL}/api/settings/avatar`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        setProfileMsg({ text: data.error || 'Failed to remove photo.', type: 'error' });
      } else {
        setProfile((p) => ({ ...p, profile_picture_url: null }));
        localStorage.removeItem('consulta-avatar');
        window.dispatchEvent(new CustomEvent('consulta-avatar-change', { detail: { url: null } }));
        setProfileMsg({ text: 'Profile picture removed.', type: 'success' });
      }
    } catch {
      setProfileMsg({ text: 'Network error. Please try again.', type: 'error' });
    } finally {
      setAvatarUploading(false);
    }
  };

  // ── Save profile ────────────────────────────────────────────────────────────
  const handleSaveProfile = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg(null);
    const token = localStorage.getItem('token') || '';
    try {
      const res = await fetch(`${API_URL}/api/settings/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          full_name: profile.full_name,
          email: profile.email,
          phone: profile.phone,
          department: profile.department,
          program: profile.program,
          year_level: profile.year_level,
          student_number: profile.student_number,
          bio: profile.bio,
          preferred_mode: profile.preferred_mode,
          is_available: profile.is_available,
        }),
      });
      const data = await res.json();
      setProfileMsg({
        text: res.ok ? data.message : (data.error || 'Failed to save profile.'),
        type: res.ok ? 'success' : 'error',
      });
    } catch {
      setProfileMsg({ text: 'Network error. Please try again.', type: 'error' });
    } finally {
      setProfileSaving(false);
    }
  };

  // ── Save notifications ──────────────────────────────────────────────────────
  const handleSaveNotif = async () => {
    setNotifSaving(true);
    setNotifMsg(null);
    const token = localStorage.getItem('token') || '';
    try {
      const res = await fetch(`${API_URL}/api/settings/notifications`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(notif),
      });
      const data = await res.json();
      setNotifMsg({
        text: res.ok ? data.message : (data.error || 'Failed to save.'),
        type: res.ok ? 'success' : 'error',
      });
    } catch {
      setNotifMsg({ text: 'Network error. Please try again.', type: 'error' });
    } finally {
      setNotifSaving(false);
    }
  };

  // ── Change password ─────────────────────────────────────────────────────────
  const handleChangePassword = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) {
      setPwMsg({ text: 'New passwords do not match.', type: 'error' });
      return;
    }
    setPwSaving(true);
    setPwMsg(null);
    const token = localStorage.getItem('token') || '';
    try {
      const res = await fetch(`${API_URL}/api/settings/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          current_password: pwForm.current,
          new_password: pwForm.next,
          confirm_password: pwForm.confirm,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPwMsg({ text: data.message, type: 'success' });
        setPwForm({ current: '', next: '', confirm: '' });
      } else {
        setPwMsg({ text: data.error || 'Failed to change password.', type: 'error' });
      }
    } catch {
      setPwMsg({ text: 'Network error. Please try again.', type: 'error' });
    } finally {
      setPwSaving(false);
    }
  };

  // ── Save system settings ────────────────────────────────────────────────────
  const handleSaveSystem = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSysSaving(true);
    setSysMsg(null);
    const token = localStorage.getItem('token') || '';
    try {
      const res = await fetch(`${API_URL}/api/settings/system`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(sysSettings),
      });
      const data = await res.json();
      setSysMsg({
        text: res.ok ? data.message : (data.error || 'Failed to save.'),
        type: res.ok ? 'success' : 'error',
      });
    } catch {
      setSysMsg({ text: 'Network error. Please try again.', type: 'error' });
    } finally {
      setSysSaving(false);
    }
  };

  // ── Tab definitions ─────────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
    {
      id: 'profile',
      label: 'Profile',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
    },
    {
      id: 'system',
      label: 'System',
      adminOnly: true,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  const visibleTabs = tabs.filter((t) => !t.adminOnly || role === 'admin');

  // ── Render ──────────────────────────────────────────────────────────────────
  const avatarSrc =
    profile.profile_picture_url && !profile.profile_picture_url.startsWith('/uploads/')
      ? profile.profile_picture_url
      : null;

  const initials = profile.full_name
    ? profile.full_name
        .split(' ')
        .slice(0, 2)
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : profile.email?.[0]?.toUpperCase() || '?';

  // Shared input/select class — switches between dark and light mode
  const inpCls = isDark
    ? 'bg-[#1a1f35] border border-white/10 text-gray-200 placeholder-gray-500'
    : 'bg-white border border-gray-200 text-gray-800 placeholder-gray-400';

  // Profile completion score
  const completionItems = role === 'professor'
    ? [
        { label: 'Full name',    done: !!profile.full_name },
        { label: 'Email',        done: !!profile.email },
        { label: 'Phone',        done: !!profile.phone },
        { label: 'Specialty',    done: !!profile.department },
        { label: 'Bio',          done: !!profile.bio },
        { label: 'Photo',        done: !!avatarSrc },
      ]
    : role === 'student'
    ? [
        { label: 'Full name',       done: !!profile.full_name },
        { label: 'Email',           done: !!profile.email },
        { label: 'Phone',           done: !!profile.phone },
        { label: 'Student number',  done: !!profile.student_number },
        { label: 'Program',         done: !!profile.program },
        { label: 'Year level',      done: !!profile.year_level },
        { label: 'Photo',           done: !!avatarSrc },
      ]
    : [];
  const completionPct  = completionItems.length
    ? Math.round((completionItems.filter(i => i.done).length / completionItems.length) * 100)
    : 100;
  const firstMissing   = completionItems.find(i => !i.done);

  return (
    <DashboardShell weekBadge={false} hideTopBar={true}>
      <div className={`min-h-full ${isDark ? 'bg-[#1e2235]' : 'bg-[#f2f3f5]'}`}>
        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div className={`flex items-center gap-3 px-6 py-4 border-b ${isDark ? 'bg-[#1e2235] border-white/5' : 'bg-white border-black/10'}`}>
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className={`w-px h-4 ${isDark ? 'bg-white/10' : 'bg-black/10'}`} />
          <h1 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Settings</h1>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-[#0EA5E9] border-t-transparent animate-spin" />
              <span className="text-sm text-gray-500">Loading settings…</span>
            </div>
          </div>
        ) : (
          <div className="flex max-w-5xl mx-auto px-4 py-6 gap-6">
            {/* ── Sidebar ──────────────────────────────────────────────────── */}
            <aside className="w-52 flex-shrink-0">
              {/* Mini profile card */}
              <div className={`flex flex-col items-center gap-2 p-4 mb-4 rounded-xl border ${isDark ? 'bg-[#252535] border-white/5 shadow-[0_4px_20px_rgba(0,0,0,0.35)]' : 'bg-white border-sky-100 shadow-sm'}`}>
                <div className={`w-14 h-14 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center border-2 border-[#0EA5E9]/40 ${isDark ? 'bg-[#0369A1]/20' : 'bg-sky-50'}`}>
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-lg font-bold text-sky-400">{initials}</span>
                  )}
                </div>
                <div className="text-center min-w-0 w-full">
                  <p className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{profile.full_name}</p>
                  <span
                    className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mt-1 ${
                      role === 'admin'
                        ? 'bg-sky-500/20 text-sky-400'
                        : role === 'professor'
                        ? 'bg-blue-500/15 text-blue-400'
                        : 'bg-emerald-500/15 text-emerald-400'
                    }`}
                  >
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </span>
                </div>

                {/* Profile completion bar */}
                {completionItems.length > 0 && (
                  <div className="w-full mt-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[10px] font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Profile</span>
                      <span className={`text-[10px] font-bold ${completionPct === 100 ? 'text-emerald-400' : 'text-sky-400'}`}>{completionPct}%</span>
                    </div>
                    <div className={`h-1.5 w-full rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-gray-200'}`}>
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${completionPct === 100 ? 'bg-emerald-400' : 'bg-gradient-to-r from-[#0369A1] to-[#0EA5E9]'}`}
                        style={{ width: `${completionPct}%` }}
                      />
                    </div>
                    {firstMissing && (
                      <p className="text-[10px] text-gray-500 mt-1 leading-tight">Add {firstMissing.label}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Nav tabs */}
              <nav className="flex flex-col gap-0.5">
                {visibleTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors ${
                      activeTab === tab.id
                        ? 'bg-sky-500/15 text-sky-400'
                        : isDark
                          ? 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-black/5'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </nav>
            </aside>

            {/* ── Content area ─────────────────────────────────────────────── */}
            <main className="flex-1 min-w-0">

              {/* ── PROFILE TAB ────────────────────────────────────────────── */}
              {activeTab === 'profile' && (
                <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-[#252535] border-white/5 shadow-[0_4px_20px_rgba(0,0,0,0.35)]' : 'bg-white border-sky-100 shadow-sm'}`}>
                  <div className="px-6 py-4 border-b border-white/5">
                    <h2 className="text-sm font-semibold text-white">Profile Information</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Update your display name, contact email, and profile picture.</p>
                  </div>

                  <div className="px-6 py-5 space-y-5">
                    {profileMsg && (
                      <StatusBanner
                        message={profileMsg.text}
                        type={profileMsg.type}
                        onDismiss={() => setProfileMsg(null)}
                      />
                    )}

                    {/* Avatar section */}
                    <div className="flex items-center gap-4 pb-5 border-b border-white/5">
                      <div className="w-20 h-20 rounded-full overflow-hidden flex-shrink-0 bg-[#0369A1]/20 flex items-center justify-center border-2 border-[#0EA5E9]/40">
                        {avatarSrc ? (
                          <img src={avatarSrc} alt="avatar" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-2xl font-bold text-sky-400">{initials}</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="hidden"
                          onChange={handleAvatarChange}
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={avatarUploading}
                            onClick={() => avatarInputRef.current?.click()}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-[#0369A1] to-[#0EA5E9] hover:from-[#0284c7] hover:to-[#38bdf8] text-white transition-all shadow-md shadow-sky-900/30 hover:shadow-sky-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {avatarUploading ? 'Uploading…' : 'Change Photo'}
                          </button>
                          {avatarSrc && (
                            <button
                              type="button"
                              disabled={avatarUploading}
                              onClick={handleRemoveAvatar}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 text-gray-400 hover:text-white hover:border-white/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Remove Photo
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-600">JPG, PNG, WEBP or GIF · Max 5 MB</p>
                        <p className="text-[11px] text-gray-600 italic">Photo saves automatically when selected.</p>
                      </div>
                    </div>

                    {/* Profile form */}
                    <form onSubmit={handleSaveProfile} className="space-y-4">
                      {role !== 'admin' && (
                        <FieldInput isDark={isDark}
                          label="Full Name"
                          value={profile.full_name}
                          onChange={(v) => setProfile((p) => ({ ...p, full_name: v }))}
                          placeholder="e.g. Juan Dela Cruz"
                          required
                        />
                      )}

                      <FieldInput isDark={isDark}
                        label="Email Address"
                        type="email"
                        value={profile.email}
                        onChange={(v) => setProfile((p) => ({ ...p, email: v }))}
                        placeholder="you@example.com"
                        required
                      />

                      {(role === 'student' || role === 'professor') && (
                        <PhoneInput isDark={isDark}
                          value={profile.phone}
                          onChange={(v) => setProfile((p) => ({ ...p, phone: v }))}
                        />
                      )}

                      {/* Student-specific fields */}
                      {role === 'student' && (
                        <>
                          <FieldInput isDark={isDark}
                            label="Student Number"
                            value={profile.student_number || ''}
                            onChange={(v) => setProfile((p) => ({ ...p, student_number: v }))}
                            placeholder="e.g. 2021-XXXXX-MN-0"
                            required
                          />
                          <div className="flex flex-col gap-1.5">
                            <label className={`text-xs font-medium uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                              Program
                            </label>
                            <select
                              value={profile.program || ''}
                              onChange={(e) => setProfile((p) => ({ ...p, program: e.target.value }))}
                              className={`w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0EA5E9]/50 transition-colors ${inpCls}`}
                            >
                              <option value="">Select program…</option>
                              {['BS Computer Science','BS Entertainment and Multimedia Computing','BS Information Technology','BS Information Systems','BS Data Science','BS Cybersecurity','Others'].map(p => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className={`text-xs font-medium uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                              Year Level
                            </label>
                            <select
                              value={String(profile.year_level ?? '')}
                              onChange={(e) =>
                                setProfile((p) => ({
                                  ...p,
                                  year_level: e.target.value ? parseInt(e.target.value) : '',
                                }))
                              }
                              className={`w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0EA5E9]/50 transition-colors ${inpCls}`}
                            >
                              <option value="">Select year level</option>
                              {[1, 2, 3, 4, 5].map((y) => (
                                <option key={y} value={y}>
                                  Year {y}
                                </option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}

                      {/* Professor-specific fields */}
                      {role === 'professor' && (
                        <>
                          <div className="flex flex-col gap-1.5">
                            <label className={`text-xs font-medium uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                              Specialty
                            </label>
                            <input
                              type="text"
                              value={profile.department || ''}
                              onChange={(e) => setProfile((p) => ({ ...p, department: e.target.value }))}
                              placeholder="e.g. Web Development, Data Science…"
                              className={`w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0EA5E9]/50 transition-colors ${inpCls}`}
                            />
                          </div>

                          {/* Bio / About Me */}
                          <div className="flex flex-col gap-1.5">
                            <label className={`text-xs font-medium uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                              Bio / About Me
                            </label>
                            <textarea
                              value={profile.bio || ''}
                              onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
                              rows={3}
                              placeholder="Subjects handled, research interests, advising focus…"
                              className={`w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0EA5E9]/50 transition-colors resize-none ${inpCls}`}
                            />
                            <p className={`text-[11px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Visible to students when they view your profile before booking.</p>
                          </div>

                          {/* Availability + Preferred Mode in a 2-col row */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Availability toggle */}
                            <div className={`rounded-xl border p-4 flex items-start gap-3 ${isDark ? 'bg-[#1a1f35] border-white/8' : 'bg-gray-50 border-gray-200'}`}>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                                  Available for Bookings
                                </p>
                                <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                  {profile.is_available !== false
                                    ? 'Students can book consultations with you'
                                    : 'Students cannot book new consultations'}
                                </p>
                              </div>
                              <Toggle
                                checked={profile.is_available !== false}
                                onChange={(v) => setProfile((p) => ({ ...p, is_available: v }))}
                              />
                            </div>

                            {/* Preferred mode */}
                            <div className={`rounded-xl border p-4 ${isDark ? 'bg-[#1a1f35] border-white/8' : 'bg-gray-50 border-gray-200'}`}>
                              <p className={`text-sm font-medium mb-2.5 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                                Preferred Mode
                              </p>
                              <div className="flex gap-2">
                                {(['F2F', 'Online', 'Both'] as const).map((m) => (
                                  <button
                                    key={m}
                                    type="button"
                                    onClick={() => setProfile((p) => ({ ...p, preferred_mode: m }))}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                      profile.preferred_mode === m
                                        ? 'bg-gradient-to-r from-[#0369A1] to-[#0EA5E9] text-white shadow-sm'
                                        : isDark ? 'bg-white/5 text-gray-400 hover:bg-white/10' : 'bg-white border border-gray-200 text-gray-600 hover:border-sky-300'
                                    }`}
                                  >
                                    {m === 'F2F' ? 'In-Person' : m}
                                  </button>
                                ))}
                              </div>
                              <p className={`text-[11px] mt-2 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Auto-suggested when students book</p>
                            </div>
                          </div>
                        </>
                      )}

                      {/* Admin info */}
                      {role === 'admin' && (
                        <div className={`px-4 py-3 rounded-lg text-xs text-gray-500 ${isDark ? 'bg-[#1a1f35] border border-white/5' : 'bg-gray-50 border border-gray-200'}`}>
                          Admin accounts use only the email address as profile information. Contact your system owner to update additional details.
                        </div>
                      )}

                      <div className="pt-2">
                        <button
                          type="submit"
                          disabled={profileSaving}
                          className="px-5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#0369A1] to-[#0EA5E9] hover:from-[#0284c7] hover:to-[#38bdf8] text-white transition-all shadow-md shadow-sky-900/30 hover:shadow-sky-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {profileSaving ? 'Saving…' : 'Save Changes'}
                        </button>
                      </div>
                    </form>

                    {/* ── Inline Change Password ── */}
                    <div className={`mt-2 border-t ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                      <button
                        type="button"
                        onClick={() => { setPwOpen(o => !o); setPwMsg(null); setPwForm({ current: '', next: '', confirm: '' }); }}
                        className={`w-full flex items-center justify-between px-6 py-4 text-left transition-colors ${isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-gray-50'}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Change Password</span>
                        </div>
                        <svg className={`w-4 h-4 text-gray-500 transition-transform ${pwOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {pwOpen && (
                        <div className="px-6 pb-6 space-y-4">
                          {pwMsg && <StatusBanner message={pwMsg.text} type={pwMsg.type} onDismiss={() => setPwMsg(null)} />}
                          <form onSubmit={handleChangePassword} className="space-y-4 max-w-sm">
                            {(['current', 'next', 'confirm'] as const).map((key) => (
                              <div key={key} className="flex flex-col gap-1.5">
                                <label className={`text-xs font-medium uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                  {key === 'current' ? 'Current Password' : key === 'next' ? 'New Password' : 'Confirm New Password'} <span className="text-sky-400">*</span>
                                </label>
                                <div className="relative">
                                  <input
                                    type={showPw[key] ? 'text' : 'password'}
                                    value={pwForm[key]}
                                    onChange={(e) => setPwForm((p) => ({ ...p, [key]: e.target.value }))}
                                    placeholder={key === 'current' ? 'Your current password' : key === 'next' ? 'At least 8 characters' : 'Repeat new password'}
                                    required
                                    minLength={key === 'next' ? 8 : undefined}
                                    className={`w-full pl-3 pr-10 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0EA5E9]/50 transition-colors ${inpCls}`}
                                  />
                                  <button type="button" onClick={() => setShowPw((s) => ({ ...s, [key]: !s[key] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                                    {showPw[key]
                                      ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                      : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                                  </button>
                                </div>
                                {key === 'next' && pwForm.next.length > 0 && pwForm.next.length < 8 && <p className="text-[11px] text-amber-400">Must be at least 8 characters.</p>}
                                {key === 'confirm' && pwForm.confirm.length > 0 && pwForm.next !== pwForm.confirm && <p className="text-[11px] text-red-400">Passwords do not match.</p>}
                              </div>
                            ))}
                            <button type="submit" disabled={pwSaving || !pwForm.current || !pwForm.next || pwForm.next !== pwForm.confirm}
                              className="px-5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#0369A1] to-[#0EA5E9] hover:from-[#0284c7] hover:to-[#38bdf8] text-white transition-all shadow-md shadow-sky-900/30 hover:shadow-sky-500/30 disabled:opacity-50 disabled:cursor-not-allowed">
                              {pwSaving ? 'Changing…' : 'Change Password'}
                            </button>
                          </form>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── NOTIFICATIONS TAB ──────────────────────────────────────── */}
              {activeTab === 'notifications' && (
                <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-[#252535] border-white/5 shadow-[0_4px_20px_rgba(0,0,0,0.35)]' : 'bg-white border-sky-100 shadow-sm'}`}>
                  <div className={`px-6 py-4 border-b ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                    <h2 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Notification Preferences</h2>
                    <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                      Choose which events trigger notifications.
                    </p>
                  </div>

                  <div className="px-6 py-5 space-y-6">
                    {notifMsg && (
                      <StatusBanner
                        message={notifMsg.text}
                        type={notifMsg.type}
                        onDismiss={() => setNotifMsg(null)}
                      />
                    )}

                    {/* In-app notifications */}
                    <div>
                      <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>In-App Alerts</p>
                      <div className={`rounded-xl px-4 divide-y ${isDark ? 'bg-[#1a1f35] border border-white/5 divide-white/5' : 'bg-gray-50 border border-gray-200 divide-gray-100'}`}>
                        <ToggleRow
                          label="Booking Confirmed"
                          sublabel="Show alert when a booking is confirmed"
                          checked={notif.inapp_booking_confirmed}
                          onChange={(v) => setNotif((n) => ({ ...n, inapp_booking_confirmed: v }))}
                        />
                        <ToggleRow
                          label="Booking Cancelled or Rescheduled"
                          sublabel="Show alert when a consultation is cancelled"
                          checked={notif.inapp_booking_cancelled}
                          onChange={(v) => setNotif((n) => ({ ...n, inapp_booking_cancelled: v }))}
                        />
                        <ToggleRow
                          label="Upcoming Reminder"
                          sublabel="Show reminder before a scheduled consultation"
                          checked={notif.inapp_upcoming_reminder}
                          onChange={(v) => setNotif((n) => ({ ...n, inapp_upcoming_reminder: v }))}
                        />
                      </div>
                    </div>

                    {/* Email notifications — professors only */}
                    {role === 'professor' && (
                      <div>
                        <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Email Notifications</p>
                        <div className={`rounded-xl px-4 divide-y ${isDark ? 'bg-[#1a1f35] border border-white/5 divide-white/5' : 'bg-gray-50 border border-gray-200 divide-gray-100'}`}>
                          <ToggleRow
                            label="New Booking Request"
                            sublabel="Email when a student books a new consultation"
                            checked={notif.email_booking_confirmed}
                            onChange={(v) => setNotif((n) => ({ ...n, email_booking_confirmed: v }))}
                          />
                          <ToggleRow
                            label="Booking Cancelled by Student"
                            sublabel="Email when a student cancels their consultation"
                            checked={notif.email_booking_cancelled}
                            onChange={(v) => setNotif((n) => ({ ...n, email_booking_cancelled: v }))}
                          />
                        </div>
                        <p className={`mt-2 text-[11px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                          Emails are sent to <span className={`font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{profile.email || 'your registered email'}</span>
                        </p>
                      </div>
                    )}

                    {/* Accessibility */}
                    <div>
                      <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Accessibility</p>
                      <div className={`rounded-xl px-4 divide-y ${isDark ? 'bg-[#1a1f35] border border-white/5 divide-white/5' : 'bg-gray-50 border border-gray-200 divide-gray-100'}`}>
                        <ToggleRow
                          label="Reduce Motion"
                          sublabel="Disable hover shake effects and animations (recommended for ADHD)"
                          checked={reduceMotion}
                          onChange={handleReduceMotion}
                        />
                      </div>
                    </div>

                    <div>
                      <button
                        type="button"
                        disabled={notifSaving}
                        onClick={handleSaveNotif}
                        className="px-5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#0369A1] to-[#0EA5E9] hover:from-[#0284c7] hover:to-[#38bdf8] text-white transition-all shadow-md shadow-sky-900/30 hover:shadow-sky-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {notifSaving ? 'Saving…' : 'Save Preferences'}
                      </button>
                    </div>
                  </div>
                </div>
              )}


              {/* ── SYSTEM TAB (admin only) ────────────────────────────────── */}
              {activeTab === 'system' && role === 'admin' && (
                <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-[#252535] border-white/5 shadow-[0_4px_20px_rgba(0,0,0,0.35)]' : 'bg-white border-sky-100 shadow-sm'}`}>
                  <div className="px-6 py-4 border-b border-white/5">
                    <h2 className="text-sm font-semibold text-white">System Configuration</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Manage global app settings. Changes apply to all users immediately.
                    </p>
                  </div>

                  <div className="px-6 py-5">
                    {sysMsg && (
                      <div className="mb-4">
                        <StatusBanner
                          message={sysMsg.text}
                          type={sysMsg.type}
                          onDismiss={() => setSysMsg(null)}
                        />
                      </div>
                    )}

                    <form onSubmit={handleSaveSystem} className="space-y-5">
                      {/* Maintenance mode */}
                      <div className="flex items-start justify-between gap-6 py-3 border-b border-white/5">
                        <div>
                          <p className="text-sm font-medium text-gray-200">Maintenance Mode</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            When enabled, students and professors will see a maintenance notice and cannot book consultations.
                          </p>
                          {sysSettings.maintenance_mode === 'true' && (
                            <span className="inline-block mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
                              MAINTENANCE ACTIVE
                            </span>
                          )}
                        </div>
                        <Toggle
                          checked={sysSettings.maintenance_mode === 'true'}
                          onChange={(v) =>
                            setSysSettings((s) => ({ ...s, maintenance_mode: v ? 'true' : 'false' }))
                          }
                        />
                      </div>

                      {/* Require admin approval */}
                      <div className="flex items-start justify-between gap-6 py-3 border-b border-white/5">
                        <div>
                          <p className="text-sm font-medium text-gray-200">Require Admin Approval</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            When enabled, new registrations must be approved by an admin before the user can log in.
                          </p>
                          {sysSettings.require_admin_approval === 'true' && (
                            <span className="inline-block mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/20">
                              APPROVAL REQUIRED
                            </span>
                          )}
                        </div>
                        <Toggle
                          checked={sysSettings.require_admin_approval === 'true'}
                          onChange={(v) =>
                            setSysSettings((s) => ({ ...s, require_admin_approval: v ? 'true' : 'false' }))
                          }
                        />
                      </div>

                      {/* Max bookings per student */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                          Max Active Bookings per Student
                        </label>
                        <p className="text-xs text-gray-600 mb-1">
                          Maximum number of pending or confirmed consultations a student can have at one time.
                        </p>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={sysSettings.max_bookings_per_student}
                          onChange={(e) =>
                            setSysSettings((s) => ({
                              ...s,
                              max_bookings_per_student: e.target.value,
                            }))
                          }
                          className={`w-28 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0EA5E9]/50 transition-colors ${inpCls}`}
                        />
                      </div>

                      {/* Academic year */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                          Academic Year
                        </label>
                        <input
                          type="text"
                          value={sysSettings.academic_year}
                          onChange={(e) =>
                            setSysSettings((s) => ({ ...s, academic_year: e.target.value }))
                          }
                          placeholder="e.g. 2025-2026"
                          className={`w-40 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0EA5E9]/50 transition-colors ${inpCls}`}
                        />
                      </div>

                      {/* Current semester */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                          Current Semester
                        </label>
                        <select
                          value={sysSettings.current_semester}
                          onChange={(e) =>
                            setSysSettings((s) => ({ ...s, current_semester: e.target.value }))
                          }
                          className={`w-48 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0EA5E9]/50 transition-colors ${inpCls}`}
                        >
                          <option value="1st Semester">1st Semester</option>
                          <option value="2nd Semester">2nd Semester</option>
                          <option value="Summer">Summer</option>
                        </select>
                      </div>

                      <div className="pt-2">
                        <button
                          type="submit"
                          disabled={sysSaving}
                          className="px-5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#0369A1] to-[#0EA5E9] hover:from-[#0284c7] hover:to-[#38bdf8] text-white transition-all shadow-md shadow-sky-900/30 hover:shadow-sky-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {sysSaving ? 'Saving…' : 'Save System Settings'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </main>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
