'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const BOOKING_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type TimeRange = { time_start: string; time_end: string };
type Schedule = {
  id: number;
  professor_id: number;
  day: string;
  time_start: string;
  time_end: string;
  time_ranges?: TimeRange[];
  is_available: boolean;
  date?: string;
  mode?: string | null;
};
type BookingSlotInfo = { booked_count: number; topics: string[] };
type BookedTimesData = { booked: Record<string, BookingSlotInfo>; blocked: string[] };

function findMatchingSlots(slots: Schedule[], dateStr: string): Schedule[] {
  const dayName = DAYS_OF_WEEK[new Date(dateStr + 'T12:00:00').getDay()];
  const dated = slots.filter(s => s.date === dateStr);
  return dated.length > 0 ? dated : slots.filter(s => !s.date && s.day === dayName);
}

function getTimeSlots(start: string, end: string): string[] {
  const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const result: string[] = [];
  for (let mins = toMins(start); mins < toMins(end); mins += 30) {
    result.push(`${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`);
  }
  return result;
}

function formatTime12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function getPhtNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
  return {
    today: `${get('year')}-${get('month')}-${get('day')}`,
    mins: parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10),
  };
}

function BookingCalendar({ slots, bookedDatesMap, selected, onSelect, isDark }: {
  slots: Schedule[];
  bookedDatesMap: Record<number, string[]>;
  selected: string;
  onSelect: (d: string) => void;
  isDark: boolean;
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className={`border rounded-xl p-3 min-h-[220px] ${isDark ? 'bg-[#0f0f0f] border-white/10' : 'bg-gray-50 border-gray-200'}`} />;

  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
  const recurringDows = new Set(slots.filter(s => !s.date).map(s => DAYS_OF_WEEK.indexOf(s.day)));

  const prevMonth = () => {
    if (isCurrentMonth) return;
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1);
  };

  return (
    <div className={`border rounded-xl p-3 select-none ${isDark ? 'bg-[#0f0f0f] border-white/10' : 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={prevMonth} disabled={isCurrentMonth}
          className={`w-7 h-7 flex items-center justify-center rounded-lg disabled:opacity-20 transition-colors ${isDark ? 'text-gray-500 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200'}`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{BOOKING_MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button type="button" onClick={nextMonth}
          className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200'}`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d, i) => (
          <div key={d} className={`text-center text-[10px] font-medium py-1 ${recurringDows.has(i) ? 'text-[#0EA5E9]' : isDark ? 'text-gray-700' : 'text-gray-400'}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstDow }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isPast = new Date(viewYear, viewMonth, day) < today;
          const matchingSlots = findMatchingSlots(slots, dateStr);
          const isAvailable = matchingSlots.length > 0 && !isPast;
          const isFullyBooked = matchingSlots.length > 0 && matchingSlots.every(ms => (bookedDatesMap[ms.id] ?? []).includes(dateStr));
          const isDisabled = !isAvailable || isFullyBooked;
          const isSelected = selected === dateStr;
          return (
            <button key={dateStr} type="button" disabled={isDisabled} onClick={() => onSelect(dateStr)}
              className={['rounded-lg text-xs py-1.5 font-medium transition-colors w-full',
                isSelected ? 'bg-sky-500 text-white'
                : isAvailable && isFullyBooked ? `line-through cursor-not-allowed ${isDark ? 'bg-red-500/15 text-red-400' : 'bg-red-100 text-red-500'}`
                : isAvailable ? `font-semibold ${isDark ? 'bg-sky-500/15 text-sky-400 hover:bg-sky-500/30' : 'bg-sky-50 text-sky-600 hover:bg-sky-100'}`
                : `cursor-not-allowed ${isDark ? 'text-gray-800' : 'text-gray-300'}`,
              ].join(' ')}>
              {day}
            </button>
          );
        })}
      </div>
      {selected && (
        <p className={`text-[10px] text-center mt-2.5 font-medium ${isDark ? 'text-sky-400' : 'text-sky-600'}`}>
          {new Date(selected + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      )}
    </div>
  );
}

interface RescheduleBookingPanelProps {
  consultId: number;
  professorId: number;
  rescheduleRemarks: string | null;
  token: string;
  isDark: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function RescheduleBookingPanel({
  consultId, professorId, rescheduleRemarks, token, isDark, onSuccess, onCancel,
}: RescheduleBookingPanelProps) {
  const [slots, setSlots] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlots, setSelectedSlots] = useState<Schedule[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState('');
  const [bookedDatesMap, setBookedDatesMap] = useState<Record<number, string[]>>({});
  const [bookedTimes, setBookedTimes] = useState<Record<string, BookedTimesData>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const timePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/api/schedules', token).then(data => {
      if (Array.isArray(data)) {
        const profSlots = (data as Schedule[]).filter(s => String(s.professor_id) === String(professorId) && s.is_available);
        setSlots(profSlots);
        profSlots.forEach(s => {
          api.get(`/api/consultations/booked-dates?schedule_id=${s.id}`, token)
            .then(d => { if (Array.isArray(d)) setBookedDatesMap(prev => ({ ...prev, [s.id]: d })); })
            .catch(() => {});
        });
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [token, professorId]);

  const slotRanges = (s: Schedule) => s.time_ranges?.length ? s.time_ranges : [{ time_start: s.time_start, time_end: s.time_end }];

  const onDateSelect = (dateStr: string) => {
    const matched = findMatchingSlots(slots, dateStr);
    setSelectedSlots(matched);

    // Auto-select first non-past time slot across all matching slots
    let autoScheduleId: number | null = null;
    let autoTime = '';
    const { today, mins: nowMins } = getPhtNow();
    const isToday = dateStr === today;
    outer:
    for (const m of matched) {
      for (const r of slotRanges(m)) {
        const ts = getTimeSlots(r.time_start.slice(0, 5), r.time_end.slice(0, 5));
        const avail = isToday ? ts.filter(t => { const [h, mm] = t.split(':').map(Number); return h * 60 + mm + 30 > nowMins; }) : ts;
        if (avail.length > 0) { autoScheduleId = m.id; autoTime = avail[0]; break outer; }
      }
    }
    setSelectedDate(dateStr);
    setSelectedScheduleId(autoScheduleId);
    setSelectedTime(autoTime);

    matched.forEach(m => {
      const key = `${m.id}-${dateStr}`;
      if (!bookedTimes[key]) {
        api.get(`/api/schedules/${m.id}/booked-times?date=${dateStr}`, token)
          .then(data => {
            if (data && typeof data === 'object' && !Array.isArray(data)) {
              const entry: BookedTimesData = { booked: data.booked ?? {}, blocked: data.blocked ?? [] };
              setBookedTimes(prev => ({ ...prev, [key]: entry }));
              setSelectedTime(t => (m.id === autoScheduleId && entry.blocked.includes(t)) ? '' : t);
            }
          })
          .catch(() => {});
      }
    });
    setTimeout(() => timePickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  };

  const handleSubmit = async () => {
    if (!selectedScheduleId || !selectedDate || !selectedTime || saving) return;
    setError('');
    setSaving(true);
    try {
      const data = await api.patch(`/api/consultations/${consultId}/accept-reschedule`, {
        date: selectedDate,
        time: selectedTime,
        schedule_id: selectedScheduleId,
      }, token);
      if (data.error) { setError(data.error); return; }
      onSuccess();
    } finally {
      setSaving(false);
    }
  };

  const tp  = isDark ? 'text-white'    : 'text-gray-900';
  const ts  = isDark ? 'text-gray-400' : 'text-gray-500';
  const cardCls = isDark ? 'bg-[#1e1f22] border border-white/5' : 'bg-white border border-gray-200';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
        <svg className={`w-10 h-10 opacity-30 ${ts}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
        </svg>
        <p className={`text-sm font-medium ${ts}`}>No available schedule slots at the moment.</p>
        <p className={`text-xs ${ts} opacity-70`}>Please contact your professor directly or check back later.</p>
        <button onClick={onCancel}
          className={`mt-2 px-5 py-2 rounded-xl text-sm font-medium transition-colors ${isDark ? 'bg-white/5 text-gray-300 hover:bg-white/10' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Professor's reschedule reason */}
      {rescheduleRemarks && (
        <div className={`flex items-start gap-2.5 p-3.5 rounded-xl ${isDark ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'}`}>
          <svg className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
          <div>
            <p className={`text-xs font-semibold ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>Professor's reason for rescheduling:</p>
            <p className={`text-xs mt-0.5 italic ${isDark ? 'text-amber-400/80' : 'text-amber-700'}`}>"{rescheduleRemarks}"</p>
          </div>
        </div>
      )}

      {/* Date picker */}
      <div className={`rounded-2xl p-5 ${cardCls}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-sm font-bold ${tp}`}>Select Date</h3>
          <span className={`text-xs ${ts}`}>Available days highlighted</span>
        </div>
        <BookingCalendar
          slots={slots}
          bookedDatesMap={bookedDatesMap}
          selected={selectedDate}
          isDark={isDark}
          onSelect={onDateSelect}
        />
        {selectedSlots.length > 0 && selectedDate && (
          <div className={`mt-3 flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl text-xs ${isDark ? 'bg-sky-500/10 text-sky-400' : 'bg-sky-50 text-sky-700'}`}>
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>
            {selectedSlots.flatMap(s => slotRanges(s)).map((r, i) => (
              <span key={i}>{formatTime12(r.time_start.slice(0, 5))}–{formatTime12(r.time_end.slice(0, 5))}</span>
            ))}
          </div>
        )}
      </div>

      {/* Time picker */}
      <div ref={timePickerRef} className={`rounded-2xl p-5 ${cardCls}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-sm font-bold ${tp}`}>Preferred Start Time</h3>
          {!selectedDate && <span className={`text-xs italic ${ts}`}>Select a date first</span>}
        </div>
        {!selectedDate ? (
          <p className={`text-xs text-center py-4 ${ts}`}>Select a date to view available time slots.</p>
        ) : (
          <div className="space-y-4">
            {(() => {
              const { today: todayStr, mins: currentTimeMins } = getPhtNow();
              const isToday = selectedDate === todayStr;
              return selectedSlots.flatMap(slot => {
                const takenInfo: BookedTimesData = bookedTimes[`${slot.id}-${selectedDate}`] ?? { booked: {}, blocked: [] };
                return slotRanges(slot).map((range, ri) => {
                  let timeSlots = getTimeSlots(range.time_start.slice(0, 5), range.time_end.slice(0, 5));
                  if (isToday) timeSlots = timeSlots.filter(t => { const [h, m] = t.split(':').map(Number); return h * 60 + m + 30 > currentTimeMins; });
                  const session = parseInt(range.time_start.slice(0, 2), 10) < 12 ? 'Morning' : 'Afternoon';
                  return (
                    <div key={`${slot.id}-${ri}`}>
                      <p className={`text-[11px] font-semibold mb-2 uppercase tracking-wide ${ts}`}>
                        {session} · {formatTime12(range.time_start.slice(0, 5))}–{formatTime12(range.time_end.slice(0, 5))}{slot.mode ? ` · ${slot.mode === 'F2F' ? 'Face-to-Face' : slot.mode === 'OL' ? 'Online' : 'Face-to-Face & Online'}` : ''}
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {timeSlots.map(t => {
                          const info = takenInfo.booked[t];
                          const isBlocked = takenInfo.blocked.includes(t);
                          const isBooked = !!info && !isBlocked;
                          const isSel = selectedScheduleId === slot.id && selectedTime === t;
                          return (
                            <button key={t} type="button" disabled={isBlocked} onClick={() => { setSelectedScheduleId(slot.id); setSelectedTime(t); }}
                              className={`flex flex-col p-2.5 rounded-xl border-2 text-left transition-all ${
                                isBlocked   ? `cursor-not-allowed opacity-40 ${isDark ? 'border-white/5 bg-white/[0.02]' : 'border-gray-100 bg-gray-50'}`
                                : isSel     ? 'border-sky-500 bg-sky-500/10'
                                : isBooked  ? isDark ? 'border-amber-500/40 bg-amber-500/10 hover:border-amber-500/60' : 'border-amber-300 bg-amber-50 hover:border-amber-400'
                                :             isDark ? 'border-white/10 bg-white/[0.03] hover:border-white/20' : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                              }`}>
                              <span className={`text-xs font-bold leading-none ${
                                isBlocked ? isDark ? 'text-gray-700' : 'text-gray-300'
                                : isSel    ? 'text-sky-400'
                                : isBooked ? isDark ? 'text-amber-300' : 'text-amber-700'
                                :            isDark ? 'text-white'    : 'text-gray-900'
                              }`}>{formatTime12(t)}</span>
                              <span className={`text-[9px] mt-1 ${
                                isBlocked ? isDark ? 'text-gray-700'      : 'text-gray-300'
                                : isSel    ? 'text-sky-400/60'
                                : isBooked ? isDark ? 'text-amber-400/70' : 'text-amber-600'
                                :            isDark ? 'text-gray-700'     : 'text-gray-300'
                              }`}>
                                {isBlocked ? 'Unavailable' : isBooked ? `${info.booked_count} booked` : 'Open'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              });
            })()}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 pt-1">
        <button onClick={onCancel}
          className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${isDark ? 'bg-white/5 text-gray-300 hover:bg-white/10' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          Cancel
        </button>
        <button onClick={handleSubmit} disabled={!selectedDate || !selectedScheduleId || !selectedTime || saving}
          className="flex-[2] py-3 rounded-xl text-sm font-semibold bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
          {saving ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Submitting…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
              </svg>
              Confirm New Schedule
            </>
          )}
        </button>
      </div>
    </div>
  );
}
