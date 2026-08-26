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

/**
 * A decodable ES256 ID token carrying the *shape* a real run produces, and **no real value**.
 *
 * The first version of this fixture was worse than untidy. Its token strings were copied off a
 * screenshot of a live session, so a real access token and a real refresh token went into the repo and
 * onto a public remote; **GitGuardian caught it on the pull request and nothing local did.** `AGENTS.md`
 * says never commit real Authlete credentials, tokens or client secrets, and a test fixture is exactly
 * where that rule gets broken — a value lifted from a working run is the one guaranteed to deserialise.
 *
 * So every value here is synthetic and *visibly* so. `example.test` is reserved by RFC 6761 §6.2 and can
 * never resolve; the opaque tokens read as placeholders at a glance and at a realistic length. What the
 * assertions actually need is the shape — a long `iss` to wrap, a UUID-shaped `nonce`, a base64url
 * `s_hash` — and nothing here is weaker for the change, which is the point: the real values bought
 * nothing.
 */
const OPAQUE_ACCESS_TOKEN = `example-access-token-${'0'.repeat(22)}`;
const OPAQUE_REFRESH_TOKEN = `example-refresh-token-${'0'.repeat(21)}`;

function idToken(): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = 1787745727;
  return [
    b64({ alg: 'ES256', kid: '1' }),
    b64({
      iss: 'https://as.example.test',
      sub: 'admin',
      aud: 'example-client-id',
      exp: now + 86340,
      iat: now,
      auth_time: now - 2,
      nonce: '00000000-0000-4000-8000-000000000000',
      acr: 'pwd',
      s_hash: 'ZXhhbXBsZS1zLWhhc2g',
    }),
    // Not a signature over anything, and nothing here verifies one: `JwtInspector` starts unverified.
    'ZXhhbXBsZS1zaWduYXR1cmUtdmVyaWZ5aW5nLWFnYWluc3Qtbm90aGluZw',
  ].join('.');
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

