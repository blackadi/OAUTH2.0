import { test, expect } from '@playwright/test';
import { SURFACES } from './surfaces';

/**
 * The light palette, on every route, checked for the four things a contrast script cannot see.
 *
 * **Why this exists.** `scripts/check-contrast.mjs` scores every text colour against its surface in both
 * palettes and passes — and the audit still had to record this, verbatim: *"Contrast is measured and
 * passing in both themes; **nobody has opened the light theme in a browser**. Layout, borders,
 * translucent fills (`bg-indigo-500/10` on white) and focus rings are outside what a contrast check can
 * see. Treat those as unverified."*
 *
 * That warning stood for a year of commits because the gap is real: a colour that passes AA is still a
 * colour, and none of typecheck, lint, 1119 unit tests, `vite build`, the four `check:*` scripts or the
 * screenshot baselines answers *"is the light theme usable?"*. Screenshot baselines come closest and
 * cover **nine** captures; there are twenty-three routes.
 *
 * So this sweeps all of them and asks the four questions directly. It found **nothing** on the run that
 * introduced it (2026-08-23) — which is the point: the previous state was not "the light theme is fine",
 * it was "nobody knows". A gate that passes on day one is still the difference between an assumption and
 * a measurement.
 *
 * **One test per route rather than four**, so a failure names the route and lists everything wrong with
 * it at once. The whole sweep is ~30s.
 *
 * ## What each check catches
 *
 * - **Horizontal overflow.** `layout.spec.ts` asks this at 360px, where it is expected and tolerated on a
 *   doing surface. At 1440px it is never acceptable, and a wide viewport is where a `min-width: auto`
 *   grid child or a non-wrapping flex row actually shows up.
 * - **Invisible borders.** The named failure mode. Every card in this app is `border border-border`, and
 *   a border token that resolves too close to its background turns the entire card grammar into
 *   nothing — while every text colour on it still passes AA. Threshold is 1.06:1, which is *far* below
 *   any legibility standard: this asks "is it there at all", not "is it good".
 * - **Focus rings.** The form primitives pair `focus:outline-none` with `focus:ring-2 focus:ring-ring`,
 *   so the ring is a `box-shadow` — and `focus:outline-none` with a ring that does not render is how an
 *   application ends up with no visible keyboard focus anywhere. This is exactly what happened once
 *   already, when the whole palette was declared on `:root` instead of `@theme` and every token
 *   compiled to nothing.
 * - **Transparent text.** Cheap to check and catastrophic when true; a `text-transparent` left behind by
 *   a gradient-clip experiment reads as a blank screen and passes every other gate.
 */

test.describe('the light palette, on every route', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'one engine is enough to measure this',
  );

  for (const surface of SURFACES) {
    test(`${surface.name}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.emulateMedia({ colorScheme: 'light' });
      await page.goto(surface.path);
      await page.waitForSelector(surface.ready);
      // Let the theme's media query settle before anything is measured.
      await page.waitForTimeout(250);

      const findings = await page.evaluate(() => {
        const luminance = (colour: string): number | null => {
          const parts = colour.match(/[\d.]+/g);
          if (!parts) return null;
          const [r, g, b, alpha = '1'] = parts.map(Number);
          if (alpha === 0) return null;
          const channel = (v: number) => {
            const x = v / 255;
            return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
          };
          return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
        };

        const ratio = (a: string, b: string): number | null => {
          const la = luminance(a);
          const lb = luminance(b);
          if (la === null || lb === null) return null;
          return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
        };

        /** The first opaque-enough background up the tree — what is actually behind this element. */
        const backgroundBehind = (el: Element): string => {
          let node: Element | null = el;
          while (node) {
            const bg = getComputedStyle(node).backgroundColor;
            const parts = bg.match(/[\d.]+/g);
            if (parts && (parts.length < 4 || Number(parts[3]) > 0.5)) return bg;
            node = node.parentElement;
          }
          return 'rgb(255, 255, 255)';
        };

        const out: string[] = [];

        /**
         * **`<main>` as well as the document, and a mutation is why.**
         *
         * This checked `documentElement` only, and injecting `min-width: 3000px` into the content did not
         * fail it — because `AppLayout`'s `<main>` carries `overflow-y-auto`, so it is the scroll
         * container and the document never grows. Checking the element that actually scrolls is the
         * difference between a gate and a decoration.
         */
        for (const scroller of [document.documentElement, document.querySelector('main')]) {
          if (!scroller) continue;
          if (scroller.scrollWidth > scroller.clientWidth + 1) {
            out.push(
              `horizontal overflow on <${scroller.tagName.toLowerCase()}>: scrollWidth ${scroller.scrollWidth} > ${scroller.clientWidth}`,
            );
          }
        }

        const inMain = Array.from(document.querySelectorAll('main *')).slice(0, 800);

        const invisibleBorders: string[] = [];
        const transparentText: string[] = [];
        for (const el of inMain) {
          const cs = getComputedStyle(el);

          if (parseFloat(cs.borderTopWidth) >= 0.5 && cs.borderTopStyle !== 'none') {
            const r = ratio(cs.borderTopColor, backgroundBehind(el.parentElement ?? el));
            if (r !== null && r < 1.06) {
              invisibleBorders.push(`${el.tagName}.${el.className.toString().slice(0, 30)}`);
            }
          }

          /**
           * Own text nodes, not `textContent`, and a mutation is why this changed too.
           *
           * The first version required `el.children.length === 0`, which skipped every `<label>` in this
           * app — they wrap an input and a span — so injecting `color: transparent` on labels passed
           * cleanly. What matters is whether *this* element renders text of its own.
           */
          const ownText = Array.from(el.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => (n.textContent ?? '').trim())
            .join(' ')
            .trim();
          if (ownText) {
            const parts = cs.color.match(/[\d.]+/g);
            if (parts && parts.length === 4 && Number(parts[3]) === 0) {
              transparentText.push(ownText.slice(0, 24));
            }
          }
        }
        if (invisibleBorders.length) {
          out.push(
            `${invisibleBorders.length} invisible border(s) <1.06:1 — e.g. ${invisibleBorders.slice(0, 3).join(', ')}`,
          );
        }
        if (transparentText.length) {
          out.push(`transparent text: ${transparentText.slice(0, 3).join(', ')}`);
        }

        const selector = [
          'main a[href]',
          'main button:not([disabled])',
          'main input:not([disabled])',
          'main select',
          'main textarea',
          'main [tabindex="0"]',
        ].join(', ');
        const unfocusable: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector)).slice(
          0,
          25,
        )) {
          const before = getComputedStyle(el);
          const was = `${before.outlineWidth}${before.outlineStyle}|${before.boxShadow}`;
          el.focus();
          const after = getComputedStyle(el);
          const now = `${after.outlineWidth}${after.outlineStyle}|${after.boxShadow}`;
          if (was === now) {
            const label = (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName)
              .trim()
              .slice(0, 26);
            unfocusable.push(`${el.tagName}"${label}"`);
          }
          el.blur();
        }
        if (unfocusable.length) {
          out.push(
            `${unfocusable.length} control(s) with no visible focus change — e.g. ${unfocusable.slice(0, 3).join(', ')}`,
          );
        }

        return out;
      });

      expect(findings, `light theme on ${surface.path}`).toEqual([]);
    });
  }
});
