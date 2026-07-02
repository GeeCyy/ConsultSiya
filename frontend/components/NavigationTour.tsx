'use client';

import { useState, useEffect, useCallback } from 'react';

const TOUR_DONE_KEYS = {
  student:   'consulta-tour-done-student',
  professor: 'consulta-tour-done-professor',
  admin:     'consulta-tour-done-admin',
};

const PAD = 8;
const TOOLTIP_WIDTH = 288;
const TOOLTIP_H_EST = 210; // generous estimate for clamping

interface TourStep {
  title: string;
  description: string;
  target: string | null;
}

const STUDENT_STEPS: TourStep[] = [
  {
    title: 'Welcome to Consulta!',
    description:
      "Let's walk you through the key features so you can start booking professor consultations right away.",
    target: null,
  },
  {
    title: 'Notifications',
    description:
      'Stay in the loop! Get real-time updates on your consultation status and school announcements here.',
    target: '[data-tour="notifications"]',
  },
  {
    title: 'Home',
    description:
      'Your dashboard overview — view the academic calendar, quick stats, and upcoming events at a glance.',
    target: '[data-tour="nav-home"]',
  },
  {
    title: 'Book a Slot',
    description:
      'Browse available professor consultation slots and book one in just a few clicks.',
    target: '[data-tour="nav-book"]',
  },
  {
    title: 'My Consultations',
    description:
      "Track your active consultations here — whether they're pending approval or already confirmed.",
    target: '[data-tour="nav-my"]',
  },
  {
    title: 'History',
    description:
      'Review all your completed, cancelled, or missed consultations in one place.',
    target: '[data-tour="nav-history"]',
  },
  {
    title: 'FAQ & AI Assistant',
    description:
      'Need help? Click this button anytime to browse FAQs or chat with the AI assistant for instant answers.',
    target: '[data-tour="chatbot-fab"]',
  },
];

const ADMIN_STEPS: TourStep[] = [
  {
    title: 'Welcome to Consulta Admin!',
    description:
      "Let's walk you through the key sections so you can manage the platform with confidence.",
    target: null,
  },
  {
    title: 'Notifications',
    description:
      'Pending account approvals and system alerts appear here. Keep an eye on it for new user requests.',
    target: '[data-tour="notifications"]',
  },
  {
    title: 'Home',
    description:
      'Your admin overview — platform stats, academic calendar, and recent consultation activity at a glance.',
    target: '[data-tour="nav-home"]',
  },
  {
    title: 'Consultations',
    description:
      'Browse all student-professor consultation records across the platform. Filter by status or search by name.',
    target: '[data-tour="nav-consultations"]',
  },
  {
    title: 'Accounts',
    description:
      'Approve new user registrations, manage existing student and professor accounts, and control access.',
    target: '[data-tour="nav-accounts"]',
  },
  {
    title: 'Schedules',
    description:
      "View all professors' consultation slots in one place. Useful for spotting availability gaps.",
    target: '[data-tour="nav-schedules"]',
  },
  {
    title: 'Reports',
    description:
      'Generate and export consultation reports for administrative and accreditation purposes.',
    target: '[data-tour="nav-reports"]',
  },
  {
    title: 'History',
    description:
      'Review all completed, cancelled, and missed consultations archived across terms.',
    target: '[data-tour="nav-history"]',
  },
  {
    title: 'Term Archive',
    description:
      'Access consultation records from previous academic terms, organized for easy retrieval.',
    target: '[data-tour="nav-archive"]',
  },
  {
    title: 'Calendar',
    description:
      'Manage the academic calendar — set exam weeks, mode overrides, and blocked dates for the whole institution.',
    target: '[data-tour="nav-calendar"]',
  },
  {
    title: 'FAQ & AI Assistant',
    description:
      'Need help? Click this button anytime to browse FAQs or chat with the AI assistant for instant answers.',
    target: '[data-tour="chatbot-fab"]',
  },
];

