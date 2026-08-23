import { screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ParSection } from '@/components/oidc/ParSection';
import { parService } from '@/services';
import { getTraces, clearTraces } from '@/services/trace-store';
import {
  mountSection,
  fill,
  press,
  stubNavigation,
  expectCall,
  expectReadsBack,
  resetSectionState,
} from '@/test/helpers/drive-section';

/**
 * PAR — where the client-authentication **channel** is the thing that goes wrong.
 *
 * Authlete matches the channel credentials arrive on against the client's registered method, so the
 * correct secret in the wrong place is a 401 in both directions: creds in `parameters` for a
 * `client_secret_basic` client earns `[A157357]`, and Basic for a `client_secret_post` client earns
 * *"the request does not include a client secret"*. The section exposes the choice as a selector, which
 * makes it exactly the kind of control that can be decorative — so each of the three is driven.
 *
 * The response half is the FAPI class: T1-11 made `POST /api/par` answer **RFC 9126 §2.2's** body, whose
 * member is `request_uri`. `RarSection` kept reading the vendor's camelCase `requestUri` after that
 * change and its "push and redirect" button silently did nothing — the same defect the FAPI wizard had.
 */

beforeEach(() => {
  resetSectionState();
  clearTraces();
});
afterEach(cleanup);

/** Exactly what the server returns on 201 — snake_case, no envelope. */
const PAR_201 = { expires_in: 600, request_uri: 'urn:ietf:params:oauth:request_uri:par-driven-01' };

describe('ParSection — the client-authentication channel', () => {
  it('puts the credentials in the body for client_secret_post, the default', async () => {
    const spy = vi.spyOn(parService, 'pushedAuthorization').mockResolvedValue(PAR_201);
    mountSection(<ParSection />);

    fill(/^Client ID$/i, '1523514379');
    fill(/^Client Secret$/i, 'the-secret');
    press(/Push Authorization Request/i);

    const [body, basicAuth] = (await expectCall(spy, 'the Push button')) as [
      Record<string, string>,
      unknown,
    ];
    expect(body.clientId).toBe('1523514379');
    expect(body.clientSecret).toBe('the-secret');
    expect(basicAuth, 'a post client must not also present a Basic header').toBeUndefined();
  });

  /**
   * With Basic the secret travels in the header, so it has to be **absent from the body** — not merely
   * duplicated there. RFC 6749 §2.3.1 forbids more than one authentication method per request, and this
   * server enforces it at `par.controller.ts` before any Authlete call.
   */
  it('moves the secret out of the body entirely for client_secret_basic', async () => {
    const spy = vi.spyOn(parService, 'pushedAuthorization').mockResolvedValue(PAR_201);
    mountSection(<ParSection />);

    fill(/^Client ID$/i, '1523514379');
    fill(/^Client Secret$/i, 'the-secret');
    fill(/Client Auth Method/i, 'basic');
    press(/Push Authorization Request/i);

    const [body, basicAuth] = (await expectCall(spy, 'the Push button')) as [
      Record<string, string>,
      { clientId: string; clientSecret: string } | undefined,
    ];
    expect(basicAuth?.clientId).toBe('1523514379');
    expect(basicAuth?.clientSecret).toBe('the-secret');
    expect(
      body.clientSecret,
      'both channels at once is refused with 400 invalid_request (RFC 6749 §2.3.1)',
    ).toBeUndefined();
    expect(
      body.clientId,
      'the id is not a second credential, but it still must not duplicate',
    ).toBeUndefined();
  });

  it('sends client_id alone for a public client', async () => {
    const spy = vi.spyOn(parService, 'pushedAuthorization').mockResolvedValue(PAR_201);
    mountSection(<ParSection />);

    fill(/^Client ID$/i, '4277838306');
    fill(/Client Auth Method/i, 'none');
    press(/Push Authorization Request/i);

    const [body] = (await expectCall(spy, 'the Push button')) as [Record<string, string>];
    expect(body.clientId).toBe('4277838306');
    // `[A157303]`: Authlete refuses *any* client-authentication data for a `tokenAuthMethod: NONE`
    // client, so the field must not travel at all.
    expect(body.clientSecret).toBeUndefined();
  });

  it('takes the DPoP path with a proof factory when the box is ticked', async () => {
    const spy = vi
      .spyOn(parService, 'pushedAuthorizationWithDpop')
      .mockResolvedValue({ data: PAR_201 });
    const plain = vi.spyOn(parService, 'pushedAuthorization');
    mountSection(<ParSection />);

    fill(/^Client ID$/i, '1523514379');
    // A checkbox, not a button — `press` asserts an enabled *button* and would not find it.
    fireEvent.click(screen.getByRole('checkbox', { name: /Use DPoP/i }));
    press(/Push Authorization Request/i);

    const [, proofFactory] = (await expectCall(spy, 'the Push button with DPoP')) as [
      unknown,
      unknown,
    ];
    // A factory, not a string: `dpopRequest` re-signs on a `use_dpop_nonce` refusal and the nonce lives
    // inside the signature, so a finished proof could never be retried.
    expect(typeof proofFactory).toBe('function');
    expect(plain, 'the plain path must not also fire').not.toHaveBeenCalled();
  });
});

