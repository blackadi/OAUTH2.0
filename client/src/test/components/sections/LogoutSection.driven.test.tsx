import { screen, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LogoutSection } from '@/components/oidc/LogoutSection';
import * as traceStore from '@/services/trace-store';
import { getTraces, clearTraces } from '@/services/trace-store';
import { SESSION_KEYS } from '@/services/session-keys';
import {
  mountSection,
  fill,
  press,
  seedTokens,
  stubNavigation,
  resetSectionState,
} from '@/test/helpers/drive-section';

/**
 * RP-Initiated Logout — the section that sends **no request at all**, which is what makes it worth a
 * driven test rather than a service spy.
 *
 * Everything here is one navigation, so every assertion is about the URL that gets built. And the
 * server side is unusually strict about it:
 *
 * - **§2 makes the confirmation mandatory.** `GET /api/logout` renders a page and destroys nothing;
 *   only the confirming `POST` verifies the hint, delivers back-channel logout tokens and ends the
 *   session. Before that split, `<img src="…/api/logout">` logged the viewer out.
 * - **§3 matches `post_logout_redirect_uri` exactly**, byte for byte, against the *client's* registered
 *   set — `http://localhost:3000` does not match `http://localhost:3000/`. The client is identified by
 *   `client_id`, or by the `aud` of a **verified** `id_token_hint`; with neither, there is no redirect.
 *
 * So the three parameters are not decoration: each one decides whether the flow can complete, and each
 * is only observable in the URL.
 */

beforeEach(() => {
  resetSectionState();
  clearTraces();
});
afterEach(cleanup);

describe('LogoutSection — the URL it builds', () => {
  it('carries the hint, the redirect URI and the state', async () => {
    const nav = stubNavigation();
    mountSection(<LogoutSection />);

    fill(/ID Token Hint/i, 'eyJhbGciOiJSUzI1NiJ9.e30.sig');
    fill(/Post-Logout Redirect URI/i, 'http://localhost:3001');
    fill(/^State$/i, 'logout-state-1');
    press(/RP-Initiated Logout/i);

    await waitFor(() => expect(nav.href).not.toBe(''));
    const params = new URL(nav.href).searchParams;
    expect(params.get('id_token_hint')).toBe('eyJhbGciOiJSUzI1NiJ9.e30.sig');
    expect(params.get('post_logout_redirect_uri')).toBe('http://localhost:3001');
    expect(params.get('state')).toBe('logout-state-1');
  });

  /**
   * §3's match is byte-for-byte, so a trailing slash the section added or removed on the user's behalf
   * would turn a working logout into a silent no-redirect. The value must travel exactly as typed.
   */
  it('sends the redirect URI byte for byte, trailing slash included', async () => {
    const nav = stubNavigation();
    mountSection(<LogoutSection />);

    fill(/Post-Logout Redirect URI/i, 'http://localhost:3001/');
    press(/RP-Initiated Logout/i);

    await waitFor(() => expect(nav.href).not.toBe(''));
    expect(
      new URL(nav.href).searchParams.get('post_logout_redirect_uri'),
      '§3 matches exactly — normalising the slash here would break a registered URI',
    ).toBe('http://localhost:3001/');
  });

  it('omits the parameters that were cleared, rather than sending empty ones', async () => {
    const nav = stubNavigation();
    mountSection(<LogoutSection />);

    fill(/ID Token Hint/i, '');
    fill(/Post-Logout Redirect URI/i, '');
    fill(/^State$/i, '');
    press(/RP-Initiated Logout/i);

    await waitFor(() => expect(nav.href).not.toBe(''));
    const params = new URL(nav.href).searchParams;
    // An empty `id_token_hint` is not the same request as an absent one: §2 makes the parameter
    // OPTIONAL, and a present-but-empty value is a malformed hint rather than no hint.
    expect(params.has('id_token_hint')).toBe(false);
    expect(params.has('post_logout_redirect_uri')).toBe(false);
    expect(params.has('state')).toBe(false);
  });

  it('pre-fills the hint from the ID token in session, so it need not be pasted', () => {
    seedTokens({ id_token: 'eyJraWQiOiJyc2EtMSJ9.e30.sig' });
    mountSection(<LogoutSection />);

    expect((screen.getByLabelText(/ID Token Hint/i) as HTMLInputElement).value).toBe(
      'eyJraWQiOiJyc2EtMSJ9.e30.sig',
    );
  });

  /**
   * The tokens go **before** the navigation, and the ordering is the whole assertion.
   *
   * The browser is about to leave, so anything deferred until after the redirect never runs — a logout
   * that cleared them afterwards would leave the app holding credentials for a session that no longer
   * exists, and would look identical in every test that only checks the end state.
   *
   * **Which is exactly what happened here.** The first version of this test asserted `sessionStorage`
   * was empty after pressing, and moving `clearTokens()` to *after* `navigateTo` did not fail it: the
   * navigation stub does not unload the page, so both orderings reach the same end state. The ordering
   * is only observable *at the moment of navigation*, so that is where it is now observed.
   */
  it('clears the tokens before leaving, not after', async () => {
    seedTokens({ access_token: 'at-1', id_token: 'idt-1' });
    stubNavigation();

    let tokensAtNavigation: string | null = 'not-called';
    // Captured by value **before** the spy replaces the export. A named import would not do: ESM
    // bindings are live, so `navigateTo` inside the mock would resolve to the spy and recurse until
    // the stack gives out — which is exactly what the first attempt did.
    const original = traceStore.navigateTo;
    vi.spyOn(traceStore, 'navigateTo').mockImplementation((url, label) => {
      tokensAtNavigation = sessionStorage.getItem(SESSION_KEYS.tokenResponse);
      original(url, label);
    });

    mountSection(<LogoutSection />);
    press(/RP-Initiated Logout/i);

    await waitFor(() => expect(tokensAtNavigation).not.toBe('not-called'));
    expect(
      tokensAtNavigation,
      'the browser has left; there is no "after" in which to clear them',
    ).toBeNull();
  });

  /** The fifth site of the unrecorded-navigation defect — see `navigateTo` in `trace-store.ts`. */
  it('records the front-channel hop', async () => {
    stubNavigation();
    mountSection(<LogoutSection />);
    press(/RP-Initiated Logout/i);

    await waitFor(() => {
      const hop = getTraces().find((t) => t.navigation && t.url.includes('/api/logout'));
      expect(hop, 'the browser left for the logout endpoint and nothing recorded it').toBeDefined();
      expect(hop!.direction).toBe('outbound');
    });
  });

  /**
   * §2 requires the OP to ask before ending the session, and this deployment asks unconditionally. The
   * section has to say so, because "log out" that does not log you out until a second page is exactly
   * the sort of thing a user reads as a bug.
   */
  it('says that nothing is signed out until the confirmation on the server', () => {
    mountSection(<LogoutSection />);
    expect(screen.getByText(/Nothing is signed out until you confirm there/i)).toBeInTheDocument();
  });
});
