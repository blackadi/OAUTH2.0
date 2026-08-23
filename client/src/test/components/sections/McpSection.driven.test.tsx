import { screen, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpSection } from '@/components/mcp/McpSection';
import { mcpService, dcrService } from '@/services';
import {
  mountSection,
  fill,
  fillAdminCredentials,
  press,
  expectCall,
  expectSends,
  expectReadsBack,
  resetSectionState,
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

  it('renders the authorization URL it built, since the user has to open it by hand', async () => {
    vi.spyOn(mcpService, 'fetchAsMetadata').mockResolvedValue(AS_METADATA);
    mountSection(<McpSection />);
    press(/Fetch Metadata/i);
    await screen.findByText(/DCR Supported/i);
    press(/Build Authorization URL/i);

    const link = await screen.findByRole('link', { name: /\/api\/authorization/ });
    const url = new URL(link.getAttribute('href')!);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state'), 'RFC 9207 mix-up defence needs one').toBeTruthy();
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
   */
  it('explains a wizard refusal instead of printing it raw', async () => {
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
    expect(screen.getAllByText(/A157303/)).toHaveLength(2);
  });
});
