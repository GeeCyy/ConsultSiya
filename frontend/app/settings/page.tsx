'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'profile' | 'notifications' | 'security' | 'system';

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
};

type NotifSettings = {
  email_booking_confirmed: boolean;
  email_booking_cancelled: boolean;
  email_upcoming_reminder: boolean;
  inapp_booking_confirmed: boolean;
  inapp_booking_cancelled: boolean;
  inapp_upcoming_reminder: boolean;
};

type SystemSettings = {
  maintenance_mode: string;
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
        checked ? 'bg-[#CC0000]' : 'bg-[#383a40]'
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
        {label}
        {required && <span className="text-[#CC0000] ml-1">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 py-2 rounded-lg bg-[#1e1f22] border border-white/10 text-gray-200 placeholder-gray-600 text-sm focus:outline-none focus:border-[#CC0000]/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
}: {
  value: string;
  onChange: (code: string) => void;
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
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-[#1e1f22] border border-white/10 text-gray-200 text-sm hover:border-white/20 focus:outline-none focus:border-[#CC0000]/60 transition-colors"
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
        <div className="absolute top-full left-0 mt-1 z-50 w-56 rounded-xl bg-[#2b2d31] border border-white/10 shadow-2xl overflow-hidden">
          <div className="max-h-60 overflow-y-auto">
            {COUNTRY_CODES.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => { onChange(c.code); setOpen(false); }}
                className={`flex items-center gap-3 w-full px-3 py-2.5 text-left transition-colors ${
                  c.code === value
                    ? 'bg-[#CC0000]/10 text-white'
                    : 'text-gray-300 hover:bg-white/5'
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

function PhoneInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
        <CountryCodeSelect value={selectedCode} onChange={handleCode} />
        <input
          ref={inputRef}
          type="tel"
          value={applyPhoneFormat(rawDigits, groups)}
          onChange={handleLocal}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 rounded-lg bg-[#1e1f22] border border-white/10 text-gray-200 placeholder-gray-600 text-sm focus:outline-none focus:border-[#CC0000]/60 transition-colors"
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

  useEffect(() => {
    setIsDark(localStorage.getItem('consulta-theme') === 'dark');
    const handler = (e: Event) => setIsDark((e as CustomEvent<{ dark: boolean }>).detail.dark);
    window.addEventListener('consulta-theme-change', handler);
    return () => window.removeEventListener('consulta-theme-change', handler);
  }, []);

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
    email_booking_confirmed: true,
    email_booking_cancelled: true,
    email_upcoming_reminder: true,
    inapp_booking_confirmed: true,
    inapp_booking_cancelled: true,
    inapp_upcoming_reminder: true,
  });
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifMsg, setNotifMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Password state
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });

  // System settings state
  const [sysSettings, setSysSettings] = useState<SystemSettings>({
    maintenance_mode: 'false',
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
          });
        }
        if (notifRes.ok) {
          setNotif(await notifRes.json());
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
      id: 'security',
      label: 'Security',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
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

  return (
    <DashboardShell weekBadge={false}>
      <div className={`min-h-full ${isDark ? 'bg-[#1e1f22]' : 'bg-[#f2f3f5]'}`}>
        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div className={`flex items-center gap-3 px-6 py-4 border-b ${isDark ? 'bg-[#1a1b1e] border-white/5' : 'bg-white border-black/10'}`}>
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
              <div className="w-8 h-8 rounded-full border-2 border-[#CC0000] border-t-transparent animate-spin" />
              <span className="text-sm text-gray-500">Loading settings…</span>
            </div>
          </div>
        ) : (
          <div className="flex max-w-5xl mx-auto px-4 py-6 gap-6">
            {/* ── Sidebar ──────────────────────────────────────────────────── */}
            <aside className="w-52 flex-shrink-0">
              {/* Mini profile card */}
              <div className={`flex flex-col items-center gap-2 p-4 mb-4 rounded-xl border ${isDark ? 'bg-[#2b2d31] border-white/10' : 'bg-white border-black/10'}`}>
                <div className={`w-14 h-14 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center border-2 border-[#CC0000]/40 ${isDark ? 'bg-[#383a40]' : 'bg-[#f2f3f5]'}`}>
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-lg font-bold text-[#CC0000]">{initials}</span>
                  )}
                </div>
                <div className="text-center min-w-0 w-full">
                  <p className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{profile.full_name}</p>
                  <span
                    className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mt-1 ${
                      role === 'admin'
                        ? 'bg-[#CC0000]/20 text-[#CC0000]'
                        : role === 'professor'
                        ? 'bg-blue-500/15 text-blue-400'
                        : 'bg-emerald-500/15 text-emerald-400'
                    }`}
                  >
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </span>
                </div>
              </div>

              {/* Nav tabs */}
              <nav className="flex flex-col gap-0.5">
                {visibleTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors ${
                      activeTab === tab.id
                        ? 'bg-[#CC0000]/15 text-[#CC0000]'
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
                <div className="bg-[#2b2d31] rounded-xl border border-white/10 overflow-hidden">
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
                      <div className="w-20 h-20 rounded-full overflow-hidden flex-shrink-0 bg-[#383a40] flex items-center justify-center border-2 border-[#CC0000]/30">
                        {avatarSrc ? (
                          <img src={avatarSrc} alt="avatar" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-2xl font-bold text-[#CC0000]">{initials}</span>
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
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#CC0000] hover:bg-[#aa0000] text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                        <FieldInput
                          label="Full Name"
                          value={profile.full_name}
                          onChange={(v) => setProfile((p) => ({ ...p, full_name: v }))}
                          placeholder="e.g. Juan Dela Cruz"
                          required
                        />
                      )}

                      <FieldInput
                        label="Email Address"
                        type="email"
                        value={profile.email}
                        onChange={(v) => setProfile((p) => ({ ...p, email: v }))}
                        placeholder="you@example.com"
                        required
                      />

                      {(role === 'student' || role === 'professor') && (
                        <PhoneInput
                          value={profile.phone}
                          onChange={(v) => setProfile((p) => ({ ...p, phone: v }))}
                        />
                      )}

                      {/* Student-specific fields */}
                      {role === 'student' && (
                        <>
                          <FieldInput
                            label="Student Number"
                            value={profile.student_number || ''}
                            onChange={(v) => setProfile((p) => ({ ...p, student_number: v }))}
                            placeholder="e.g. 2021-XXXXX-MN-0"
                            required
                          />
                          <FieldInput
                            label="Program"
                            value={profile.program || ''}
                            onChange={(v) => setProfile((p) => ({ ...p, program: v }))}
                            placeholder="e.g. BS Computer Science"
                          />
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
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
                              className="w-full px-3 py-2 rounded-lg bg-[#1e1f22] border border-white/10 text-gray-200 text-sm focus:outline-none focus:border-[#CC0000]/60 transition-colors"
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
                        <FieldInput
                          label="Department"
                          value={profile.department || ''}
                          onChange={(v) => setProfile((p) => ({ ...p, department: v }))}
                          placeholder="e.g. Computer Engineering"
                        />
                      )}

                      {/* Admin info */}
                      {role === 'admin' && (
                        <div className="px-4 py-3 rounded-lg bg-[#1e1f22] border border-white/5 text-xs text-gray-500">
                          Admin accounts use only the email address as profile information. Contact your system owner to update additional details.
                        </div>
                      )}

                      <div className="pt-2">
                        <button
                          type="submit"
                          disabled={profileSaving}
                          className="px-5 py-2 rounded-lg text-sm font-semibold bg-[#CC0000] hover:bg-[#aa0000] text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {profileSaving ? 'Saving…' : 'Save Changes'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* ── NOTIFICATIONS TAB ──────────────────────────────────────── */}
              {activeTab === 'notifications' && (
                <div className="bg-[#2b2d31] rounded-xl border border-white/10 overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/5">
                    <h2 className="text-sm font-semibold text-white">Notification Preferences</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Choose which events trigger email and in-app notifications.
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

                    {/* Email notifications */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <svg className="w-4 h-4 text-[#CC0000]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                          Email Notifications
                        </h3>
                      </div>
                      <div className="rounded-xl bg-[#1e1f22] border border-white/5 px-4 divide-y divide-white/5">
                        <ToggleRow
                          label="Booking Confirmed"
                          sublabel="When a professor confirms your consultation"
                          checked={notif.email_booking_confirmed}
                          onChange={(v) => setNotif((n) => ({ ...n, email_booking_confirmed: v }))}
                        />
                        <ToggleRow
                          label="Booking Cancelled or Rescheduled"
                          sublabel="When a consultation is cancelled or rescheduled"
                          checked={notif.email_booking_cancelled}
                          onChange={(v) => setNotif((n) => ({ ...n, email_booking_cancelled: v }))}
                        />
                        <ToggleRow
                          label="Upcoming Reminder"
                          sublabel="Reminder before a scheduled consultation"
                          checked={notif.email_upcoming_reminder}
                          onChange={(v) => setNotif((n) => ({ ...n, email_upcoming_reminder: v }))}
                        />
                      </div>
                    </div>

                    {/* In-app notifications */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <svg className="w-4 h-4 text-[#CC0000]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                          In-App Notifications
                        </h3>
                      </div>
                      <div className="rounded-xl bg-[#1e1f22] border border-white/5 px-4 divide-y divide-white/5">
                        <ToggleRow
                          label="Booking Confirmed"
                          sublabel="Show alert when your booking is confirmed"
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

                    <div>
                      <button
                        type="button"
                        disabled={notifSaving}
                        onClick={handleSaveNotif}
                        className="px-5 py-2 rounded-lg text-sm font-semibold bg-[#CC0000] hover:bg-[#aa0000] text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {notifSaving ? 'Saving…' : 'Save Preferences'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── SECURITY TAB ───────────────────────────────────────────── */}
              {activeTab === 'security' && (
                <div className="bg-[#2b2d31] rounded-xl border border-white/10 overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/5">
                    <h2 className="text-sm font-semibold text-white">Security</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Change your account password. You will need your current password to confirm.</p>
                  </div>

                  <div className="px-6 py-5">
                    {pwMsg && (
                      <div className="mb-4">
                        <StatusBanner
                          message={pwMsg.text}
                          type={pwMsg.type}
                          onDismiss={() => setPwMsg(null)}
                        />
                      </div>
                    )}

                    <form onSubmit={handleChangePassword} className="space-y-4 max-w-sm">
                      {/* Current password */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                          Current Password <span className="text-[#CC0000]">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showPw.current ? 'text' : 'password'}
                            value={pwForm.current}
                            onChange={(e) => setPwForm((p) => ({ ...p, current: e.target.value }))}
                            placeholder="Your current password"
                            required
                            className="w-full pl-3 pr-10 py-2 rounded-lg bg-[#1e1f22] border border-white/10 text-gray-200 placeholder-gray-600 text-sm focus:outline-none focus:border-[#CC0000]/60 transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPw((s) => ({ ...s, current: !s.current }))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                          >
                            {showPw.current ? (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* New password */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                          New Password <span className="text-[#CC0000]">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showPw.next ? 'text' : 'password'}
                            value={pwForm.next}
                            onChange={(e) => setPwForm((p) => ({ ...p, next: e.target.value }))}
                            placeholder="At least 8 characters"
                            required
                            minLength={8}
                            className="w-full pl-3 pr-10 py-2 rounded-lg bg-[#1e1f22] border border-white/10 text-gray-200 placeholder-gray-600 text-sm focus:outline-none focus:border-[#CC0000]/60 transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPw((s) => ({ ...s, next: !s.next }))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                          >
                            {showPw.next ? (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            )}
                          </button>
                        </div>
                        {pwForm.next.length > 0 && pwForm.next.length < 8 && (
                          <p className="text-[11px] text-amber-400">Password must be at least 8 characters.</p>
                        )}
                      </div>

                      {/* Confirm password */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                          Confirm New Password <span className="text-[#CC0000]">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showPw.confirm ? 'text' : 'password'}
                            value={pwForm.confirm}
                            onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))}
                            placeholder="Repeat new password"
                            required
                            className="w-full pl-3 pr-10 py-2 rounded-lg bg-[#1e1f22] border border-white/10 text-gray-200 placeholder-gray-600 text-sm focus:outline-none focus:border-[#CC0000]/60 transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPw((s) => ({ ...s, confirm: !s.confirm }))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                          >
                            {showPw.confirm ? (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            )}
                          </button>
                        </div>
                        {pwForm.confirm.length > 0 && pwForm.next !== pwForm.confirm && (
                          <p className="text-[11px] text-red-400">Passwords do not match.</p>
                        )}
                      </div>

                      <div className="pt-2">
                        <button
                          type="submit"
                          disabled={pwSaving || !pwForm.current || !pwForm.next || pwForm.next !== pwForm.confirm}
                          className="px-5 py-2 rounded-lg text-sm font-semibold bg-[#CC0000] hover:bg-[#aa0000] text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {pwSaving ? 'Changing…' : 'Change Password'}
                        </button>
                      </div>
                    </form>

                    {/* Account info */}
                    {profile.created_at && (
                      <div className="mt-6 pt-5 border-t border-white/5">
                        <p className="text-xs text-gray-600">
                          Account created{' '}
                          {new Date(profile.created_at).toLocaleDateString('en-PH', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── SYSTEM TAB (admin only) ────────────────────────────────── */}
              {activeTab === 'system' && role === 'admin' && (
                <div className="bg-[#2b2d31] rounded-xl border border-white/10 overflow-hidden">
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
                          className="w-28 px-3 py-2 rounded-lg bg-[#1e1f22] border border-white/10 text-gray-200 text-sm focus:outline-none focus:border-[#CC0000]/60 transition-colors"
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
                          className="w-40 px-3 py-2 rounded-lg bg-[#1e1f22] border border-white/10 text-gray-200 text-sm focus:outline-none focus:border-[#CC0000]/60 transition-colors"
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
                          className="w-48 px-3 py-2 rounded-lg bg-[#1e1f22] border border-white/10 text-gray-200 text-sm focus:outline-none focus:border-[#CC0000]/60 transition-colors"
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
                          className="px-5 py-2 rounded-lg text-sm font-semibold bg-[#CC0000] hover:bg-[#aa0000] text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
