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

  /**
   * The evidence rail: whether it is open, which tab is showing, how wide it is.
   *
   * `railOpen` stores **both** `'true'` and `'false'`, which is the opposite of what `skipLanding` does
   * two entries up — and the exception is principled rather than sloppy. That rule exists because a
   * stale `'false'` outlives a change to what the default *means*, and it holds whenever the default is
   * a constant. This default is not: the rail opens by itself on a display wide enough to spare the
   * room and stays shut on one that is not (see `EvidenceRail`). So "never chosen" and "chosen closed"
   * are genuinely different states, and collapsing them would re-open the rail on every visit for
   * somebody who closed it on a 1440px screen.
   */
  railOpen: 'oauth_debugger_rail_open',
  railTab: 'oauth_debugger_rail_tab',
  railWidth: 'oauth_debugger_rail_width',
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

/** The three surfaces the evidence rail can show. */
export type RailTab = 'tokens' | 'trace' | 'inspect';

const RAIL_TABS: readonly RailTab[] = ['tokens', 'trace', 'inspect'];

/** `null` means the reader has never expressed a preference, which is not the same as "closed". */
export function readRailOpen(): boolean | null {
  const stored = read(KEYS.railOpen);
  return stored === 'true' ? true : stored === 'false' ? false : null;
}

export function setRailOpen(open: boolean): void {
  write(KEYS.railOpen, open ? 'true' : 'false');
}

/**
 * Validated against the list rather than cast.
 *
 * A tab that is renamed or removed leaves a value in storage that no longer exists, and a bare cast
 * would hand the rail a tab it cannot render — a blank pane with no way to tell why. Falling back to
 * the first tab is a legible wrong answer.
 */
export function readRailTab(): RailTab {
  const stored = read(KEYS.railTab);
  return RAIL_TABS.find((tab) => tab === stored) ?? 'tokens';
}

export function setRailTab(tab: RailTab): void {
  write(KEYS.railTab, tab);
}

/** The rail's width in CSS pixels, clamped to what is actually usable. */
export const RAIL_WIDTH = { min: 300, max: 640, default: 380 } as const;

export function readRailWidth(): number {
  const parsed = Number.parseInt(read(KEYS.railWidth) ?? '', 10);
  // `Number.isNaN` before the clamp: clamping NaN silently yields a bound, so a corrupt value would
  // present as a deliberate choice of 300px.
  if (Number.isNaN(parsed)) return RAIL_WIDTH.default;
  return clampRailWidth(parsed);
}

export function setRailWidth(px: number): void {
  write(KEYS.railWidth, String(Math.round(clampRailWidth(px))));
}

export function clampRailWidth(px: number): number {
  return Math.min(RAIL_WIDTH.max, Math.max(RAIL_WIDTH.min, px));
}

/** Exported for tests and for anything that needs to clear the slate. */
export const PREFERENCE_KEYS = KEYS;