test.describe('the desktop rail is bounded, and its contents cannot starve the navigation', () => {
  /**
   * The defect this block exists for, and why nothing already here could see it.
   *
   * Reported from a real run: fetch tokens, click **Inspect** in the Token Vault, and the sidebar looks
   * *missing*. Three separate mistakes compounded, and all three were invisible to every gate including
   * this file:
   *
   * 1. `AppLayout`'s shell was `min-h-screen` — a *minimum*. The row below it is `overflow-hidden` and
   *    both `nav` and `main` are `overflow-y-auto`, so the whole desktop chrome was written for a
   *    fixed-height app shell that was never constrained. Measured on `/auth-flows` at 1440×900 before
   *    the fix: the document was **2,694px** tall, the `<aside>` was 2,646px of it, and the Token Vault
   *    sat at **y = 2,637** — 1,737px below the fold, on a rail that scrolled away with the page.
   * 2. The vault lives in the sidebar footer, and `nav` is `flex-1` (flex base size 0). A `shrink-0`
   *    footer therefore wins every contest for height: opening the inspector took the footer to
   *    ~7,750px and left `nav` with 992px of the 2,575px it needed.
   * 3. `JwtInspector`'s `ClaimRow` had a fixed `min-w-[7rem]` name column plus a trailing `HelpPopover`,
   *    which in a 224px rail left **7–29px** for the value. `nonce` rendered over **38 lines**, one or
   *    two characters at a time.
   *
   * **`toBeVisible()` is the reason the existing vault test passed throughout.** Playwright's definition
   * is a non-empty bounding box and no `visibility: hidden` — an element 1,737px below the fold satisfies
   * it. So these assertions are geometric on purpose: *inside the viewport*, not merely in the DOM.
   */

  /**
   * `railOpen: false` is set explicitly, and the explicitness is the point.
   *
   * These two tests are about the **sidebar** rail — its height, its scroller, and the vault sitting in
   * its footer. That is where the vault lives only while the evidence rail is shut, and the rail opens by
   * itself from 1440px (`RAIL_AUTO_OPEN_WIDTH`), which is exactly the viewport these tests use. Leaving
   * it to the width heuristic would make the subject of the test a side effect of a threshold somebody
   * may reasonably move later.
   *
   * The key is spelled out rather than imported because Playwright resolves no `@/` alias. A rename
   * therefore breaks these tests *loudly* — the rail auto-opens, the vault is not in the sidebar, and the
   * assertions fail — rather than quietly passing against a key nothing reads.
   */
  async function withTokens(page: Page, railOpen = false) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/auth-flows');
    await page.waitForSelector('h1');
    await page.evaluate((open) => {
      localStorage.setItem('oauth_debugger_rail_open', open ? 'true' : 'false');
    }, railOpen);
    await page.evaluate(
      ([id, access, refresh]) =>
        sessionStorage.setItem(
          'token_response',
          JSON.stringify({
            access_token: access,
            refresh_token: refresh,
            id_token: id,
            token_type: 'Bearer',
            expires_in: 86400,
            scope: 'openid profile email',
          }),
        ),
      [idToken(), OPAQUE_ACCESS_TOKEN, OPAQUE_REFRESH_TOKEN],
    );
    await page.reload();
    await page.waitForSelector('h1');
    await settle(page);
  }

  test('the shell is the viewport, so the vault is on screen without scrolling', async ({
    page,
  }) => {
    await withTokens(page);

    const shell = await page.evaluate(() => {
      const aside = document.querySelector('aside')!;
      const nav = aside.querySelector('nav')!;
      const vault = [...aside.querySelectorAll('button')].find((b) =>
        /Token Vault/.test(b.textContent ?? ''),
      )!;
      const r = vault.getBoundingClientRect();
      return {
        docScrollH: document.documentElement.scrollHeight,
        docClientH: document.documentElement.clientHeight,
        asideH: Math.round(aside.getBoundingClientRect().height),
        /** The rail's own scroller must be the one that engages, not the document's. */
        navScrolls: nav.scrollHeight > nav.clientHeight,
        vaultTop: Math.round(r.top),
        vaultBottom: Math.round(r.bottom),
      };
    });

    expect(shell.docScrollH, `the document scrolls: ${JSON.stringify(shell)}`).toBeLessThanOrEqual(
      shell.docClientH,
    );
    expect(
      shell.asideH,
      `the rail is taller than the shell: ${JSON.stringify(shell)}`,
    ).toBeLessThanOrEqual(shell.docClientH);
    expect(shell.navScrolls, `the rail's nav is not the scroller: ${JSON.stringify(shell)}`).toBe(
      true,
    );
    expect(
      shell.vaultTop,
      `the vault is off-screen: ${JSON.stringify(shell)}`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      shell.vaultBottom,
      `the vault is below the fold: ${JSON.stringify(shell)}`,
    ).toBeLessThanOrEqual(shell.docClientH);
  });

  test('opening the vault inspector leaves the navigation on screen and the claims legible', async ({
    page,
  }) => {
    await withTokens(page);

    await page.getByRole('button', { name: /Token Vault/ }).click();
    // Two inspectable entries — access token then ID token. The ID token is the one with claims.
    await page.locator('aside').getByRole('button', { name: 'Inspect' }).nth(1).click();
    await settle(page);

    const after = await page.evaluate(() => {
      const aside = document.querySelector('aside')!;
      const firstLink = aside.querySelector('nav a')!.getBoundingClientRect();
      const vault = [...aside.querySelectorAll('button')]
        .find((b) => /Token Vault/.test(b.textContent ?? ''))!
        .getBoundingClientRect();
      /** Every claim row's *value*, which is what collapsed to a 7px column. */
      const rows = [...aside.querySelectorAll('code')].map((code) => ({
        name: code.textContent ?? '?',
        valueH: Math.round(
          code.parentElement?.parentElement?.querySelector('div > span')?.getBoundingClientRect()
            .height ?? 0,
        ),
      }));
      return {
        asideH: Math.round(aside.getBoundingClientRect().height),
        viewportH: window.innerHeight,
        firstLinkTop: Math.round(firstLink.top),
        firstLinkBottom: Math.round(firstLink.bottom),
        vaultHeaderTop: Math.round(vault.top),
        worst: rows.sort((a, b) => b.valueH - a.valueH)[0],
      };
    });

    expect(
      after.asideH,
      `the rail grew past the shell: ${JSON.stringify(after)}`,
    ).toBeLessThanOrEqual(after.viewportH);
    expect(
      after.firstLinkBottom,
      `the first nav link left the viewport: ${JSON.stringify(after)}`,
    ).toBeLessThanOrEqual(after.viewportH);
    expect(
      after.firstLinkTop,
      `the first nav link is above the viewport: ${JSON.stringify(after)}`,
    ).toBeGreaterThanOrEqual(0);
    /* The vault's own header must survive its body scrolling — it is what names the surface. */
    expect(
      after.vaultHeaderTop,
      `the vault header scrolled out of the rail: ${JSON.stringify(after)}`,
    ).toBeGreaterThanOrEqual(0);
    /*
      96px is ~6 lines at this type size. It is not a design target, it is the distance between "wraps"
      and "renders one character per line" — the worst row measured 609px before the fix and 31px after.
    */
    expect(
      after.worst.valueH,
      `a claim value wrapped into a column: ${JSON.stringify(after)}`,
    ).toBeLessThanOrEqual(96);
  });
});

