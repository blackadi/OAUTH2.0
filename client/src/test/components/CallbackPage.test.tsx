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
