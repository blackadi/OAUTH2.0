import { useCallback, useSyncExternalStore } from 'react';

/**
 * A media query as React state, for the one case where a CSS class cannot do the job.
 *
 * **Reach for a Tailwind breakpoint first.** Almost everything responsive here belongs in the
 * stylesheet, and `SplitPane` is the standing reminder that a *container* query usually beats a viewport
 * one. This hook exists for a narrower problem: when the same component has to be **mounted in a
 * different place** in the tree depending on the viewport, CSS has nothing to offer. The request trace
 * is that case — it is a pane inside the evidence rail on a desktop and a bottom sheet on a phone, and
 * rendering both and hiding one with `hidden lg:flex` would put two `role="region"` landmarks with the
 * same accessible name in the tree, plus two copies of its filter and view state.
 *
 * **`useSyncExternalStore`, not `useState` + `useEffect`.** A `MediaQueryList` is an external mutable
 * source, which is exactly what this hook is for: it reads the snapshot during render, so there is no
 * window in which the component has rendered against a stale value, and no synchronous `setState` in an
 * effect body — which `react-hooks/set-state-in-effect` rejects, correctly, as a cascading render. The
 * same choice `useTraces` makes for the trace store.
 *
 * `typeof matchMedia === 'function'` guards every call, the same way `useTheme` and `useHashScroll` do:
 * jsdom provides no `matchMedia`, so an unguarded call is not a degraded experience, it is a crash in 81
 * test files. When it is absent the query reports `false`, which for a `min-width` question means the
 * caller takes its narrow branch — the one that assumes least about the space available.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof matchMedia !== 'function') return () => {};
      const list = matchMedia(query);
      list.addEventListener('change', onStoreChange);
      return () => list.removeEventListener('change', onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(
    () => typeof matchMedia === 'function' && matchMedia(query).matches,
    [query],
  );

  // The third argument is the server snapshot. This app does not server-render, but the parameter is
  // also what React reads during hydration, and `false` is the same narrow-branch default as above.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * The one breakpoint this app makes a *structural* decision at, named once.
 *
 * 1024px is Tailwind's `lg`, and it is already where the sidebar appears and where the shell becomes a
 * fixed-height app shell. Duplicating the number as a string in a hook call is how a breakpoint drifts
 * from the stylesheet that owns it.
 */
export const DESKTOP_QUERY = '(min-width: 1024px)';
