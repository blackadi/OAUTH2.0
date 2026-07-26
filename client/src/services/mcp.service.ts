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

async function exchangeCode(params: {
  tokenEndpoint: string;
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<unknown> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  });
  return http.postForm(params.tokenEndpoint, body);
}

async function introspectToken(tokenEndpoint: string, token: string): Promise<unknown> {
  const body = new URLSearchParams({ token });
  return http.postForm(tokenEndpoint.replace('/token', '/introspection/standard'), body);
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
