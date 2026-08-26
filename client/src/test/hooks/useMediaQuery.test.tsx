import { renderHook, act, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { useMediaQuery, DESKTOP_QUERY } from '@/hooks/useMediaQuery';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A `MediaQueryList` stub that can actually change, which is the half a static mock cannot test. */
function stubMatchMedia(initial: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  let matches = initial;
  vi.stubGlobal(
    'matchMedia',
    vi.fn((media: string) => ({
      get matches() {
        return matches;
      },
      media,
      addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) =>
        listeners.delete(fn),
    })),
  );
  return {
    set(next: boolean) {
      matches = next;
      for (const fn of listeners) fn({ matches: next } as MediaQueryListEvent);
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

describe('without matchMedia', () => {
  /**
   * jsdom provides no `matchMedia`, and this is the case that matters most: an unguarded call is not a
   * degraded experience, it is a crash in every test file that renders `AppLayout`. `false` is the right
   * answer for a `min-width` question — the caller takes the branch that assumes least about space.
   */
  it('reports false rather than throwing', () => {
    // No stub at all: this is the real jsdom environment the other 80 test files run in.
    const { result } = renderHook(() => useMediaQuery(DESKTOP_QUERY));
    expect(result.current).toBe(false);
  });
});

describe('with matchMedia', () => {
  it('reads the snapshot during render, not after an effect', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery(DESKTOP_QUERY));
    /*
      `true` on the *first* result, not after a re-render. This is what `useSyncExternalStore` buys over
      `useState` + `useEffect`: with the effect version the first paint would report `false` and the trace
      panel would mount into the wrong container for one frame.
    */
    expect(result.current).toBe(true);
  });

  it('follows a change in the query', () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery(DESKTOP_QUERY));
    expect(result.current).toBe(false);

    act(() => media.set(true));
    expect(result.current).toBe(true);
  });

  it('unsubscribes on unmount', () => {
    const media = stubMatchMedia(true);
    const { unmount } = renderHook(() => useMediaQuery(DESKTOP_QUERY));
    expect(media.listenerCount).toBe(1);
    unmount();
    expect(media.listenerCount).toBe(0);
  });
});

describe('the shared breakpoint', () => {
  it('is 1024px, the same number `lg:` compiles to', () => {
    /*
      Pinned because the hook and the stylesheet have to agree and nothing else can check it. `AppLayout`
      decides *where* the trace panel mounts from this query while deciding whether to *show* the rail
      toggle from `lg:`; if the two drift, there is a band of widths with a toggle for a rail that cannot
      appear, or a rail with no way to reach it.
    */
    expect(DESKTOP_QUERY).toBe('(min-width: 1024px)');
  });
});
