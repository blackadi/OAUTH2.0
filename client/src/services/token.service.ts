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
  dpopProof: string,
): Promise<TokenResponseWithNonce> {
  const params = new URLSearchParams(tokenRequest as unknown as Record<string, string>);
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      DPoP: dpopProof,
    },
    body: params.toString(),
  });
  if (!response.ok) throw new Error(await response.text());
  const tokenResponse = (await response.json()) as TokenResponse;
  const dpopNonce = response.headers.get('dpop-nonce') || undefined;
  return { tokenResponse, dpopNonce };
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

export interface UserinfoResponseWithNonce {
  data: unknown;
  dpopNonce?: string;
}

async function userInfo(accessToken: string): Promise<unknown> {
  return http.getWithBearer(USERINFO_ENDPOINT, accessToken);
}

async function userInfoWithDpop(
  accessToken: string,
  dpopProof: string,
): Promise<UserinfoResponseWithNonce> {
  const response = await fetch(USERINFO_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      DPoP: dpopProof,
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  const dpopNonce = response.headers.get('dpop-nonce') || undefined;
  return { data, dpopNonce };
}

async function introspection(token: string, accessToken?: string): Promise<unknown> {
  const params = new URLSearchParams({ token });
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  const response = await fetch(INTROSPECTION_ENDPOINT, {
    method: 'POST',
    headers,
    body: params.toString(),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function introspectionStandard(token: string): Promise<unknown> {
  return http.postForm(INTROSPECTION_STANDARD_ENDPOINT, new URLSearchParams({ token }));
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
    const response = await fetch(REVOCATION_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: params.toString(),
    });
    if (!response.ok) throw new Error(await response.text());
  } else {
    await http.postForm(REVOCATION_ENDPOINT, params);
  }
}

async function discovery(): Promise<unknown> {
  return http.getJson(DISCOVERY_ENDPOINT);
}

async function getJwks(): Promise<JwksResponse> {
  const response = await fetch(JWKS_ENDPOINT, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`JWKS request failed with status ${response.status}`);
  const data = (await response.json()) as unknown;
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
  userInfo,
  userInfoWithDpop,
  introspection,
  introspectionStandard,
  revocation,
  discovery,
  getJwks,
};
