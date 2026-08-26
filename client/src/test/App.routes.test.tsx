import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import App, { allSectionsFlat } from '@/App';
import { clearTraces, recordTrace } from '@/services/trace-store';
import { PREFERENCE_KEYS } from '@/services/preferences';

/**
 * The whole app, through the real router.
 *
 * The per-section tests mount a component directly, which cannot see the wiring *around* it: the route
 * table, the lazy-import map, the layout, the providers, the Suspense boundary. Every defect this review
 * found in phase 1 was of that shape — something the narrower test could not reach. `App.tsx` maps 20
 * section ids to 20 lazy imports by hand, and a mismatch there is a blank screen with a console error,
 * not a test failure.
 */

beforeEach(() => {
  clearTraces();
  sessionStorage.clear();
  // `/` branches on a `localStorage` preference now, so a test that set it must not leak into the next.
  localStorage.clear();
  // The layout polls /api/health on mount; nothing here is asserting on connectivity.
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline in test'));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('every route resolves to a section', () => {
  it.each(allSectionsFlat.map((s) => [s.label, s.path] as const))(
    '%s at %s',
    async (label, path) => {
      renderAt(path);
      /**
       * The section arrives through React.lazy, so the Suspense fallback shows first.
       *
       * This asserted `querySelector('h2')`, which pinned the defect rather than the behaviour: every
       * section title was an `<h2>` and **no route had an `<h1>` at all**, so each of the 20 pages
       * presented a heading tree with no root. Asserting exactly one `h1` is the property that was
       * actually wanted, and it fails if the level ever regresses in either direction.
       */
      await waitFor(
        () => {
          expect(document.querySelectorAll('h1').length).toBe(1);
        },
        { timeout: 5000 },
      );
      // A rendered section always offers at least one control — a button or a tab.
      expect(
        screen.queryAllByRole('button').length + screen.queryAllByRole('tab').length,
      ).toBeGreaterThan(0);
      expect(label).toBeTruthy();
    },
  );

  /**
   * **`/` is a landing page now, and this test used to assert the opposite.**
   *
   * It read *"sends / to the first section rather than a blank page"* and passed against
   * `<Navigate to="/auth-flows" replace />` — which is exactly the behaviour the audit scored 1/5 on the
   * on-ramp: first paint was a twenty-item sidebar and a form, with nothing saying what the tool is. The
   * assertion was right about "not a blank page" and wrong about what should be there instead, so it is
   * rewritten rather than deleted.
   */
  it('gives / a landing page that says what this is and what to configure', async () => {
    renderAt('/');
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        /OAuth 2.x and OpenID Connect server/i,
      ),
    );
    expect(screen.getByText(/What is configured right now/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Start the authorization-code flow/i }),
      'one path in, not a tour',
    ).toBeInTheDocument();
  });

  /**
   * The one path in lands on the flow the page just described, which is the payoff from putting the tab
   * in the URL — a bare `/auth-flows` would arrive on whichever tab happens to be the default.
   */
  it('points the first-flow link at the authorization-code tab specifically', async () => {
    renderAt('/');
    const link = await screen.findByRole('link', { name: /Start the authorization-code flow/i });
    expect(link).toHaveAttribute('href', '/auth-flows?op=authorization_code');
  });

  it('still serves the landing page at /start, so the preference is not a one-way door', async () => {
    // **With the preference set**, which is the only configuration where this route matters. Without it
    // `/start` and `/` render the same thing, and the test would pass against a `/start` that was itself
    // preference-gated — a mutation proved exactly that.
    localStorage.setItem(PREFERENCE_KEYS.skipLanding, 'true');
    renderAt('/start');
    await waitFor(() =>
      expect(screen.getByText(/What is configured right now/i)).toBeInTheDocument(),
    );
  });

  /**
   * The opt-out, and it is an *opt-out* rather than "has visited": arriving a second time is not a
   * request to skip the introduction, ticking the box is. See `services/preferences.ts`.
   */
  it('sends / straight to Grant Flows once the preference is set', async () => {
    localStorage.setItem(PREFERENCE_KEYS.skipLanding, 'true');
    renderAt('/');
    await waitFor(() => expect(screen.getByText(/Authorization Flows/i)).toBeInTheDocument());
    expect(screen.queryByText(/What is configured right now/i)).not.toBeInTheDocument();
  });

  it('shows the landing page again when the preference is cleared', async () => {
    localStorage.setItem(PREFERENCE_KEYS.skipLanding, 'false');
    renderAt('/');
    // Only the literal `'true'` opts out — `'false'` is a value nothing writes, and a stale one must not
    // be read as a stale opt-*in* either.
    await waitFor(() =>
      expect(screen.getByText(/What is configured right now/i)).toBeInTheDocument(),
    );
  });

  it('maps every section id in the registry to a route', () => {
    // Guards the hand-maintained id → component map in App.tsx.
    const paths = new Set(allSectionsFlat.map((s) => s.path));
    expect(paths.size).toBe(allSectionsFlat.length);
    /**
     * 22, not 20. The two additions are `/reference` — the **only reading surface** in the application —
     * and `/token-exchange`, which the server implemented and Module 06 taught while the debugger could
     * not send it.
     *
     * A hardcoded count is the right shape here — it is a deliberate tripwire on a hand-maintained map,
     * and it should fail when a route is added so that somebody confirms the id → component entry
     * exists. It just has to be updated on purpose rather than treated as a regression.
     */
    expect(allSectionsFlat.length).toBe(22);
    // The two routes added after the audit, named rather than merely counted.
    expect(allSectionsFlat.map((s) => s.id)).toContain('reference');
    expect(allSectionsFlat.map((s) => s.id)).toContain('token-exchange');
  });
});

