import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { DOING, READING, NARROW } from './surfaces';

/**
 * Accessibility, measured on the rendered page rather than inferred from JSX.
 *
 * **This is the better answer to A11Y-05.** The audit wanted `eslint-plugin-jsx-a11y`, which it could
 * not install; axe at runtime is stronger anyway, and for a reason that matters here. A lint rule reads
 * JSX. axe reads the *accessibility tree*: computed contrast against the surface actually behind the
 * text, ARIA attributes after every conditional has resolved, and roles as the browser assigned them —
 * which is the only way to catch the class of defect this codebase actually had. `role="img"` on the
 * sequence SVG made its focusable arrows unannounceable, and no lint rule would have said so.
 *
 * Scoped to WCAG 2.1 A and AA, which is what `check-contrast.mjs` already targets, so the two agree.
 */

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
}

/** A readable failure: axe's raw output is enormous, and only the rule and the node matter. */
function summarise(violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']) {
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 3).map((n) => n.html.slice(0, 140)),
  }));
}

test.describe('no WCAG A/AA violations', () => {
  for (const surface of [...READING, ...DOING]) {
    test(`${surface.name}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(surface.path);
      await page.waitForSelector(surface.ready);
      await settle(page);

      const { violations } = await scan(page).analyze();
      expect(JSON.stringify(summarise(violations), null, 2)).toBe('[]');
    });
  }

  /**
   * The light palette gets its own pass.
   *
   * `check-contrast.mjs` scores the *declared token values* from the built stylesheet, which is real but
   * is not the same as measuring text against the surface it actually landed on — a translucent tint over
   * a card over the page is three layers the script cannot compose. This is the check that closes UX-02's
   * remaining question, and it is why the tints were tokenised per palette rather than reused.
   */
  test('the light palette, on the densest surface', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/auth-flows');
    await page.waitForSelector('h1');
    await settle(page);

    const { violations } = await scan(page).analyze();
    expect(JSON.stringify(summarise(violations), null, 2)).toBe('[]');
  });

  test('the light palette, on the reading surface', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/reference');
    await page.waitForSelector('h1');
    await settle(page);

    const { violations } = await scan(page).analyze();
    expect(JSON.stringify(summarise(violations), null, 2)).toBe('[]');
  });

  /** Narrow, where the mobile drawer and the wrapped header are in play instead of the sidebar. */
  test('at 360px, with the mobile drawer open', async ({ page }) => {
    await page.setViewportSize(NARROW);
    await page.goto('/auth-flows');
    await page.waitForSelector('h1');
    await page.getByRole('button', { name: /Toggle menu/i }).click();
    await settle(page);

    const { violations } = await scan(page).analyze();
    expect(JSON.stringify(summarise(violations), null, 2)).toBe('[]');
  });
});

test.describe('the document outline', () => {
  /**
   * A11Y-03. Every section title was an `<h2>` and **no route had an `<h1>`**, so each of the 22 pages
   * presented a heading tree with no root. The unit suite asserts exactly one `h1` per route; this is the
   * same property measured on a real render, where `SectionPanel`'s heading and any card headings coexist.
   */
  test('exactly one h1 per route, and no skipped levels', async ({ page }) => {
    for (const surface of [...READING, ...DOING]) {
      await page.goto(surface.path);
      await page.waitForSelector(surface.ready);

      const levels = await page.evaluate(() =>
        [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1])),
      );

      expect(
        levels.filter((l) => l === 1),
        `${surface.path}: h1 count`,
      ).toHaveLength(1);
      expect(levels[0], `${surface.path}: first heading must be the h1`).toBe(1);

      // No level may jump by more than one from the deepest seen so far.
      let deepest = 1;
      for (const level of levels) {
        expect(
          level,
          `${surface.path}: heading jumped from h${deepest} to h${level}`,
        ).toBeLessThanOrEqual(deepest + 1);
        deepest = Math.max(deepest, level);
      }
    }
  });
});

test.describe('keyboard-only operation', () => {
  /**
   * The skip link exists because 22 nav items sit between the top of the document and the content. That
   * it is *first* in the tab order is the whole point — a skip link you have to tab past the nav to reach
   * is decoration.
   */
  test('the first Tab reaches the skip link, and it moves focus to the content', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/auth-flows');
    await page.waitForSelector('h1');

    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => ({
      tag: document.activeElement?.tagName.toLowerCase(),
      text: document.activeElement?.textContent?.trim(),
    }));
    expect(first).toEqual({ tag: 'a', text: 'Skip to content' });

    await page.keyboard.press('Enter');
    // Landing on `#main` is what makes the link do anything; `tabIndex={-1}` is what lets it receive focus.
    await expect(page.locator('#main')).toBeFocused();
  });

  /**
   * A11Y-03's second half. A client-side route change replaced the whole page without moving focus, so a
   * keyboard user stayed on the sidebar link they had just activated with no indication anything changed.
   */
  test('focus moves to the content region on navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/auth-flows');
    await page.waitForSelector('h1');

    await page
      .getByRole('link', { name: /Discovery/i })
      .first()
      .click();
    await expect(page.getByRole('heading', { level: 1, name: /Discovery/i })).toBeVisible();
    await expect(page.locator('#main')).toBeFocused();
  });

  /**
   * A11Y-02. The Clear control used to sit *inside* the expand button, which is invalid HTML — the parser
   * hoists the inner button out, so the rendered tree is not the authored one. Two siblings are reachable
   * by keyboard in order; a nested pair is not.
   */
  test('both vault controls are separately reachable', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/auth-flows');
    await page.waitForSelector('h1');
    await page.evaluate(() =>
      sessionStorage.setItem('token_response', JSON.stringify({ access_token: 'at-1' })),
    );
    await page.reload();
    await page.waitForSelector('h1');

    const expand = page.getByRole('button', { name: /Token Vault/i });
    const clear = page.getByRole('button', { name: /Clear tokens/i });
    await expect(expand).toBeVisible();
    await expect(clear).toBeVisible();

    await expand.focus();
    await page.keyboard.press('Tab');
    await expect(clear).toBeFocused();
  });

  /**
   * `TabBar` implements APG roving tabindex. Worth verifying on a real render because jsdom does not
   * apply focus the way a browser does, so the unit test can assert the handler ran but not that focus
   * actually moved.
   */
  test('arrow keys move between grant tabs', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/auth-flows');
    await page.waitForSelector('h1');

    const tabs = page.getByRole('tab');
    await tabs.first().focus();
    const before = await page.evaluate(() => document.activeElement?.textContent);
    await page.keyboard.press('ArrowRight');
    const after = await page.evaluate(() => document.activeElement?.textContent);

    expect(after).not.toBe(before);
    await expect(page.getByRole('tab', { selected: true })).toHaveCount(1);
  });
});

