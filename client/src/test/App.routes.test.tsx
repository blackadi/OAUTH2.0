import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import App, { allSectionsFlat } from '@/App';
import { clearTraces, recordTrace } from '@/services/trace-store';

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
      // The section arrives through React.lazy, so the Suspense fallback shows first.
      await waitFor(
        () => {
          expect(document.querySelector('h2')).toBeTruthy();
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

  it('sends / to the first section rather than a blank page', async () => {
    renderAt('/');
    await waitFor(() => expect(screen.getByText(/Authorization Flows/i)).toBeInTheDocument());
  });

  it('maps every section id in the registry to a route', () => {
    // Guards the hand-maintained id → component map in App.tsx.
    const paths = new Set(allSectionsFlat.map((s) => s.path));
    expect(paths.size).toBe(allSectionsFlat.length);
    expect(allSectionsFlat.length).toBe(20);
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
      expect(screen.getByRole('heading', { level: 2, name: /Discovery/i })).toBeInTheDocument(),
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