describe('the shell', () => {
  it('navigates between sections from the sidebar', async () => {
    renderAt('/auth-flows');
    await waitFor(() => expect(screen.getByText(/Authorization Flows/i)).toBeInTheDocument());

    // Navigation is links, not buttons — that is the point of the a11y change: middle-click,
    // open-in-new-tab and `aria-current` all come from using the right element.
    fireEvent.click(screen.getAllByRole('link', { name: /Discovery/i })[0]);
    // Assert on the panel heading, not on the text: the nav item matches too, and "found multiple"
    // would pass for the wrong reason.
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: /Discovery/i })).toBeInTheDocument(),
    );
  });

  it('opens the request trace from the header and shows what was recorded', async () => {
    recordTrace({
      startedAt: Date.now(),
      durationMs: 7,
      method: 'POST',
      url: 'http://localhost:3000/api/token',
      requestHeaders: {},
      status: 401,
      statusText: 'Unauthorized',
      responseHeaders: { 'www-authenticate': 'Basic realm="token_management"' },
      responseBody: { error: 'invalid_client' },
      ok: false,
    });

    renderAt('/auth-flows');
    fireEvent.click(await screen.findByRole('button', { name: /Trace/i }));

    const panel = await screen.findByRole('region', { name: /Request trace/i });
    expect(panel).toBeInTheDocument();
    expect(screen.getByText('401')).toBeInTheDocument();
    expect(screen.getByText('/api/token')).toBeInTheDocument();
  });

  it('counts recorded requests and failures on the header control', async () => {
    for (const status of [200, 200, 500]) {
      recordTrace({
        startedAt: Date.now(),
        durationMs: 1,
        method: 'GET',
        url: 'http://localhost:3000/api/x',
        requestHeaders: {},
        status,
        statusText: '',
        responseHeaders: {},
        responseBody: {},
        ok: status < 400,
      });
    }
    renderAt('/auth-flows');
    const trace = await screen.findByRole('button', { name: /Trace/i });
    expect(trace).toHaveTextContent('3');
    expect(trace).toHaveTextContent('1'); // the failure count
  });

  it('keeps the token vault in the shell, so a token survives navigation', async () => {
    sessionStorage.setItem('token_response', JSON.stringify({ access_token: 'at-1' }));
    renderAt('/auth-flows');
    expect(await screen.findByText(/Token Vault/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('link', { name: /Health Check/i })[0]);
    await waitFor(() => expect(screen.getByText(/Token Vault/i)).toBeInTheDocument());
  });
});