test.describe('the evidence rail keeps what the app knows beside what you are doing', () => {
  /**
   * What this block is actually guarding, since none of it is visible to a unit test.
   *
   * The rail was built because the evidence this debugger captures was scattered across three edges of
   * the window in three unrelated idioms: tokens in the sidebar *footer* under a 22-item nav list, the
   * request trace in a `position: fixed` drawer that **covered the content it explained**, and a decoded
   * token wherever the producing section happened to put it. Three claims follow from putting them in one
   * pane, and each of them is a geometric fact that jsdom cannot have an opinion about — it has no
   * viewport, so `hidden lg:flex` does nothing there and `matchMedia` does not exist at all.
   */

  const RAIL = 'aside[aria-label="Evidence"]';

  async function wide(page: Page, path = '/auth-flows') {
    await page.setViewportSize({ width: 1600, height: 950 });
    await page.goto(path);
    await page.waitForSelector('h1');
    await settle(page);
  }

  test('it opens by itself on a wide display, and the two-pane layout survives it', async ({
    page,
  }) => {
    await wide(page);

    await expect(page.locator(RAIL)).toBeVisible();
    // The vault is *in* the rail, not merely somewhere on the page.
    await expect(page.locator(RAIL).getByRole('button', { name: /Token Vault/ })).toBeVisible();

    /*
      The reason `RAIL_AUTO_OPEN_WIDTH` is 1440 and not 1024. Auto-opening the rail at a width where it
      costs the reader `SplitPane`'s second column would be spending their layout on their behalf, so the
      threshold was derived from the container query rather than picked — and this is the check that the
      derivation is right, at the first width above the 1372px bound where a display actually exists.
    */
    const columns = await page.evaluate(() => {
      const grid = document.querySelector('.\\@container > div');
      return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0;
    });
    expect(columns, 'the rail cost the main pane its second column').toBe(2);
  });

  test('the trace sits beside the content instead of on top of it', async ({ page }) => {
    await wide(page);
    await page.locator(RAIL).getByRole('tab', { name: /Trace/ }).click();
    await settle(page);

    /*
      The whole point, stated as geometry. The bottom drawer overlapped `main` by up to `min(52vh, 30rem)`
      — `AppLayout` reserved exactly that much bottom padding to compensate, which is a workaround for a
      panel covering the thing it describes. A pane cannot overlap, and this is what says so.
    */
    const boxes = await page.evaluate(() => {
      const main = document.getElementById('main')!.getBoundingClientRect();
      const trace = document.querySelector('[role="region"][aria-label="Request trace"]')!;
      const t = trace.getBoundingClientRect();
      return { mainRight: Math.round(main.right), traceLeft: Math.round(t.left) };
    });
    expect(
      boxes.traceLeft,
      `the trace overlaps the content pane: ${JSON.stringify(boxes)}`,
    ).toBeGreaterThanOrEqual(boxes.mainRight);

    /* And exactly one of them is in the tree: the bottom sheet must not also be mounted. */
    await expect(page.locator('[role="region"][aria-label="Request trace"]')).toHaveCount(1);
  });

  test('closing it hands the vault back to the sidebar rather than losing it', async ({ page }) => {
    await wide(page);
    await page.locator(RAIL).getByRole('button', { name: 'Close the evidence rail' }).click();
    await settle(page);

    await expect(page.locator(RAIL)).toHaveCount(0);
    /*
      The failure this forbids is the one the 2026-08-22 render found on mobile and which a rail makes easy
      to reintroduce: a control that exists only inside a panel you have to know about. With the rail shut
      the vault is back in the sidebar footer, which is where it has always been.
    */
    const inSidebar = await page.evaluate(() => {
      const nav = document.querySelector('aside:not([aria-label="Evidence"])');
      return [...(nav?.querySelectorAll('button') ?? [])].some((b) =>
        /Token Vault/.test(b.textContent ?? ''),
      );
    });
    expect(inSidebar, 'the vault vanished with the rail').toBe(true);
  });

  test('the width handle works from the keyboard, not only from a pointer', async ({ page }) => {
    await wide(page);

    const separator = page.getByRole('separator', { name: 'Resize the evidence rail' });
    const before = Number(await separator.getAttribute('aria-valuenow'));

    /*
      A drag handle governing how much screen the content pane gets, reachable only by pointer, is a
      mouse-only control on a load-bearing piece of layout. Left grows the rail because the rail grows
      leftwards; `aria-valuenow` is asserted rather than the computed width so the ARIA contract and the
      behaviour are checked in one move — a splitter that moves without updating its value is announced
      wrongly to anyone who cannot see it move.
    */
    await separator.focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    const after = Number(await separator.getAttribute('aria-valuenow'));
    expect(after, `ArrowLeft did not widen the rail: ${before} → ${after}`).toBeGreaterThan(before);

    const width = await page.locator(RAIL).evaluate((el) => el.getBoundingClientRect().width);
    expect(Math.round(width), 'the reported value and the rendered width disagree').toBe(after);
  });

  test('a pasted JWS decodes in the rail, legibly', async ({ page }) => {
    await wide(page);
    await page.locator(RAIL).getByRole('tab', { name: 'Inspect' }).click();

    /*
      Pasted with the `Authorization` scheme still attached and wrapped across lines, because that is how
      a token arrives from a log or a terminal — and all three of trim, unquote and de-scheme are
      normalisations the scratchpad has to do before the decoder sees it. Without them the tool would say
      "expected 3 dot-separated parts, got 1" about a perfectly good token.
    */
    const jws = idToken();
    await page.getByLabel(/Paste any JWS/).fill(`Bearer ${jws.slice(0, 40)}\n${jws.slice(40)}`);
    await settle(page);

    const worst = await page.evaluate(() => {
      const rail = document.querySelector('aside[aria-label="Evidence"]')!;
      const rows = [...rail.querySelectorAll('code')].map((code) => ({
        name: code.textContent ?? '?',
        valueH: Math.round(
          code.parentElement?.parentElement?.querySelector('div > span')?.getBoundingClientRect()
            .height ?? 0,
        ),
      }));
      return { count: rows.length, worst: rows.sort((a, b) => b.valueH - a.valueH)[0] };
    });

    expect(worst.count, 'nothing decoded — the normalisation dropped the token').toBeGreaterThan(5);
    expect(
      worst.worst.valueH,
      `a claim value wrapped into a column: ${JSON.stringify(worst)}`,
    ).toBeLessThanOrEqual(96);
  });
});

