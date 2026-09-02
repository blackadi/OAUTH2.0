import { StrictMode } from 'react';
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
  function primed() {
    sessionStorage.setItem('oauth_state', 'same');
    sessionStorage.setItem('pkce_code_verifier', 'v1');
  }

  it('refuses a response whose iss is a different authorization server', async () => {
    const exchange = vi.spyOn(tokenService, 'exchangeCodeForToken');
    primed();
    at('?code=abc&state=same&iss=https%3A%2F%2Fevil.example');
    expect(await screen.findByText(/whose origin is not/i)).toBeInTheDocument();
    expect(exchange).not.toHaveBeenCalled();
  });

  it('accepts the iss this app is configured for', async () => {
    const exchange = vi
      .spyOn(tokenService, 'exchangeCodeForToken')
      .mockResolvedValue({ access_token: 'at-1' });
    primed();
    at('?code=abc&state=same&iss=http%3A%2F%2Flocalhost%3A3000');
    await waitFor(() => expect(exchange).toHaveBeenCalled());
  });

  /**
   * The two cases the old test could not see, and the reason it could not.
   *
   * The check was `API_BASE_URL.startsWith(new URL(issParam).origin)`, and a prefix test on an origin
   * accepts any origin that is a **truncation** of the expected one. The suite only ever tried an
   * obviously-different origin (`https://evil.example`) and an exact match, so both of these passed
   * silently — in the defence whose own comment reads *"RFC 9207 exists to catch exactly this"*, and in
   * the same `startsWith` shape the server had already removed from `post_logout_redirect_uri` matching
   * after two live-verified open redirects.
   *
   * `API_BASE_URL` is `http://localhost:3000` under test, so `http://localhost:3` and
   * `http://localhost:300` are both prefixes of it and neither is it.
   */
  it.each([
    ['a truncated port', 'http%3A%2F%2Flocalhost%3A3'],
    ['a partly truncated port', 'http%3A%2F%2Flocalhost%3A300'],
  ])('refuses an iss that is merely a prefix of the expected origin — %s', async (_label, iss) => {
    const exchange = vi.spyOn(tokenService, 'exchangeCodeForToken');
    primed();
    at(`?code=abc&state=same&iss=${iss}`);
    expect(await screen.findByText(/whose origin is not/i)).toBeInTheDocument();
    expect(exchange).not.toHaveBeenCalled();
  });

  /**
   * `new URL()` throws a `TypeError` on a value that is not a URL, and the call sat *outside* the
   * `try`. The rejection escaped the effect, `loading` was never cleared, and the page showed the
   * spinner and "Exchanging authorization code for tokens…" for ever — no error, no way forward.
   */
  it('reports a malformed iss instead of hanging on the spinner', async () => {
    const exchange = vi.spyOn(tokenService, 'exchangeCodeForToken');
    primed();
    at('?code=abc&state=same&iss=notaurl');
    expect(await screen.findByText(/whose origin is not/i)).toBeInTheDocument();
    expect(screen.queryByText(/Exchanging authorization code/i)).not.toBeInTheDocument();
    expect(exchange).not.toHaveBeenCalled();
  });

  /**
   * A missing `iss` is **reported and not fatal**, which is what the code comment always claimed and
   * the code never did — it short-circuited on `issParam &&` and said nothing. Hard-failing would be
   * wrong too: a client that cannot talk to an AS which sends no `iss` is broken for a different
   * reason. What it must not do is stay silent, because silence makes "the check passed" and "there was
   * nothing to check" look identical.
   */
  it('warns when no iss came back, and still completes the exchange', async () => {
    const exchange = vi
      .spyOn(tokenService, 'exchangeCodeForToken')
      .mockResolvedValue({ access_token: 'at-1' });
    primed();
    at('?code=abc&state=same');
    await waitFor(() => expect(exchange).toHaveBeenCalled());
    expect(await screen.findByText(/carried no `iss` parameter/i)).toBeInTheDocument();
  });
});

/**
 * The authorization code is single-use, and `main.tsx` wraps the tree in `React.StrictMode` — which in
 * development runs an effect setup → cleanup → setup on the same instance. Without a latch the code was
 * redeemed twice: the first request succeeded, the second was refused with `invalid_grant`, and because
 * `setState` lands in resolution order the later failure could overwrite the earlier success. A correct
 * flow reported a protocol error, in the one environment learners actually run.
 *
 * Rendered inside a real `<StrictMode>` here, because that is the only way to reproduce it — the
 * default test render does not double-invoke.
 */
