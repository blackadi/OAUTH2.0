import { defineConfig, devices } from '@playwright/test';

/**
 * Rendering verification: the class of defect that four green gates cannot see.
 *
 * **Why this exists.** The 2026-08-22 audit had to mark every visual and responsive claim
 * `[INFERRED]`, because nothing in this repo could render a page. Typecheck, lint, 571 unit tests, the
 * production build and four bespoke checks were all green while — for example — the header was a
 * non-wrapping flex row of five groups on every route, and `HelpPopover` sized its scroll container in
 * pixels against a viewport it never measured. Neither is visible to any of those gates: a layout that
 * overflows is made of perfectly valid CSS.
 *
 * **Deliberately not an end-to-end protocol suite.** These specs render the application and inspect the
 * result; they do **not** drive a real OAuth flow. `AGENTS.md` is explicit that the server e2e suite
 * spends real Authlete quota and trips a ~15-call rate limit, so nothing here needs credentials and
 * nothing here calls the authorization server. The client dev server is started with no backend behind
 * it, which means the header shows "Offline" — a state worth capturing rather than a problem to hide.
 *
 * **Two engines, on purpose.** Gecko and Blink disagree most often on exactly what this application is
 * made of: flex shrink behaviour, `min-width: auto` on grid children, and container queries. WebKit is
 * omitted because Safari is not a target audience for this tool and it would triple the baselines.
 */
export default defineConfig({
  testDir: './e2e',
  /* Screenshots are compared against committed baselines, so ordering must not vary. */
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  /**
   * A slightly generous threshold, and the reason matters.
   *
   * Font rasterisation differs between machines, so a pixel-exact comparison fails on somebody else's
   * laptop for reasons that have nothing to do with the layout. `maxDiffPixelRatio` at 1% tolerates
   * antialiasing while still catching a shifted panel, a lost border or a colour change — which is what
   * these baselines are for.
   */
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },

  use: {
    baseURL: 'http://localhost:3011',
    /* On failure only: a passing run should not litter the tree with artefacts. */
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],

  /**
   * Playwright starts the Vite dev server itself, on a port of its own.
   *
   * Port 3011 rather than the usual 3001 so a run cannot collide with a dev server somebody already has
   * open — and `reuseExistingServer` is off outside CI for the same reason: a stale server serving an
   * older build would make the baselines lie.
   */
  webServer: {
    command: 'npm run dev -- --port 3011 --strictPort',
    url: 'http://localhost:3011',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
