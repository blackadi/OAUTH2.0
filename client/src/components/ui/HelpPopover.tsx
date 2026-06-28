import { useRef, useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

interface HelpPopoverProps {
  title: string;
  description: string;
  params?: { name: string; desc: string }[];
  returns?: string;
  tips?: string;
}

function HelpPopover({ title, description, params, returns, tips }: HelpPopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const getFocusableElements = useCallback(() => {
    if (!panelRef.current) return [];
    return Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    );
  }, []);

  const trapFocus = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const elements = getFocusableElements();
    if (elements.length === 0) return;
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, [getFocusableElements]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (panel) {
      const firstFocusable = getFocusableElements()[0];
      firstFocusable?.focus();
    }
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    document.addEventListener('keydown', trapFocus);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('keydown', trapFocus);
    };
  }, [open, trapFocus, getFocusableElements]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center w-5 h-5 rounded-full border border-indigo-500 bg-transparent text-indigo-500 cursor-pointer hover:bg-indigo-500 hover:text-white transition-colors shrink-0"
        aria-label="Help"
        aria-expanded={open}
        aria-controls="help-popover-panel"
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <text x="8" y="12" textAnchor="middle" fontSize="11" fill="currentColor" fontWeight="600">i</text>
        </svg>
      </button>
      {open && (
        <div
          id="help-popover-panel"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={cn(
            'absolute top-full right-0 z-50 mt-1.5 w-[360px] max-w-[90vw]',
            'bg-slate-800 border border-slate-700 rounded-lg shadow-xl text-xs text-slate-200',
          )}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
            <strong className="text-sm">{title}</strong>
            <button
              onClick={close}
              className="bg-transparent border-none text-slate-400 hover:text-red-400 cursor-pointer p-0.5"
              aria-label="Close help"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="px-3 py-2 flex flex-col gap-2">
            <p className="m-0 leading-relaxed">{description}</p>
            {params && params.length > 0 && (
              <div className="flex flex-col gap-1">
                <strong className="text-xs text-slate-400 uppercase tracking-wider">Parameters</strong>
                <div className="flex flex-col gap-1">
                  {params.map((p, i) => (
                    <div key={i} className="flex flex-col gap-0.5">
                      <code className="text-xs text-indigo-300 bg-indigo-500/10 px-1 py-0.5 rounded">{p.name}</code>
                      <span className="text-xs text-slate-300">{p.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {returns && (
              <div className="flex flex-col gap-1">
                <strong className="text-xs text-slate-400 uppercase tracking-wider">Returns</strong>
                <p className="m-0 text-xs text-slate-300">{returns}</p>
              </div>
            )}
            {tips && (
              <div className="flex flex-col gap-1 border-t border-slate-700 pt-2">
                <strong className="text-xs text-slate-400 uppercase tracking-wider">Tips</strong>
                <p className="m-0 text-xs text-slate-300">{tips}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { HelpPopover };
