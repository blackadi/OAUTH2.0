import { test, expect, type Page } from '@playwright/test';
import { DOING, NARROW, READING, READING_VIEWPORTS } from './surfaces';

/**
 * The defect class that four green gates cannot see: a layout that overflows.
 *
 * Every claim in the 2026-08-22 audit's design section was marked `[INFERRED]` because nothing here
 * could render a page. These specs answer the questions that inference could only frame as risk, and the
 * central one is **horizontal overflow of the document**, because that is the exact failure the declared
 * responsive posture exists to prevent: *"a learner opening a shared link on a phone and hitting a
 * horizontally-scrolling, overflowing mess with no explanation of why."*
 *
 * The measurement is deliberately the *document*, not an element. A wide table inside its own
 * `overflow-x: auto` container is correct and intended — `JsonBlock`, `RequestBuilder` and
 * `SequenceView` all rely on it. What is never acceptable is the page body itself scrolling sideways,
 * because that moves the whole interface out from under the reader.
 */

/** Settle web fonts and the theme before measuring: a swap mid-measure shifts widths. */
async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  // The layout polls /api/health with no backend behind it; give the first failure time to land so the
  // header renders its final "Offline" state rather than being caught mid-transition.
  await page.waitForTimeout(250);
}

async function documentOverflow(page: Page) {
  return page.evaluate(() => {
    const el = document.documentElement;
    return {
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      /** Which elements, if any, actually stick out past the viewport. Named, so a failure is fixable. */
      offenders: [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((n) => {
          const r = n.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          // Ignore anything inside a container that is *meant* to scroll sideways.
          let p: HTMLElement | null = n.parentElement;
          while (p) {
            const o = getComputedStyle(p).overflowX;
            if (o === 'auto' || o === 'scroll') return false;
            p = p.parentElement;
          }
          return r.right > el.clientWidth + 1;
        })
        .slice(0, 5)
        .map((n) => ({
          tag: n.tagName.toLowerCase(),
          cls: n.className?.toString().slice(0, 90) ?? '',
          right: Math.round(n.getBoundingClientRect().right),
        })),
    };
  });
}

test.describe('no surface scrolls the document sideways', () => {
  /**
   * The header is chrome on **every** route, which is why it gets its own case at the narrowest width.
   *
   * This is UX-05, filed High precisely because it was not a doing-surface concern: it holds five groups
   * — menu, identity, trace, theme, status — and only two of them hide below `sm:`. Before the fix it was
   * a single non-wrapping flex row with no `truncate` on the title.
   */
  test('the header holds at 360px, on every surface class', async ({ page }) => {
    await page.setViewportSize(NARROW);
    for (const surface of [READING[0], DOING[0], DOING[1]]) {
      await page.goto(surface.path);
      await page.waitForSelector(surface.ready);
      await settle(page);

      const { scrollWidth, clientWidth, offenders } = await documentOverflow(page);
      expect(
        scrollWidth,
        `${surface.path} overflows by ${scrollWidth - clientWidth}px. Offenders: ${JSON.stringify(offenders)}`,
      ).toBeLessThanOrEqual(clientWidth);
    }
  });

  /** A reading surface must hold at every width, because reading is its whole job. */
  for (const surface of READING) {
    for (const vp of READING_VIEWPORTS) {
      test(`reading: ${surface.name} at ${vp.name}px`, async ({ page }) => {
        await page.setViewportSize(vp);
        await page.goto(surface.path);
        await page.waitForSelector(surface.ready);
        await settle(page);

        const { scrollWidth, clientWidth, offenders } = await documentOverflow(page);
        expect(
          scrollWidth,
          `overflow of ${scrollWidth - clientWidth}px. Offenders: ${JSON.stringify(offenders)}`,
        ).toBeLessThanOrEqual(clientWidth);
      });
    }
  }

  /**
   * For a doing surface the narrow pass asks **one** question: does it break silently?
   *
   * Collapsing to a single column is intended and is not checked. Overflowing the document is not, and
   * that is all this asserts.
   */
  for (const surface of DOING) {
    test(`doing: ${surface.name} does not break silently at 360px`, async ({ page }) => {
      await page.setViewportSize(NARROW);
      await page.goto(surface.path);
      await page.waitForSelector(surface.ready);
      await settle(page);

      const { scrollWidth, clientWidth, offenders } = await documentOverflow(page);
      expect(
        scrollWidth,
        `overflow of ${scrollWidth - clientWidth}px. Offenders: ${JSON.stringify(offenders)}`,
      ).toBeLessThanOrEqual(clientWidth);
    });
  }
});

test.describe('long protocol values wrap instead of pushing the page', () => {
  /**
   * The category's usual layout killer. The audit scored this 5/5 from static analysis — `break-all`,
   * `min-w-0 flex-1`, contained `overflow-x-auto` — and this is the check that it is actually true, with
   * a token far longer than anything a real server issues.
   */
  /**
   * At 360px the vault lives in the mobile drawer, because the sidebar that normally holds it is
   * `hidden lg:flex`. That it is *there at all* is the fix for the finding this test discovered — see
   * the note in `AppLayout`.
   */
  test('a 4,000-character token in the vault does not widen the page', async ({ page }) => {
    await page.setViewportSize(NARROW);
    await page.goto('/auth-flows');
    await page.waitForSelector('h1');

    await page.evaluate(() => {
      sessionStorage.setItem(
        'token_response',
        JSON.stringify({
          access_token: 'a'.repeat(4000),
          id_token: `${'b'.repeat(1200)}.${'c'.repeat(1200)}.${'d'.repeat(400)}`,
          refresh_token: 'e'.repeat(2000),
          token_type: 'Bearer',
          scope: 'openid profile email',
          expires_in: 300,
        }),
      );
    });
    await page.reload();
    await page.waitForSelector('h1');
    // The sidebar is hidden below `lg:`, so the vault is reached through the mobile drawer.
    await page.getByRole('button', { name: /Toggle menu/i }).click();
    await page.getByRole('button', { name: /Token Vault/i }).click();
    await settle(page);

    const { scrollWidth, clientWidth, offenders } = await documentOverflow(page);
    expect(
      scrollWidth,
      `a long token widened the page by ${scrollWidth - clientWidth}px. Offenders: ${JSON.stringify(offenders)}`,
    ).toBeLessThanOrEqual(clientWidth);
  });
});

test.describe('the help popover fits the viewport it is in', () => {
  /**
   * UX-06. The panel used a constant 480px height and sized its scroll container at `480 - 44`, both
   * viewport-independent — so below roughly 504px of viewport height the bottom went off-screen **with
   * no scroll to reach it**. A landscape phone and a short desktop window both hit it, and what was cut
   * off is the per-parameter explanation that is this product's differentiator.
   */
  for (const height of [420, 500, 900]) {
    test(`reachable at a ${height}px-tall viewport`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height });
      await page.goto('/auth-flows');
      await page.waitForSelector('h1');
      await settle(page);

      await page.getByRole('button', { name: 'Help' }).first().click();
      const panel = page.getByRole('dialog');
      await expect(panel).toBeVisible();

      const fits = await panel.evaluate((el, vh) => {
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh };
      }, height);

      expect(
        fits.top,
        `panel starts above the viewport: ${JSON.stringify(fits)}`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        fits.bottom,
        `panel extends past the bottom of the viewport: ${JSON.stringify(fits)}`,
      ).toBeLessThanOrEqual(height);
    });
  }
});

