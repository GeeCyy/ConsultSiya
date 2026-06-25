'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  isDark: boolean;
  className?: string;
  wrapperClassName?: string;
  align?: 'left' | 'right';
  forceUp?: boolean;
  triggerPrefix?: string;
}

export default function CustomSelect({ value, onChange, options, isDark, className = '', wrapperClassName, align = 'left', forceUp = false, triggerPrefix = '' }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const panelHeight = panelRef.current?.offsetHeight ?? 240;
    const flipUp = forceUp || (rect.bottom + panelHeight > window.innerHeight && rect.top - panelHeight > 0);
    setPos({
      top: flipUp ? rect.top - panelHeight - 4 : rect.bottom + 4,
      left: align === 'right' ? rect.right - Math.max(rect.width, panelRef.current?.offsetWidth ?? 0) : rect.left,
      width: rect.width,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const handleReposition = () => updatePosition();
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open]);

  const selected = options.find(o => o.value === value);

  return (
    <div className={`relative ${wrapperClassName || 'inline-block'}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center justify-between gap-2 rounded-lg border cursor-pointer transition-colors ${
          isDark ? 'bg-[#252535] border-white/10 text-white hover:border-white/20' : 'bg-white border-gray-200 text-gray-900 hover:border-gray-300'
        } ${className}`}
      >
        <span className="truncate">{triggerPrefix}{selected?.label ?? ''}</span>
        <svg className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.width }}
          className={`z-[1000] max-h-60 overflow-y-auto rounded-lg border shadow-xl py-1 ${
            isDark ? 'bg-[#252535] border-white/10' : 'bg-white border-gray-200'
          }`}
        >
          {options.map(opt => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2 text-sm whitespace-nowrap transition-colors ${
                  isDark
                    ? `text-gray-200 hover:bg-white/10 hover:text-white ${isSelected ? 'bg-white/10 text-white font-medium' : ''}`
                    : `text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${isSelected ? 'bg-gray-100 text-gray-900 font-medium' : ''}`
                }`}
              >
                {opt.label}
                {isSelected && (
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
