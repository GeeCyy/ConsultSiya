'use client';

import { useState, useEffect, useCallback } from 'react';

const TOUR_DONE_KEY = 'consulta-tour-done-student';
const PAD = 8;
const TOOLTIP_WIDTH = 288;

interface TourStep {
  title: string;
  description: string;
  target: string | null;
}

const STEPS: TourStep[] = [
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
      'Track your active consultations here — whether they\'re pending approval or already confirmed.',
    target: '[data-tour="nav-my"]',
  },
  {
    title: 'History',
    description:
      'Review all your completed, cancelled, or missed consultations in one place.',
    target: '[data-tour="nav-history"]',
  },
];

type Rect = { top: number; left: number; width: number; height: number };

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

export default function NavigationTour({ isDark }: { isDark: boolean }) {
  const [visible, setVisible] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(TOUR_DONE_KEY)) setVisible(true);
    } catch { /**/ }
  }, []);

  const step = STEPS[stepIdx];
  const rect = useElementRect(visible ? step.target : null, visible);

  const dismiss = () => {
    try { localStorage.setItem(TOUR_DONE_KEY, '1'); } catch { /**/ }
    setVisible(false);
  };

  const goNext = () => {
    if (stepIdx < STEPS.length - 1) setStepIdx(i => i + 1);
    else dismiss();
  };

  const goPrev = () => { if (stepIdx > 0) setStepIdx(i => i - 1); };

  if (!visible) return null;

  const sp = rect
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null;

  const isLast = stepIdx === STEPS.length - 1;

  const cardBg    = isDark ? 'bg-[#1e1f22] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900';
  const descCls   = isDark ? 'text-gray-400' : 'text-gray-500';
  const btnGhost  = isDark
    ? 'text-gray-400 hover:text-white hover:bg-white/10 border border-white/10'
    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200';

  const getTooltipStyle = (): React.CSSProperties => {
    if (!sp) return {};
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rightOfEl = sp.left + sp.width + 12;
    if (rightOfEl + TOOLTIP_WIDTH <= vw - 12) {
      const top = Math.max(12, Math.min(sp.top + sp.height / 2 - 100, vh - 220));
      return { position: 'fixed', top, left: rightOfEl, width: TOOLTIP_WIDTH };
    }
    // not enough room to the right — place below
    const left = Math.max(12, Math.min(sp.left, vw - TOOLTIP_WIDTH - 12));
    const top  = Math.min(sp.top + sp.height + 12, vh - 220);
    return { position: 'fixed', top, left, width: TOOLTIP_WIDTH };
  };

  const dots = (
    <div className="flex gap-1">
      {STEPS.map((_, i) => (
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
        <button
          onClick={goPrev}
          className={`flex-1 text-xs py-1.5 px-3 rounded-lg transition-colors ${btnGhost}`}
        >
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
      <button
        onClick={dismiss}
        className={`text-[11px] px-2 py-0.5 rounded transition-colors ${btnGhost}`}
      >
        Skip tour
      </button>
    </div>
  );

  return (
    <>
      {/* Dark overlay with spotlight cutout */}
      {sp ? (
        <svg
          className="fixed inset-0 z-[200] pointer-events-none"
          style={{ width: '100vw', height: '100vh' }}
        >
          <defs>
            <mask id="tour-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={sp.left} y={sp.top}
                width={sp.width} height={sp.height}
                rx="8" fill="black"
              />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.65)" mask="url(#tour-mask)" />
        </svg>
      ) : (
        <div className="fixed inset-0 z-[200] bg-black/60 pointer-events-none" />
      )}

      {/* Click blocker (below tooltip, blocks page interaction) */}
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

      {/* Tooltip (targeted step) */}
      {sp && (
        <div
          className={`fixed z-[202] rounded-xl border shadow-2xl p-4 ${cardBg}`}
          style={getTooltipStyle()}
        >
          {cardHeader}
          <h3 className="font-semibold text-sm mb-1.5">{step.title}</h3>
          <p className={`text-xs leading-relaxed ${descCls}`}>{step.description}</p>
          {buttons}
        </div>
      )}

      {/* Centered card (welcome / fallback when no visible target) */}
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
