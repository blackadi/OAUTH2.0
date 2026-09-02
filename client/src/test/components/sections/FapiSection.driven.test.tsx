import { screen, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FapiSection } from '@/components/fapi/FapiSection';
import { fapiService, parService } from '@/services';
import { getTraces, clearTraces } from '@/services/trace-store';
import { SESSION_KEYS } from '@/services/session-keys';
import {
  mountSection,
  press,
  stubNavigation,
  expectCall,
  expectReadsBack,
  resetSectionState,
  seedTokens,
  seedDpopKey,
  seedFapiSigningKey,
} from '@/test/helpers/drive-section';
import { tokenService } from '@/services';
import { generateKeyPair } from '@/services/dpop.service';

/**
 * The FAPI 2.0 wizard — where the third dead-flow class was found, and where **no component test
 * existed at all** until this file. The audit's own words: the guards there are the compiler and the
 * service tests, which is worth knowing before trusting a green suite about them.
 *
 * The regression: T1-11 made `POST /api/par` answer RFC 9126 §2.2's body, whose members are
 * `request_uri` and `expires_in`. The wizard held an inline `{ requestUri?: string }` and cast to it, so
 * `requestUri` became permanently `undefined` — and step 2's handler opens with an early return on it.
 * The button was **enabled and inert**: no redirect, no error, while the panel directly above displayed
 * the `request_uri` it refused to use.
 *
 * A request assertion cannot see that. The only way is to hand the section a realistic response and
 * check that a value from it reaches the next step — which is why `stubNavigation` exists.
 */

beforeEach(() => {
  resetSectionState();
  clearTraces();
});
afterEach(cleanup);

/**
 * Decode a JWS segment. The FAPI wizard now signs its authorization parameters into a request
 * object, so asserting on them means opening the JWT rather than reading a form field.
 */
const decodeB64Url = (segment: string): string =>
  new TextDecoder().decode(
    Uint8Array.from(atob(segment.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0)),
  );

/** `GET /api/fapi/config`, read live from the Authlete service — the live values on this deployment. */
const CONFIG = {
  mode: 'disabled',
  dpopEnabled: false,
  supportedTokenAuthMethods: [
    'NONE',
    'CLIENT_SECRET_BASIC',
    'CLIENT_SECRET_POST',
    'CLIENT_SECRET_JWT',
    'PRIVATE_KEY_JWT',
  ],
  certificateBoundAccessTokens: false,
  parRequired: false,
  pkceRequired: false,
  refreshTokenRotation: false,
  scopeRequired: true,
  cimdSupported: true,
};

/**
 * **RFC 9126 §2.2's body, which is the whole point.** Writing `requestUri` here would make this file
 * agree with the bug rather than catch it, so the fixture is snake_case exactly as the server answers.
 */
const PAR_201 = {
  expires_in: 600,
  request_uri: 'urn:ietf:params:oauth:request_uri:driven-test-01',
};

/**
 * Get the wizard to the state where PAR can fire.
 *
 * Real key generation, not a mock: `private_key_jwt` and DPoP are the two things a FAPI 2.0 profile
 * *is*, and a test that mocked them would pass against a wizard that signed nothing.
 */
async function generateBothKeys(): Promise<void> {
  press(/Generate Client Auth Key/i);
  await waitFor(
    () =>
      expect(
        (screen.getByLabelText(/Client Auth Public Key \(JWK Set\)/i) as HTMLTextAreaElement).value,
      ).not.toBe(''),
    { timeout: 5000 },
  );
  // Anchored: `/Generate DPoP Key/i` also matches the standalone "Generate DPoP Key Pair (ES256)"
  // button in the DPoP Key Utilities card above the wizard.
  press(/^Generate DPoP Key$/i);
  await screen.findByText(/DPoP Public Key \(JWK\)/i, undefined, { timeout: 5000 });
}

