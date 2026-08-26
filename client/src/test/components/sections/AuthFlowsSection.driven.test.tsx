import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import AuthFlowsSection from '@/components/auth/AuthFlowsSection';
import { tokenService } from '@/services';
import { getTraces, clearTraces } from '@/services/trace-store';
import { SESSION_KEYS } from '@/services/session-keys';
import { jwkThumbprint, type JWK } from '@/services/crypto-utils';
import {
  mountSection,
  mountSectionAt,
  seedTokens,
  fill,
  press,
  selectOp,
  stubNavigation,
  expectCall,
  expectReadsBack,
  resetSectionState,
} from '@/test/helpers/drive-section';

/**
 * Grant Flows — the headline section, and the one where the client-authentication rule is subtlest.
 *
 * **A public client authenticates with nothing, and "nothing" means the parameter is absent.** The
 * SPA's own client `4277838306` is public with `tokenAuthMethod: NONE`, and Authlete refuses *any*
 * client-authentication data for such a client with `[A157303]`. `clientCredentials`, `passwordGrant`
 * and `refreshToken` sent `Authorization: Basic` **unconditionally** — so Refresh Token failed for the
 * same reason the code exchange did. They share `postWithOptionalBasic` now, matching what
 * `jwtBearerGrant` and `revocation` always did.
 *
 * The boundary was **measured, not reasoned**, at the live token endpoint on 2026-08-22: an *empty*
 * `client_secret` passes client authentication and an absent one does too, while the placeholder
 * `your_client_secret` and the literal string `"undefined"` are both refused. Omission is what the code
 * sends, because RFC 6749 §2.3.1 describes a public client as presenting no credentials and *"the
 * vendor tolerates an empty parameter"* is undocumented behaviour to depend on.
 *
 * These tests spy on the service, so they assert *section → service*: does the section pass a secret it
 * does not have? The `Authorization` header itself belongs to `token.service.test.ts`, which mocks
 * `fetch`. Both halves have to exist — the 2026-08-22 outage had both broken at once.
 */

beforeEach(() => {
  resetSectionState();
  clearTraces();
});
afterEach(cleanup);

/**
 * Wait for the builder to finish minting `state`, `nonce` and the PKCE pair.
 *
 * It does that in a mount effect, so a test that reads the URL immediately compares a request with no
 * `code_challenge` in it — and would pass while proving nothing about the parameter that matters most.
 */
async function builderReady(): Promise<URL> {
  let url!: URL;
  await waitFor(() => {
    url = new URL(screen.getByText(/\/api\/authorization\?/).textContent!.trim());
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
  });
  return url;
}

const TOKENS = {
  access_token: 'at-driven-01',
  token_type: 'Bearer',
  expires_in: 3600,
  scope: 'openid profile',
  refresh_token: 'rt-driven-01',
};