describe('the code is exchanged exactly once (React.StrictMode)', () => {
  it('does not redeem a single-use authorization code twice', async () => {
    const exchange = vi
      .spyOn(tokenService, 'exchangeCodeForToken')
      .mockResolvedValue({ access_token: 'at-1' });
    sessionStorage.setItem('oauth_state', 'same');
    sessionStorage.setItem('pkce_code_verifier', 'v1');

    window.history.replaceState({}, '', '/callback?code=abc&state=same');
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/callback?code=abc&state=same']}>
          <TokenProvider>
            <CredentialProvider>
              <CallbackPage />
            </CredentialProvider>
          </TokenProvider>
        </MemoryRouter>
      </StrictMode>,
    );

    await waitFor(() => expect(exchange).toHaveBeenCalled());
    // Give a second invocation every chance to land before asserting it did not.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(exchange).toHaveBeenCalledTimes(1);
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

/**
 * **JARM — `response_mode=jwt`, which this page could not read at all.**
 *
 * Once a scope carries Authlete's `fapi2: ms-authres` attribute the authorization response is one
 * signed `response=<JWS>` parameter and there is no bare `code`, `state` or `iss` on the query string.
 * Every check above reads those three, so a correct Message Signing response was reported as *"Missing
 * authorization code in callback URL"* — and the FAPI 2.0 wizard never reached this page in the first
 * place, because its request object omitted `response_mode` and the server error-redirected with
 * `[A309301]` (measured live 2026-09-02).
 *
 * The signatures here are real. The point of `readJarmResponse` is the difference between a JWT that
 * verifies and one that merely decodes, and a stubbed verification would assert the decode.
 */
describe('JARM response_mode=jwt', () => {
  const AS_ISSUER = 'http://localhost:3000';
  const enc = new TextEncoder();

  function b64url(bytes: Uint8Array | ArrayBuffer): string {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let binary = '';
    for (const byte of view) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  async function signedResponse(claims: Record<string, unknown>) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ]);
    const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as Record<string, unknown>;
    jwk.kid = 'as-key';
    const head = b64url(enc.encode(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: 'as-key' })));
    const body = b64url(enc.encode(JSON.stringify(claims)));
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.privateKey,
      enc.encode(`${head}.${body}`),
    );
    // The page fetches the key set to check the signature against; that fetch failing is reported as
    // itself rather than as an invalid token, which is why it is a separate spy.
    vi.spyOn(tokenService, 'getJwks').mockResolvedValue({
      keys: [jwk],
    } as unknown as Awaited<ReturnType<typeof tokenService.getJwks>>);
    return `${head}.${body}.${b64url(signature)}`;
  }

  function primed() {
    sessionStorage.setItem('oauth_state', 'same');
    sessionStorage.setItem('pkce_code_verifier', 'v1');
    sessionStorage.setItem('authz_client_id', 'fapi-client-1');
  }

  const claims = (extra: Record<string, unknown> = {}) => ({
    iss: AS_ISSUER,
    aud: 'fapi-client-1',
    exp: Math.floor(Date.now() / 1000) + 300,
    code: 'jarm-code-1',
    state: 'same',
    ...extra,
  });

  it('redeems the code carried inside the signed response', async () => {
    const exchange = vi
      .spyOn(tokenService, 'exchangeCodeForToken')
      .mockResolvedValue({ access_token: 'at-1' });
    primed();
    const jwt = await signedResponse(claims());
    at(`?response=${encodeURIComponent(jwt)}`);

    await waitFor(() => expect(exchange).toHaveBeenCalled());
    // The code came from inside the JWT — there is none on the query string to fall back to.
    expect(exchange.mock.calls[0][0]).toMatchObject({ code: 'jarm-code-1', code_verifier: 'v1' });
  });

  it('binds on the state inside the JWT, and stops on a mismatch', async () => {
    const exchange = vi.spyOn(tokenService, 'exchangeCodeForToken');
    primed();
    const jwt = await signedResponse(claims({ state: 'attacker-1' }));
    at(`?response=${encodeURIComponent(jwt)}`);

    expect(await screen.findByText(/State mismatch/i)).toBeInTheDocument();
    expect(exchange).not.toHaveBeenCalled();
  });

  /**
   * The reason the signature is checked rather than the payload merely decoded. A tampered response
   * decodes perfectly — its claims are legible, and legible reads as authoritative.
   */
  it('refuses a tampered response and never redeems its code', async () => {
    const exchange = vi.spyOn(tokenService, 'exchangeCodeForToken');
    primed();
    const jwt = await signedResponse(claims());
    const [head, , signature] = jwt.split('.');
    const forged = [
      head,
      b64url(enc.encode(JSON.stringify(claims({ code: 'attacker-code' })))),
      signature,
    ].join('.');
    at(`?response=${encodeURIComponent(forged)}`);

    expect(await screen.findByText(/signature was not verified/i)).toBeInTheDocument();
    expect(exchange).not.toHaveBeenCalled();
  });

  /**
   * **Fail closed rather than fall through.** A forged JWT arriving beside a real `?code=` must not
   * cause the page to shrug and read the query string instead — that would hand the attacker's
   * parameters the outcome.
   */
  it('does not fall back to bare query parameters when the JWT is bad', async () => {
    const exchange = vi.spyOn(tokenService, 'exchangeCodeForToken');
    primed();
    await signedResponse(claims());
    at('?response=not-a-jwt&code=abc&state=same');

    expect(await screen.findByText(/not a decodable JWS/i)).toBeInTheDocument();
    expect(exchange).not.toHaveBeenCalled();
  });

  it('surfaces a signed error response as an error, not as a missing code', async () => {
    primed();
    const jwt = await signedResponse(
      claims({ code: undefined, error: 'access_denied', error_description: 'Consent refused.' }),
    );
    at(`?response=${encodeURIComponent(jwt)}`);

    // `findAllByText`: the explainer prints the raw string and also badges the decoded code, so the
    // error legitimately appears more than once.
    expect((await screen.findAllByText(/access_denied/i)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Missing authorization code/i)).not.toBeInTheDocument();
  });

  it('reports an unfetchable JWK Set as itself rather than as a bad signature', async () => {
    primed();
    const jwt = await signedResponse(claims());
    vi.spyOn(tokenService, 'getJwks').mockRejectedValue(new Error('502 Bad Gateway'));
    at(`?response=${encodeURIComponent(jwt)}`);

    expect(await screen.findByText(/could not be fetched/i)).toBeInTheDocument();
  });
});

