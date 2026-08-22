import { useCallback, useEffect, useState } from 'react';

/**
 * Light, dark, or whatever the system says.
 *
 * Three states rather than two, because "follow the system" is a real preference and not the absence of
 * one: a viewer who switches their OS to light at dusk expects the page to follow. An explicit choice is
 * stamped as `data-theme` on the root element, which the stylesheet gives precedence over
 * `prefers-color-scheme` in *both* directions — otherwise choosing light on a dark OS would appear to
 * do nothing.
 *
 * `localStorage` rather than `sessionStorage`: a theme preference that resets when you close the tab is
 * not a preference. It is wrapped because storage throws in a sandboxed frame and wherever site data is
 * blocked, and a page that cannot remember a colour should still render one.
 */

export type ThemeChoice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme';

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function apply(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

export interface UseThemeReturn {
  choice: ThemeChoice;
  /** What is actually on screen — the system preference resolved, for labelling the control. */
  resolved: 'light' | 'dark';
  setChoice: (choice: ThemeChoice) => void;
  /** Cycle system → dark → light → system, which is what a single-button control needs. */
  cycle: () => void;
}

export function useTheme(): UseThemeReturn {
  const [choice, setChoiceState] = useState<ThemeChoice>(readChoice);
  const [systemDark, setSystemDark] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches,
  );

  // Applied in an effect rather than during render: writing to `document` while rendering is a side
  // effect, and React may render more than once before committing.
  useEffect(() => {
    apply(choice);
  }, [choice]);

  // Track the system preference so `resolved` stays honest while the choice is `system`.
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* the choice still applies for this page load */
    }
  }, []);

  const cycle = useCallback(() => {
    setChoice(choice === 'system' ? 'dark' : choice === 'dark' ? 'light' : 'system');
  }, [choice, setChoice]);

  return {
    choice,
    resolved: choice === 'system' ? (systemDark ? 'dark' : 'light') : choice,
    setChoice,
    cycle,
  };
}
