/**
 * What assistive technology is told when a request finishes.
 *
 * **Why this exists.** The application had **no live regions at all**: `aria-live` and `role="status"`
 * appeared zero times, and the only three `role="alert"`s were the field-error spans inside `Input`,
 * `Select` and `Textarea`. Every one of the 20 sections works the same way — press a control, a request
 * goes out, a response renders into a pane below — so for a screen-reader user *nothing was announced*:
 * not "sending", not "200, here is the token response", not "401, here is the challenge". In a product
 * whose content **is** the response, that is not a missing nicety; it is the content being unreadable.
 *
 * **Why a store rather than a component prop.** The announcement has to come from `useAsyncCall`, which
 * every section already routes through, and a hook cannot render. Putting the text in a module-level
 * store and rendering one `<LiveAnnouncer/>` in `AppLayout` reaches all 20 sections with a single change
 * — the same shape, and for the same reason, as `trace-store.ts`.
 *
 * Deliberately outside React and read through `useSyncExternalStore`, so a call that outlives the
 * component which started it can still announce.
 */

export type Politeness = 'polite' | 'assertive';

export interface Announcement {
  /** Monotonic, so re-announcing the *same* text still changes the snapshot and is read again. */
  id: number;
  message: string;
  politeness: Politeness;
}

let current: Announcement = { id: 0, message: '', politeness: 'polite' };
const listeners = new Set<() => void>();

/**
 * Say something.
 *
 * `assertive` is reserved for failures. A result arriving is a status update and must not interrupt what
 * the user is reading; a request having failed is the one thing worth interrupting for. Anything more
 * aggressive than that trains people to switch the screen reader off.
 */
export function announce(message: string, politeness: Politeness = 'polite'): void {
  if (!message) return;
  current = { id: current.id + 1, message, politeness };
  for (const listener of listeners) listener();
}

export function getAnnouncement(): Announcement {
  return current;
}

export function subscribeToAnnouncements(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test hook: a case must not inherit the previous case's announcement. */
export function resetAnnouncements(): void {
  current = { id: 0, message: '', politeness: 'polite' };
  for (const listener of listeners) listener();
}