const PROFESSOR_STEPS: TourStep[] = [
  {
    title: 'Welcome to Consulta!',
    description:
      "Let's walk you through the key features so you can start managing your consultation schedule right away.",
    target: null,
  },
  {
    title: 'Notifications',
    description:
      'Stay updated! New student booking requests and announcements appear here in real time.',
    target: '[data-tour="notifications"]',
  },
  {
    title: 'Home',
    description:
      'Your dashboard overview — see your upcoming consultations, quick stats, and the academic calendar.',
    target: '[data-tour="nav-home"]',
  },
  {
    title: 'Manage Schedules',
    description:
      'Create and manage your consultation slots here. Add date, time ranges, and location for each slot.',
    target: '[data-tour="nav-schedules"]',
  },
  {
    title: 'Booking Calendar',
    description:
      'A monthly calendar view of all your scheduled slots. Click any date to see its consultation details.',
    target: '[data-tour="nav-calendar"]',
  },
  {
    title: 'My Consultations',
    description:
      'Review, confirm, reschedule, or cancel student bookings. Completed sessions are marked here too.',
    target: '[data-tour="nav-consultations"]',
  },
  {
    title: 'Export Report',
    description:
      'Download your consultation records as an Excel or PDF report for administrative purposes.',
    target: '[data-tour="nav-export"]',
  },
  {
    title: 'History',
    description:
      'Browse all past consultations — completed, cancelled, or missed — grouped by term.',
    target: '[data-tour="nav-history"]',
  },
  {
    title: 'FAQ & AI Assistant',
    description:
      'Need help? Click this button anytime to browse FAQs or chat with the AI assistant for instant answers.',
    target: '[data-tour="chatbot-fab"]',
  },
];

type Rect = { top: number; left: number; width: number; height: number };
type Placement = 'right' | 'left' | 'above' | 'below';

interface TooltipPlacement {
  style: React.CSSProperties;
  placement: Placement;
  /** px offset from start of the arrow edge to the arrow centre */
  arrowPx: number;
}

function useElementRect(selector: string | null, active: boolean): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  const update = useCallback(() => {
    if (!selector || !active) { setRect(null); return; }
    const el = document.querySelector(selector) as HTMLElement | null;
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) { setRect(null); return; }
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [selector, active]);

  useEffect(() => {
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [update]);

  return rect;
}

