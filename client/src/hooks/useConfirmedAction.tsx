import { useCallback, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

/**
 * Ask before doing something that cannot be undone.
 *
 * **Why a hook and not four copies of the same state.** Four separate sections each needed a pending
 * action, a dialog and a confirm handler for the same reason — `ClientManagementSection`,
 * `DcrSection`, `GrantManagementSection` and `TokenOpsSection` all reach the **live Authlete service**
 * irreversibly. Four `useState` triples would be four chances to wire one of them up wrongly, and
 * `ClientManagementSection` already carries 33 `useState` calls without help.
 *
 * The hook returns the dialog as a node the caller renders, which keeps the confirmation adjacent to the
 * action it guards rather than in a provider three files away.
 */

export interface ConfirmableAction {
  title: string;
  /** What will happen, in plain language. */
  body: string;
  confirmLabel: string;
  /**
   * The identifier the user must type. Pass it for anything that reaches the authorization server
   * irreversibly — it makes them look at *which* object they are about to destroy.
   */
  requireTyped?: string;
  /**
   * Runs only after the user confirms.
   *
   * Allowed to be async, because every action this guards is a network call. Typing it `() => void`
   * made each caller's `() => handleCall(…)` a promise assigned where void was expected — which
   * `no-misused-promises` flags for a real reason: a rejection there would be unhandled. The callers
   * all route through `useAsyncCall`, which catches, so the promise is deliberately not awaited here.
   */
  run: () => void | Promise<void>;
}

export function useConfirmedAction(): {
  /** Stage an action. Nothing happens until the user confirms. */
  confirm: (action: ConfirmableAction) => void;
  /** Render this somewhere inside the section. */
  dialog: ReactNode;
} {
  const [pending, setPending] = useState<ConfirmableAction | null>(null);

  const confirm = useCallback((action: ConfirmableAction) => setPending(action), []);
  const cancel = useCallback(() => setPending(null), []);

  const onConfirm = useCallback(() => {
    // Read the action out before clearing, so the state update cannot race the call. Clearing first
    // would also unmount the dialog mid-handler, which is how "confirm did nothing" bugs happen.
    const action = pending;
    setPending(null);
    // Not awaited: `useAsyncCall` owns the failure path, and the dialog has already closed.
    void action?.run();
  }, [pending]);

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      title={pending?.title ?? ''}
      body={pending?.body ?? ''}
      confirmLabel={pending?.confirmLabel ?? 'Confirm'}
      requireTyped={pending?.requireTyped}
      onConfirm={onConfirm}
      onCancel={cancel}
    />
  );

  return { confirm, dialog };
}
