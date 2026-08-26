/**
 * Preferences that outlive the tab — the counterpart to `session-keys.ts`, and deliberately separate.
 *
 * **Why not `session-keys.ts`.** That module owns every `sessionStorage` key, and it exists because
 * thirteen of them were written from six components with no owner, so `clearTokens()` missed three. The
 * same argument applies here, but the *store* is different and the difference is the whole point: a
 * `sessionStorage` preference resets every time you close the tab, which makes it not a preference.
 * `useTheme` already made this call for the theme; this is the second key to need it, so it gets an owner
 * before there is a third with none.
 *
 * **Nothing sensitive goes in here, ever.** `sessionStorage` at least dies with the tab; `localStorage`
 * persists until something clears it, on a machine that may not be the user's. Tokens, codes, verifiers,
 * client secrets and DPoP keys stay where they are — see the note at the top of `trace-store.ts` on why
 * even the request history is memory-only. What belongs here is a choice a person made about the
 * *interface*.
 *
 * Every read and write is wrapped: `localStorage` throws rather than returning null in a Safari private
 * window and under some enterprise policies, and a preference is never worth a blank screen.
 */

const KEYS = {
  /**
   * Set once the user has asked not to be shown the landing page again.
   *
   * Stored as the *opt-out* rather than as "has visited", because those two are not the same thing and
   * conflating them is how a tool starts deciding on someone's behalf. Arriving at `/` a second time is
   * not a request to skip the introduction; ticking the box is.
   */
  skipLanding: 'oauth_debugger_skip_landing',
} as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — the preference simply does not persist */
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* as above */
  }
}

export function shouldSkipLanding(): boolean {
  return read(KEYS.skipLanding) === 'true';
}

export function setSkipLanding(skip: boolean): void {
  if (skip) write(KEYS.skipLanding, 'true');
  // Removed rather than set to `'false'`: the absence of the key is the default, and two ways to spell
  // the same state is how a stale `'false'` outlives a change to what the default means. The same
  // write-with-no-else-branch lesson as `session-keys.ts`, in the other direction.
  else remove(KEYS.skipLanding);
}

/** Exported for tests and for anything that needs to clear the slate. */
export const PREFERENCE_KEYS = KEYS;
