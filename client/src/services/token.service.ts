import {
  TOKEN_ENDPOINT,
  USERINFO_ENDPOINT,
  INTROSPECTION_ENDPOINT,
  INTROSPECTION_STANDARD_ENDPOINT,
  REVOCATION_ENDPOINT,
  DISCOVERY_ENDPOINT,
  JWKS_ENDPOINT,
} from '@/config';
import { http } from './http';
import { dpopRequest, type DpopProofSource } from './dpop-fetch';
import type { TokenRequest, TokenResponse, JwksResponse } from '@/types';

async function exchangeCodeForToken(tokenRequest: TokenRequest): Promise<TokenResponse> {
  const params = new URLSearchParams(tokenRequest as unknown as Record<string, string>);
  return http.postForm(TOKEN_ENDPOINT, params) as Promise<TokenResponse>;
}

export interface TokenResponseWithNonce {
  tokenResponse: TokenResponse;
  dpopNonce?: string;
}

async function exchangeCodeForTokenWithDpop(
  tokenRequest: TokenRequest,
  dpopProof: DpopProofSource,
): Promise<TokenResponseWithNonce> {
  const params = new URLSearchParams(tokenRequest as unknown as Record<string, string>);
  // A `use_dpop_nonce` refusal happens *before* the authorization code is redeemed — verified live
  // 2026-08-17 — so the retry inside `dpopRequest` replays the same code successfully. The dance costs
  // a round trip, not a re-authorization.
  const { data, dpopNonce } = await dpopRequest(TOKEN_ENDPOINT, dpopProof, (proof) => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      DPoP: proof,
    },
    body: params.toString(),
  }));
  return { tokenResponse: data as TokenResponse, dpopNonce };
}

async function clientCredentials(
  clientId: string,
  clientSecret: string,
  scope: string,
): Promise<TokenResponse> {
  const params = new URLSearchParams({ grant_type: 'client_credentials', scope });
  return http.postBasicAuth(TOKEN_ENDPOINT, params, clientId, clientSecret) as Promise<TokenResponse>;
}

async function passwordGrant(
  username: string,
  password: string,
  clientId: string,
  clientSecret: string,
  scope: string,
): Promise<TokenResponse> {
  const params = new URLSearchParams({ grant_type: 'password', username, password, scope });
  return http.postBasicAuth(TOKEN_ENDPOINT, params, clientId, clientSecret) as Promise<TokenResponse>;
}

async function refreshToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<TokenResponse> {
  const params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });
  return http.postBasicAuth(TOKEN_ENDPOINT, params, clientId, clientSecret) as Promise<TokenResponse>;
}

async function jwtBearerGrant(
  assertion: string,
  clientId?: string,
  clientSecret?: string,
  scope?: string,
): Promise<TokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  if (scope) params.append('scope', scope);
  if (clientId && clientSecret) {
    return http.postBasicAuth(TOKEN_ENDPOINT, params, clientId, clientSecret) as Promise<TokenResponse>;
  }
  if (clientId) params.append('client_id', clientId);
  return http.postForm(TOKEN_ENDPOINT, params) as Promise<TokenResponse>;
}

export interface UserinfoResponseWithNonce {
  data: unknown;
  dpopNonce?: string;
}

async function userInfo(accessToken: string): Promise<unknown> {
  return http.getWithBearer(USERINFO_ENDPOINT, accessToken);
}

async function userInfoWithDpop(
  accessToken: string,
  dpopProof: DpopProofSource,
): Promise<UserinfoResponseWithNonce> {
  // RFC 9449 §9: a *protected resource* answers a missing nonce with 401, not §8's 400. `dpopRequest`
  // keys off the `use_dpop_nonce` error code rather than the status, so it handles both.
  return dpopRequest(USERINFO_ENDPOINT, dpopProof, (proof) => ({
    method: 'POST',
    headers: {
      // RFC 9449 §7.1: a DPoP-bound access token is sent with the `DPoP` scheme, not `Bearer`.
      // §7.2 requires a protected resource to reject a DPoP-bound token received as a bearer token,
      // so `Bearer` here would be refused — and if it were not, it would silently discard the binding.
      Authorization: `DPoP ${accessToken}`,
      'Content-Type': 'application/json',
      DPoP: proof,
      Accept: 'application/json',
    },
  }));
}

/**
 * Both introspection endpoints require this deployment's admin Basic credentials.
 *
 * RFC 7662 §2.1 requires the endpoint to be protected, and until 2026-08-12 neither was — anyone could post
 * a string and learn whether it was a live token. The `Authorization` header therefore carries the admin
 * credentials now; it previously carried `Bearer <access token>`, which the server never read.
 */
async function introspection(
  token: string,
  adminClientId: string,
  adminClientSecret: string,
  options?: { acrValues?: string; maxAge?: number },
): Promise<unknown> {
  const params: Record<string, string> = { token };
  if (options?.acrValues) params.acrValues = options.acrValues;
  if (options?.maxAge !== undefined) params.maxAge = String(options.maxAge);
  return http.postBasicAuth(
    INTROSPECTION_ENDPOINT,
    new URLSearchParams(params),
    adminClientId,
    adminClientSecret,
  );
}

async function introspectionStandard(
  token: string,
  adminClientId: string,
  adminClientSecret: string,
): Promise<unknown> {
  return http.postBasicAuth(
    INTROSPECTION_STANDARD_ENDPOINT,
    new URLSearchParams({ token }),
    adminClientId,
    adminClientSecret,
  );
}

async function revocation(
  token: string,
  clientId?: string,
  clientSecret?: string,
  tokenTypeHint?: string,
): Promise<void> {
  const params = new URLSearchParams({ token });
  if (tokenTypeHint) params.append('token_type_hint', tokenTypeHint);
  if (clientId && clientSecret) {
    await http.postBasicAuth(REVOCATION_ENDPOINT, params, clientId, clientSecret);
  } else {
    await http.postForm(REVOCATION_ENDPOINT, params);
  }
}

async function discovery(): Promise<unknown> {
  return http.getJson(DISCOVERY_ENDPOINT);
}

async function getJwks(): Promise<JwksResponse> {
  // The one response in this file that is *validated* rather than passed through, because the JWT
  // inspector will verify signatures against it: a document with no `keys` array is not a key set, and
  // failing here beats failing later inside a verification routine.
  const data = await http.getJson(JWKS_ENDPOINT);
  if (!data || typeof data !== 'object' || !('keys' in data) || !Array.isArray(data.keys)) {
    throw new Error('Invalid JWKS response format');
  }
  return data as JwksResponse;
}

export const tokenService = {
  exchangeCodeForToken,
  exchangeCodeForTokenWithDpop,
  clientCredentials,
  passwordGrant,
  refreshToken,
  jwtBearerGrant,
  userInfo,
  userInfoWithDpop,
  introspection,
  introspectionStandard,
  revocation,
  discovery,
  getJwks,
};
