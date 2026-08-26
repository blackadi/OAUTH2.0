import { render, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { useHashScroll } from '@/hooks/useHashScroll';

/**
 * A wizard step named by the URL fragment.
 *
 * **What this is instead of.** UX-08 asked for URL state for "a tab and a wizard step". The tab became
 * `?op=` in ten sections. The step could not, because the FAPI and MCP wizards hold no selected step —
 * they render all of them and grey the ones whose prerequisite has not happened, which is deliberate and
 * right for teaching a protocol. So the step is addressed by fragment, and this is the hook that makes a
 * fragment work in an app whose sections arrive lazily.
 *
 * jsdom implements neither `scrollIntoView` nor `matchMedia`, which is exactly why the hook calls both
 * defensively — and why the first test here asserts the *focus*, which jsdom does implement, rather than
 * the scroll.
 */

function Harness({ hash }: { hash: string }) {
  useHashScroll();
  return (
    <>
      <div id="mcp-step-1" tabIndex={-1}>
        step one
      </div>
      <div id="mcp-step-4" tabIndex={-1}>
        step four
      </div>
      <span data-testid="hash">{hash}</span>
    </>
  );
}

function at(hash: string) {
  return render(
    <MemoryRouter initialEntries={[`/mcp${hash}`]}>
      <Harness hash={hash} />
    </MemoryRouter>,
  );
}

/**
 * Nodes appended by hand to stand in for a lazy chunk arriving.
 *
 * `cleanup()` removes only what Testing Library rendered, so an `appendChild` straight onto `body`
 * survives into the next test — and a leftover focusable node made two *earlier* tests fail with focus
 * sitting on a element from a test that had already finished. Tracked and removed here.
 */
const appended: HTMLElement[] = [];

function appendLate(id: string): HTMLElement {
  const el = document.createElement('div');
  el.id = id;
  el.tabIndex = -1;
  document.body.appendChild(el);
  appended.push(el);
  return el;
}

afterEach(() => {
  for (const el of appended.splice(0)) el.remove();
  cleanup();
  vi.restoreAllMocks();
  // `restoreAllMocks` does **not** undo `stubGlobal`, which is its own registry. Without this the
  // reduced-motion stub leaks into the next test and the one after it asserts `smooth` against a stub
  // still answering `matches: true`. Caught by that test failing, which is the good outcome.
  vi.unstubAllGlobals();
});

describe('useHashScroll', () => {
  /**
   * **Focus, not just scroll.** Scrolling a sighted reader to step 4 and leaving the keyboard at the top
   * of the document is the standard skip-link defect: the link looks like it worked and did nothing for
   * anyone not using a pointer.
   */
  it('moves focus to the element the fragment names', () => {
    at('#mcp-step-4');
    expect(document.activeElement).toBe(document.getElementById('mcp-step-4'));
  });

  it('scrolls it into view, at the top of the viewport', () => {
    const spy = vi.fn();
    // jsdom does not implement it, so there is nothing to spy on until one is put there.
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      value: spy,
      configurable: true,
      writable: true,
    });

    at('#mcp-step-1');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({ block: 'start' });
  });

  /**
   * WCAG 2.1 SC 2.3.3 (Animation from Interactions, AAA) is about exactly this class of motion. The
   * guard is also what keeps the hook from crashing under jsdom, which provides no `matchMedia` — the
   * same idiom `useTheme` already uses.
   */
  it('does not animate the scroll when reduced motion is preferred', () => {
    const spy = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      value: spy,
      configurable: true,
      writable: true,
    });
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({ matches: query.includes('reduced-motion'), media: query }) as MediaQueryList,
    );

    at('#mcp-step-1');
    expect(spy.mock.calls[0][0]).toMatchObject({ behavior: 'auto' });
  });

  it('animates it otherwise', () => {
    const spy = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      value: spy,
      configurable: true,
      writable: true,
    });

    at('#mcp-step-1');
    expect(spy.mock.calls[0][0]).toMatchObject({ behavior: 'smooth' });
  });

  /**
   * **The case that was actually broken, and that this fixture originally could not express.**
   *
   * The first implementation looked the target up once and returned if it was absent. Every test here
   * passed and the feature did not work in a browser at all: sections arrive through `React.lazy`, so on
   * a cold load of `/mcp#mcp-step-4` the hook runs before the MCP chunk resolves, finds nothing, and
   * never looks again. A jsdom fixture renders its target synchronously in the same tree, so the
   * one-shot lookup always hit — the bug was invisible here by construction.
   *
   * Playwright caught it on a real lazy route (check F2). This test reproduces the shape: mount with the
   * target **absent**, insert it afterwards, and require that focus still lands.
   */
  it('waits for a target that arrives after mount, as a lazy route does', async () => {
    render(
      <MemoryRouter initialEntries={['/mcp#late-arrival']}>
        <Harness hash="#late-arrival" />
      </MemoryRouter>,
    );
    expect(document.getElementById('late-arrival')).toBeNull();
    expect(document.activeElement).toBe(document.body);

    // What the lazy chunk resolving looks like from the hook's point of view.
    const late = appendLate('late-arrival');

    await waitFor(() => expect(document.activeElement).toBe(late));
  });

  /**
   * And it must stop watching. A fragment naming an element that will never exist is the normal case for
   * a hand-edited URL, and an observer left attached to the document for the life of the page is a leak
   * that nothing would ever report.
   */
  it('stops watching once the target is found', async () => {
    /**
     * **Counting *any* `disconnect` cannot work, and a mutation proved it.**
     *
     * The first version of this test stubbed `MutationObserver` and asserted the spy had been called —
     * and passed even with the hook's `observer.disconnect()` deleted. `waitFor` creates a
     * `MutationObserver` of its own, so the global stub was counting Testing Library's teardown. The
     * assertion could not fail.
     *
     * So the hook's own instance is identified by *how* it observes: `document.body` with exactly
     * `childList` and `subtree`, where `waitFor` also passes `attributes`. Behaviourally a leaked
     * observer is invisible — the `done` guard makes further callbacks no-ops — which is precisely why
     * it needs asserting here rather than being left to show up as a slow page much later.
     */
    const ours: { disconnected: boolean }[] = [];
    const Original = globalThis.MutationObserver;
    vi.stubGlobal(
      'MutationObserver',
      class extends Original {
        #record: { disconnected: boolean } | undefined;
        override observe(target: Node, options?: MutationObserverInit) {
          if (
            target === document.body &&
            options?.childList &&
            options.subtree &&
            !options.attributes
          ) {
            this.#record = { disconnected: false };
            ours.push(this.#record);
          }
          super.observe(target, options);
        }
        override disconnect() {
          if (this.#record) this.#record.disconnected = true;
          super.disconnect();
        }
      },
    );

    render(
      <MemoryRouter initialEntries={['/mcp#late-two']}>
        <Harness hash="#late-two" />
      </MemoryRouter>,
    );

    const late = appendLate('late-two');
    await waitFor(() => expect(document.activeElement).toBe(late));

    expect(
      ours,
      'the hook should have started watching for a target it could not find',
    ).toHaveLength(1);
    expect(ours[0].disconnected, 'the observer outlived the target it was waiting for').toBe(true);
  });

  it('does nothing at all without a fragment, rather than focusing something arbitrary', () => {
    at('');
    expect(document.activeElement).toBe(document.body);
  });

  /**
   * A fragment naming an element that is not there must be inert. It arrives from the address bar, and a
   * hand-edited one is the normal case, not the exceptional one.
   */
  it('is inert on a fragment that names nothing', () => {
    at('#mcp-step-99');
    expect(document.activeElement).toBe(document.body);
  });
});
