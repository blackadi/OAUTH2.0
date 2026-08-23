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
} from '@/test/helpers/drive-section';

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

  it('pushes a request carrying private_key_jwt, PKCE S256 and a state', async () => {
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
    // assertion is the client authentication and its absence is a 401.
    expect(params.get('client_assertion_type')).toBe(
      'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    );
    expect(params.get('client_assertion'), 'the signed assertion is the credential').toBeTruthy();
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('code_challenge')).toBeTruthy();
    expect(params.get('state'), 'RFC 9207 mix-up defence needs one').toBeTruthy();
    expect(params.get('response_type')).toBe('code');
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
