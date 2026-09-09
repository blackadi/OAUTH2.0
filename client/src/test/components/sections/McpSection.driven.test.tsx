import { screen, cleanup, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpSection } from '@/components/mcp/McpSection';
import { mcpService, dcrService } from '@/services';
import {
  mountSection,
  mountSectionAt,
  selectOp,
  fill,
  fillAdminCredentials,
  press,
  expectCall,
  expectSends,
  expectReadsBack,
  resetSectionState,
  stubNavigation,
} from '@/test/helpers/drive-section';

/**
 * The MCP wizard — the second dead flow with no component test of any kind until this file.
 *
 * Step 2 registered a client with `CLIENT_SECRET_BASIC` and read the returned `client_secret` into a
 * **local variable used only in a toast**. Step 4 then exchanged the code with no client
 * authentication at all. The button fired, the request went out, and Authlete refused it — the
 * credential existed, was displayed to the user, and never travelled.
 *
 * That is the class this file exists to catch: **the credential must come from the thing the user
 * actually obtained**, not from a constant, not from a default, and not from a variable that only ever
 * reached a notification.
 *
 * Admin credentials are entered with the shared helper because `AdminAuth` here carries a `label`, so
 * the fields read "Admin (for DCR) Client ID" — the unanchored `/Admin Client ID/i` would not match.
 */

beforeEach(resetSectionState);
afterEach(cleanup);

/** RFC 8414 AS metadata, trimmed to the members the wizard actually branches on. */
const AS_METADATA = {
  issuer: 'http://localhost:3000',
  authorization_endpoint: 'http://localhost:3000/api/authorization',
  token_endpoint: 'http://localhost:3000/api/token',
  userinfo_endpoint: 'http://localhost:3000/api/userinfo',
  introspection_endpoint: 'http://localhost:3000/api/introspection/standard',
  registration_endpoint: 'http://localhost:3000/api/client/dcr/register',
  resource_indicators_supported: true,
  code_challenge_methods_supported: ['S256'],
};

/**
 * What `POST /api/client/dcr/register` answers.
 *
 * Since T1-11 the server returns RFC 7591 §3.2.1's registration response **directly** — it used to nest
 * it inside Authlete's envelope under `responseContent`, so a conforming client found `action` and
 * `resultCode` at the top level and had to unwrap a vendor field to reach `client_id`. Snake_case, and
 * a secret comes back even though the wizard asked for `NONE`.
 */
const DCR_CREATED = {
  client_id: 'dcr-9911',
  client_secret: 'dcr-secret-from-the-server',
  client_id_issued_at: 1755900000,
  redirect_uris: ['http://localhost:3001/callback'],
};

const TOKEN_RESPONSE = {
  access_token: 'at-mcp-01',
  token_type: 'Bearer',
  expires_in: 3600,
  scope: 'openid profile',
};

