import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  shouldSkipLanding,
  setSkipLanding,
  readRailOpen,
  setRailOpen,
  readRailTab,
  setRailTab,
  readRailWidth,
  setRailWidth,
  clampRailWidth,
  RAIL_WIDTH,
  PREFERENCE_KEYS,
} from '@/services/preferences';

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('the landing opt-out is stored as an opt-out', () => {
  it('is absent by default and removed rather than set to false', () => {
    expect(shouldSkipLanding()).toBe(false);
    setSkipLanding(true);
    expect(localStorage.getItem(PREFERENCE_KEYS.skipLanding)).toBe('true');
    setSkipLanding(false);
    // Absence *is* the default. A stored `'false'` would be a second spelling of it.
    expect(localStorage.getItem(PREFERENCE_KEYS.skipLanding)).toBeNull();
  });
});

describe('the rail records "never chosen" separately from "chosen closed"', () => {
  /**
   * The one place this module deliberately departs from its own rule, so it is the one worth pinning.
   *
   * `railOpen`'s default is not a constant — the rail opens by itself above 1440px and stays shut below.
   * If "closed" were stored as absence, the width heuristic would re-open the rail on every visit for
   * somebody who had closed it on a wide display, which is the app overriding a decision they made.
   */
  it('reads null until something is written', () => {
    expect(readRailOpen()).toBeNull();
  });

  it('distinguishes false from unset', () => {
    setRailOpen(false);
    expect(readRailOpen()).toBe(false);
    setRailOpen(true);
    expect(readRailOpen()).toBe(true);
  });

  it('treats a value it did not write as unset', () => {
    localStorage.setItem(PREFERENCE_KEYS.railOpen, 'yes');
    expect(readRailOpen()).toBeNull();
  });
});

describe('the rail tab is validated against the list, never cast', () => {
  it('defaults to tokens', () => {
    expect(readRailTab()).toBe('tokens');
  });

  it('round-trips each real tab', () => {
    for (const tab of ['tokens', 'trace', 'inspect'] as const) {
      setRailTab(tab);
      expect(readRailTab()).toBe(tab);
    }
  });

  it('falls back rather than handing the rail a tab it cannot render', () => {
    // The state after a tab is renamed or removed: a value in storage that no longer exists. A bare
    // cast would produce a blank pane with nothing on screen explaining it.
    localStorage.setItem(PREFERENCE_KEYS.railTab, 'sequence');
    expect(readRailTab()).toBe('tokens');
  });
});

describe('the rail width is clamped on the way in and on the way out', () => {
  it('defaults when nothing is stored', () => {
    expect(readRailWidth()).toBe(RAIL_WIDTH.default);
  });

  it('clamps both bounds', () => {
    expect(clampRailWidth(10)).toBe(RAIL_WIDTH.min);
    expect(clampRailWidth(9000)).toBe(RAIL_WIDTH.max);
    expect(clampRailWidth(420)).toBe(420);
  });

  it('clamps what it writes, so a bad caller cannot poison storage', () => {
    setRailWidth(9000);
    expect(localStorage.getItem(PREFERENCE_KEYS.railWidth)).toBe(String(RAIL_WIDTH.max));
  });

  it('rounds, because a fractional pixel width is a subpixel border on every render', () => {
    setRailWidth(400.6);
    expect(readRailWidth()).toBe(401);
  });

  it('returns the default for a corrupt value rather than a bound', () => {
    /*
      The reason `Number.isNaN` is checked *before* the clamp. `Math.max(300, Math.min(640, NaN))` is
      `NaN`, and a `style={{ width: NaN }}` renders as no width at all — but worse, an implementation
      that clamped first would answer 300, which is indistinguishable from a deliberate choice of the
      narrowest rail.
    */
    localStorage.setItem(PREFERENCE_KEYS.railWidth, 'wide please');
    expect(readRailWidth()).toBe(RAIL_WIDTH.default);
  });
});

describe('storage that throws is not a blank screen', () => {
  /**
   * `localStorage` throws rather than returning null in a Safari private window and under some
   * enterprise policies. A preference is never worth a crash, which is why every accessor in this module
   * is wrapped — and why that wrapping needs a test, since nothing else in the suite runs without it.
   */
  it('reads fall back and writes are swallowed', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });

    expect(readRailOpen()).toBeNull();
    expect(readRailTab()).toBe('tokens');
    expect(readRailWidth()).toBe(RAIL_WIDTH.default);
    expect(shouldSkipLanding()).toBe(false);
    expect(() => setRailOpen(true)).not.toThrow();
    expect(() => setRailWidth(400)).not.toThrow();
    expect(() => setSkipLanding(false)).not.toThrow();
  });
});