describe('FapiSection — the config panel', () => {
  it('renders the live values rather than the six that used to be hardcoded', async () => {
    vi.spyOn(fapiService, 'getConfig').mockResolvedValue(CONFIG);
    mountSection(<FapiSection />);

    press(/Fetch Config/i);

    // Six fields were hardcoded server-side and every one was the opposite of the live configuration,
    // on the endpoint whose entire job is reporting the posture. `PRIVATE_KEY_JWT` is the one this
    // wizard depends on being advertised.
    await expectReadsBack(/PRIVATE_KEY_JWT/, 'the advertised client-authentication methods');
  });

  /**
   * `disabled` and `unknown` are deliberately distinct: the first means no mode is set, the second
   * means one is set that the server does not recognise. Collapsing them asserts a posture nobody
   * checked, which is FAPI2-W1's hardcoded-literal defect one layer down.
   */
  it('does not report an unrecognised FAPI mode as switched off', async () => {
    vi.spyOn(fapiService, 'getConfig').mockResolvedValue({ ...CONFIG, mode: 'unknown' });
    mountSection(<FapiSection />);
    press(/Fetch Config/i);

    expect(await screen.findByText(/FAPI mode unrecognised/i)).toBeInTheDocument();
    expect(screen.queryByText(/FAPI Disabled/i)).not.toBeInTheDocument();
  });
});

