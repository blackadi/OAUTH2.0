import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import CallbackPage from '@/pages/CallbackPage';
import { SequenceView } from '@/components/trace/SequenceView';
import { TokenProvider } from '@/context/TokenContext';
import { CredentialProvider } from '@/context/CredentialContext';
import { tokenService } from '@/services';
import {
  clearTraces,
  getTraces,
  recordNavigation,
  recordTrace,
  type TraceEntry,
} from '@/services/trace-store';
import { authorizationCodeProgress } from '@/utils/flow-progress';

/**
 * The front channel, which the request trace could not see at all.
 *
 * `recordTrace` was called from exactly two places, both inside `transport.ts`, and the authorization
 * request is `window.location.href = url` — a browser navigation no `fetch` interceptor observes. So the
 * single most important request in OAuth never entered the trace: a learner composed it parameter by
 * parameter in a 24-field builder, sent it, and watched it vanish. The history and the four-lane
 * `SequenceView` both began at the token exchange, and the diagram could not draw the front-channel /
 * back-channel distinction its four lanes exist to teach.
 */

beforeEach(() => {
  clearTraces();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('recordNavigation', () => {
  it('records a hop with no status of its own, flagged as a navigation', () => {
    recordNavigation({
      url: 'http://localhost:3000/api/authorization?client_id=c1&state=s1',
      direction: 'outbound',
      label: 'authorize',
    });

    const [entry] = getTraces();
    expect(entry.navigation).toBe(true);
    expect(entry.direction).toBe('outbound');
    expect(entry.method).toBe('GET');
    // `status: 0` is the store's existing "no response arrived" value; `ok` stays true because nothing
    // failed. The flag — not the status — is what distinguishes this from a network error.
    expect(entry.status).toBe(0);
    expect(entry.ok).toBe(true);
    expect(entry.networkError).toBeUndefined();
    expect(entry.durationMs).toBe(0);
  });

  it('carries no request headers or body, because it sent none', () => {
    recordNavigation({ url: 'http://x/authz', direction: 'outbound', label: 'authorize' });
    const [entry] = getTraces();
    expect(entry.requestHeaders).toEqual({});
    expect(entry.requestBody).toBeUndefined();
  });

  it('says which way it went, in words as well as in a flag', () => {
    recordNavigation({ url: 'http://x/authz', direction: 'outbound', label: 'out' });
    recordNavigation({ url: 'http://x/callback?code=abc', direction: 'inbound', label: 'in' });

    const [inbound, outbound] = getTraces(); // newest first
    expect(String(outbound.responseBody)).toMatch(/navigated away/i);
    expect(String(inbound.responseBody)).toMatch(/redirect the authorization server sent/i);
  });
});

describe('the callback records its own inbound redirect', () => {
  it('appears in the trace even when the callback is refused', async () => {
    // No stored state, so the page fails closed before any exchange — and the hop must still be there,
    // because a failed callback is exactly the one somebody needs the evidence for.
    window.history.replaceState({}, '', '/callback?code=abc&state=s1');
    render(
      <MemoryRouter initialEntries={['/callback?code=abc&state=s1']}>
        <TokenProvider>
          <CredentialProvider>
            <CallbackPage />
          </CredentialProvider>
        </TokenProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/No stored `state` to compare against/i)).toBeInTheDocument();
    const hops = getTraces().filter((t) => t.navigation);
    expect(hops).toHaveLength(1);
    expect(hops[0].direction).toBe('inbound');
    expect(hops[0].url).toContain('code=abc');
  });

  it('records the hop exactly once, not once per StrictMode invocation', async () => {
    vi.spyOn(tokenService, 'exchangeCodeForToken').mockResolvedValue({ access_token: 'at-1' });
    sessionStorage.setItem('oauth_state', 'same');
    sessionStorage.setItem('pkce_code_verifier', 'v1');
    window.history.replaceState({}, '', '/callback?code=abc&state=same');

    render(
      <MemoryRouter initialEntries={['/callback?code=abc&state=same']}>
        <TokenProvider>
          <CredentialProvider>
            <CallbackPage />
          </CredentialProvider>
        </TokenProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(getTraces().some((t) => t.navigation)).toBe(true));
    expect(getTraces().filter((t) => t.navigation)).toHaveLength(1);
  });
});

describe('SequenceView draws a front-channel hop as one arrow, not a round trip', () => {
  function nav(direction: 'outbound' | 'inbound'): TraceEntry {
    return {
      id: `nav-${direction}`,
      startedAt: 0,
      durationMs: 0,
      method: 'GET',
      url:
        direction === 'outbound'
          ? 'http://localhost:3000/api/authorization?client_id=c1'
          : 'http://localhost:3001/callback?code=abc',
      label: direction,
      requestHeaders: {},
      status: 0,
      statusText: 'front-channel navigation',
      responseHeaders: {},
      responseBody: 'hop',
      ok: true,
      navigation: true,
      direction,
    };
  }

  it('labels it as a browser redirect rather than as a status and a duration', () => {
    render(<SequenceView traces={[nav('outbound')]} />);
    expect(screen.getByText(/front channel · browser redirect/i)).toBeInTheDocument();
    // A navigation has no round trip, so there is no response line to carry "0 · 0 ms".
    expect(screen.queryByText(/0 · 0 ms/)).not.toBeInTheDocument();
  });

  it('does not colour it as a network error, which is the other status-0 case', () => {
    render(<SequenceView traces={[nav('inbound')]} />);
    expect(screen.queryByText(/network error/i)).not.toBeInTheDocument();
  });

  /**
   * The inbound redirect's URL is *our own* `/callback`, so a lane chosen by path matching would file
   * the authorization server's message under the client and draw it as the client talking to itself —
   * losing the very round trip the two rows exist to show.
   */
  it('attributes the inbound redirect to the authorization server, not to the client', () => {
    const { container } = render(<SequenceView traces={[nav('inbound')]} onSelect={vi.fn()} />);
    // Asserted on the `<title>` rather than the computed accessible name: a browser derives an SVG
    // element's name from its first-child `<title>`, and jsdom's name computation falls back to text
    // content instead — so checking the name here would test the polyfill, not the markup.
    const title = container.querySelector('g[role="button"] > title');
    expect(title?.textContent).toMatch(/redirect back to the client/i);
  });

  it('describes the outbound hop as leaving for the authorization server', () => {
    const { container } = render(<SequenceView traces={[nav('outbound')]} onSelect={vi.fn()} />);
    const title = container.querySelector('g[role="button"] > title');
    expect(title?.textContent).toMatch(/navigation to the authorization server/i);
    expect(title?.textContent).toMatch(/no status observed by this app/i);
  });
});

describe('flow progress reads the hops it can now see', () => {
  const base = { hasToken: false, codeReceived: false, authorizeSent: false };

  it('marks the authorize step from the outbound hop alone', () => {
    recordNavigation({
      url: 'http://localhost:3000/api/authorization?client_id=c1',
      direction: 'outbound',
      label: 'authorize',
    });
    const progress = authorizationCodeProgress({ ...base, traces: getTraces() });
    expect(progress.completedSteps).toContain('authz');
    expect(progress.completedSteps).not.toContain('callback');
  });

  /**
   * The callback step completes on the redirect arriving, not on a token existing — a flow that came
   * back and then failed at the token endpoint has genuinely finished four of five steps, and showing it
   * stalled at step one sends the reader looking in the wrong place.
   */
  it('marks login, consent and callback from the inbound hop, with no token yet', () => {
    recordNavigation({
      url: 'http://localhost:3000/api/authorization',
      direction: 'outbound',
      label: 'authorize',
    });
    recordNavigation({
      url: 'http://localhost:3001/callback?code=abc',
      direction: 'inbound',
      label: 'callback',
    });
    recordTrace({
      startedAt: 0,
      durationMs: 12,
      method: 'POST',
      url: 'http://localhost:3000/api/token',
      requestHeaders: {},
      status: 400,
      statusText: 'Bad Request',
      responseHeaders: {},
      responseBody: { error: 'invalid_grant' },
      ok: false,
    });

    const progress = authorizationCodeProgress({ ...base, traces: getTraces() });
    expect(progress.completedSteps).toEqual(
      expect.arrayContaining(['authz', 'login', 'consent', 'callback']),
    );
    expect(progress.completedSteps).not.toContain('token');
    expect(progress.currentStep).toBe('token');
  });
});