test.describe('the two-pane inspector appears when there is room for it', () => {
  /**
   * UX-07. `SplitPane` used `xl:grid-cols-2` — a *viewport* query for a *container* problem, so the
   * signature layout did not appear until 1280px even on a 1024px laptop that had the room. It is a
   * container query now, and the threshold is the container's width rather than the window's.
   */
  test('single column at 360px, two columns on a wide desktop', async ({ page }) => {
    const columnsAt = async (w: number, h: number) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/auth-flows');
      await page.waitForSelector('h1');
      await settle(page);
      return page.evaluate(() => {
        const grid = document.querySelector('.\\@container > div');
        return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0;
      });
    };

    expect(await columnsAt(360, 800)).toBe(1);
    expect(await columnsAt(1600, 1000)).toBe(2);
  });
});

test.describe('every control the app offers is reachable at 360px', () => {
  /**
   * The finding this file was written to catch, and it caught one immediately.
   *
   * `sidebarHeader` — the Token Vault — was passed only to `Sidebar`, which is `hidden lg:flex`. Below
   * 1024px the app's only view of the tokens it holds, and the only way to inspect or clear them, simply
   * did not exist. Not degraded: absent, with nothing on screen saying so.
   *
   * Invisible to every other gate. jsdom has no viewport, so `hidden lg:flex` does nothing there and
   * both the smoke suite and the route suite happily found the vault.
   */
  test('the token vault is reachable through the mobile drawer', async ({ page }) => {
    await page.setViewportSize(NARROW);
    await page.goto('/auth-flows');
    await page.waitForSelector('h1');

    // Not on screen until the drawer is opened — that part is intended.
    await expect(page.getByRole('button', { name: /Token Vault/i })).toBeHidden();

    await page.getByRole('button', { name: /Toggle menu/i }).click();
    await expect(page.getByRole('button', { name: /Token Vault/i })).toBeVisible();
  });

  test('and is present without the drawer on a desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/auth-flows');
    await page.waitForSelector('h1');
    await expect(page.getByRole('button', { name: /Token Vault/i })).toBeVisible();
  });
});