describe('FapiSection — the test flow wizard', () => {
  it('holds step 1 closed until both keys exist, because a FAPI 2.0 PAR needs both', async () => {
    mountSection(<FapiSection />);
    expect(screen.getByRole('button', { name: /Push PAR/i })).toBeDisabled();

    await generateBothKeys();
    expect(screen.getByRole('button', { name: /Push PAR/i })).toBeEnabled();
  });

  it('pushes a SIGNED REQUEST OBJECT carrying private_key_jwt, PKCE S256 and a state', async () => {
    const spy = vi
      .spyOn(parService, 'pushedAuthorizationWithDpop')
      .mockResolvedValue({ data: PAR_201 });
    mountSection(<FapiSection />);
    await generateBothKeys();

    press(/Push PAR/i);
    const args = await expectCall(spy, 'the Push PAR button');

    const [body, proofFactory] = args as [{ parameters: string }, unknown];
    const params = new URLSearchParams(body.parameters);

    // FAPI 2.0 §5.3.1.2 permits mTLS or `private_key_jwt`; this deployment has no mTLS, so the
    // assertion is the client authentication and its absence is a 401. It stays OUTSIDE the request
    // object on purpose: it authenticates the PAR call itself and is not part of the authorization
    // request being signed.
    expect(params.get('client_assertion_type')).toBe(
      'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    );
    expect(params.get('client_assertion'), 'the signed assertion is the credential').toBeTruthy();

    // The Message Signing Profile carries the authorization parameters as a signed request object
    // (JAR, RFC 9101), so they now sit one layer in. This assertion used to read them off the
    // top-level form, which is exactly the shape Authlete refuses with `400 invalid_request` once
    // the client sets `requestObjectRequired` or the scope carries `fapi2: ms-authreq`.
    const requestObject = params.get('request');
    expect(requestObject, 'Message Signing requires a signed request object').toBeTruthy();
    // `client_id` is the one parameter that appears in BOTH places — RFC 9126 §3 needs the outer
    // copy to find the client and its keys before it can verify the inner one.
    expect(params.get('client_id'), 'RFC 9126 §3 needs client_id outside the JWT').toBeTruthy();

    const [rawHeader, rawPayload] = requestObject!.split('.');
    // Annotated because `JSON.parse` returns `any`, and the lint config rejects member access on it.
    const header = JSON.parse(decodeB64Url(rawHeader)) as Record<string, unknown>;
    const claims = JSON.parse(decodeB64Url(rawPayload)) as Record<string, unknown>;

    // FAPI 2.0 §5.4.1 permits PS256, ES256 and EdDSA, and forbids `none` outright.
    expect(header.alg).toBe('ES256');
    expect(header.typ, 'RFC 9101 §4 names this media type').toBe('oauth-authz-req+jwt');

    expect(claims.code_challenge_method).toBe('S256');
    expect(claims.code_challenge).toBeTruthy();
    expect(claims.state, 'RFC 9207 mix-up defence needs one').toBeTruthy();
    expect(claims.response_type).toBe('code');
    expect(claims.nbf, 'the service sets nbfOptional: false').toBeTruthy();

    /**
     * **The regression this assertion exists for.** `myscope` carries `fapi2: ms-authres`, so the
     * authorization *response* must be a signed JWT and the request has to ask for it. Without this
     * claim Authlete defaults to `response_mode=query`, refuses it, and error-redirects with
     * `[A309301] The value of 'response_mode' must be 'jwt'.` — which is a *front-channel* failure,
     * so it produces no rejected request, no console error and no trace row on the page that sent
     * it. Nothing in the suite could see it; the wizard simply never got past step 2.
     */
    expect(claims.response_mode, 'the `fapi2: ms-authres` attribute makes JARM mandatory').toBe(
      'jwt',
    );

    // A proof **factory**, not a proof: `dpopRequest` re-signs on a `use_dpop_nonce` refusal and the
    // nonce lives inside the signature, so a finished string could never be retried.
    expect(typeof proofFactory).toBe('function');
  });

  it('stores the PKCE verifier and state, or the callback cannot complete the exchange', async () => {
    vi.spyOn(parService, 'pushedAuthorizationWithDpop').mockResolvedValue({ data: PAR_201 });
    mountSection(<FapiSection />);
    await generateBothKeys();
    press(/Push PAR/i);

    await waitFor(() => expect(sessionStorage.getItem(SESSION_KEYS.pkceVerifier)).toBeTruthy());
    expect(sessionStorage.getItem(SESSION_KEYS.oauthState)).toBeTruthy();
  });

  it('renders the request_uri the server returned', async () => {
    vi.spyOn(parService, 'pushedAuthorizationWithDpop').mockResolvedValue({ data: PAR_201 });
    mountSection(<FapiSection />);
    await generateBothKeys();
    press(/Push PAR/i);

    await expectReadsBack(
      /urn:ietf:params:oauth:request_uri:driven-test-01/,
      'the request_uri from the PAR response',
    );
  });

  /**
   * **The regression, driven end to end.**
   *
   * Step 2 was enabled on `!wizParResult` — the response object being truthy — while its handler
   * returned early on the *field* being undefined. An enabled control that does nothing is worse than a
   * disabled one, because there is nothing to read. So both halves are asserted: the button must be
   * gated on the field it is about to use, and pressing it must actually navigate with that field.
   */
  it('gates step 2 on the request_uri itself, not on the response being truthy', async () => {
    vi.spyOn(parService, 'pushedAuthorizationWithDpop').mockResolvedValue({
      // A 201 whose body somehow lacks the member. The button must stay closed rather than become an
      // enabled no-op — this is the exact state the `requestUri` misspelling produced on every run.
      data: { expires_in: 600 },
    });
    mountSection(<FapiSection />);
    await generateBothKeys();
    press(/Push PAR/i);

    await waitFor(() => expect(screen.getByText(/PAR Response/i)).toBeInTheDocument());
    expect(
      screen.getByRole('button', { name: /Open Authorize Page/i }),
      'enabled with no request_uri means an inert button, which is how this stayed broken',
    ).toBeDisabled();
  });

  it('navigates to the authorization endpoint carrying that request_uri', async () => {
    const nav = stubNavigation();
    vi.spyOn(parService, 'pushedAuthorizationWithDpop').mockResolvedValue({ data: PAR_201 });
    mountSection(<FapiSection />);
    await generateBothKeys();
    press(/Push PAR/i);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Open Authorize Page/i })).toBeEnabled(),
    );
    press(/Open Authorize Page/i);

    await waitFor(() => expect(nav.href).not.toBe(''));
    const url = new URL(nav.href);
    expect(url.pathname).toContain('/api/authorization');
    expect(
      url.searchParams.get('request_uri'),
      'the field the server sent has to be the field the redirect carries',
    ).toBe(PAR_201.request_uri);
    expect(url.searchParams.get('client_id')).toBeTruthy();
  });

  /**
   * **Found by this file.** `recordNavigation` exists because the authorization request is a browser
   * navigation that no `fetch` interceptor observes, so the single most important request in OAuth
   * never entered the trace. It is called from `AuthFlowsSection` and `CallbackPage` — and **was not
   * called here**, so a FAPI 2.0 run's front-channel hop was invisible in the trace panel and in
   * `SequenceView`, and `hasAuthorizeRequest` returned false for it.
   *
   * Same shape as the four dead flows: a capability was added, and one caller was never told.
   */
  it('records the front-channel hop, which the trace panel cannot otherwise see', async () => {
    stubNavigation();
    vi.spyOn(parService, 'pushedAuthorizationWithDpop').mockResolvedValue({ data: PAR_201 });
    mountSection(<FapiSection />);
    await generateBothKeys();
    press(/Push PAR/i);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Open Authorize Page/i })).toBeEnabled(),
    );
    press(/Open Authorize Page/i);

    await waitFor(() => {
      const hop = getTraces().find((t) => t.navigation && t.url.includes('/api/authorization'));
      expect(
        hop,
        'the browser left for the authorization endpoint and nothing recorded it',
      ).toBeDefined();
      expect(hop!.direction).toBe('outbound');
    });
  });

  it('explains a PAR refusal instead of printing it raw', async () => {
    vi.spyOn(parService, 'pushedAuthorizationWithDpop').mockRejectedValue(
      new Error('{"error":"invalid_client","error_description":"[A157303] public client."}'),
    );
    mountSection(<FapiSection />);
    await generateBothKeys();
    press(/Push PAR/i);

    expect(await screen.findByText(/What does this mean\?|Hide explanation/i)).toBeInTheDocument();
    // Twice, and exactly twice — the raw text is never replaced, only accompanied.
    expect(screen.getAllByText(/A157303/)).toHaveLength(2);
  });
});