export default function NavigationTour({
  isDark,
  role = 'student',
}: {
  isDark: boolean;
  role?: 'student' | 'professor' | 'admin';
}) {
  const steps   = role === 'professor' ? PROFESSOR_STEPS : role === 'admin' ? ADMIN_STEPS : STUDENT_STEPS;
  const doneKey = TOUR_DONE_KEYS[role];

  const [visible, setVisible] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  // Show on first visit
  useEffect(() => {
    try {
      if (!localStorage.getItem(doneKey)) setVisible(true);
    } catch { /**/ }
  }, [doneKey]);

  // Re-trigger from chatbot
  useEffect(() => {
    const handler = () => {
      try { localStorage.removeItem(doneKey); } catch { /**/ }
      setStepIdx(0);
      setVisible(true);
    };
    window.addEventListener('consulta-restart-tour', handler);
    return () => window.removeEventListener('consulta-restart-tour', handler);
  }, [doneKey]);

  const step = steps[stepIdx];
  const isChatbotStep = visible && step.target === '[data-tour="chatbot-fab"]';

  // For non-chatbot steps use the normal DOM-query approach
  const domRect = useElementRect(
    isChatbotStep ? null : (visible ? step.target : null),
    visible && !isChatbotStep,
  );

  // For the chatbot FAB step: query with rAF so the boosted z-index has painted,
  // then fall back to computing position from known Tailwind values.
  const [fabRect, setFabRect] = useState<Rect | null>(null);
  useEffect(() => {
    if (!isChatbotStep) { setFabRect(null); return; }
    let frameId: number;
    const compute = () => {
      const el = document.querySelector('[data-tour="chatbot-fab"]') as HTMLElement | null;
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 || r.height > 0) {
          setFabRect({ top: r.top, left: r.left, width: r.width, height: r.height });
          return;
        }
      }
      // Fallback: derive from Tailwind values (bottom-5 right-3 sm:right-5 w-12 h-12)
      const W = window.innerWidth;
      const H = window.innerHeight;
      const right  = W >= 640 ? 20 : 12;
      const size   = 48;
      setFabRect({ top: H - 20 - size, left: W - right - size, width: size, height: size });
    };
    // First attempt immediately, second after paint (gives z-index boost time to apply)
    frameId = requestAnimationFrame(compute);
    window.addEventListener('resize', compute);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', compute);
    };
  }, [isChatbotStep]);

  const rect = isChatbotStep ? fabRect : domRect;

  // Lift chatbot FAB above the tour overlay when its step is active
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('consulta-tour-chatbot', { detail: { active: isChatbotStep } }));
    return () => {
      window.dispatchEvent(new CustomEvent('consulta-tour-chatbot', { detail: { active: false } }));
    };
  }, [isChatbotStep]);

  const dismiss = () => {
    try { localStorage.setItem(doneKey, '1'); } catch { /**/ }
    setVisible(false);
  };

  const goNext = () => {
    if (stepIdx < steps.length - 1) setStepIdx(i => i + 1);
    else dismiss();
  };

  const goPrev = () => { if (stepIdx > 0) setStepIdx(i => i - 1); };

  if (!visible) return null;

  const sp = rect
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null;

  const isLast = stepIdx === steps.length - 1;

  const cardBg   = isDark ? 'bg-[#1e1f22] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900';
  const descCls  = isDark ? 'text-gray-400' : 'text-gray-500';
  const btnGhost = isDark
    ? 'text-gray-400 hover:text-white hover:bg-white/10 border border-white/10'
    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200';

  // ── Tooltip placement: right → left → above → below ──────────────────────────
  const getPlacement = (): TooltipPlacement | null => {
    if (!sp) return null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spMidY = sp.top  + sp.height / 2;
    const spMidX = sp.left + sp.width  / 2;

    // Right of element
    const rightOfEl = sp.left + sp.width + 12;
    if (rightOfEl + TOOLTIP_WIDTH <= vw - 12) {
      const top = Math.max(12, Math.min(spMidY - 100, vh - TOOLTIP_H_EST - 12));
      return { style: { position: 'fixed', top, left: rightOfEl, width: TOOLTIP_WIDTH }, placement: 'right', arrowPx: spMidY - top };
    }

    // Left of element
    const leftOfEl = sp.left - TOOLTIP_WIDTH - 12;
    if (leftOfEl >= 12) {
      const top = Math.max(12, Math.min(spMidY - 100, vh - TOOLTIP_H_EST - 12));
      return { style: { position: 'fixed', top, left: leftOfEl, width: TOOLTIP_WIDTH }, placement: 'left', arrowPx: spMidY - top };
    }

    // Above element
    const aboveTop = sp.top - TOOLTIP_H_EST - 12;
    if (aboveTop >= 12) {
      const left = Math.max(12, Math.min(spMidX - TOOLTIP_WIDTH / 2, vw - TOOLTIP_WIDTH - 12));
      return { style: { position: 'fixed', top: aboveTop, left, width: TOOLTIP_WIDTH }, placement: 'above', arrowPx: spMidX - left };
    }

    // Below (fallback)
    const left = Math.max(12, Math.min(spMidX - TOOLTIP_WIDTH / 2, vw - TOOLTIP_WIDTH - 12));
    const top  = Math.min(sp.top + sp.height + 12, vh - TOOLTIP_H_EST - 12);
    return { style: { position: 'fixed', top, left, width: TOOLTIP_WIDTH }, placement: 'below', arrowPx: spMidX - left };
  };

  const placement = getPlacement();

  // ── Arrow caret (rotated square, two borders exposed) ─────────────────────────
  // Rotation: rotate(45deg). After rotation the original corners map:
  //   TL→top  TR→right  BR→bottom  BL→left
  // To make the tip point in a direction, expose the two borders that form that corner.
  const arrowEl = (() => {
    if (!placement) return null;
    const { placement: side, arrowPx } = placement;
    const bg     = isDark ? '#1e1f22' : '#ffffff';
    const border = isDark ? '1px solid rgba(255,255,255,0.10)' : '1px solid #e5e7eb';
    const SZ = 10; // square side before rotation → ~14 px diagonal

    // Clamp arrow along the edge so it stays inside the card
    const clampV = Math.max(SZ + 6, Math.min(arrowPx, TOOLTIP_H_EST - SZ - 6));
    const clampH = Math.max(SZ + 6, Math.min(arrowPx, TOOLTIP_WIDTH - SZ - 6));

    const base: React.CSSProperties = {
      position: 'absolute',
      width: SZ,
      height: SZ,
      backgroundColor: bg,
      transform: 'rotate(45deg)',
    };

    switch (side) {
      // Tooltip is RIGHT of element → arrow on LEFT edge, tip points left (BL corner → borderLeft + borderBottom)
      case 'right':
        return <div style={{ ...base, left: -(SZ / 2), top: clampV - SZ / 2, borderLeft: border, borderBottom: border }} />;

      // Tooltip is LEFT of element → arrow on RIGHT edge, tip points right (TR corner → borderTop + borderRight)
      case 'left':
        return <div style={{ ...base, right: -(SZ / 2), top: clampV - SZ / 2, borderTop: border, borderRight: border }} />;

      // Tooltip is ABOVE element → arrow on BOTTOM edge, tip points down (BR corner → borderBottom + borderRight)
      case 'above':
        return <div style={{ ...base, bottom: -(SZ / 2), left: clampH - SZ / 2, borderBottom: border, borderRight: border }} />;

      // Tooltip is BELOW element → arrow on TOP edge, tip points up (TL corner → borderTop + borderLeft)
      case 'below':
        return <div style={{ ...base, top: -(SZ / 2), left: clampH - SZ / 2, borderTop: border, borderLeft: border }} />;
    }
  })();

  const dots = (
    <div className="flex gap-1">
      {steps.map((_, i) => (
        <div
          key={i}
          className={`h-1 rounded-full transition-all duration-200 ${
            i === stepIdx ? 'w-5 bg-[#0EA5E9]' : isDark ? 'w-2 bg-white/20' : 'w-2 bg-gray-300'
          }`}
        />
      ))}
    </div>
  );

  const buttons = (
    <div className="flex items-center gap-2 mt-4">
      {stepIdx > 0 && (
        <button onClick={goPrev} className={`flex-1 text-xs py-1.5 px-3 rounded-lg transition-colors ${btnGhost}`}>
          Back
        </button>
      )}
      <button
        onClick={goNext}
        className="flex-1 text-xs py-2 px-3 rounded-lg bg-[#0EA5E9] hover:bg-[#0284C7] text-white font-semibold transition-colors"
      >
        {isLast ? 'Done' : 'Next'}
      </button>
    </div>
  );

  const cardHeader = (
    <div className="flex items-center justify-between mb-3">
      {dots}
      <button onClick={dismiss} className={`text-[11px] px-2 py-0.5 rounded transition-colors ${btnGhost}`}>
        Skip tour
      </button>
    </div>
  );

  return (
    <>
      {/* Dark overlay with spotlight cutout */}
      {sp ? (
        <svg className="fixed inset-0 z-[200] pointer-events-none" style={{ width: '100vw', height: '100vh' }}>
          <defs>
            <mask id="tour-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect x={sp.left} y={sp.top} width={sp.width} height={sp.height} rx="8" fill="black" />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.65)" mask="url(#tour-mask)" />
        </svg>
      ) : (
        <div className="fixed inset-0 z-[200] bg-black/60 pointer-events-none" />
      )}

      {/* Click blocker */}
      <div className="fixed inset-0 z-[199]" />

      {/* Spotlight ring */}
      {sp && (
        <div
          className="fixed z-[201] rounded-lg pointer-events-none transition-all duration-200"
          style={{
            top: sp.top, left: sp.left,
            width: sp.width, height: sp.height,
            outline: '2px solid #0EA5E9',
            boxShadow: '0 0 0 4px rgba(14,165,233,0.25)',
          }}
        />
      )}

      {/* Tooltip card (targeted step) — uses placement to avoid covering the element */}
      {placement && (
        <div
          className={`fixed z-[202] rounded-xl border shadow-2xl p-4 ${cardBg}`}
          style={{ ...placement.style, position: 'fixed' }}
        >
          {arrowEl}
          {cardHeader}
          <h3 className="font-semibold text-sm mb-1.5">{step.title}</h3>
          <p className={`text-xs leading-relaxed ${descCls}`}>{step.description}</p>
          {buttons}
        </div>
      )}

      {/* Centered card (welcome / fallback when no target) */}
      {!sp && (
        <div className="fixed inset-0 z-[202] flex items-center justify-center p-4">
          <div className={`rounded-2xl border shadow-2xl p-6 w-full max-w-sm ${cardBg}`}>
            {cardHeader}
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-[#0EA5E9]/10 mb-4">
              <svg className="w-6 h-6 text-[#0EA5E9]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 20.25H5.25A2.25 2.25 0 0 1 3 18V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25v5.25M9 20.25h6M9 20.25v-3m6 3v-3m0 0h3.75A2.25 2.25 0 0 0 21 15v-3.75M15 17.25H9" />
              </svg>
            </div>
            <h3 className="font-bold text-base mb-2">{step.title}</h3>
            <p className={`text-sm leading-relaxed ${descCls}`}>{step.description}</p>
            {buttons}
          </div>
        </div>
      )}
    </>
  );
}
