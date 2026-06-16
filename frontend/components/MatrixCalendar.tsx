'use client';

import { useState, useRef } from 'react';
import CustomSelect from './CustomSelect';

type Consultation = {
  id: number;
  student_name: string;
  date: string;
  time: string | null;
  time_start: string;
  time_end: string;
  status: string;
  mode: string;
  program?: string;
};

interface MatrixCalendarProps {
  consultations: Consultation[];
  isDark: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMins(t: string): number {
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

function fmtMins(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function generateSlots(startMins: number, endMins: number, intervalMins: number) {
  const slots: { start: number; end: number; label: string }[] = [];
  for (let s = startMins; s < endMins; s += intervalMins) {
    const e = Math.min(s + intervalMins, endMins);
    slots.push({ start: s, end: e, label: `${fmtMins(s)}` });
  }
  return slots;
}

function getWeekDates(offset: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay(); // 0=Sun
  const monday = new Date(today);
  monday.setDate(today.getDate() + (dow === 0 ? -6 : 1 - dow) + offset * 7);
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      date: iso,
      day: DAYS[i],
      label: `${DAYS[i]} ${d.getMonth() + 1}/${d.getDate()}`,
      isToday: iso === new Date().toISOString().slice(0, 10),
    };
  });
}

function getConsultsForCell(
  dateStr: string,
  slotStart: number,
  slotEnd: number,
  consultations: Consultation[],
): Consultation[] {
  return consultations.filter(c => {
    if (c.date.slice(0, 10) !== dateStr) return false;
    const t = c.time || c.time_start;
    if (!t) return false;
    const mins = toMins(t);
    return mins >= slotStart && mins < slotEnd;
  });
}