describe('AuthFlowsSection — client authentication that matches the client', () => {
  it('sends no secret for a public client, rather than an empty or placeholder one', async () => {
    const spy = vi.spyOn(tokenService, 'clientCredentials').mockResolvedValue(TOKENS);
    mountSection(<AuthFlowsSection />);
    await selectOp(/Client Credentials/i);

    fill(/^Client ID$/i, '4277838306');
    fill(/^Client Secret$/i, '');
    press(/Request Token|Get Token|Exchange/i);

    const [clientId, clientSecret] = (await expectCall(spy, 'the client-credentials button')) as [
      string,
      string,
    ];
    expect(clientId).toBe('4277838306');
    // `postWithOptionalBasic` branches on truthiness, so an empty string is what "send no header"
    // looks like at this boundary. What must never happen is a placeholder arriving as a credential.
    expect(clientSecret).toBe('');
    expect(clientSecret).not.toBe('your_client_secret');
  });

  it('sends the secret for a confidential client', async () => {
    const spy = vi.spyOn(tokenService, 'clientCredentials').mockResolvedValue(TOKENS);
    mountSection(<AuthFlowsSection />);
    await selectOp(/Client Credentials/i);

    fill(/^Client ID$/i, '1523514379');
    fill(/^Client Secret$/i, 'real-secret');
    fill(/^Scope$/i, 'openid profile');
    press(/Request Token|Get Token|Exchange/i);

    const args = (await expectCall(spy, 'the client-credentials button')) as string[];
    expect(args).toEqual(['1523514379', 'real-secret', 'openid profile']);
  });

  /**
   * Refresh Token is the one the 2026-08-22 probe caught in the wild: it sent Basic unconditionally,
   * so a public client's refresh earned `[A157303]` exactly as its code exchange had.
   */
  it('refreshes without a secret when there is none', async () => {
    const spy = vi.spyOn(tokenService, 'refreshToken').mockResolvedValue(TOKENS);
    mountSection(<AuthFlowsSection />);
    await selectOp(/Refresh Token/i);

    // Anchored: the unanchored form also matches the tab that was just clicked.
    fill(/^Refresh Token$/i, 'rt-abc');
    fill(/^Client ID$/i, '4277838306');
    press(/Refresh|Request Token|Get Token/i);

    const [token, clientId, clientSecret] = (await expectCall(spy, 'the refresh button')) as [
      string,
      string,
      string,
    ];
    expect(token).toBe('rt-abc');
    expect(clientId).toBe('4277838306');
    expect(clientSecret, 'sending Basic here is what earned [A157303] on the deployment').toBe('');
  });

  /**
   * The refresh token from an earlier grant is offered rather than retyped.
   *
   * Pinned because a mutation found it unpinned: emptying the initial value left every test green, since
   * the tests above all type a token in by hand. It is a convenience rather than a security property,
   * but it is the one piece of state in these four panels that comes from *outside* them — so it is the
   * one a refactor can drop without anything noticing, and this refactor moved it behind a prop.
   */
  it('offers the refresh token already held, so it need not be retyped', async () => {
    seedTokens({ refresh_token: 'rt-from-an-earlier-grant' });
    mountSection(<AuthFlowsSection />);
    await selectOp(/Refresh Token/i);

    expect(screen.getByLabelText(/^Refresh Token$/i)).toHaveValue('rt-from-an-earlier-grant');
  });

  it('carries the credentials the user typed on the password grant', async () => {
    const spy = vi.spyOn(tokenService, 'passwordGrant').mockResolvedValue(TOKENS);
    mountSection(<AuthFlowsSection />);
    await selectOp(/Password \(ROPC\)/i);

    fill(/^Username$/i, 'admin');
    fill(/^Password$/i, 'password');
    fill(/^Client ID$/i, '1523514379');
    fill(/^Client Secret$/i, 'real-secret');
    press(/Request Token|Get Token|Exchange/i);

    const args = (await expectCall(spy, 'the password-grant button')) as string[];
    // Order matters and is easy to transpose — username/password before the client pair.
    expect(args.slice(0, 4)).toEqual(['admin', 'password', '1523514379', 'real-secret']);
  });

  it('sends the assertion on the JWT bearer grant', async () => {
    const spy = vi.spyOn(tokenService, 'jwtBearerGrant').mockResolvedValue(TOKENS);
    mountSection(<AuthFlowsSection />);
    await selectOp(/JWT Bearer/i);

    fill(/Signed JWT Assertion/i, 'eyJhbGciOiJSUzI1NiJ9.e30.sig');
    press(/Request Token|Get Token|Exchange/i);

    const [assertion] = (await expectCall(spy, 'the JWT bearer button')) as [string];
    expect(assertion).toBe('eyJhbGciOiJSUzI1NiJ9.e30.sig');
  });

  it('stores the tokens it received, so the rest of the app can use them', async () => {
    vi.spyOn(tokenService, 'clientCredentials').mockResolvedValue(TOKENS);
    mountSection(<AuthFlowsSection />);
    await selectOp(/Client Credentials/i);
    fill(/^Client ID$/i, '1523514379');
    fill(/^Client Secret$/i, 'real-secret');
    press(/Request Token|Get Token|Exchange/i);

    await expectReadsBack(/at-driven-01/, 'the access token in the response pane');
    await waitFor(() =>
      expect(sessionStorage.getItem(SESSION_KEYS.tokenResponse)).toContain('at-driven-01'),
    );
  });

  /**
   * **An emptied secret field must remove the stored one, not leave the last run's behind.**
   *
   * With the old `if (secret) writeKey(...)` and no else branch, running once with a confidential
   * client and then clearing the field meant `CallbackPage` still read a secret and sent `client_secret`
   * for a client whose method is `none` — refused with `[A157303]`, while the field the user was
   * looking at was empty. Absence has to be written down to be absent.
   */
  it('clears the stored secret when the field is emptied', async () => {
    vi.spyOn(tokenService, 'clientCredentials').mockResolvedValue(TOKENS);
    mountSection(<AuthFlowsSection />);
    await selectOp(/Client Credentials/i);

    fill(/^Client ID$/i, '1523514379');
    fill(/^Client Secret$/i, 'real-secret');
    press(/Request Token|Get Token|Exchange/i);
    await waitFor(() =>
      expect(sessionStorage.getItem(SESSION_KEYS.activeClientSecret)).toBe('real-secret'),
    );

    fill(/^Client Secret$/i, '');
    press(/Request Token|Get Token|Exchange/i);
    await waitFor(() =>
      expect(
        sessionStorage.getItem(SESSION_KEYS.activeClientSecret),
        'the previous run’s secret survived an emptied field',
      ).toBeNull(),
    );
  });
});

