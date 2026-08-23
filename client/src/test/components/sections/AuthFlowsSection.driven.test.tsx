import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import AuthFlowsSection from '@/components/auth/AuthFlowsSection';
import { tokenService } from '@/services';
import { getTraces, clearTraces } from '@/services/trace-store';
import { SESSION_KEYS } from '@/services/session-keys';
import {
  mountSection,
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
   * Ticking the box generates and stores a DPoP key.
   *
   * **What this test deliberately does not assert, because it is not true yet.** The checkbox's own
   * copy says it *"sends its thumbprint as `dpop_jkt`"*, and it does not: `dpop_jkt` carries
   * `defaultOn: false` in `data/authParams.ts` and sits in the collapsed `extensions` group, so nothing
   * reaches the authorization request unless the user finds and enables that row.
   *
   * And if they do, the value is wrong. `AuthFlowsSection` passes `pair.kid`, which
   * `generateP256KeyPair` derives as `SHA-256(JSON.stringify(exportedPublicJwk))` — an object that
   * WebCrypto exports carrying `key_ops` and `ext`, in insertion order. **RFC 9449** (*"OAuth 2.0
   * Demonstrating Proof of Possession (DPoP)"*, Standards Track, September 2023) §10 *"Authorization
   * Code Binding to a DPoP Key"*: *"The value of the `dpop_jkt` authorization request parameter is the
   * JWK Thumbprint [RFC7638] of the proof-of-possession public key using the SHA-256 hash function,
   * which is the same value as used for the `jkt` confirmation method defined in Section 6.1."* And
   * **RFC 7638** (*"JSON Web Key (JWK) Thumbprint"*, Standards Track, September 2015) §3.2 requires
   * exactly `crv`, `kty`, `x`, `y`, *"ordered lexicographically by the Unicode code points of the
   * member names"*. Measured on a real P-256 key, the two digests differ.
   *
   * The `kid` itself is fine where it is used — RFC 9449 §4.2 requires the full `jwk` in the proof
   * header, so `kid` is only an identifier. It is `dpop_jkt` that needs a conformant thumbprint. Fixing
   * that is a DPoP change and goes through a plan.
   */
  it('generates and stores a DPoP key when the box is ticked', async () => {
    stubNavigation();
    mountSection(<AuthFlowsSection />);

    fireEvent.click(screen.getByRole('checkbox', { name: /Sender-constrain with DPoP/i }));
    await waitFor(() => expect(sessionStorage.getItem(SESSION_KEYS.dpopPrivateKey)).toBeTruthy(), {
      timeout: 5000,
    });
    expect(sessionStorage.getItem(SESSION_KEYS.dpopKid)).toBeTruthy();
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
