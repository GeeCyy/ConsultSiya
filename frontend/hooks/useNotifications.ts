'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export type LiveNotif = {
  id: number;
  type: string;
  message: string;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
};

export function useNotifications(token: string | null) {
  const [notifs, setNotifs] = useState<LiveNotif[]>([]);
  const [toast, setToast] = useState<LiveNotif | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((n: LiveNotif) => {
    setToast(n);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  useEffect(() => {
    if (!token) return;

    // Load existing notifications
    fetch(`${API}/api/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : []))
      .then((data: LiveNotif[]) => setNotifs(data))
      .catch(() => {});

    // Open SSE stream — token in query param since EventSource can't send headers
    const es = new EventSource(
      `${API}/api/notifications/stream?token=${encodeURIComponent(token)}`
    );

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as LiveNotif & { type: string };
        if (data.type === 'connected') return;
        setNotifs(prev => [data, ...prev]);
        showToast(data);
      } catch { /* ignore malformed events */ }
    };

    es.onerror = () => { /* SSE auto-reconnects — no action needed */ };

    return () => {
      es.close();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [token, showToast]);

  const unreadCount = notifs.filter(n => !n.is_read).length;

  const markAllRead = useCallback(() => {
    if (!token) return;
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    fetch(`${API}/api/notifications/read-all`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }, [token]);

  const markRead = useCallback((id: number) => {
    if (!token) return;
    setNotifs(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)));
    fetch(`${API}/api/notifications/${id}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }, [token]);

  const dismissToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  return { notifs, unreadCount, markAllRead, markRead, toast, dismissToast };
}