describe('AuthFlowsSection — the selected grant is addressable', () => {
  /**
   * **`?op=` was on nine sections and not on the headline one.**
   *
   * The tab a person wants to send you a link to is *"the refresh-token flow"*, and Grant Flows was the
   * last `TabBar` in the app still holding its selection in `useState`. These three tests are the first
   * in the suite to assert the *wiring* rather than the hook: `useUrlState.test.tsx` drives the hook
   * against its own harness, which cannot see a section reading the wrong key or never writing back.
   */
  it('opens the tab named in the URL', () => {
    mountSectionAt(<AuthFlowsSection />, '/auth-flows?op=refresh_token');

    expect(screen.getByRole('tab', { name: /Refresh Token/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByLabelText(/^Refresh Token$/i)).toBeInTheDocument();
  });

  it('writes the tab back to the URL, so the link is the state', async () => {
    const view = mountSectionAt(<AuthFlowsSection />, '/auth-flows');
    await selectOp(/Password \(ROPC\)/i);

    expect(new URLSearchParams(view.search()).get('op')).toBe('password');
  });

  /**
   * A hand-edited query must not be trusted: `flowSteps[grantType]` is indexed with this value, so an
   * unvalidated one renders a diagram from `undefined`.
   */
  it('falls back to the authorization-code tab on a value that does not exist', () => {
    mountSectionAt(<AuthFlowsSection />, '/auth-flows?op=not_a_grant');

    expect(screen.getByRole('tab', { name: /Auth Code \(PKCE\)/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

describe('AuthFlowsSection — the authorization request', () => {
  /**
   * **The URL the builder shows is the URL it navigates to.** A separately-assembled preview drifted
   * from the real request — it omitted `state`, `nonce` and `code_challenge`, so it showed an
   * approximation and never the request. This asserts the two are the same string.
   */
  it('navigates to exactly the URL it displays', async () => {
    const nav = stubNavigation();
    mountSection(<AuthFlowsSection />);

    await builderReady();
    const displayed = screen.getByText(/\/api\/authorization\?/).textContent!.trim();

    press(/Send authorization request/i);
    await waitFor(() => expect(nav.href).not.toBe(''));
    expect(
      nav.href,
      'the preview drifting from the request is how three parameters went missing',
    ).toBe(displayed);
  });

  it('stores the verifier and state the builder generated, not fresh ones', async () => {
    stubNavigation();
    mountSection(<AuthFlowsSection />);

    const url = await builderReady();
    const challengeShown = url.searchParams.get('code_challenge');
    const stateShown = url.searchParams.get('state');

    press(/Send authorization request/i);

    await waitFor(() => expect(sessionStorage.getItem(SESSION_KEYS.pkceVerifier)).toBeTruthy());
    // Regenerating a verifier here would guarantee a mismatch with the challenge in the URL.
    expect(sessionStorage.getItem(SESSION_KEYS.oauthState)).toBe(stateShown);
    expect(challengeShown, 'PKCE S256 is required on this client').toBeTruthy();
  });

  /**
   * **The authorization-code path has its own stored secret, and its own else branch.**
   *
   * Two keys, two writers, one lesson learned twice: `saveClientCredentials` writes
   * `activeClientSecret` after a back-channel grant, and `sendAuthorizeRequest` writes
   * `authzClientSecret` before the redirect. The test above covers the first. A mutation found the
   * second unpinned — deleting `else removeKey(SESSION_KEYS.authzClientSecret)` left every test green.
   *
   * That is the more dangerous of the two. `CallbackPage` reads
   * `readKey(authzClientSecret) || CLIENT_SECRET`, so a stale secret makes the *code exchange* send
   * `client_secret` for a client whose method is `none` — refused with `[A157303]` — while the field the
   * user is looking at is empty. Absence has to be written down to be absent.
   */
  it('clears the stored authorization-code secret when that field is emptied', async () => {
    stubNavigation();
    mountSection(<AuthFlowsSection />);
    await builderReady();

    fill(/^Client Secret$/i, 'confidential-secret');
    press(/Send authorization request/i);
    await waitFor(() =>
      expect(sessionStorage.getItem(SESSION_KEYS.authzClientSecret)).toBe('confidential-secret'),
    );

    fill(/^Client Secret$/i, '');
    press(/Send authorization request/i);
    await waitFor(() =>
      expect(
        sessionStorage.getItem(SESSION_KEYS.authzClientSecret),
        'CallbackPage would send this secret for a client whose method is none',
      ).toBeNull(),
    );
  });

  /**
   * The front-channel hop, which no `fetch` interceptor can observe. `recordNavigation` exists for
   * exactly this, and without it the single most important request in OAuth never entered the trace.
   */
  it('records the outbound hop so the trace and the sequence view can show it', async () => {
    stubNavigation();
    mountSection(<AuthFlowsSection />);
    await builderReady();
    press(/Send authorization request/i);

    await waitFor(() => {
      const hop = getTraces().find((t) => t.navigation && t.url.includes('/api/authorization'));
      expect(hop, 'the browser left and nothing recorded it').toBeDefined();
      expect(hop!.direction).toBe('outbound');
    });
  });

  /**
   * A stored FAPI signing key silently rewires the exchange to `private_key_jwt` — the section warns
   * rather than leaving the mode invisible, because for a public client that is `[A157303]` again and
   * the cause is two sections away.
   */
  it('warns when a stored signing key will rewire the exchange', async () => {
    sessionStorage.setItem(SESSION_KEYS.fapiSigningKey, JSON.stringify({ kty: 'EC', d: 'x' }));
    mountSection(<AuthFlowsSection />);

    expect(await screen.findByText(/FAPI signing key/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Forget the signing key/i })).toBeEnabled();
  });

  it('lets the signing key be forgotten, so the invisible mode is escapable', async () => {
    sessionStorage.setItem(SESSION_KEYS.fapiSigningKey, JSON.stringify({ kty: 'EC', d: 'x' }));
    mountSection(<AuthFlowsSection />);

    press(/Forget the signing key/i);
    await waitFor(() => expect(sessionStorage.getItem(SESSION_KEYS.fapiSigningKey)).toBeNull());
  });

  /**
   * **RFC 9449 §10, end to end: tick the box and a conformant `dpop_jkt` reaches the request.**
   *
   * Neither half of that sentence used to be true. `dpop_jkt` is `defaultOn: false` and sits in the
   * collapsed `extensions` group, so nothing was sent — while the checkbox's own copy said it
   * *"sends its thumbprint as `dpop_jkt`"*. And the value it would have sent was `pair.kid`, the digest
   * of `JSON.stringify(exportedPublicJwk)`, an object WebCrypto exports carrying `key_ops` and `ext` in
   * insertion order. §10 requires the RFC 7638 thumbprint and makes a mismatch a **MUST reject** at the
   * token endpoint, so the two faults were masking each other: wrong value, never sent.
   */
  it('puts a dpop_jkt in the authorization request when DPoP is enabled', async () => {
    stubNavigation();
    mountSection(<AuthFlowsSection />);
    await builderReady();

    fireEvent.click(screen.getByRole('checkbox', { name: /Sender-constrain with DPoP/i }));

    await waitFor(
      async () => {
        const url = new URL(screen.getByText(/\/api\/authorization\?/).textContent!.trim());
        const sent = url.searchParams.get('dpop_jkt');
        expect(sent, 'the checkbox says it sends this; it has to actually send it').toBeTruthy();
      },
      { timeout: 5000 },
    );
  });

  /**
   * And it is the **thumbprint**, not the `kid` — the assertion the whole change exists for.
   *
   * Both are base64url SHA-256 digests of "the key", which is why substituting one for the other reads
   * as correct. This recomputes RFC 7638 from the stored public key and demands the request carry that,
   * and explicitly demands it does *not* carry `dpop_kid`.
   */
  it('sends the RFC 7638 thumbprint, not the key id, which are different values', async () => {
    stubNavigation();
    mountSection(<AuthFlowsSection />);
    await builderReady();

    fireEvent.click(screen.getByRole('checkbox', { name: /Sender-constrain with DPoP/i }));
    await waitFor(() => expect(sessionStorage.getItem(SESSION_KEYS.dpopPublicKey)).toBeTruthy(), {
      timeout: 5000,
    });

    const publicKey = JSON.parse(sessionStorage.getItem(SESSION_KEYS.dpopPublicKey)!) as JWK;
    const expected = await jwkThumbprint(publicKey);
    const kid = sessionStorage.getItem(SESSION_KEYS.dpopKid);

    await waitFor(async () => {
      const url = new URL(screen.getByText(/\/api\/authorization\?/).textContent!.trim());
      expect(url.searchParams.get('dpop_jkt')).toBe(expected);
    });
    // The guard against a silent regression to the old behaviour. If these two ever coincide, the key
    // generator has changed and `crypto-utils.thumbprint.test.ts` will say so first.
    expect(kid, 'a kid is still stored, and is still not a thumbprint').not.toBe(expected);
  });

  it('removes dpop_jkt again when DPoP is turned off', async () => {
    stubNavigation();
    mountSection(<AuthFlowsSection />);
    await builderReady();
    const box = screen.getByRole('checkbox', { name: /Sender-constrain with DPoP/i });

    fireEvent.click(box);
    await waitFor(
      () => {
        const url = new URL(screen.getByText(/\/api\/authorization\?/).textContent!.trim());
        expect(url.searchParams.get('dpop_jkt')).toBeTruthy();
      },
      { timeout: 5000 },
    );

    fireEvent.click(box);
    await waitFor(() => {
      const url = new URL(screen.getByText(/\/api\/authorization\?/).textContent!.trim());
      expect(url.searchParams.get('dpop_jkt'), 'a stale binding is worse than none').toBeNull();
    });
  });

  it('clears the key and the cached nonce when the box is unticked', async () => {
    stubNavigation();
    mountSection(<AuthFlowsSection />);
    const box = screen.getByRole('checkbox', { name: /Sender-constrain with DPoP/i });

    fireEvent.click(box);
    await waitFor(() => expect(sessionStorage.getItem(SESSION_KEYS.dpopPrivateKey)).toBeTruthy(), {
      timeout: 5000,
    });

    fireEvent.click(box);
    // A nonce is bound to the key that was proving possession, so keeping it past that key can only
    // mislead the next request.
    await waitFor(() => expect(sessionStorage.getItem(SESSION_KEYS.dpopPrivateKey)).toBeNull());
    expect(sessionStorage.getItem(SESSION_KEYS.dpopNonce)).toBeNull();
  });

  /**
   * **Switching tabs must not discard the other tab's state — and must not untick DPoP.**
   *
   * This is the reason the two panels are rendered *unconditionally* and each returns `null` when it is
   * not the selected grant, rather than being mounted conditionally. The single 710-line component did
   * this implicitly, because all 24 pieces of state lived in one component instance and a hidden branch
   * simply did not render.
   *
   * Both tests below were written because a mutation proved the claim unenforced: replacing the panel
   * with `{grantType === 'authorization_code' && <AuthorizationCodePanel active />}` left every test
   * green while silently recreating the invisible-mode class of bug this section keeps producing — a key
   * sitting in `sessionStorage` with the checkbox that describes it showing unticked.
   */
  it('keeps what was typed on one tab while another is visited', async () => {
    stubNavigation();
    mountSection(<AuthFlowsSection />);
    await builderReady();

    fill(/^Client ID$/i, 'ac-typed-by-hand');
    await selectOp(/Client Credentials/i);
    // The visible Client ID is now the client-credentials one, still at its own default.
    expect(screen.getByLabelText(/^Client ID$/i)).not.toHaveValue('ac-typed-by-hand');

    await selectOp(/Auth Code \(PKCE\)/i);
    expect(screen.getByLabelText(/^Client ID$/i)).toHaveValue('ac-typed-by-hand');

    // The same claim in the other direction: the four back-channel forms share one component, and a
    // `key={grantType}` on it would remount them on every tab click. Typing a password, stepping away
    // and coming back is the cheapest thing that notices.
    await selectOp(/Password \(ROPC\)/i);
    fill(/^Username$/i, 'typed-once');
    await selectOp(/Refresh Token/i);
    await selectOp(/Password \(ROPC\)/i);
    expect(screen.getByLabelText(/^Username$/i)).toHaveValue('typed-once');
  });

  it('does not untick DPoP behind a key that is still in the session', async () => {
    stubNavigation();
    mountSection(<AuthFlowsSection />);
    await builderReady();

    fireEvent.click(screen.getByRole('checkbox', { name: /Sender-constrain with DPoP/i }));
    await waitFor(() => expect(sessionStorage.getItem(SESSION_KEYS.dpopPrivateKey)).toBeTruthy(), {
      timeout: 5000,
    });

    await selectOp(/Client Credentials/i);
    await selectOp(/Auth Code \(PKCE\)/i);

    expect(sessionStorage.getItem(SESSION_KEYS.dpopPrivateKey)).toBeTruthy();
    expect(
      screen.getByRole('checkbox', { name: /Sender-constrain with DPoP/i }),
      'the key is still in session storage; an unticked box describes a state this session is not in',
    ).toBeChecked();
  });

  it('explains a refusal instead of printing it raw', async () => {
    vi.spyOn(tokenService, 'clientCredentials').mockRejectedValue(
      new Error('{"error":"invalid_client","error_description":"[A157303] public client."}'),
    );
    mountSection(<AuthFlowsSection />);
    await selectOp(/Client Credentials/i);
    fill(/^Client ID$/i, '4277838306');
    press(/Request Token|Get Token|Exchange/i);

    expect(await screen.findByText(/What does this mean\?|Hide explanation/i)).toBeInTheDocument();
    expect(screen.getAllByText(/A157303/)).toHaveLength(2);
  });
});
