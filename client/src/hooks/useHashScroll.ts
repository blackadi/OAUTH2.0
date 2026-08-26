import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Scroll to the element the URL fragment names, and focus it — once that element exists.
 *
 * **Why a hook rather than the browser.** `useUrlState` made a *tab* addressable, and UX-08 asked for a
 * wizard step too — but the FAPI and MCP wizards have no selected step to store. They render **every**
 * step at once and grey the ones whose prerequisite has not happened (see `utils/step-state.ts`), which
 * is the right design for teaching a protocol: you can read step 4 before you have run step 1. So the
 * addressable unit there is a **fragment**, not query state, and *"look at what happened on step 3"* is
 * `#mcp-step-3`.
 *
 * ## The bug this shape exists to fix, and how it was found
 *
 * The first version looked up the target once, in an effect, and returned if it was not there. Every
 * jsdom test passed and **the feature did not work in a browser at all.**
 *
 * Sections arrive through `React.lazy`. On a cold load of `/mcp#mcp-step-4` this hook runs when
 * `AppLayout` commits, which is *before* the MCP chunk has resolved — so `getElementById` returned
 * `null`, the effect returned, and nothing ever looked again. The unit test could not see it because a
 * jsdom fixture renders its target synchronously in the same tree, so the one-shot lookup always hit.
 * A Playwright assertion on a real lazy route failed immediately. **That is the whole argument for the
 * accessibility-tree specs in `e2e/a11y.spec.ts`** — it is check F2 in
 * `docs/SCREEN-READER-CHECKLIST.md`.
 *
 * So the lookup retries, via a `MutationObserver` on the subtree, until the target appears. Bounded by
 * `DEADLINE_MS`, because a fragment naming an element that will never exist is the normal case for a
 * hand-edited URL and must not leave an observer attached to the document for the life of the page.
 *
 * ## Three other details that are easy to get wrong
 *
 * - **`scrollIntoView` is optional-called.** jsdom does not implement it, so any test mounting with a
 *   fragment would throw. `?.()` is not defensive noise; it is the difference between a hook that is
 *   testable and one that is not.
 * - **Reduced motion is honoured**, using the same `typeof matchMedia === 'function'` guard as
 *   `useTheme` — jsdom provides no `matchMedia` and an unguarded call is a crash in tests. A smooth
 *   scroll is motion, and WCAG 2.1 SC 2.3.3 is about exactly this class of it.
 * - **Focus moves with the scroll.** Scrolling a sighted reader to a step and leaving the keyboard at
 *   the top of the document is the standard skip-link defect: the link appears to work and does nothing
 *   for anyone not using a pointer. The targets carry `tabIndex={-1}` so they can receive it, and
 *   `preventScroll` stops the focus call from fighting the smooth scroll it was paired with.
 */

/**
 * How long to keep watching for a target that has not arrived.
 *
 * Long enough for a lazy chunk on a slow connection, short enough that a fragment naming nothing stops
 * observing well within the time anyone would spend on the page.
 */
const DEADLINE_MS = 5000;

export function useHashScroll(): void {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));

    let done = false;

    const settle = (target: HTMLElement): void => {
      done = true;
      const reduced =
        typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      target.focus?.({ preventScroll: true });
    };

    const attempt = (): boolean => {
      if (done) return true;
      const target = document.getElementById(id);
      if (!target) return false;
      settle(target);
      return true;
    };

    // The fast path: on an in-app navigation the target is usually already committed.
    if (attempt()) return;

    // `MutationObserver` rather than polling: it fires on the commit that inserts the element, so focus
    // lands on the same frame it becomes available instead of up to an interval late.
    const observer = new MutationObserver(() => {
      if (attempt()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const timer = setTimeout(() => observer.disconnect(), DEADLINE_MS);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [hash]);
}
