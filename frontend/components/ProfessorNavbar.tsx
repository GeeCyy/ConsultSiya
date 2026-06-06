'use client';

import DashboardNavbar from './DashboardNavbar';

export type ProfessorTab = 'home' | 'schedules' | 'calendar' | 'consultations' | 'export' | 'history';

const NAV_ITEMS: { key: ProfessorTab; label: string }[] = [
  { key: 'home',          label: 'Home' },
  { key: 'schedules',     label: 'Manage Schedules' },
  { key: 'calendar',      label: 'Booking Calendar' },
  { key: 'consultations', label: 'My Consultations' },
  { key: 'export',        label: 'Export Report' },
  { key: 'history',       label: 'History' },
];

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

interface Props {
  tab: ProfessorTab;
  onTabChange: (tab: ProfessorTab) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  profileName: string;
  profileAvatar: string | null;
  pendingConsultations: PendingConsult[];
  announcements: AnnItem[];
  storageKey: string;
}

export default function ProfessorNavbar({
  tab, onTabChange, isDark, onToggleTheme,
  profileName, profileAvatar,
  pendingConsultations, announcements, storageKey,
}: Props) {
  return (
    <DashboardNavbar
      role="professor"
      navItems={NAV_ITEMS}
      activeTab={tab}
      onTabChange={onTabChange as (tab: string) => void}
      isDark={isDark}
      onToggleTheme={onToggleTheme}
      profileName={profileName}
      profileAvatar={profileAvatar}
      pendingConsultations={pendingConsultations}
      announcements={announcements}
      storageKey={storageKey}
    />
  );
}