describe('FapiSection — every wizard step is addressable', () => {
  /** The same two halves as MCP: `useHashScroll` needs targets, and only a render can say they exist. */
  it('gives the setup block and the three steps ids that can take focus', () => {
    mountSection(<FapiSection />);

    for (const id of ['fapi-setup', 'fapi-step-1', 'fapi-step-2', 'fapi-step-3']) {
      const step = document.getElementById(id);
      expect(step, `#${id} is what a link to that step points at`).not.toBeNull();
      expect(step).toHaveAttribute('tabindex', '-1');
    }
  });

  it('anchors each id to the block that actually holds that step', () => {
    mountSection(<FapiSection />);

    expect(document.getElementById('fapi-step-1')).toHaveTextContent(/Push Authorization Request/i);
    expect(document.getElementById('fapi-step-3')).toHaveTextContent(/Call Userinfo with DPoP/i);
  });
});

/**
 * **Step 3, mounted the way it is actually reached — after the redirect.**
 *
 * Every other case in this file drives the wizard on one unbroken page, and that is precisely why the
 * suite was green over a step that could not work. Step 2 is `window.location.href = url`, a
 * full-document navigation: the hook's `useState` is gone, and the section that comes back has
 * forgotten both key pairs while `sessionStorage` still holds every byte of them.
 *
 * Measured before the fix (2026-09-02): the step-3 button was **enabled** — it was gated on the token,
 * which is session-backed and therefore present — and its proof factory threw `TypeError: Cannot read
 * properties of null (reading 'privateKey')`. The crash is deferred *into the factory*, so a test that
 * mocks `userInfoWithDpop` and never invokes the factory it was handed sees a green pass over a button
 * that cannot work. Both cases below invoke it.
 */
