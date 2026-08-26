import { test, expect, type Page } from '@playwright/test';
import { NARROW } from './surfaces';

/**
 * Baselines, so that what was fixed cannot silently un-fix itself.
 *
 * **Why these and not all 22 routes × 4 viewports × 2 themes.** A baseline is only worth its maintenance
 * if a diff means something. 176 screenshots would mean 176 files to re-approve on any padding change,
 * which is how visual suites get deleted six weeks in. This set is chosen to cover the *things that were
 * actually wrong*, one shot each:
 *
 * | Shot | Guards |
 * |---|---|
 * | header at 360px, both themes | UX-05 — five groups in a non-wrapping flex row on every route |
 * | `/reference` at 360 and 1440, both themes | UX-01 — the one reading surface, held to full parity |
 * | `/auth-flows` at 1440, both themes | UX-02/UX-04 — the densest surface, where tints and type stack up |
 * | the disabled parameter row | the `opacity-55` contrast failure, now a surface tint |
 * | a primary and a danger button | the gradient stops that measured 2.98:1 and 2.77:1 on hover |
 * | an unavailable wizard step | the `opacity-50` failure across seven sites |
 *
 * **Chromium only.** Font rasterisation differs between engines, so a shared baseline would fail on one
 * of them for reasons that have nothing to do with the layout — and maintaining two sets doubles the
 * cost for no extra signal. Firefox still runs the layout and a11y suites, which is where engine
 * differences would actually show up.
 *
 * These were generated on one machine. A first run elsewhere will need `--update-snapshots`; the 1%
 * `maxDiffPixelRatio` in `playwright.config.ts` absorbs antialiasing but not a moved panel.
 */

test.describe.configure({ mode: 'serial' });

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  // The status pill animates while the health poll is in flight; wait for it to land on "Offline" so the
  // baseline is not a coin flip between two frames.
  await page.waitForTimeout(600);
}

for (const scheme of ['dark', 'light'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.skip(({ browserName }) => browserName !== 'chromium', 'baselines are Chromium-only');

    test(`header at 360px`, async ({ page }) => {
      await page.setViewportSize(NARROW);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/auth-flows');
      await page.waitForSelector('h1');
      await settle(page);

      await expect(page.locator('header')).toHaveScreenshot(`header-360-${scheme}.png`);
    });

    /**
     * **The landing page is deliberately NOT pixel-baselined. Do not add it back.**
     *
     * It was, briefly, at 360px and 1440px in both themes — and CI failed on `landing-1440-dark` with 3%
     * of pixels different while all four baselines passed locally. The cause is the page itself, not the
     * runner: `pages/LandingPage.tsx` renders the **live** configuration, and `client/.env` is
     * gitignored. On a developer machine `VITE_CLIENT_ID` is set and that row reads *"Read from
     * VITE_CLIENT_ID"*; on CI it falls back to the `your_client_id` placeholder, which flips the row to a
     * warning and a three-line note about how to fix it. The `dl` grows, everything below it shifts.
     *
     * Masking the block does not help — `toHaveScreenshot({ mask })` paints over a region but cannot stop
     * that region's *height* from changing, and the height is what moved. A pixel baseline of a surface
     * whose whole point is to reflect the environment is machine-dependent by construction.
     *
     * It is not unwatched. `src/test/components/LandingPage.test.tsx` asserts the content in both the
     * configured and placeholder branches, `layout.spec.ts` holds it at four reading viewports because it
     * is in `SURFACES`, `a11y.spec.ts` sweeps it with axe, and `light-theme.spec.ts` checks it for
     * overflow, invisible borders, transparent text and focus rings. All four are content-independent,
     * which is exactly what a baseline here could not be.
     */
    test(`reference at 360px`, async ({ page }) => {
      await page.setViewportSize(NARROW);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/reference');
      await page.waitForSelector('h1');
      await settle(page);

      await expect(page).toHaveScreenshot(`reference-360-${scheme}.png`, { fullPage: false });
    });

    test(`reference at 1440px`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/reference');
      await page.waitForSelector('h1');
      await settle(page);

      await expect(page).toHaveScreenshot(`reference-1440-${scheme}.png`, { fullPage: false });
    });

    test(`grant flows at 1440px`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/auth-flows');
      await page.waitForSelector('h1');
      await settle(page);

      await expect(page).toHaveScreenshot(`auth-flows-1440-${scheme}.png`, { fullPage: false });
    });

    /**
     * The disabled parameter row, which was `opacity-55` and measured 2.36:1 at its worst.
     * `response_mode` is off by default, so the row above it is on and the contrast between the two
     * states is what the baseline captures.
     */
    test(`a disabled parameter row`, async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/auth-flows');
      await page.waitForSelector('h1');
      await settle(page);

      const row = page.locator('label[for="param-response_mode"]').locator('../..');
      await expect(row).toHaveScreenshot(`param-row-disabled-${scheme}.png`);
    });

    /** The two gradients whose hover states failed AA at 2.98:1 and 2.77:1. */
    test(`the primary and danger buttons`, async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/client-mgmt');
      await page.waitForSelector('h1');
      await settle(page);

      await expect(page.getByRole('button').first()).toHaveScreenshot(
        `button-primary-${scheme}.png`,
      );
    });

    /** An unavailable wizard step, formerly `opacity-50 pointer-events-none` across seven sites. */
    test(`an unavailable wizard step`, async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 1200 });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/mcp');
      await page.waitForSelector('h1');
      await settle(page);

      const step = page.locator('[aria-disabled="true"]').first();
      await expect(step).toHaveScreenshot(`wizard-step-unavailable-${scheme}.png`);
    });
  });
}