describe('accessibility of the shell (F-22)', () => {
  it('offers a skip link, since 20 nav items sit before the content', async () => {
    renderAt('/auth-flows');
    const skip = await screen.findByRole('link', { name: /Skip to content/i });
    expect(skip).toHaveAttribute('href', '#main');
    expect(document.querySelector('#main')).toBeTruthy();
  });

  it('navigates with links, not buttons, so middle-click and open-in-new-tab work', async () => {
    renderAt('/auth-flows');
    const nav = await screen.findAllByRole('link', { name: /Discovery/i });
    expect(nav.length).toBeGreaterThan(0);
    expect(nav[0]).toHaveAttribute('href', '/discovery');
  });

  it('marks the current page with aria-current', async () => {
    renderAt('/discovery');
    const links = await screen.findAllByRole('link', { name: /Discovery/i });
    expect(links.some((l) => l.getAttribute('aria-current') === 'page')).toBe(true);
  });

  it('exposes grant selectors as a tab list with a selected tab', async () => {
    renderAt('/auth-flows');
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.length).toBeGreaterThan(1);
    expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
  });

  it('moves between tabs with the arrow keys', async () => {
    renderAt('/auth-flows');
    const tabs = await screen.findAllByRole('tab');
    const selected = tabs.find((t) => t.getAttribute('aria-selected') === 'true')!;
    fireEvent.keyDown(selected, { key: 'ArrowRight' });
    const after = await screen.findAllByRole('tab');
    expect(after[1].getAttribute('aria-selected')).toBe('true');
  });

  it('describes flow-diagram steps in text, not by colour alone', async () => {
    renderAt('/auth-flows');
    // "Step 1, Authorize: not started" — readable without distinguishing green from indigo.
    expect(await screen.findByLabelText(/Step 1, Authorize:/i)).toBeInTheDocument();
  });
});

describe('shared management credentials (F-18)', () => {
  it('carries the credential across sections, so it is entered once', async () => {
    renderAt('/admin');
    const id = await screen.findByLabelText(/Admin Client ID/i);
    const secret = await screen.findByLabelText(/Admin Client Secret/i);

    fireEvent.change(id, { target: { value: 'mgmt-client' } });
    fireEvent.change(secret, { target: { value: 's3cr3t' } });

    // Each section used to hold its own useState pair, and a route change unmounts a section — so
    // half the app's surface demanded the same two values again on every navigation.
    fireEvent.click(screen.getAllByRole('link', { name: /Client Management/i })[0]);
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { level: 1, name: /Client Management/i }),
      ).toBeInTheDocument(),
    );

    expect(await screen.findByLabelText(/Admin Client ID/i)).toHaveValue('mgmt-client');
    expect(await screen.findByLabelText(/Admin Client Secret/i)).toHaveValue('s3cr3t');
  });

  it('says the credential is shared, once both halves are present', async () => {
    renderAt('/admin');
    fireEvent.change(await screen.findByLabelText(/Admin Client ID/i), { target: { value: 'a' } });
    fireEvent.change(await screen.findByLabelText(/Admin Client Secret/i), {
      target: { value: 'b' },
    });
    expect(screen.getByText(/Shared across every admin section/i)).toBeInTheDocument();
  });
});

describe('a URL fragment lands on the wizard step it names', () => {
  /**
   * **The third half of the feature, and the one a mutation found missing.**
   *
   * `useHashScroll.test.tsx` proves the hook works against its own fixture. The MCP and FAPI driven tests
   * prove the step cards carry the ids. Neither can see whether anything ever *calls* the hook — deleting
   * `useHashScroll()` from `AppLayout` left both suites green, which is the same shape as the four dead
   * flows of 2026-08-22: two correct halves and no wiring. Only the real router can answer it.
   */
  it('moves focus to the step, through the real router and the lazy section', async () => {
    renderAt('/mcp#mcp-step-4');

    await waitFor(
      () => {
        expect(document.getElementById('mcp-step-4')).not.toBeNull();
      },
      { timeout: 5000 },
    );
    await waitFor(() => {
      expect(document.activeElement).toBe(document.getElementById('mcp-step-4'));
    });
  });

  it('leaves focus alone on a route with no fragment', async () => {
    renderAt('/mcp');

    await waitFor(
      () => {
        expect(document.getElementById('mcp-step-4')).not.toBeNull();
      },
      { timeout: 5000 },
    );
    expect(document.activeElement).toBe(document.body);
  });
});