test.describe('the command palette is the way in', () => {
  /**
   * Why a palette at all, stated as the thing these tests protect.
   *
   * The sidebar is the only route to a section and it does not fit: 22 links plus 4 group headings need
   * 992px of a rail that has 781px, so Admin is permanently below the fold. One level down, `/reference`
   * renders the whole cited corpus — 24 authorization parameters, 6 token-request parameters, 26 claims,
   * 20 specification error codes, 18 Authlete codes, a glossary — each with its own anchor, and the only
   * way to reach an entry was to know the page existed and scroll it.
   *
   * Three of the four tests here are things no unit test can see: a `window` keydown listener with
   * `preventDefault` against the browser's own `Ctrl+K`, and whether the fragment the index computes
   * actually resolves to an element the page rendered.
   */

  async function openPalette(page: Page, chord = true) {
    await page.setViewportSize({ width: 1600, height: 950 });
    await page.goto('/auth-flows');
    await page.waitForSelector('h1');
    await settle(page);
    if (chord) await page.keyboard.press('Control+k');
    else await page.getByRole('button', { name: 'Open the command palette' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    /* Named, because `role="combobox"` also matches the two `<select>` parameter rows on this page —
       `response_type` and `code_challenge_method`. Playwright's strict mode caught it. */
    return page.getByRole('combobox', { name: /Search sections/ });
  }

  test('the chord opens it, and the chord closes it again', async ({ page }) => {
    const query = await openPalette(page);
    await expect(query).toBeFocused();
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('the header button opens it too, for anyone without a keyboard', async ({ page }) => {
    // A shortcut nobody is told about is a feature for the person who wrote it — and on a touch device
    // the chord is unreachable, so the button is the only way in.
    await openPalette(page, false);
  });

  test('a section is two keystrokes away by its initials', async ({ page }) => {
    const query = await openPalette(page);
    await query.fill('cm');
    /*
      Scoped to the dialog, and it has to be: `/auth-flows` renders two `<select>` parameter rows, and a
      native `<option>` carries `role="option"` — so an unscoped query matched eleven rows that had
      nothing to do with the palette. The same class of mistake as the `combobox` locator above, found the
      same way.

      "cm" is nowhere in "Client Management" as a substring; this is the initials path, and it is the
      difference between a palette you use and one you fall back to the sidebar from.
    */
    await expect(page.getByRole('dialog').getByRole('option')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/client-mgmt$/);
  });

  test('a reference entry resolves to an element the page actually rendered', async ({ page }) => {
    /*
      Reduced motion, so the scroll is instant and the assertion below is a fact rather than a race.
      `useHashScroll` reads `prefers-reduced-motion` and passes `behavior: 'auto'`, so this exercises a
      real code path rather than defeating one — and the thing under test is whether the fragment resolves
      at all, not how it animates.
    */
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const query = await openPalette(page);
    await query.fill('s_hash');
    await page.keyboard.press('Enter');

    /*
      The contract nothing else can check. `command-index.ts` computes `/reference#claim-s_hash` and
      `ReferencePage` renders `id={`claim-${name}`}`, independently, from the same data. Rename either and
      the palette navigates to a fragment matching nothing, `useHashScroll` gives up after its 5s
      deadline, and the failure is a page that just sits at the top with no error anywhere.
    */
    await expect(page).toHaveURL(/\/reference#claim-s_hash$/);
    /*
      This is also the regression test for what writing it uncovered: `ReferencePage` is tabbed, its tab
      lived in `useState`, and **five of its six corpora were unreachable by fragment** — the element with
      the id was simply never rendered, so `useHashScroll` watched for it until its 5s deadline and gave up
      without a word. Only `#glossary-*` worked, because glossary is the default tab. The page's own doc
      comment claimed "every section deep-linkable by fragment" throughout.
    */
    // `aria-current`, not `aria-selected`: this page's tabs are plain buttons rather than a `TabBar`.
    await expect(page.getByRole('button', { name: 'JWT claims' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    const target = page.locator('#claim-s_hash');
    await expect(target).toBeVisible();
    await settle(page);
    // Scrolled to, not merely present: the whole point of the fragment.
    const inView = await target.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.top < window.innerHeight;
    });
    expect(inView, 'the anchor resolved but was never scrolled to').toBe(true);
  });

  test('an Authlete code pasted with its brackets finds its entry', async ({ page }) => {
    const query = await openPalette(page);
    // `[A157303]` is how the code arrives in a `responseContent`, so it is how it gets pasted.
    await query.fill('[A157303]');
    await expect(page.getByRole('dialog').getByRole('option', { name: /A157303/ })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/reference#authlete-A157303$/);
    await expect(page.locator('#authlete-A157303')).toBeVisible();
  });
});

test.describe('the trace toolbar reduces itself instead of wrapping three deep', () => {
  /**
   * Nine controls in a 380px rail wrapped to three rows — a third of the pane's height spent on chrome
   * before a single request was shown. The fix is **progressive reduction**: the four file and clipboard
   * actions drop their labels to icons below `32rem` of *container* width, so every control stays one
   * click away rather than being buried in an overflow menu one level deeper than the three benign
   * buttons beside it.
   *
   * Measured as **rows**, not pixels. Counting distinct `offsetTop` values among the toolbar's children
   * is the thing the finding was actually about, and it does not move when a font or a padding value does.
   */

  /**
   * Rows counted by each child's vertical **centre**, not its top.
   *
   * The toolbar is `items-center`, so a 22px chip and a 28px input on the same flex line have tops 3px
   * apart and centres that are identical. Counting tops reported four rows for a two-row toolbar — a
   * measurement that would have failed for a reason that has nothing to do with the finding.
   */
  async function toolbarRows(page: Page) {
    return page.evaluate(() => {
      const bar = document.querySelector('[role="region"][aria-label="Request trace"] > div > div');
      if (!bar) return -1;
      const centres = new Set(
        [...bar.children]
          .map((child) => child.getBoundingClientRect())
          .filter((r) => r.height > 0)
          .map((r) => Math.round((r.top + r.bottom) / 2)),
      );
      return centres.size;
    });
  }

  test('two rows in the rail at its default width, and the labels are still announced', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 950 });
    await page.goto('/auth-flows');
    await page.waitForSelector('h1');
    await page
      .getByRole('tablist', { name: 'Evidence' })
      .getByRole('tab', { name: /Trace/ })
      .click();
    await settle(page);

    expect(await toolbarRows(page), 'the toolbar wrapped deeper than two rows').toBeLessThanOrEqual(
      2,
    );

    /*
      `sr-only`, not `hidden`. `display: none` would take the text out of the accessibility tree too and
      leave four icon buttons with no accessible name at all — so this asserts the names survive the
      labels being invisible, which is the entire reason for choosing `sr-only`.
    */
    const rail = page.locator('aside[aria-label="Evidence"]');
    for (const name of ['Export', 'Save run', 'Clear']) {
      await expect(rail.getByRole('button', { name })).toBeAttached();
    }
    /*
      "Open run" is not in that list because it is not a button: it is a `<label>` wrapping a real
      `<input type="file">`, so the whole control is the file picker's trigger, keyboard included. Its
      accessible name comes from the input's own `aria-label` and is unaffected by the visible text being
      reduced away — which is exactly what this asserts.
    */
    await expect(rail.getByLabel('Open a saved run')).toBeAttached();
  });

  test('the labels come back when the container is wide enough', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 950 });
    await page.goto('/auth-flows');
    await page.waitForSelector('h1');
    await page
      .getByRole('tablist', { name: 'Evidence' })
      .getByRole('tab', { name: /Trace/ })
      .click();

    const label = page.locator('aside[aria-label="Evidence"] button', { hasText: 'Export' });
    const widthOf = () => label.evaluate((el) => el.getBoundingClientRect().width);
    const narrow = await widthOf();

    // Widen past the 32rem threshold using the rail's own handle, which is also the query the reduction
    // is measured against — a *container* query, so this is the only way to move it.
    const separator = page.getByRole('separator', { name: 'Resize the evidence rail' });
    await separator.focus();
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('Shift+ArrowLeft');
    await settle(page);

    expect(
      await widthOf(),
      'the label did not return when the container grew past 32rem',
    ).toBeGreaterThan(narrow);
  });

  test('the bottom sheet keeps its labels, because it has the room', async ({ page }) => {
    // Below `lg:` the trace is the original drawer at full window width. The container query means one
    // component is correct in both places without a `variant` flag deciding it.
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/auth-flows');
    await page.waitForSelector('h1');
    await page.locator('header').getByRole('button', { name: /Trace/ }).click();
    await settle(page);

    expect(await toolbarRows(page), 'the drawer toolbar should be a single row').toBe(1);
  });
});
