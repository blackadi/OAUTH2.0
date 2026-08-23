import { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Prose } from './Prose';

interface HelpPopoverProps {
  title: string;
  description: string;
  params?: { name: string; desc: string }[];
  returns?: string;
  tips?: string;
}

const GAP = 6;
/** The tallest the panel is ever allowed to be, before the viewport gets a say. */
const PREFERRED_HEIGHT = 480;
const MARGIN = 12;
/** Below this the panel would show a line and a half of prose; better to keep it usable. */
const MIN_HEIGHT = 160;

/**
 * Where the panel goes, and **how tall it is allowed to be**.
 *
 * The height used to be the constant 480, with the inner scroller sized at `480 - 44` — both
 * viewport-independent. On a viewport shorter than about 504px the clamp
 * `Math.min(top, vh - 480 - 12)` went negative, `Math.max(MARGIN, …)` pinned the panel at `top: 12`,
 * and a 480px panel sat inside a shorter window with its bottom off-screen **and no scroll to reach
 * it** — because the scroll container was sized in pixels rather than relative to what was visible. A
 * landscape phone (~375px tall) and a short desktop window both hit it.
 *
 * That matters more than a clipped panel usually would: this popover is where the per-parameter
 * explanations live, it is `position: fixed` in a portal, and the content it holds is reachable by no
 * other route.
 */
function computePosition(trigger: HTMLElement) {
  const triggerRect = trigger.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const preferredWidth = Math.min(360, vw - MARGIN * 2);
  const left = Math.min(triggerRect.right - preferredWidth, vw - preferredWidth - MARGIN);

  // Never taller than the space there is. `MIN_HEIGHT` keeps a very short viewport from producing a
  // panel too small to read; it will overflow the window, but its own scroller is then reachable.
  const available = vh - MARGIN * 2;
  const height = Math.max(MIN_HEIGHT, Math.min(PREFERRED_HEIGHT, available));

  type Placement = 'bottom' | 'top';
  let placement: Placement = 'bottom';
  let top = triggerRect.bottom + GAP;

  const fitsBelow = top + height <= vh - MARGIN;
  const fitsAbove = triggerRect.top - GAP - height >= MARGIN;

  if (!fitsBelow && fitsAbove) {
    placement = 'top';
    top = triggerRect.top - GAP - height;
  }

  top = Math.max(MARGIN, Math.min(top, Math.max(MARGIN, vh - height - MARGIN)));

  return { top, left, width: preferredWidth, height, placement };
}

function HelpPopover({ title, description, params, returns, tips }: HelpPopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [{ top, left, width, height }, setPosition] = useState({
    top: 0,
    left: 0,
    width: 360,
    height: PREFERRED_HEIGHT,
  });
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');

  const reposition = useCallback(() => {
    if (!triggerRef.current) return;
    const pos = computePosition(triggerRef.current);
    setPosition({ top: pos.top, left: pos.left, width: pos.width, height: pos.height });
    setPlacement(pos.placement);
  }, []);

  const getFocusableElements = useCallback(() => {
    if (!panelRef.current) return [];
    return Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    );
  }, []);

  const trapFocus = useCallback(
    (e: KeyboardEvent) => {
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
    },
    [getFocusableElements],
  );

  useEffect(() => {
    if (!open) return;
    reposition();
    const panel = panelRef.current;
    if (panel) {
      const firstFocusable = getFocusableElements()[0];
      firstFocusable?.focus();
    }
    const handleOutside = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        panelRef.current &&
        !panelRef.current.contains(e.target as Node)
      ) {
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
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('keydown', trapFocus);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, trapFocus, getFocusableElements, reposition]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-center w-5 h-5 rounded-full border border-indigo-500 bg-transparent text-accent-text cursor-pointer hover:bg-indigo-500 hover:text-white transition-colors shrink-0"
        aria-label="Help"
        aria-expanded={open}
        aria-controls="help-popover-panel"
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <text x="8" y="12" textAnchor="middle" fontSize="11" fill="currentColor" fontWeight="600">
            i
          </text>
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            id="help-popover-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            style={{ position: 'fixed', top, left, width, maxHeight: height }}
            className={cn(
              'z-[9999] bg-surface-2 border border-border rounded-lg shadow-xl text-xs text-foreground',
              placement === 'top' && 'origin-bottom',
            )}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <strong className="text-sm">{title}</strong>
              <button
                onClick={close}
                className="bg-transparent border-none text-muted-foreground hover:text-danger-text cursor-pointer p-0.5"
                aria-label="Close help"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <div
              className="px-3 py-2 flex flex-col gap-2 overflow-y-auto"
              /* Header is 44px; the scroller gets whatever the measured panel height leaves. */
              style={{ maxHeight: height - 44 }}
            >
              <Prose as="p" className="m-0 leading-relaxed">
                {description}
              </Prose>
              {params && params.length > 0 && (
                <div className="flex flex-col gap-1">
                  <strong className="text-xs text-muted-foreground uppercase tracking-wider">
                    Parameters
                  </strong>
                  <div className="flex flex-col gap-1">
                    {params.map((p, i) => (
                      <div key={i} className="flex flex-col gap-0.5">
                        <code className="text-xs text-accent-text bg-tint-accent px-1 py-0.5 rounded">
                          {p.name}
                        </code>
                        <Prose className="text-xs text-foreground-muted">{p.desc}</Prose>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {returns && (
                <div className="flex flex-col gap-1">
                  <strong className="text-xs text-muted-foreground uppercase tracking-wider">
                    Returns
                  </strong>
                  <Prose as="p" className="m-0 text-xs text-foreground-muted">
                    {returns}
                  </Prose>
                </div>
              )}
              {tips && (
                <div className="flex flex-col gap-1 border-t border-border pt-2">
                  <strong className="text-xs text-muted-foreground uppercase tracking-wider">
                    Tips
                  </strong>
                  <Prose as="p" className="m-0 text-xs text-foreground-muted">
                    {tips}
                  </Prose>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export { HelpPopover };