describe('McpSection — the credential the user obtained', () => {
  it('discovers the AS and reads back what it advertises', async () => {
    vi.spyOn(mcpService, 'fetchAsMetadata').mockResolvedValue(AS_METADATA);
    mountSection(<McpSection />);

    press(/Fetch Metadata/i);

    // Each badge is a separate member read off the document; a rename shows as a missing badge and
    // nothing else, which is exactly the failure mode a smoke test cannot see.
    expect(await screen.findByText(/DCR Supported/i)).toBeInTheDocument();
    expect(screen.getByText(/Resource Indicators/i)).toBeInTheDocument();
    expect(screen.getByText(/PKCE S256/i)).toBeInTheDocument();
  });

  /**
   * MCP and OAuth 2.1 expect a browser app to be a public client with PKCE, which is what step 3 does.
   * The registration used to ask for `CLIENT_SECRET_BASIC`, whose secret step 4 then failed to present
   * — so the two steps disagreed about what kind of client this was.
   */
  it('registers a public client, matching what the authorize step actually does', async () => {
    vi.spyOn(mcpService, 'fetchAsMetadata').mockResolvedValue(AS_METADATA);
    const spy = vi.spyOn(dcrService, 'dcrRegister').mockResolvedValue(DCR_CREATED);
    mountSection(<McpSection />);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin (for DCR)');
    press(/Fetch Metadata/i);
    await screen.findByText(/DCR Supported/i);

    press(/DCR \(admin register\)/i);
    const args = await expectCall(spy, 'the DCR register button');

    expectSends(args, btoa('mgmt-id:mgmt-secret'), 'DCR register is behind admin Basic auth');
    const [body] = args as [{ json: string }];
    const metadata = JSON.parse(body.json) as Record<string, unknown>;
    expect(
      metadata.token_endpoint_auth_method,
      'step 3 sends PKCE and no secret, so registering a confidential client makes the two steps disagree',
    ).toBe('NONE');
  });

  /**
   * **The regression itself.** The secret came back, was shown in a toast, and never reached the wire.
   */
  it('presents the client secret DCR returned on the token exchange', async () => {
    vi.spyOn(mcpService, 'fetchAsMetadata').mockResolvedValue(AS_METADATA);
    vi.spyOn(dcrService, 'dcrRegister').mockResolvedValue(DCR_CREATED);
    const spy = vi.spyOn(mcpService, 'exchangeCode').mockResolvedValue(TOKEN_RESPONSE);
    mountSection(<McpSection />);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin (for DCR)');

    press(/Fetch Metadata/i);
    await screen.findByText(/DCR Supported/i);
    press(/DCR \(admin register\)/i);
    // The registered id lands in the auto-filled input's *value*, not as text on the page.
    await waitFor(() =>
      expect((screen.getByLabelText(/Client ID \(auto-filled\)/i) as HTMLInputElement).value).toBe(
        DCR_CREATED.client_id,
      ),
    );

    press(/Build Authorization URL/i);
    await waitFor(() =>
      expect((screen.getByLabelText(/Code Verifier/i) as HTMLInputElement).value).not.toBe(''),
    );

    fill(/Authorization Code \(from callback\)/i, 'code-from-callback');
    press(/Exchange Code for Token/i);

    const [params] = (await expectCall(spy, 'the token exchange button')) as [
      { clientId: string; clientSecret?: string; codeVerifier: string; code: string },
    ];
    expect(
      params.clientSecret,
      'the secret DCR returned was read into a local used only in a toast, so the exchange sent none',
    ).toBe(DCR_CREATED.client_secret);
    expect(
      params.clientId,
      'the registered client is the one being authenticated, not the configured default',
    ).toBe(DCR_CREATED.client_id);
    expect(params.code).toBe('code-from-callback');
    expect(
      params.codeVerifier,
      'the verifier step 3 generated must be the one replayed',
    ).toBeTruthy();
  });

  /**
   * MCP requires the `resource` indicator (RFC 8707) on **both** the authorization request and the
   * token request. Sending it on one and not the other is the failure this asserts against, and it is
   * silent: the AS issues a token for the wrong audience and the MCP server rejects it later.
   */
  it('carries the same resource indicator on the authorize step and the exchange', async () => {
    vi.spyOn(mcpService, 'fetchAsMetadata').mockResolvedValue(AS_METADATA);
    const build = vi.spyOn(mcpService, 'buildAuthorizationUrl');
    const exchange = vi.spyOn(mcpService, 'exchangeCode').mockResolvedValue(TOKEN_RESPONSE);
    mountSection(<McpSection />);

    press(/Fetch Metadata/i);
    await screen.findByText(/DCR Supported/i);

    fill(/Resource \(optional — MCP server URL\)/i, 'https://mcp.example.com');
    press(/Build Authorization URL/i);

    const [authParams] = (await expectCall(build, 'the build authorization URL button')) as [
      { resource?: string; codeChallenge: string },
    ];
    expect(authParams.resource).toBe('https://mcp.example.com');
    expect(authParams.codeChallenge, 'OAuth 2.1 requires PKCE').toBeTruthy();

    await waitFor(() =>
      expect((screen.getByLabelText(/Code Verifier/i) as HTMLInputElement).value).not.toBe(''),
    );
    fill(/Authorization Code \(from callback\)/i, 'code-from-callback');
    press(/Exchange Code for Token/i);

    const [tokenParams] = (await expectCall(exchange, 'the token exchange button')) as [
      { resource?: string; tokenEndpoint: string },
    ];
    expect(
      tokenParams.resource,
      'RFC 8707 §2.2 — the token request repeats the resource, or the audience is not narrowed',
    ).toBe('https://mcp.example.com');
    // From the discovered metadata, not from string surgery on the issuer.
    expect(tokenParams.tokenEndpoint).toBe(AS_METADATA.token_endpoint);
  });

  /**
   * The URL is shown rather than linked.
   *
   * This asserted an `<a href>` and read the query off the attribute. The anchor is gone deliberately:
   * it carried `target="_blank"`, and a new tab is the one shape that defeats the verifier step 3 now
   * writes to session storage, because session storage is per-tab. The guarantees it checked are
   * unchanged and still checked — the URL is rendered, it carries `S256`, and it carries a `state`.
   */
  it('renders the authorization URL it built, so it can be read before it is followed', async () => {
    vi.spyOn(mcpService, 'fetchAsMetadata').mockResolvedValue(AS_METADATA);
    mountSection(<McpSection />);
    press(/Fetch Metadata/i);
    await screen.findByText(/DCR Supported/i);
    press(/Build Authorization URL/i);

    const shown = await screen.findByText(/\/api\/authorization\?/);
    const url = new URL(shown.textContent!);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state'), 'RFC 9207 mix-up defence needs one').toBeTruthy();
    expect(screen.queryByRole('link', { name: /\/api\/authorization/ })).toBeNull();
  });

  it('renders the token response it received', async () => {
    vi.spyOn(mcpService, 'fetchAsMetadata').mockResolvedValue(AS_METADATA);
    vi.spyOn(mcpService, 'exchangeCode').mockResolvedValue(TOKEN_RESPONSE);
    mountSection(<McpSection />);
    press(/Fetch Metadata/i);
    await screen.findByText(/DCR Supported/i);
    press(/Build Authorization URL/i);
    await waitFor(() =>
      expect((screen.getByLabelText(/Code Verifier/i) as HTMLInputElement).value).not.toBe(''),
    );
    fill(/Authorization Code \(from callback\)/i, 'code-from-callback');
    press(/Exchange Code for Token/i);

    await expectReadsBack(/at-mcp-01/, 'the access token from the exchange');
  });

  /**
   * `introspectToken` existed and was called from nowhere, so the `mcp.introspect` doc entry had no
   * surface — and had it been wired as written it would have failed, because it sent no credentials to
   * an endpoint RFC 7662 §2.1 requires to be protected. Both halves are asserted: the credential
   * travels, and the endpoint comes from the discovered metadata rather than substring surgery.
   */
  it('introspects with admin credentials and the discovered endpoint', async () => {
    vi.spyOn(mcpService, 'fetchAsMetadata').mockResolvedValue(AS_METADATA);
    vi.spyOn(mcpService, 'exchangeCode').mockResolvedValue(TOKEN_RESPONSE);
    const spy = vi.spyOn(mcpService, 'introspectToken').mockResolvedValue({ active: true });
    mountSection(<McpSection />);
    fillAdminCredentials('mgmt-id', 'mgmt-secret', 'Admin (for DCR)');
    press(/Fetch Metadata/i);
    await screen.findByText(/DCR Supported/i);
    press(/Build Authorization URL/i);
    await waitFor(() =>
      expect((screen.getByLabelText(/Code Verifier/i) as HTMLInputElement).value).not.toBe(''),
    );
    fill(/Authorization Code \(from callback\)/i, 'code-from-callback');
    press(/Exchange Code for Token/i);
    await waitFor(() => expect(screen.getByRole('button', { name: /Introspect/i })).toBeEnabled());
    press(/Introspect/i);

    const args = await expectCall(spy, 'the introspect button');
    expect(args[0], 'the endpoint is a member of the AS metadata already fetched').toBe(
      AS_METADATA.introspection_endpoint,
    );
    expect(args[1]).toBe(TOKEN_RESPONSE.access_token);
    expectSends(args, 'mgmt-id', 'RFC 7662 §2.1 requires the endpoint be protected');
    expectSends(args, 'mgmt-secret', 'RFC 7662 §2.1 requires the endpoint be protected');
  });

  /**
   * The wizard's failures were a bare `<p>` while the tabs above used `ErrorExplainer` — the same
   * PED-08 defect that was closed in JAR and FAPI, still open in one half of this section. An
   * `[A157303]` here means the exchange presented client-authentication data for a public client,
   * which is precisely the sort of thing the decoder exists to say out loud.
   *
   * **And it has to land in the step that failed.** This assertion used to be `screen.getAllByText`,
   * which passes wherever on the page the explanation renders — and where it rendered was the top of
   * the section, measured at 1,894px from the button that produced it. Scoping the query to
   * `#mcp-step-4` is the whole regression: an explainer hoisted back out of the card fails here.
   */
  it('explains a wizard refusal inside the step that produced it', async () => {
    vi.spyOn(mcpService, 'fetchAsMetadata').mockResolvedValue(AS_METADATA);
    vi.spyOn(mcpService, 'exchangeCode').mockRejectedValue(
      new Error('{"error":"invalid_client","error_description":"[A157303] public client."}'),
    );
    mountSection(<McpSection />);
    press(/Fetch Metadata/i);
    await screen.findByText(/DCR Supported/i);
    press(/Build Authorization URL/i);
    await waitFor(() =>
      expect((screen.getByLabelText(/Code Verifier/i) as HTMLInputElement).value).not.toBe(''),
    );
    fill(/Authorization Code \(from callback\)/i, 'code-from-callback');
    press(/Exchange Code for Token/i);

    expect(await screen.findByText(/What does this mean\?|Hide explanation/i)).toBeInTheDocument();
    const step4 = document.getElementById('mcp-step-4');
    expect(step4).not.toBeNull();
    // Twice inside the card: once as the raw body the reader has to be able to see, once decoded.
    expect(within(step4!).getAllByText(/A157303/)).toHaveLength(2);
    // And nowhere else on the page — two copies total means none was left at the top.
    expect(screen.getAllByText(/A157303/)).toHaveLength(2);
  });

  /**
   * The routing, not just the placement.
   *
   * A `StepError` hard-coded into step 4 would satisfy the test above. This one fails a *different*
   * step and asserts the explanation follows it, which is the only thing that proves the discriminator
   * — `errorLabel` on `useDiscriminatedAsyncCall` — is being read rather than ignored.
   */
  it('routes a step 1 failure to step 1 and leaves step 4 clean', async () => {
    vi.spyOn(mcpService, 'fetchAsMetadata').mockRejectedValue(
      new Error('{"error":"invalid_request","error_description":"[A157357] wrong channel."}'),
    );
    mountSection(<McpSection />);
    press(/Fetch Metadata/i);

    const step1 = document.getElementById('mcp-step-1');
    const step4 = document.getElementById('mcp-step-4');
    expect(step1).not.toBeNull();
    expect(step4).not.toBeNull();
    await waitFor(() => expect(within(step1!).getAllByText(/A157357/).length).toBeGreaterThan(0));
    expect(within(step4!).queryByText(/A157357/)).toBeNull();
  });
});

