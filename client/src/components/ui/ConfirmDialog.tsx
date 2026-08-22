import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { cn } from '@/utils/cn';

/**
 * A confirmation the user has to mean.
 *
 * **Why this exists.** Six irreversible actions in this application had no confirmation of any kind, and
 * `window.confirm` appeared nowhere in the codebase. Four of the six reach the **live Authlete service**
 * and cannot be undone from here: deleting a client, deleting a DCR client, revoking a grant, revoking a
 * token. Two of the clients reachable that way are **curriculum infrastructure** — `1523514379` carries
 * Module 02's plain code flow and `1678274156` carries Module 03's — and Client Management offers a
 * free-text client-id field immediately beside an unguarded Delete button. One misclick permanently
 * removed a client a lab depends on, and nothing in this repo could restore it.
 *
 * **Two strengths, chosen by reach rather than by taste.** `requireTyped` demands the exact identifier
 * before the confirm button enables, which is the right friction for an unrecoverable remote deletion —
 * it makes the user look at *which* object they are about to destroy, not merely acknowledge that they
 * are destroying something. Actions whose blast radius is this browser tab (clearing the vault, clearing
 * the trace) get the plain form: they deserve a sentence explaining what goes, not a typing test.
 *
 * Deliberately not `window.confirm`: it cannot explain what is about to happen, cannot be styled to
 * match, cannot require a typed value, and is suppressible by the browser.
 */

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen, in plain language. Shown above the controls. */
  body: string;
  confirmLabel: string;
  /**
   * When set, the user must type this exact string before confirming. Use it for anything that reaches
   * the authorization server irreversibly; omit it for local-only state.
   */
  requireTyped?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The panel is a separate component that only exists while the dialog is open.
 *
 * That is what keeps `typed` correct without an effect resetting it: a closed dialog is *unmounted*, so
 * the next open starts from a fresh, empty field by construction. Clearing it inside an effect instead
 * would be a synchronous `setState` in an effect body — a cascading render, and the thing
 * `react-hooks/set-state-in-effect` exists to catch. Unmounting is both simpler and impossible to get
 * out of step.
 */
function ConfirmDialog(props: ConfirmDialogProps) {
  if (!props.open) return null;
  return <ConfirmDialogPanel {...props} />;
}

function ConfirmDialogPanel({
  title,
  body,
  confirmLabel,
  requireTyped,
  onConfirm,
  onCancel,
}: Omit<ConfirmDialogProps, 'open'>) {
  const [typed, setTyped] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Where focus was before the dialog opened, so it can be given back. */
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();

  const satisfied = requireTyped === undefined || typed === requireTyped;

  const getFocusable = useCallback(
    () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input, [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ),
    [],
  );

  // Remember the trigger on mount and move focus in — to the text field when one is required, otherwise
  // to the confirm button — then give focus back on unmount. `requireTyped` is read once and not tracked:
  // a dialog that changed its own shape mid-life would be a different dialog.
  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const target = inputRef.current ?? confirmRef.current;
    target?.focus();
    const trigger = returnFocusRef.current;
    return () => {
      trigger?.focus();
    };
  }, []);

  // Escape cancels, and Tab is trapped inside the panel — an unguarded destructive dialog you can tab
  // out of is a dialog you can confirm without having read.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = getFocusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel, getFocusable]);

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm"
      // A click on the backdrop cancels; a click inside must not. Cancelling is always the safe
      // outcome, so the backdrop is allowed to be the easy target.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="w-full max-w-md rounded-xl border border-edge-danger bg-card shadow-2xl overflow-hidden"
      >
        <div className="flex gap-2.5 items-start px-4 pt-4">
          <AlertTriangle className="h-4 w-4 text-danger-text mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-semibold text-foreground m-0">
              {title}
            </h2>
            <p id={bodyId} className="text-xs text-muted-foreground leading-relaxed mt-1.5">
              {body}
            </p>
          </div>
        </div>

        {requireTyped !== undefined && (
          <div className="px-4 pt-3">
            <label
              htmlFor={`${titleId}-typed`}
              className="text-xs text-muted-foreground block mb-1"
            >
              Type <code className="text-danger-text font-mono">{requireTyped}</code> to confirm
            </label>
            <input
              id={`${titleId}-typed`}
              ref={inputRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className={cn(
                'w-full h-9 rounded-lg border bg-input px-3 text-sm font-mono text-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring',
                satisfied ? 'border-border' : 'border-edge-danger',
              )}
            />
          </div>
        )}

        <div className="flex justify-end gap-2 px-4 py-4">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            ref={confirmRef}
            variant="danger"
            size="sm"
            disabled={!satisfied}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export { ConfirmDialog };