describe('ParSection — the response it reads back', () => {
  it('generates a PKCE pair and puts the challenge in the pushed parameters', async () => {
    const spy = vi.spyOn(parService, 'pushedAuthorization').mockResolvedValue(PAR_201);
    mountSection(<ParSection />);

    press(/Generate PKCE/i);
    await waitFor(() => expect(sessionStorage.getItem('pkce_code_verifier')).toBeTruthy());

    fill(/^Client ID$/i, '4277838306');
    fill(/Client Auth Method/i, 'none');
    press(/Push Authorization Request/i);

    const [body] = (await expectCall(spy, 'the Push button')) as [{ parameters: string }];
    const params = new URLSearchParams(body.parameters);
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('code_challenge')).toBeTruthy();
    expect(params.get('state'), 'stored for the callback to compare').toBe(
      sessionStorage.getItem('oauth_state'),
    );
  });

  /** RFC 9126 §2.2's member is `request_uri`. Reading `requestUri` here is a blank panel and no error. */
  it('renders the request_uri from the specification-shaped body', async () => {
    vi.spyOn(parService, 'pushedAuthorization').mockResolvedValue(PAR_201);
    mountSection(<ParSection />);
    fill(/^Client ID$/i, '1523514379');
    press(/Push Authorization Request/i);

    await expectReadsBack(/urn:ietf:params:oauth:request_uri:par-driven-01/, 'the request_uri');
    await expectReadsBack(/600/, 'expires_in');
  });

  it('offers the authorize controls only once a request_uri actually came back', async () => {
    vi.spyOn(parService, 'pushedAuthorization').mockResolvedValue({ expires_in: 600 });
    mountSection(<ParSection />);
    fill(/^Client ID$/i, '1523514379');
    press(/Push Authorization Request/i);

    await waitFor(() => expect(screen.getByText(/PAR Response/i)).toBeInTheDocument());
    // Gated on the field, not on the response being truthy — an enabled control that does nothing is
    // worse than a disabled one, because there is nothing to read.
    expect(
      screen.queryByRole('button', { name: /Authorize \(redirect\)/i }),
    ).not.toBeInTheDocument();
  });

  it('redirects with the request_uri the server sent', async () => {
    const nav = stubNavigation();
    vi.spyOn(parService, 'pushedAuthorization').mockResolvedValue(PAR_201);
    mountSection(<ParSection />);
    fill(/^Client ID$/i, '1523514379');
    press(/Push Authorization Request/i);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Authorize \(redirect\)/i })).toBeEnabled(),
    );
    press(/Authorize \(redirect\)/i);

    await waitFor(() => expect(nav.href).not.toBe(''));
    const url = new URL(nav.href);
    expect(url.searchParams.get('request_uri')).toBe(PAR_201.request_uri);
    expect(url.searchParams.get('client_id')).toBe('1523514379');
  });

  /**
   * **Found by this file, and it was the fourth site of the same defect.** `window.location.href = url`
   * appeared in seven places across five sections and only `AuthFlowsSection` recorded the hop, so the
   * authorization request was in the trace when it started from Grant Flows and invisible when it
   * started here. `navigateTo` in `trace-store.ts` now pairs the two operations so forgetting is not
   * possible.
   */
  it('records the front-channel hop, which no fetch interceptor can see', async () => {
    stubNavigation();
    vi.spyOn(parService, 'pushedAuthorization').mockResolvedValue(PAR_201);
    mountSection(<ParSection />);
    fill(/^Client ID$/i, '1523514379');
    press(/Push Authorization Request/i);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Authorize \(redirect\)/i })).toBeEnabled(),
    );
    press(/Authorize \(redirect\)/i);

    await waitFor(() => {
      const hop = getTraces().find((t) => t.navigation && t.url.includes('/api/authorization'));
      expect(hop, 'the browser left and nothing recorded it').toBeDefined();
      expect(hop!.direction).toBe('outbound');
    });
  });

  it('explains a channel mismatch instead of printing it raw', async () => {
    vi.spyOn(parService, 'pushedAuthorization').mockRejectedValue(
      new Error(
        '{"error":"invalid_client","error_description":"[A157357] The client identifier is not found at the expected location."}',
      ),
    );
    mountSection(<ParSection />);
    fill(/^Client ID$/i, '1523514379');
    press(/Push Authorization Request/i);

    expect(await screen.findByText(/What does this mean\?|Hide explanation/i)).toBeInTheDocument();

    /**
     * **Three occurrences here, not the two the JAR section shows, and the third is deliberate.**
     *
     * `ErrorExplainer`'s rule is that the raw text is never replaced, only accompanied — so the code
     * appears once in the verbatim body and once as the decoded badge. The third is
     * `OAUTH_ERRORS.invalid_client`'s own `fix` prose, which says *"See A157357 below — the correct
     * secret in the wrong channel is a 401"*: the spec-level error cross-referencing the vendor code
     * that explains it, which is the pairing this section most needs.
     *
     * Asserted by role rather than by count, so adding a fourth mention somewhere does not fail a test
     * that is really about the raw body surviving intact.
     */
    const occurrences = screen.getAllByText(/A157357/);
    expect(occurrences.map((el) => el.tagName)).toEqual(['P', 'SPAN', 'CODE']);
    expect(
      occurrences[0].textContent,
      'the verbatim body is what lets a reader check the explanation against what actually arrived',
    ).toContain('"error":"invalid_client"');
  });
});