describe('McpSection — the authorization survives the redirect', () => {
  /**
   * The wizard was the only flow in the application that could not survive its own redirect.
   *
   * `CallbackPage` reads `pkce_code_verifier`, `oauth_state`, `authz_client_id`,
   * `authz_client_secret` and `authz_resource`; `AuthorizationCodePanel`, `ParSection`, `RarSection`
   * and the FAPI wizard all write them before leaving. MCP wrote none, which is why a code landing on
   * `/callback` from here was refused with "No stored `state` to compare against" — and why step 4
   * asks for a hand-copied code at all.
   */
  async function authorize(resource?: string) {
    vi.spyOn(mcpService, 'fetchAsMetadata').mockResolvedValue(AS_METADATA);
    mountSection(<McpSection />);
    press(/Fetch Metadata/i);
    await screen.findByText(/DCR Supported/i);
    if (resource !== undefined) fill(/Resource \(optional/i, resource);
    press(/Build Authorization URL/i);
    await screen.findByText(/\/api\/authorization\?/);
  }

  it('writes everything the callback reads', async () => {
    await authorize('https://mcp.example.com');

    const verifier = sessionStorage.getItem('pkce_code_verifier');
    expect(verifier, 'the callback hard-fails without it').toBeTruthy();
    // The same value the wizard shows, so the two cannot drift.
    expect((screen.getByLabelText(/Code Verifier/i) as HTMLInputElement).value).toBe(verifier);

    expect(sessionStorage.getItem('oauth_state'), 'the CSRF binding').toBeTruthy();
    expect(sessionStorage.getItem('authz_client_id')).toBeTruthy();
    // RFC 8707 §2.2 — the token request's copy is what narrows the audience, and the callback sends
    // exactly this one.
    expect(sessionStorage.getItem('authz_resource')).toBe('https://mcp.example.com');
  });

  /**
   * Absence has to be written down to be absent.
   *
   * `AuthorizationCodePanel` learned this the hard way: a write with no else-remove branch left a
   * stale `authz_client_secret` behind and produced an unexplainable `[A157303]`. Drop either else
   * branch below and this fails.
   */
  it('removes the keys it has no value for, rather than leaving stale ones', async () => {
    sessionStorage.setItem('authz_resource', 'https://stale.example.com');
    sessionStorage.setItem('authz_client_secret', 'stale-secret');

    await authorize('');

    expect(sessionStorage.getItem('authz_resource')).toBeNull();
    // MCP is a public client with PKCE; a secret only exists here if DCR handed one back.
    expect(sessionStorage.getItem('authz_client_secret')).toBeNull();
  });

  /**
   * The stale-key hazard `services/session-keys.ts` exists for, and nothing covered it.
   *
   * `CallbackPage` picks between three exchange shapes by the **presence** of `dpop_private_key` and
   * `fapi_signing_private_key`. A reader who opened the FAPI section earlier in the same tab still has
   * a signing key sitting there, so joining the shared callback without clearing it would quietly turn
   * this public-client exchange into a `private_key_jwt` one — verbatim the defect that module's
   * header records.
   */
  it('clears the keys that would silently pick a different exchange', async () => {
    sessionStorage.setItem('fapi_signing_private_key', '{"kty":"EC"}');
    sessionStorage.setItem('fapi_signing_pub_jwk', '{"kty":"EC"}');
    sessionStorage.setItem('dpop_private_key', '{"kty":"EC"}');
    sessionStorage.setItem('dpop_public_key', '{"kty":"EC"}');
    sessionStorage.setItem('dpop_kid', 'kid-1');

    await authorize();

    for (const key of [
      'fapi_signing_private_key',
      'fapi_signing_pub_jwk',
      'dpop_private_key',
      'dpop_public_key',
      'dpop_kid',
    ]) {
      expect(sessionStorage.getItem(key), `${key} would misroute the exchange`).toBeNull();
    }
  });

  /**
   * `state` was `mcp-<timestamp>` — the only generator in the client not using `crypto.randomUUID()`.
   *
   * It cost nothing while the value was write-only. It is now the CSRF binding `CallbackPage`
   * validates fail-closed, and a timestamp is guessable.
   */
  it('mints an unguessable state, not a timestamp', async () => {
    await authorize();
    const state = sessionStorage.getItem('oauth_state')!;
    expect(state).not.toMatch(/^mcp-\d+$/);
    expect(state).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    // The URL has to carry the same one, or the comparison at the callback cannot succeed.
    const shown = screen.getByText(/\/api\/authorization\?/);
    expect(new URL(shown.textContent!).searchParams.get('state')).toBe(state);
  });

  /** The verifier is the only copy that survives the hook being destroyed by the navigation. */
  it('restores the verifier from session storage on mount', () => {
    sessionStorage.setItem('pkce_code_verifier', 'verifier-from-before-the-redirect');
    mountSection(<McpSection />);
    expect((screen.getByLabelText(/Code Verifier/i) as HTMLInputElement).value).toBe(
      'verifier-from-before-the-redirect',
    );
  });

  /**
   * Leaving goes through `navigateTo`, which is the single exit — it records the outbound hop and
   * writes `return_to`. Step 4 is where the reader needs to be afterwards, and it was the step nobody
   * reached.
   */
  it('leaves through navigateTo and books the return to step 4', async () => {
    const nav = stubNavigation();
    await authorize();
    press(/Authorize in this tab/i);

    expect(nav.href).toContain('/api/authorization?');
    expect(sessionStorage.getItem('return_to')).toBe('/mcp#mcp-step-4');
  });
});

describe('McpSection — the wizard remembers what it did before the redirect', () => {
  /**
   * Steps 2 and 3 gate on the discovery document and step 4 on the built URL, and both lived only in
   * `useState` — which the navigation to the authorization endpoint discards. Measured on return from
   * a *successful* callback, before this: steps 2, 3 and 4 announcing `aria-disabled` and telling the
   * reader to "Run Step 1 first", while steps 5 and 6 were live off the token that had survived in
   * `TokenContext`. A section that has forgotten it discovered the authorization server while still
   * holding the token it obtained from it.
   *
   * It only became reachable when step 3 started leaving through `navigateTo`; the previous
   * `target="_blank"` never unmounted the hook.
   */
  const PROGRESS = {
    issuer: 'http://localhost:3000',
    asData: AS_METADATA,
    authUrl: 'http://localhost:3000/api/authorization?response_type=code&client_id=x',
  };

  it('restores the discovery document and the built URL on mount', () => {
    sessionStorage.setItem('mcp_wizard_progress', JSON.stringify(PROGRESS));
    mountSection(<McpSection />);

    // The two gates that had been lost.
    expect(document.getElementById('mcp-step-2')).not.toHaveAttribute('aria-disabled');
    expect(document.getElementById('mcp-step-3')).not.toHaveAttribute('aria-disabled');
    expect(document.getElementById('mcp-step-4')).not.toHaveAttribute('aria-disabled');
    // And what the reader can see of it, so a restored gate cannot be an empty card.
    expect(
      within(document.getElementById('mcp-step-1')!).getByText(/DCR Supported/i),
    ).toBeInTheDocument();
    expect(
      within(document.getElementById('mcp-step-3')!).getByText(/\/api\/authorization\?/),
    ).toBeInTheDocument();
  });

  it('leaves the steps gated when there is no snapshot to restore', () => {
    mountSection(<McpSection />);
    expect(document.getElementById('mcp-step-2')).toHaveAttribute('aria-disabled', 'true');
    expect(document.getElementById('mcp-step-4')).toHaveAttribute('aria-disabled', 'true');
  });

  /** The snapshot's shape, so reading it back is checked rather than `any`. */
  type Snapshot = { issuer?: string; asData?: { issuer?: string } | null; authUrl?: string };
  const readSnapshot = (): Snapshot =>
    JSON.parse(sessionStorage.getItem('mcp_wizard_progress')!) as Snapshot;

  it('writes the snapshot when a step changes what the later ones gate on', async () => {
    vi.spyOn(mcpService, 'fetchAsMetadata').mockResolvedValue(AS_METADATA);
    mountSection(<McpSection />);
    expect(sessionStorage.getItem('mcp_wizard_progress')).toBeNull();

    press(/Fetch Metadata/i);
    await screen.findByText(/DCR Supported/i);
    const afterDiscovery = readSnapshot();
    // Read from the response, not from the closure's stale copy of state.
    expect(afterDiscovery.asData?.issuer).toBe(AS_METADATA.issuer);
    expect(afterDiscovery.authUrl).toBe('');

    press(/Build Authorization URL/i);
    await screen.findByText(/\/api\/authorization\?/);
    const afterBuild = readSnapshot();
    expect(afterBuild.authUrl).toContain('/api/authorization?');
    // The earlier half must survive the second write.
    expect(afterBuild.asData?.issuer).toBe(AS_METADATA.issuer);
  });
});

describe('McpSection — rebuilding the authorization asks first', () => {
  /**
   * A fresh verifier per authorization request is correct (RFC 7636 §7.1), so the code that belonged
   * to the previous challenge stops being exchangeable the moment step 3 runs again. That used to
   * happen silently and surfaced two steps later as `invalid_grant`.
   */
  it('does not ask when there is no code to lose', async () => {
    vi.spyOn(mcpService, 'fetchAsMetadata').mockResolvedValue(AS_METADATA);
    mountSection(<McpSection />);
    press(/Fetch Metadata/i);
    await screen.findByText(/DCR Supported/i);
    press(/Build Authorization URL/i);

    expect(screen.queryByRole('dialog')).toBeNull();
    await screen.findByText(/\/api\/authorization\?/);
  });

  it('asks before discarding a code, and clears it on confirm', async () => {
    vi.spyOn(mcpService, 'fetchAsMetadata').mockResolvedValue(AS_METADATA);
    mountSection(<McpSection />);
    press(/Fetch Metadata/i);
    await screen.findByText(/DCR Supported/i);
    press(/Build Authorization URL/i);
    await screen.findByText(/\/api\/authorization\?/);

    fill(/Authorization Code \(from callback\)/i, 'code-from-the-first-authorization');
    const first = sessionStorage.getItem('pkce_code_verifier');
    press(/Build Authorization URL/i);

    // Nothing has changed yet — the dialog is a question, not a formality.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(sessionStorage.getItem('pkce_code_verifier')).toBe(first);

    press(/Start over/i);
    await waitFor(() => expect(sessionStorage.getItem('pkce_code_verifier')).not.toBe(first));
    // The code cannot be exchanged against the new challenge, so it must not be left in the field.
    expect(
      (screen.getByLabelText(/Authorization Code \(from callback\)/i) as HTMLInputElement).value,
    ).toBe('');
  });

  it('keeps the code when the question is declined', async () => {
    vi.spyOn(mcpService, 'fetchAsMetadata').mockResolvedValue(AS_METADATA);
    mountSection(<McpSection />);
    press(/Fetch Metadata/i);
    await screen.findByText(/DCR Supported/i);
    press(/Build Authorization URL/i);
    await screen.findByText(/\/api\/authorization\?/);

    fill(/Authorization Code \(from callback\)/i, 'keep-me');
    const first = sessionStorage.getItem('pkce_code_verifier');
    press(/Build Authorization URL/i);
    await screen.findByRole('dialog');
    press(/Cancel/i);

    expect(sessionStorage.getItem('pkce_code_verifier')).toBe(first);
    expect(
      (screen.getByLabelText(/Authorization Code \(from callback\)/i) as HTMLInputElement).value,
    ).toBe('keep-me');
  });
});

describe('McpSection — a token from the callback unlocks the rest of the flow', () => {
  /**
   * `CallbackPage` writes its exchange into `TokenContext`, not into this wizard. Without reading it
   * back, authorizing successfully left steps 5 and 6 gated — a flow that dead-ends one step after its
   * hardest moment, which would have made joining the shared callback worse than not joining it.
   */
  it('ungates userinfo and introspection from a token the wizard did not exchange', () => {
    sessionStorage.setItem(
      'token_response',
      JSON.stringify({ access_token: 'from-the-callback', token_type: 'Bearer' }),
    );
    mountSection(<McpSection />);

    expect(document.getElementById('mcp-step-5')).not.toHaveAttribute('aria-disabled');
    expect(document.getElementById('mcp-step-6')).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('button', { name: /^Fetch UserInfo$/i })).not.toBeDisabled();
  });

  it('leaves them gated when the session holds no token', () => {
    mountSection(<McpSection />);
    expect(document.getElementById('mcp-step-5')).toHaveAttribute('aria-disabled', 'true');
    expect(document.getElementById('mcp-step-6')).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('McpSection — a step that is not yet reachable looks it', () => {
  /**
   * The gated state had no test of any kind, which is how it shipped with only half of itself.
   *
   * `stepState` sets `border-dashed`, a border *style*; the five gated steps were `<Card>`s on the
   * default variant, which carries a shadow and no border *width*. Measured in the browser:
   * `border-top-width: 0px`, `border-top-style: dashed`. So the dashed edge did not exist and the only
   * signal left was `bg-muted/30` — roughly 2% luminance from a ready card on the light palette.
   *
   * jsdom has no Tailwind stylesheet, so this asserts the classes rather than the pixels. That is the
   * layer at which the defect actually lived: a border style with no width, and a shadow the border
   * was not allowed to sit beside.
   */
  it('gives a gated step a border width instead of a shadow', () => {
    mountSection(<McpSection />);
    const gated = document.getElementById('mcp-step-2');
    expect(gated).not.toBeNull();

    expect(gated).toHaveAttribute('aria-disabled', 'true');
    // The style is useless without the width — that pairing is the whole regression.
    expect(gated!.className).toMatch(/\bborder-dashed\b/);
    expect(gated!.className).toMatch(/\bborder\b(?!-)/);
    // DESIGN.md: a card takes a border or a shadow, never both.
    expect(gated!.className).not.toMatch(/\bshadow-card\b/);
  });

  /**
   * Ready and gated now differ by border *style*, not by border-versus-shadow.
   *
   * Every step is bordered since the `nested-cards` finding: `SectionPanel` and each `Card` painted
   * the same `bg-card` ground at the same radius, so the shadow meant to separate them was — by
   * DESIGN.md's own measurement — near-black on a near-black ground. A hairline separates them; the
   * style says whether the step can be attempted.
   */
  it('leaves a reachable step solid-bordered with no dashed edge and no shadow', () => {
    mountSection(<McpSection />);
    const ready = document.getElementById('mcp-step-1');
    expect(ready).not.toBeNull();

    expect(ready).not.toHaveAttribute('aria-disabled');
    expect(ready!.className).toMatch(/\bborder\b(?!-)/);
    expect(ready!.className).not.toMatch(/\bborder-dashed\b/);
    expect(ready!.className).not.toMatch(/\bshadow-card\b/);
  });

  /**
   * `pointer-events-none` stops a mouse and nothing else.
   *
   * Measured on the live page before this: gated steps 2, 3 and 4 offered 2, 4 and 3 tabbable controls
   * while announcing `aria-disabled`, so a keyboard user could tab in and type into a step the
   * interface had declared unreachable — strictly worse than the mouse user it did block.
   *
   * The fix is a disabled `fieldset` rather than `inert`, and the second half of this test is why:
   * `inert` would also drop the subtree from the accessibility tree, and this wizard renders all six
   * steps at once so the whole flow can be read before any of it is run.
   */
  it('disables a gated step to the keyboard without hiding it from assistive tech', () => {
    mountSection(<McpSection />);
    const gated = document.getElementById('mcp-step-2');
    const controls = gated!.querySelectorAll('input, button, select, textarea');
    expect(controls.length).toBeGreaterThan(0);
    controls.forEach((c) => expect(c).toBeDisabled());

    // Readable, not hidden — the whole reason this is a fieldset and not `inert`.
    expect(gated!.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(within(gated!).getByText(/Step 2 \(optional\): Register Client/i)).toBeInTheDocument();
    expect(within(gated!).getByLabelText(/CIMD URL \(for CIMD flow\)/i)).toBeInTheDocument();
  });

  it('leaves a reachable step fully operable', () => {
    mountSection(<McpSection />);
    const ready = document.getElementById('mcp-step-1');
    expect(within(ready!).getByLabelText(/Issuer URL/i)).not.toBeDisabled();
    expect(within(ready!).getByRole('button', { name: /Fetch Metadata/i })).not.toBeDisabled();
  });

  /**
   * A gated step has to say what unblocks it.
   *
   * "Not yet" without "not yet until what" tells the reader they are stuck and nothing else, and five
   * of the six steps are gated on arrival. The sentence names the *step to run* rather than the state
   * to acquire — "needs `asData`" would be a sentence about this codebase, not about the next click.
   */
  it('tells a gated step what unblocks it, and stops saying so once it is reachable', async () => {
    vi.spyOn(mcpService, 'fetchAsMetadata').mockResolvedValue(AS_METADATA);
    mountSection(<McpSection />);

    expect(
      within(document.getElementById('mcp-step-2')!).getByText(/Run Step 1 first/i),
    ).toBeInTheDocument();
    expect(
      within(document.getElementById('mcp-step-3')!).getByText(/Run Step 1 first/i),
    ).toBeInTheDocument();
    expect(
      within(document.getElementById('mcp-step-4')!).getByText(
        /Build the authorization URL in Step 3 first/i,
      ),
    ).toBeInTheDocument();
    expect(
      within(document.getElementById('mcp-step-5')!).getByText(
        /Exchange a code for an access token in Step 4 first/i,
      ),
    ).toBeInTheDocument();

    press(/Fetch Metadata/i);
    await screen.findByText(/DCR Supported/i);

    // Steps 2 and 3 are reachable now, so the instruction has to go — a stale "run Step 1 first" on a
    // live card is worse than none.
    expect(
      within(document.getElementById('mcp-step-2')!).queryByText(/Run Step 1 first/i),
    ).toBeNull();
    expect(
      within(document.getElementById('mcp-step-3')!).queryByText(/Run Step 1 first/i),
    ).toBeNull();
    // Step 4 still gates on the authorization URL, so its instruction stays.
    expect(
      within(document.getElementById('mcp-step-4')!).getByText(
        /Build the authorization URL in Step 3 first/i,
      ),
    ).toBeInTheDocument();
  });

  /**
   * Step 2's dead end: the card un-gated on a successful Step 1 while both of its buttons stayed
   * disabled on conditions of their own, stated nowhere. The interface said "proceed" and "you may
   * not" at once, at the decision point with the most controls and the least guidance.
   */
  it('states each of step 2 preconditions where the control is', async () => {
    vi.spyOn(mcpService, 'fetchAsMetadata').mockResolvedValue(AS_METADATA);
    mountSection(<McpSection />);
    press(/Fetch Metadata/i);
    await screen.findByText(/DCR Supported/i);
    const step2 = document.getElementById('mcp-step-2')!;

    // DCR is dead without the admin credentials, and now says so.
    expect(within(step2).getByRole('button', { name: /DCR \(admin register\)/i })).toBeDisabled();
    expect(
      within(step2).getByText(/needs the admin credentials at the top of this section/i),
    ).toBeInTheDocument();

    // CIMD is dead without a URL, and the field that supplies it is wired to the button by a hint the
    // screen reader gets too — `aria-describedby`, not a bare paragraph.
    const cimd = within(step2).getByLabelText(/CIMD URL \(for CIMD flow\)/i);
    expect(
      within(step2).getByRole('button', { name: /CIMD \(URL as client_id\)/i }),
    ).toBeDisabled();
    const describedBy = cimd.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(/enables the CIMD button/i);

    // The field has to come before the button it turns on.
    expect(
      cimd.compareDocumentPosition(
        within(step2).getByRole('button', { name: /CIMD \(URL as client_id\)/i }),
      ),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  /**
   * Step 3 gates on the AS metadata and never on step 2, so the numbering overstates it. The card now
   * says so rather than leaving the reader to infer it from two `stepState` calls.
   */
  it('marks step 2 optional and says what to do instead', () => {
    mountSection(<McpSection />);
    const step2 = document.getElementById('mcp-step-2')!;
    expect(within(step2).getByText(/Step 2 \(optional\): Register Client/i)).toBeInTheDocument();
    expect(
      within(step2).getByText(/skip it to authorize with the client ID already filled in/i),
    ).toBeInTheDocument();
  });

  /**
   * The state has to actually move, not merely start out right. Step 2 gates on `asData`, so a
   * successful Step 1 is what unblocks it.
   */
  it('drops the gated treatment once the prerequisite has happened', async () => {
    vi.spyOn(mcpService, 'fetchAsMetadata').mockResolvedValue(AS_METADATA);
    mountSection(<McpSection />);
    press(/Fetch Metadata/i);
    await screen.findByText(/DCR Supported/i);

    const step2 = document.getElementById('mcp-step-2');
    expect(step2).not.toHaveAttribute('aria-disabled');
    expect(step2!.className).not.toMatch(/\bborder-dashed\b/);
    expect(step2!.className).toMatch(/\bborder\b(?!-)/);
    // And the controls come back with it — the fieldset has to release them, not just the styling.
    expect(within(step2!).getByLabelText(/CIMD URL \(for CIMD flow\)/i)).not.toBeDisabled();
  });
});

describe('McpSection — the selected lookup is addressable', () => {
  /**
   * The tenth and last `TabBar` to move to `?op=`. No fallback here, deliberately: none of the three
   * lookups is the obvious default and the section reads fine with all three collapsed, so an absent
   * `?op=` means absent rather than "the first one".
   */
  it('opens the lookup named in the URL', () => {
    mountSectionAt(<McpSection />, '/mcp?op=cimd');

    expect(screen.getByRole('tab', { name: /CIMD Metadata/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // The other two must be *off*, not merely un-asserted — a section that ignored `?op=` and selected
    // its first tab would satisfy a one-sided check. `CIMD URL` is deliberately not queried: the
    // six-step wizard below renders a field by that name too, and the anchored label matches both.
    expect(screen.getByRole('tab', { name: /AS Metadata/i })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(screen.getByRole('tab', { name: /Protected Resource/i })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('writes the lookup back to the URL', async () => {
    const view = mountSectionAt(<McpSection />, '/mcp');
    await selectOp(/Protected Resource/i);

    expect(new URLSearchParams(view.search()).get('op')).toBe('resource-metadata');
  });

  it('selects nothing on a value that does not exist, rather than asking getDoc for it', () => {
    mountSectionAt(<McpSection />, '/mcp?op=not_a_lookup');

    for (const name of [/AS Metadata/i, /Protected Resource/i, /CIMD Metadata/i]) {
      expect(screen.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'false');
    }
  });
});

describe('McpSection — every wizard step is addressable', () => {
  /**
   * **The hook and the anchors are two halves and neither is worth anything alone.**
   * `useHashScroll.test.tsx` drives the hook against its own fixture, so it cannot see a wizard whose
   * steps carry no `id` — which is the whole point of `#mcp-step-4`. This asserts the targets exist,
   * that they are focusable, and that they are on the right cards.
   */
  it('gives each of the six steps an id that can take focus', () => {
    mountSection(<McpSection />);

    for (const n of [1, 2, 3, 4, 5, 6]) {
      const step = document.getElementById(`mcp-step-${n}`);
      expect(step, `#mcp-step-${n} is what a link to that step points at`).not.toBeNull();
      // Without this the fragment scrolls the page and leaves the keyboard at the top of the document.
      expect(step).toHaveAttribute('tabindex', '-1');
    }
  });

  it('anchors each id to the card that actually holds that step', () => {
    mountSection(<McpSection />);

    expect(document.getElementById('mcp-step-1')).toHaveTextContent(/Discover AS/i);
    expect(document.getElementById('mcp-step-4')).toHaveTextContent(/Token Exchange/i);
    expect(document.getElementById('mcp-step-6')).toHaveTextContent(/Introspect/i);
  });
});
