import { http } from './http';

async function fetchAsMetadata(issuerUrl: string): Promise<unknown> {
  // Try RFC 8414 first, then fall back to OIDC Discovery
  const wellKnownPaths = [
    '/.well-known/oauth-authorization-server',
    '/.well-known/openid-configuration',
  ];
  let lastError: Error | null = null;

  for (const path of wellKnownPaths) {
    const url = `${issuerUrl.replace(/\/$/, '')}${path}`;
    try {
      const data = await http.getJson(url);
      return data;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw lastError || new Error('Failed to fetch AS metadata from both well-known paths');
}

async function fetchProtectedResourceMetadata(resourceUrl: string): Promise<unknown> {
  const url = `${resourceUrl.replace(/\/$/, '')}/.well-known/oauth-protected-resource`;
  return http.getJson(url);
}

async function fetchCimdMetadata(cimdUrl: string): Promise<unknown> {
  return http.getJson(cimdUrl);
}

function buildAuthorizationUrl(params: {
  issuer: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string;
  resource?: string;
  state: string;
  requestUri?: string;
}): string {
  const baseUrl = `${params.issuer.replace(/\/$/, '')}/api/authorization`;

  const url = new URL(baseUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', params.scope);
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  if (params.resource) {
    url.searchParams.set('resource', params.resource);
  }
  if (params.requestUri) {
    url.searchParams.set('request_uri', params.requestUri);
  }

  return url.toString();
}

/**
 * Exchange the authorization code for tokens.
 *
 * `resource` is sent here **as well as** on the authorization request — MCP requires clients to send it in
 * *both*, and until 2026-08-14 this function did not accept the parameter at all (MCP-W1). Sending it only
 * on the authorization request is the easy half to get right and the useless one on its own: RFC 8707 §2.2
 * lets the token request narrow the audience of the token actually issued, so omitting it here means the
 * access token can come back without the `aud` the wizard's earlier step asked for — and nothing in the
 * response says so. Verify with introspection rather than by inspecting the request.
 */
/**
 * `clientSecret` is optional and is sent **only when non-empty**.
 *
 * The wizard registers its own client by DCR, and it used to ask for `CLIENT_SECRET_BASIC`, read the
 * `client_secret` out of the response, mention it in a toast and then drop it — so this exchange
 * carried no client authentication for a client that required some. It now registers `NONE` (a public
 * client with PKCE, which is what MCP and OAuth 2.1 expect of a browser app), but the secret is still
 * threaded through, because Authlete is on record overriding the requested auth method on DCR-created
 * clients — see "Client auth for DCR confidential clients" in AGENTS.md. The wizard therefore works
 * whichever answer comes back, rather than trusting what it asked for.
 *
 * Non-empty rather than merely defined, for the reason the SPA's own callback omits the parameter: a
 * public client sending client-auth data is refused with `[A157303]`, so an empty secret must not
 * become an empty `client_secret=`.
 */
async function exchangeCode(params: {
  tokenEndpoint: string;
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource?: string;
  clientSecret?: string;
}): Promise<unknown> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  });
  if (params.resource) {
    body.set('resource', params.resource);
  }
  if (params.clientSecret) {
    body.set('client_secret', params.clientSecret);
  }
  return http.postForm(params.tokenEndpoint, body);
}

/**
 * Introspect an MCP access token (RFC 7662).
 *
 * **Not currently called from anywhere** — the wizard's five steps stop at UserInfo, and the
 * `mcp.introspect` entry in `operationDocs.ts` has no surface to render on. It is kept rather than
 * deleted because that doc entry advertises the capability, and fixed rather than left alone because
 * dead code that is *wrong* costs whoever wires it up an hour of debugging. Two things were wrong:
 *
 * 1. **It sent no credentials.** `/api/introspection/standard` requires this deployment's admin Basic
 *    auth — RFC 7662 §2.1 requires the endpoint be protected, and until 2026-08-12 neither
 *    introspection endpoint here was, which made both token-scanning oracles. Unauthenticated, this
 *    could only ever have returned 401.
 * 2. **It derived the URL with `tokenEndpoint.replace('/token', …)`** — first-match substring surgery
 *    on a URL that may legitimately contain `/token` more than once. The endpoint is a member of the
 *    AS metadata document the wizard has already fetched, so pass it in rather than guessing.
 */
async function introspectToken(
  introspectionEndpoint: string,
  token: string,
  adminClientId: string,
  adminClientSecret: string,
): Promise<unknown> {
  return http.postBasicAuth(
    introspectionEndpoint,
    new URLSearchParams({ token }),
    adminClientId,
    adminClientSecret,
  );
}

async function fetchUserInfo(userInfoEndpoint: string, accessToken: string): Promise<unknown> {
  return http.getWithBearer(userInfoEndpoint, accessToken);
}

export const mcpService = {
  fetchAsMetadata,
  fetchProtectedResourceMetadata,
  fetchCimdMetadata,
  buildAuthorizationUrl,
  exchangeCode,
  introspectToken,
  fetchUserInfo,
};