/**
 * The signed response is *readable*, not merely acted on.
 *
 * `readJarmResponse` returns parameters and the JWS that carried them was discarded — on a debugger
 * whose premise is showing evidence, and which already owns `JwtInspector` for every other JWS it
 * handles. The failing case is the one that needed it most: "the signature does not verify" is an
 * assertion until the reader can see the token it is about, and a tampered claim set that looks
 * entirely reasonable next to that sentence is the lesson.
 */
describe('the JARM response is shown, on both outcomes', () => {
  const AS_ISSUER = 'http://localhost:3000';
  const enc = new TextEncoder();

  function b64url(bytes: Uint8Array | ArrayBuffer): string {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let binary = '';
    for (const byte of view) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  async function signed(extra: Record<string, unknown> = {}) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ]);
    const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as Record<string, unknown>;
    jwk.kid = 'as-key';
    vi.spyOn(tokenService, 'getJwks').mockResolvedValue({
      keys: [jwk],
    } as unknown as Awaited<ReturnType<typeof tokenService.getJwks>>);
    const head = b64url(enc.encode(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: 'as-key' })));
    const body = b64url(
      enc.encode(
        JSON.stringify({
          iss: AS_ISSUER,
          aud: 'fapi-client-1',
          exp: Math.floor(Date.now() / 1000) + 300,
          code: 'jarm-code-1',
          state: 'same',
          ...extra,
        }),
      ),
    );
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.privateKey,
      enc.encode(`${head}.${body}`),
    );
    return { jwt: `${head}.${body}.${b64url(signature)}`, head, body };
  }

  function primed() {
    sessionStorage.setItem('oauth_state', 'same');
    sessionStorage.setItem('pkce_code_verifier', 'v1');
    sessionStorage.setItem('authz_client_id', 'fapi-client-1');
  }

  it('inspects it after a successful exchange', async () => {
    vi.spyOn(tokenService, 'exchangeCodeForToken').mockResolvedValue({ access_token: 'at-1' });
    primed();
    const { jwt } = await signed();
    at(`?response=${encodeURIComponent(jwt)}`);

    expect(await screen.findByText(/signed authorization response \(JARM\)/i)).toBeInTheDocument();
    // The inspector's own header row, which is what distinguishes it from a raw string dump. `All`,
    // because the algorithm shows in both the header table and the signature row.
    expect((await screen.findAllByText(/ES256/)).length).toBeGreaterThan(0);
    // The claims are open, not behind a disclosure triangle — see `defaultOpen` at the call site.
    expect(screen.getAllByText(/jarm-code-1/).length).toBeGreaterThan(0);
  });

  it('inspects it when verification failed, which is the case with most to read', async () => {
    primed();
    const { jwt, head } = await signed();
    const forged = [
      head,
      b64url(
        enc.encode(
          JSON.stringify({
            iss: AS_ISSUER,
            aud: 'fapi-client-1',
            exp: Math.floor(Date.now() / 1000) + 300,
            code: 'attacker-code',
            state: 'same',
          }),
        ),
      ),
      jwt.split('.')[2],
    ].join('.');
    at(`?response=${encodeURIComponent(forged)}`);

    await screen.findByText(/signature was not verified/i);
    // The token is on screen beside the refusal, not swallowed by it.
    expect(screen.getByText(/signed authorization response \(JARM\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/attacker-code/).length).toBeGreaterThan(0);
  });

  it('shows nothing of the sort for an ordinary query-string callback', async () => {
    vi.spyOn(tokenService, 'exchangeCodeForToken').mockResolvedValue({ access_token: 'at-1' });
    sessionStorage.setItem('oauth_state', 'same');
    sessionStorage.setItem('pkce_code_verifier', 'v1');
    at('?code=abc&state=same');

    await screen.findByText(/Successfully obtained tokens/i);
    expect(screen.queryByText(/signed authorization response \(JARM\)/i)).not.toBeInTheDocument();
  });
});

