import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CallbackPage from '@/pages/CallbackPage';
import { TokenProvider } from '@/context/TokenContext';
import { tokenService } from '@/services';
import { CredentialProvider } from '@/context/CredentialContext';

/**
 * The callback page had no tests at all, and it is the most security-relevant file in the client: it
 * checks `state`, holds the PKCE verifier, and decides which of three client-authentication shapes to
 * use for the token exchange. The `state` check used to be `if (expected && received && expected !==
 * received)` — skipped entirely when either side was absent.
 */

function at(query: string) {
  // The page reads `window.location`, not the router, so the URL has to be set for real.
  window.history.replaceState({}, '', `/callback${query}`);
  return render(
    <MemoryRouter initialEntries={[`/callback${query}`]}>
      <TokenProvider>
        <CredentialProvider>
          <CallbackPage />
        </CredentialProvider>
      </TokenProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('state validation fails closed', () => {
  it('refuses when nothing was stored to compare against', async () => {
    at('?code=abc&state=s1');
    expect(await screen.findByText(/No stored `state` to compare against/i)).toBeInTheDocument();
  });

  it('refuses when the callback carries no state', async () => {
    sessionStorage.setItem('oauth_state', 's1');
    sessionStorage.setItem('pkce_code_verifier', 'v1');
    at('?code=abc');
    expect(await screen.findByText(/carried no `state`/i)).toBeInTheDocument();
  });

  it('refuses a mismatch and shows both values', async () => {
    sessionStorage.setItem('oauth_state', 'expected-1');
    sessionStorage.setItem('pkce_code_verifier', 'v1');
    at('?code=abc&state=attacker-1');
    expect(await screen.findByText(/State mismatch/i)).toBeInTheDocument();
    expect(screen.getByText(/expected-1/)).toBeInTheDocument();
    expect(screen.getByText(/attacker-1/)).toBeInTheDocument();
  });

  it('does not exchange the code when state validation fails', async () => {
    const exchange = vi.spyOn(tokenService, 'exchangeCodeForToken');
    sessionStorage.setItem('oauth_state', 'expected-1');
    sessionStorage.setItem('pkce_code_verifier', 'v1');
    at('?code=abc&state=wrong');
    await screen.findByText(/State mismatch/i);
    expect(exchange).not.toHaveBeenCalled();
  });

  it('proceeds when state matches', async () => {
    const exchange = vi
      .spyOn(tokenService, 'exchangeCodeForToken')
      .mockResolvedValue({ access_token: 'at-1', token_type: 'Bearer' });
    sessionStorage.setItem('oauth_state', 'same');
    sessionStorage.setItem('pkce_code_verifier', 'v1');
    at('?code=abc&state=same');
    await waitFor(() => expect(exchange).toHaveBeenCalledTimes(1));
    expect(exchange.mock.calls[0][0]).toMatchObject({
      grant_type: 'authorization_code',
      code: 'abc',
      code_verifier: 'v1',
    });
  });
});

describe('RFC 9207 iss', () => {
  it('refuses a response whose iss is a different authorization server', async () => {
    const exchange = vi.spyOn(tokenService, 'exchangeCodeForToken');
    sessionStorage.setItem('oauth_state', 'same');
    sessionStorage.setItem('pkce_code_verifier', 'v1');
    at('?code=abc&state=same&iss=https%3A%2F%2Fevil.example');
    expect(
      await screen.findByText(/not the server this app is configured for/i),
    ).toBeInTheDocument();
    expect(exchange).not.toHaveBeenCalled();
  });

  it('accepts the iss this app is configured for', async () => {
    const exchange = vi
      .spyOn(tokenService, 'exchangeCodeForToken')
      .mockResolvedValue({ access_token: 'at-1' });
    sessionStorage.setItem('oauth_state', 'same');
    sessionStorage.setItem('pkce_code_verifier', 'v1');
    at('?code=abc&state=same&iss=http%3A%2F%2Flocalhost%3A3000');
    await waitFor(() => expect(exchange).toHaveBeenCalled());
  });
});

describe('authorization errors', () => {
  it('keeps error_description and error_uri instead of discarding them', async () => {
    at(
      '?error=invalid_scope&error_description=%5BA000000%5D+scope+not+allowed&error_uri=https%3A%2F%2Fdocs.authlete.com%2F%23x',
    );
    const shown = await screen.findByText(/error=invalid_scope/);
    expect(shown).toHaveTextContent('scope not allowed');
    expect(shown).toHaveTextContent('docs.authlete.com');
  });

  it('explains the error code rather than only printing it', async () => {
    at('?error=invalid_scope');
    // ErrorExplainer decodes it from the same string.
    expect(
      await screen.findByText(/registered on the service and requestable/i),
    ).toBeInTheDocument();
  });
});

describe('preconditions', () => {
  it('reports a missing code', async () => {
    at('?state=s1');
    expect(await screen.findByText(/Missing authorization code/i)).toBeInTheDocument();
  });

  it('reports a missing PKCE verifier', async () => {
    sessionStorage.setItem('oauth_state', 'same');
    at('?code=abc&state=same');
    expect(await screen.findByText(/Missing PKCE code verifier/i)).toBeInTheDocument();
  });
});

/**
 * The token request the SPA's own client can actually use.
 *
 * `4277838306` is public with `tokenAuthMethod: NONE`, and Authlete refuses **any** client
 * authentication data for such a client — `[A157303]`, observed live on the deployment breaking the
 * headline authorization-code + PKCE flow. `client_secret` used to be added unconditionally, seeded from
 * `VITE_CLIENT_SECRET`, whose default and whose `.env.example` value were both the literal
 * `your_client_secret`. So the flow shipped broken and the error blamed the credential rather than its
 * presence.
 *
 * These assert **omission**, not emptiness. `URLSearchParams` stringifies its values, so
 * `client_secret: undefined` would put `client_secret=undefined` on the wire — probed live and refused
 * with `[A157303]`, exactly like the placeholder. An *empty* `client_secret=` is, measurably, tolerated
 * by Authlete; omission is what RFC 6749 §2.3.1 actually describes and is what these pin, so the tests
 * do not encode a dependency on that tolerance.
 */
describe('client authentication on the code exchange', () => {
  const ready = () => {
    sessionStorage.setItem('oauth_state', 'same');
    sessionStorage.setItem('pkce_code_verifier', 'v1');
  };

  it('omits client_secret entirely when there is no secret', async () => {
    const exchange = vi
      .spyOn(tokenService, 'exchangeCodeForToken')
      .mockResolvedValue({ access_token: 'at-1' });
    ready();
    at('?code=abc&state=same');
    await waitFor(() => expect(exchange).toHaveBeenCalled());

    const sent = exchange.mock.calls[0][0];
    expect('client_secret' in sent).toBe(false);
    // Neither the placeholder nor a stringified `undefined` reaches the request by any other name.
    expect(Object.values(sent)).not.toContain('your_client_secret');
    expect(Object.values(sent)).not.toContain('undefined');
    // The parameters a public client does send are still there.
    expect(sent).toMatchObject({ client_id: expect.any(String), code_verifier: 'v1' });
  });

  it('still sends a real secret for a confidential client', async () => {
    const exchange = vi
      .spyOn(tokenService, 'exchangeCodeForToken')
      .mockResolvedValue({ access_token: 'at-1' });
    ready();
    sessionStorage.setItem('authz_client_secret', 's3cr3t-for-real');
    at('?code=abc&state=same');
    await waitFor(() => expect(exchange).toHaveBeenCalled());

    expect(exchange.mock.calls[0][0]).toMatchObject({ client_secret: 's3cr3t-for-real' });
  });
});

describe('a successful exchange', () => {
  it('stores the tokens and inspects the ID token', async () => {
    // A structurally valid JWT — the inspector decodes it; verification is a separate, explicit step.
    const header = btoa(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).replace(/=+$/, '');
    const payload = btoa(JSON.stringify({ sub: 'alice', iss: 'http://localhost:3000' })).replace(
      /=+$/,
      '',
    );
    vi.spyOn(tokenService, 'exchangeCodeForToken').mockResolvedValue({
      access_token: 'at-1',
      id_token: `${header}.${payload}.sig`,
    });
    sessionStorage.setItem('oauth_state', 'same');
    sessionStorage.setItem('pkce_code_verifier', 'v1');
    at('?code=abc&state=same');

    expect(await screen.findByText(/Successfully obtained tokens/i)).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem('token_response')!)).toMatchObject({
      access_token: 'at-1',
    });
    // The inspector replaced a payload-only `jwt-decode` dump.
    expect(screen.getByText(/unverified/i)).toBeInTheDocument();
  });
});