const STATUS_DOT: Record<string, string> = {
  pending:     'bg-amber-400',
  confirmed:   'bg-blue-400',
  completed:   'bg-emerald-400',
  cancelled:   'bg-red-400',
  rescheduled: 'bg-orange-400',
  missed:      'bg-purple-400',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function MatrixCalendar({ consultations, isDark }: MatrixCalendarProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [intervalMins, setIntervalMins] = useState(70);
  const [selectedCell, setSelectedCell] = useState<{ date: string; slotLabel: string; items: Consultation[] } | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [animatingDay, setAnimatingDay] = useState<string | null>(null);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const weekDates = getWeekDates(weekOffset);
  const slots = generateSlots(7 * 60, 18 * 60, intervalMins);

  const active = consultations.filter(c =>
    filterStatus === 'all' ? !['completed', 'cancelled', 'missed'].includes(c.status) : c.status === filterStatus
  );

  const weekStr = (() => {
    const first = weekDates[0];
    const last = weekDates[5];
    const a = new Date(first.date + 'T12:00:00');
    const b = new Date(last.date + 'T12:00:00');
    if (a.getMonth() === b.getMonth())
      return `${a.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}`;
    return `${a.toLocaleDateString('en-PH', { month: 'short' })} – ${b.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })}`;
  })();

  // All consultations for the selected day (ignores filterStatus — shows full picture)
  const dayConsults = selectedDay
    ? [...consultations]
        .filter(c => c.date.slice(0, 10) === selectedDay)
        .sort((a, b) => (a.time || a.time_start || '').localeCompare(b.time || b.time_start || ''))
    : [];

  const handleDayClick = (dateStr: string) => {
    if (selectedDay === dateStr) {
      setSelectedDay(null);
      return;
    }
    setSelectedDay(dateStr);
    setAnimatingDay(dateStr);
    if (animTimerRef.current) clearTimeout(animTimerRef.current);
    animTimerRef.current = setTimeout(() => setAnimatingDay(null), 380);
  };

  const card = isDark ? 'bg-[#252525] border-white/5' : 'bg-white border-gray-200';
  const bg = isDark ? 'bg-[#1e1f22]' : 'bg-gray-50';
  const tp = isDark ? 'text-white' : 'text-gray-900';
  const ts = isDark ? 'text-gray-400' : 'text-gray-500';
  const tm = isDark ? 'text-gray-600' : 'text-gray-400';
  const borderCls = isDark ? 'border-white/5' : 'border-gray-100';

  const getCellBg = (items: Consultation[]) => {
    if (items.length === 0) return '';
    const hasConfirmed = items.some(c => c.status === 'confirmed');
    const hasPending = items.some(c => c.status === 'pending');
    const totalBooked = items.length;
    if (totalBooked >= 3) return isDark ? 'bg-red-500/20 border-red-500/30' : 'bg-red-50 border-red-200';
    if (hasConfirmed) return isDark ? 'bg-emerald-500/15 border-emerald-500/25' : 'bg-emerald-50 border-emerald-200';
    if (hasPending) return isDark ? 'bg-amber-500/15 border-amber-500/25' : 'bg-amber-50 border-amber-200';
    return isDark ? 'bg-blue-500/10 border-blue-500/20' : 'bg-blue-50 border-blue-200';
  };

  return (
    <div className={`rounded-2xl border overflow-hidden ${card}`}>
      {/* ── Header controls ── */}
      <div className={`px-4 py-3 border-b ${borderCls} flex flex-col sm:flex-row sm:items-center gap-3`}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset(o => o - 1)}
            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className={`text-sm font-semibold min-w-[160px] text-center ${tp}`}>{weekStr}</span>
          <button
            onClick={() => setWeekOffset(o => o + 1)}
            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${isDark ? 'text-[#CC0000] hover:bg-[#CC0000]/10' : 'text-[#CC0000] hover:bg-red-50'}`}
            >
              Today
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 sm:ml-auto flex-wrap">
          {/* Interval selector */}
          <div className="flex items-center gap-1.5">
            <span className={`text-xs ${tm}`}>Period:</span>
            <CustomSelect
              value={String(intervalMins)}
              onChange={v => setIntervalMins(Number(v))}
              isDark={isDark}
              className="text-xs px-2 py-1"
              options={[
                { value: '50', label: '50 min' },
                { value: '60', label: '60 min' },
                { value: '70', label: '70 min (MAPUA)' },
                { value: '90', label: '90 min' },
              ]}
            />
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1.5">
            <span className={`text-xs ${tm}`}>Show:</span>
            <CustomSelect
              value={filterStatus}
              onChange={setFilterStatus}
              isDark={isDark}
              className="text-xs px-2 py-1"
              options={[
                { value: 'all', label: 'Active' },
                { value: 'pending', label: 'Pending only' },
                { value: 'confirmed', label: 'Confirmed only' },
                { value: 'completed', label: 'Completed' },
              ]}
            />
          </div>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className={`px-4 py-2 border-b ${borderCls} flex items-center gap-4 flex-wrap`}>
        {[
          { color: isDark ? 'bg-emerald-500/15 border border-emerald-500/25' : 'bg-emerald-50 border border-emerald-200', label: 'Confirmed' },
          { color: isDark ? 'bg-amber-500/15 border border-amber-500/25' : 'bg-amber-50 border border-amber-200', label: 'Pending' },
          { color: isDark ? 'bg-red-500/20 border border-red-500/30' : 'bg-red-50 border border-red-200', label: 'Heavily booked (3+)' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className={`w-3.5 h-3.5 rounded ${l.color}`} />
            <span className={`text-[10px] ${tm}`}>{l.label}</span>
          </div>
        ))}
        <span className={`text-[10px] ml-auto ${tm}`}>
          Click a day header to see details
        </span>
      </div>

      {/* ── Grid ── */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed border-collapse">
          <thead>
            <tr>
              <th className={`w-[88px] px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide border-b border-r ${borderCls} ${tm}`}>
                Time
              </th>
              {weekDates.map(d => {
                const isSelected = selectedDay === d.date;
                const isAnimating = animatingDay === d.date;
                return (
                  <th
                    key={d.date}
                    onClick={() => handleDayClick(d.date)}
                    className={`px-2 py-2.5 text-center text-[11px] font-semibold border-b border-r last:border-r-0 ${borderCls} cursor-pointer select-none transition-all duration-200 ${
                      isAnimating
                        ? isDark ? 'bg-sky-400/30' : 'bg-sky-200/60'
                        : isSelected
                          ? isDark ? 'bg-sky-500/10' : 'bg-sky-50'
                          : isDark ? 'hover:bg-white/[0.03]' : 'hover:bg-gray-50'
                    } ${
                      isSelected || d.isToday ? 'text-sky-500' : ts
                    }`}
                  >
                    <div className={`transition-transform duration-150 ${isAnimating ? 'scale-110' : 'scale-100'}`}>
                      <div>{d.day}</div>
                      <div className={`text-[10px] font-normal mt-0.5 ${isSelected || d.isToday ? 'text-sky-400' : tm}`}>
                        {d.date.slice(5).replace('-', '/')}
                      </div>
                      {isSelected && (
                        <div className="mt-1 mx-auto w-1 h-1 rounded-full bg-sky-400" />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {slots.map((slot, si) => {
              const isHour = slot.start % 60 === 0;
              return (
                <tr key={slot.start} className={`${si % 2 === 0 ? (isDark ? 'bg-white/[0.015]' : 'bg-gray-50/50') : ''}`}>
                  <td className={`px-3 py-2 text-[10px] font-mono border-r border-b last:border-b-0 ${borderCls} ${isHour ? ts : tm} whitespace-nowrap`}>
                    {slot.label}
                  </td>
                  {weekDates.map(d => {
                    const items = getConsultsForCell(d.date, slot.start, slot.end, active);
                    const cellBg = getCellBg(items);
                    const isDaySelected = selectedDay === d.date;
                    return (
                      <td
                        key={d.date}
                        className={`relative px-1.5 py-1.5 border-r border-b last:border-r-0 ${borderCls} align-top min-h-[40px] transition-colors ${
                          items.length > 0 ? 'cursor-pointer' : ''
                        } ${
                          isDaySelected && items.length === 0
                            ? isDark ? 'bg-sky-500/[0.04]' : 'bg-sky-50/40'
                            : ''
                        }`}
                        onClick={() => items.length > 0 && setSelectedCell({
                          date: d.date,
                          slotLabel: `${fmtMins(slot.start)} – ${fmtMins(slot.end)}`,
                          items,
                        })}
                      >
                        {items.length > 0 && (
                          <div className={`rounded-md border px-1.5 py-1 text-[10px] leading-snug min-h-[32px] transition-opacity hover:opacity-80 ${cellBg}`}>
                            {items.slice(0, 2).map(c => (
                              <div key={c.id} className="flex items-center gap-1 truncate">
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[c.status] ?? 'bg-gray-400'}`} />
                                <span className={`truncate text-[10px] font-medium ${tp}`}>{c.student_name.split(' ').slice(-1)[0]}</span>
                              </div>
                            ))}
                            {items.length > 2 && (
                              <div className={`text-[9px] font-semibold mt-0.5 ${tm}`}>+{items.length - 2} more</div>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Day detail slide-down panel ── */}
      <div
        style={{
          maxHeight: selectedDay ? '600px' : '0px',
          opacity: selectedDay ? 1 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.22s ease',
        }}
      >
        <div className={`border-t px-4 pt-4 pb-5 ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
          {/* Panel header */}
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className={`font-semibold text-sm ${tp}`}>
                {selectedDay && new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-PH', {
                  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                })}
              </p>
              <p className={`text-xs mt-0.5 ${tm}`}>
                {dayConsults.length === 0
                  ? 'No consultations scheduled'
                  : `${dayConsults.length} consultation${dayConsults.length !== 1 ? 's' : ''}`}
              </p>
            </div>
            <button
              onClick={() => setSelectedDay(null)}
              className={`w-6 h-6 flex items-center justify-center rounded-lg transition-colors flex-shrink-0 ml-3 ${isDark ? 'text-gray-500 hover:text-white hover:bg-white/5' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {dayConsults.length === 0 ? (
            <div className={`flex flex-col items-center justify-center py-8 rounded-xl border ${isDark ? 'border-white/5 bg-white/[0.02]' : 'border-gray-100 bg-gray-50'}`}>
              <svg className={`w-8 h-8 mb-2 ${tm}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
              </svg>
              <p className={`text-sm font-medium ${ts}`}>No consultations on this day</p>
              <p className={`text-xs mt-1 ${tm}`}>Click another day to see its schedule</p>
            </div>
          ) : (
            <div className={`rounded-xl border overflow-hidden divide-y ${isDark ? 'border-white/5 divide-white/5' : 'border-gray-100 divide-gray-100'}`}>
              {dayConsults.map(c => (
                <div
                  key={c.id}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${isDark ? 'bg-[#252525] hover:bg-white/[0.03]' : 'bg-white hover:bg-gray-50'}`}
                >
                  {/* Avatar initials */}
                  <div className="w-8 h-8 rounded-full bg-red-950 border border-red-900/50 flex items-center justify-center text-red-300 text-xs font-semibold flex-shrink-0">
                    {c.student_name.split(' ').filter(Boolean).map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${tp}`}>{c.student_name}</p>
                    <p className={`text-xs mt-0.5 ${tm}`}>
                      {(c.time || c.time_start)?.slice(0, 5)}
                      {c.time_end && ` – ${c.time_end.slice(0, 5)}`}
                      {' · '}
                      {c.mode === 'F2F' ? 'Face-to-Face' : 'Online'}
                    </p>
                  </div>
                  {/* Status badge */}
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                    c.status === 'confirmed'   ? (isDark ? 'bg-blue-500/15 text-blue-400'       : 'bg-blue-50 text-blue-600') :
                    c.status === 'pending'     ? (isDark ? 'bg-amber-500/15 text-amber-400'     : 'bg-amber-50 text-amber-700') :
                    c.status === 'completed'   ? (isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700') :
                    c.status === 'cancelled'   ? (isDark ? 'bg-red-500/15 text-red-400'         : 'bg-red-50 text-red-600') :
                    c.status === 'missed'      ? (isDark ? 'bg-purple-500/15 text-purple-400'   : 'bg-purple-50 text-purple-600') :
                    isDark ? 'bg-gray-500/15 text-gray-400' : 'bg-gray-100 text-gray-600'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[c.status] ?? 'bg-gray-400'}`} />
                    {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Time-slot cell detail modal ── */}
      {selectedCell && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedCell(null)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className={`relative z-10 w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden ${isDark ? 'bg-[#252525] border-white/10' : 'bg-white border-gray-200'}`}
            onClick={e => e.stopPropagation()}
          >
            <div className={`px-4 py-3.5 border-b flex items-center justify-between ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
              <div>
                <p className={`text-sm font-semibold ${tp}`}>
                  {new Date(selectedCell.date + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric' })}
                </p>
                <p className={`text-xs ${tm}`}>{selectedCell.slotLabel}</p>
              </div>
              <button
                onClick={() => setSelectedCell(null)}
                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-white hover:bg-white/5' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className={`divide-y ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
              {selectedCell.items.map(c => (
                <div key={c.id} className="px-4 py-3 flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full bg-red-950 border border-red-900/50 flex items-center justify-center text-red-300 text-xs font-semibold flex-shrink-0`}>
                    {c.student_name.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${tp}`}>{c.student_name}</p>
                    {c.program && <p className={`text-xs ${tm}`}>{c.program}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                        c.status === 'confirmed'   ? (isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600') :
                        c.status === 'pending'     ? (isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-700') :
                        c.status === 'completed'   ? (isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700') :
                        isDark ? 'bg-gray-500/15 text-gray-400' : 'bg-gray-100 text-gray-600'
                      }`}>
                        <span className={`w-1 h-1 rounded-full ${STATUS_DOT[c.status] ?? 'bg-gray-400'}`} />
                        {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                      </span>
                      <span className={`text-[10px] ${tm}`}>
                        {c.mode === 'F2F' ? 'In-Person' : 'Online'}
                      </span>
                    </div>
                  </div>
                  <p className={`text-xs font-mono flex-shrink-0 ${ts}`}>
                    {(c.time || c.time_start)?.slice(0, 5)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