describe('FapiSection — coming back from the callback', () => {
  /** The exact state the browser is in on return: token in the vault, keys in the session, hook empty. */
  function afterRedirect() {
    seedTokens({ token_type: 'DPoP', access_token: 'fapi-at-1' });
    seedDpopKey();
    seedFapiSigningKey();
  }

  it('restores both key pairs rather than showing a section that forgot what it did', async () => {
    afterRedirect();
    mountSection(<FapiSection />);

    // The JWK Set is what the reader was told to register in the Authlete console. Losing it mid-run
    // means it cannot be checked against what the server has.
    await expectReadsBack(/sign-kid/, 'the restored client-auth public key');
    expect(
      screen.getByRole('button', { name: /^Generate Client Auth Key$/i }),
      'a restored key must close the button that would replace it',
    ).toBeDisabled();
  });

  /**
   * A **real** P-256 pair here, not `seedDpopKey`'s placeholder.
   *
   * The shared fixture exists for the sections that only branch on a key being present, and WebCrypto
   * rejects it with `DataError: Invalid keyData` the moment anything tries to sign — which is the
   * correct answer for a key made of the letters `x`, `y` and `d`. This case is the one that has to
   * produce a signature, so it generates one and seeds both halves the way the wizard does.
   */
  it('enables step 3 and builds a real proof from the restored key', async () => {
    afterRedirect();
    const real = await generateKeyPair();
    sessionStorage.setItem(SESSION_KEYS.dpopPrivateKey, JSON.stringify(real.privateKey));
    sessionStorage.setItem(SESSION_KEYS.dpopPublicKey, JSON.stringify(real.publicKey));
    // Capture the factory and call it exactly as the transport does on a nonce retry. Asserting only
    // that the service was reached is what let the TypeError hide.
    let proofOutcome = 'factory never invoked';
    vi.spyOn(tokenService, 'userInfoWithDpop').mockImplementation(async (_at, proof) => {
      try {
        // `DpopProofSource` admits a finished string as well as a factory. Step 3 must pass a
        // **factory** — a `use_dpop_nonce` retry needs a fresh signature and the nonce lives inside it
        // — so anything else is the defect, not a shape to accommodate.
        if (typeof proof !== 'function') {
          proofOutcome = 'a finished proof was passed, which cannot be retried with a nonce';
        } else {
          const jws: string = await proof(undefined);
          proofOutcome =
            jws.split('.').length === 3 ? 'signed a compact JWS' : `unexpected: ${jws}`;
        }
      } catch (e) {
        proofOutcome = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      }
      return { data: { sub: 'admin' } };
    });
    mountSection(<FapiSection />);

    expect(screen.getByRole('button', { name: /Call Userinfo with DPoP/i })).toBeEnabled();
    press(/Call Userinfo with DPoP/i);

    await waitFor(() => expect(proofOutcome).toBe('signed a compact JWS'));
  });

  /**
   * The other half of the gate. A token can be present while the key is not — clear the session keys,
   * keep the vault — and RFC 9449 §7.1 gives a bound token no bearer alternative, so there is no
   * degraded call to offer. The button must be shut, not enabled and failing.
   */
  it('shuts step 3 when the token is present but the DPoP key is gone', async () => {
    seedTokens({ token_type: 'DPoP' });
    mountSection(<FapiSection />);

    expect(
      screen.getByRole('button', { name: /Call Userinfo with DPoP/i }),
      'gated on the token alone, this button was enabled and crashing',
    ).toBeDisabled();
    expect(screen.getByText(/no DPoP key is in this session/i)).toBeInTheDocument();
  });

  /**
   * Regenerating a key silently invalidates the token already in the vault — it is bound to the old one
   * through `cnf.jkt`, and the refusal that follows names the proof rather than the cause. Stated rather
   * than prevented, because starting a second run is legitimate.
   */
  it('warns before a new key can orphan the token already held', async () => {
    afterRedirect();
    mountSection(<FapiSection />);
    expect(
      screen.getByText(/Generating a new DPoP key replaces the one that token is bound to/i),
    ).toBeInTheDocument();
  });
});