test.describe('the live regions announce', () => {
  /**
   * A11Y-01. There were **no** live regions: `aria-live` appeared zero times, and every section works by
   * rendering an async response into a pane. A screen-reader user was never told a response had arrived,
   * failed, or was on its way — in a product whose content *is* the response.
   *
   * Both regions must be in the accessibility tree from first paint, empty. Mounting a region and filling
   * it in the same commit is the single most common way live regions are got wrong, and it is silent.
   */
  test('both regions exist and start empty', async ({ page }) => {
    await page.goto('/auth-flows');
    await page.waitForSelector('h1');

    /**
     * Scoped to the app's own regions.
     *
     * A bare `[aria-live="polite"]` matches **two** elements, because `sonner`'s `<Toaster>` renders one
     * of its own — which is correct of sonner and not a defect. Narrowing by `role` distinguishes them:
     * `LiveAnnouncer` pairs `role="status"` with polite and `role="alert"` with assertive, and sonner's
     * region carries neither.
     */
    const polite = page.locator('[role="status"][aria-live="polite"]');
    const assertive = page.locator('[role="alert"][aria-live="assertive"]');
    await expect(polite).toHaveCount(1);
    await expect(assertive).toHaveCount(1);
    await expect(polite).toHaveText('');
    await expect(assertive).toHaveText('');
  });

  /**
   * With no backend behind the dev server, any request fails — which makes this the easy case to observe:
   * the assertive region should carry the failure. That the *failure* path announces is the half that
   * matters, since it is the one a user cannot otherwise detect.
   */
  test('a failed request reaches the assertive region', async ({ page }) => {
    await page.goto('/discovery');
    await page.waitForSelector('h1');

    await page
      .getByRole('button')
      .filter({ hasText: /Discovery|Fetch|Get/i })
      .first()
      .click();
    await expect(page.locator('[role="alert"][aria-live="assertive"]')).toContainText(
      /Request failed/i,
      {
        timeout: 10_000,
      },
    );
  });
});

test.describe('fragment navigation', () => {
  /**
   * A `#step-N` link has to land **focus**, not merely scroll.
   *
   * The only test of this feature in a real browser, and it is here because it earned its place: it
   * failed the first time it ran, while six jsdom tests passed. Sections arrive through `React.lazy`, so
   * `useHashScroll` looked for its target before the chunk resolved, found nothing, and never looked
   * again — a jsdom fixture renders its target synchronously in the same tree, so the one-shot lookup
   * always hit and the bug was invisible there by construction. `useHashScroll.test.tsx` now simulates
   * late arrival; this asserts it against a genuinely lazy route.
   */
  test('a fragment link lands focus on the wizard step it names', async ({ page }) => {
    await page.goto('/mcp#mcp-step-4');
    await page.waitForSelector('#mcp-step-4');

    await expect(page.locator('#mcp-step-4')).toBeFocused();
  });
});
