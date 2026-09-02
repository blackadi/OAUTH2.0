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
import { tokenResponseSchema, asMetadataSchema, introspectionSchema } from './schemas';
import { dpopRequest, type DpopProofSource } from './dpop-fetch';
import { createProof, computeAth } from './dpop.service';
import { SESSION_KEYS, readJsonKey } from './session-keys';
import type { JWK } from './crypto-utils';
import type { TokenRequest, TokenResponse, JwksResponse } from '@/types';

async function exchangeCodeForToken(tokenRequest: TokenRequest): Promise<TokenResponse> {
  const params = new URLSearchParams(tokenRequest as unknown as Record<string, string>);
  return http.postForm(
    TOKEN_ENDPOINT,
    params,
    undefined,
    tokenResponseSchema,
  ) as Promise<TokenResponse>;
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

/**
 * One rule for the three grants below, and for `jwtBearerGrant` and `revocation` further down: **a
 * secret means Basic, no secret means `client_id` in the body.**
 *
 * These three sent `Authorization: Basic` unconditionally. Their secret fields were pre-filled from
 * `CLIENT_SECRET`, whose default was the literal `your_client_secret`, so a public client presenting a
 * placeholder was refused — probed live at the token endpoint: `Basic 4277838306:your_client_secret`
 * earns `401 [A157303] The request contains data for client authentication although the client type is
 * 'public' and the client authentication method is 'none'.` The Refresh Token button sat right beside
 * the authorization-code flow and failed for exactly the reason the code exchange did.
 *
 * `secretOrEmpty` now keeps the placeholder out, and an empty Basic password happens to be tolerated by
 * Authlete (measured) — but "the vendor tolerates it" is not the shape to ship. RFC 6749 §2.3.1 gives a
 * public client `client_id` and no credentials, which is what `device.service.pollToken`,
 * `jwtBearerGrant` and `revocation` already do. This makes the other three agree with them.
 */
function postWithOptionalBasic(
  params: URLSearchParams,
  clientId: string,
  clientSecret?: string,
): Promise<TokenResponse> {
  if (clientSecret) {
    return http.postBasicAuth(
      TOKEN_ENDPOINT,
      params,
      clientId,
      clientSecret,
      tokenResponseSchema,
    ) as Promise<TokenResponse>;
  }
  // A bare `client_id` beside no secret is one method, not two — and it is the only one a public client
  // has. (It is also why `client_id` alongside a Basic header is not the dual-channel shape the server
  // refuses: that rule counts a second *credential*.)
  params.set('client_id', clientId);
  return http.postForm(
    TOKEN_ENDPOINT,
    params,
    undefined,
    tokenResponseSchema,
  ) as Promise<TokenResponse>;
}

async function clientCredentials(
  clientId: string,
  clientSecret: string,
  scope: string,
): Promise<TokenResponse> {
  const params = new URLSearchParams({ grant_type: 'client_credentials', scope });
  return postWithOptionalBasic(params, clientId, clientSecret);
}

async function passwordGrant(
  username: string,
  password: string,
  clientId: string,
  clientSecret: string,
  scope: string,
): Promise<TokenResponse> {
  const params = new URLSearchParams({ grant_type: 'password', username, password, scope });
  return postWithOptionalBasic(params, clientId, clientSecret);
}

async function refreshToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<TokenResponse> {
  const params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });
  return postWithOptionalBasic(params, clientId, clientSecret);
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
    return http.postBasicAuth(
      TOKEN_ENDPOINT,
      params,
      clientId,
      clientSecret,
    ) as Promise<TokenResponse>;
  }
  if (clientId) params.append('client_id', clientId);
  return http.postForm(
    TOKEN_ENDPOINT,
    params,
    undefined,
    tokenResponseSchema,
  ) as Promise<TokenResponse>;
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
 * Call UserInfo with whatever this particular token requires. **The one place that decision is made.**
 *
 * **Why this exists.** The choice between `Bearer` and `DPoP` was made in two components — `TokenOps`
 * and the FAPI wizard's step 3 — and the two had already diverged, with only one of them correct.
 * `TokenOps` reads the private key out of `sessionStorage`; the wizard read it from a `useState` in
 * `use-fapi-flow`, which the authorization redirect destroys. Measured 2026-09-02: after the callback
 * the wizard's step-3 button is *enabled* (it is gated on the token, which is session-backed and
 * therefore present) and its proof factory throws `TypeError: Cannot read properties of null (reading
 * 'privateKey')`. The crash is deferred into the factory, so a test that mocks `userInfoWithDpop`
 * without invoking it sees nothing wrong — which is why the suite was green.
 *
 * The key comes from `sessionStorage` and never from a caller's memory, because that is the only copy
 * that survives a full-page navigation, and every flow that produces a DPoP-bound token here gets one.
 *
 * **A bound token has no bearer fallback.** RFC 9449 §7.1 gives it no bearer option and §7.2 requires
 * the resource to reject one; Authlete enforces it with `[A089311]`. So a missing key is reported as
 * what it is rather than quietly downgraded — the downgrade produced a request that could not succeed,
 * explained only by a vendor code.
 *
 * `ath` is REQUIRED when a proof accompanies an access token (§7.1) — and it is `ath`, not `sub`.
 */
async function userInfoForToken(accessToken: string, isDpopBound: boolean): Promise<unknown> {
  // Through `tokenService`, not the local bindings. This composes the two published operations rather
  // than reaching around them, so the scheme it picked stays observable from outside — the driven tests
  // assert *"presents a bearer token with the Bearer scheme"* by watching which transport the button
  // reached, and a direct local call makes that assertion silently unobservable rather than false.
  if (!isDpopBound) return tokenService.userInfo(accessToken);

  const dpopKey = readJsonKey<JWK>(SESSION_KEYS.dpopPrivateKey);
  if (!dpopKey) {
    throw new Error(
      'This access token is DPoP-bound, but the DPoP private key is no longer in this session — so no valid proof can be built for it. RFC 9449 §7.1 gives a bound token no bearer alternative. Obtain a new token with DPoP enabled.',
    );
  }

  const ath = await computeAth(accessToken);
  // A factory, not a finished proof: `dpopRequest` re-signs on a `use_dpop_nonce` refusal and the
  // nonce lives inside the signature, so a completed string could never be retried.
  const { data } = await tokenService.userInfoWithDpop(accessToken, (nonce) =>
    createProof(dpopKey, 'POST', USERINFO_ENDPOINT, ath, nonce),
  );
  return data;
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
    // RFC 7662 §2.2's shape. The **Authlete** introspection endpoint above deliberately gets no schema:
    // it answers a vendor envelope, not §2.2's body, and pinning one would reject correct responses.
    introspectionSchema,
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
  return http.getJson(DISCOVERY_ENDPOINT, undefined, asMetadataSchema);
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
  userInfoForToken,
  introspection,
  introspectionStandard,
  revocation,
  discovery,
  getJwks,
};