/**
 * **The way out of a page that has no nav.**
 *
 * `/callback` is registered outside `AppLayout` (`App.tsx`), so it renders with no sidebar and no
 * links, and its only exit went to `/`. Four sections leave through `navigateTo` — Grant Flows, PAR,
 * RAR and the FAPI wizard — so completing any flow dropped the reader on the dashboard to find their
 * place again. For the FAPI wizard it was worse than friction: step 3 is *after* the redirect, so the
 * final step of the flow was effectively unreachable.
 */
describe('returning to where the flow started', () => {
  function primed() {
    sessionStorage.setItem('oauth_state', 'same');
    sessionStorage.setItem('pkce_code_verifier', 'v1');
  }

  it('offers the stored path, and keeps the dashboard as a second exit', async () => {
    vi.spyOn(tokenService, 'exchangeCodeForToken').mockResolvedValue({ access_token: 'at-1' });
    primed();
    sessionStorage.setItem('return_to', '/fapi#fapi-step-3');
    at('?code=abc&state=same');

    expect(
      await screen.findByRole('button', { name: /Back to.*\/fapi#fapi-step-3/i }),
    ).toBeInTheDocument();
    // Replacing one exit with another exit is not an improvement on a page that is a dead end.
    expect(screen.getByRole('button', { name: /^Dashboard$/i })).toBeInTheDocument();
  });

  it('falls back to the dashboard when nothing was stored', async () => {
    vi.spyOn(tokenService, 'exchangeCodeForToken').mockResolvedValue({ access_token: 'at-1' });
    primed();
    at('?code=abc&state=same');

    expect(await screen.findByRole('button', { name: /Return to Dashboard/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Back to/i })).not.toBeInTheDocument();
  });

  /**
   * `sessionStorage` is writable by anything on the origin and this value is handed to `navigate()`.
   * A **protocol-relative** `//evil.example` is a URL, not a path — the exact shape that made
   * `post_logout_redirect_uri` matching an open redirect on the server twice.
   */
  it.each([
    ['protocol-relative', '//evil.example/callback'],
    ['absolute', 'https://evil.example/callback'],
    ['schemeless relative', 'evil'],
  ])('refuses a return path that is not an internal path — %s', async (_label, value) => {
    vi.spyOn(tokenService, 'exchangeCodeForToken').mockResolvedValue({ access_token: 'at-1' });
    primed();
    sessionStorage.setItem('return_to', value);
    at('?code=abc&state=same');

    await screen.findByRole('button', { name: /Return to Dashboard/i });
    expect(screen.queryByRole('button', { name: /Back to/i })).not.toBeInTheDocument();
  });
});
