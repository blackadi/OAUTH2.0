import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * A piece of section state that lives in the URL.
 *
 * **Why.** Twenty-two routes and, before this, **zero** query state: a tab, a wizard step, an expanded
 * trace row and a decoded token were all invisible to the address bar. Three consequences, and in a
 * debugger the first is the one that hurts:
 *
 * - *"Look at what happened on step 3"* could not be communicated. The natural unit of conversation
 *   about this tool is **a specific operation in a specific run**, and there was no way to name one.
 * - Back did not undo a tab change; it left the section entirely.
 * - Reload lost your position, which for a multi-step protocol means starting over.
 *
 * **`replace` rather than `push`, deliberately.** Selecting a tab is not navigation — it is refining
 * where you already are. Pushing would make the back button walk through every tab somebody clicked
 * before it left the section, which is worse than the behaviour it replaced.
 *
 * **A wizard step is not one of these, and that turned out not to be a gap.** The original note here left
 * the step "to the caller"; the FAPI and MCP wizards have no step to leave — they render every step at
 * once and grey the ones whose prerequisite has not happened (`utils/step-state.ts`), which is right for
 * teaching a protocol, since you can read step 4 before running step 1. A step is therefore addressed by
 * **fragment** rather than by query: `#mcp-step-3`, resolved by `useHashScroll`.
 *
 * The value is validated against the allowed set rather than trusted, because it arrives from the URL:
 * a hand-edited `?op=nonsense` selects the fallback instead of rendering a section with no valid tab.
 */
/**
 * Two overloads, because a caller that supplies a real fallback can never be handed `null`.
 *
 * Without them every call site with a default tab had to re-apply it — `activeOp ?? 'introspect'` beside
 * a hook that was already given `'introspect'` — and the second copy is the one that goes stale. Grant
 * Flows needs this: its tab indexes `flowSteps[grantType]`, so `null` is not a state it can render.
 */
export function useUrlState<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): [T, (value: T) => void];
export function useUrlState<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback?: null,
): [T | null, (value: T | null) => void];
/** A fallback that may or may not be there — a computed default, or the test harness that drives both. */
export function useUrlState<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T | null,
): [T | null, (value: T | null) => void];
export function useUrlState<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T | null = null,
): [T | null, (value: T | null) => void] {
  const [params, setParams] = useSearchParams();

  const raw = params.get(key);
  const value = raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;

  const setValue = useCallback(
    (next: T | null) => {
      setParams(
        (current) => {
          // A new instance, not a mutation: React Router compares the search string it is given, and
          // mutating the existing params in place can leave it thinking nothing changed.
          const updated = new URLSearchParams(current);
          if (next === null) updated.delete(key);
          else updated.set(key, next);
          return updated;
        },
        { replace: true },
      );
    },
    [key, setParams],
  );

  return [value, setValue];
}
