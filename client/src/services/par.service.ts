import { PAR_ENDPOINT } from '@/config';
import { http } from './http';
import { dpopRequest, type DpopProofSource } from './dpop-fetch';

export interface ParResponseWithNonce {
  data: unknown;
  dpopNonce?: string;
}

/**
 * The 201 body of `POST /api/par` — **RFC 9126 §2.2's own shape, not Authlete's envelope**.
 *
 * Since T1-11 the server answers with exactly `{"expires_in":600,"request_uri":"urn:…"}`. It used to
 * forward the vendor envelope, whose members are camelCase `requestUri`/`expiresIn` beside an `action`
 * and a `resultCode`. Both spellings therefore exist in this repo's history, and reading the old one
 * yields `undefined` rather than an error: `RarSection` kept reading `requestUri` after the change, so
 * its "push and redirect" button silently did nothing at all — no redirect, no message.
 *
 * This type exists so the next such change is a compile error instead of a dead button. Every member is
 * optional because nothing here parses the response and a debugging surface should render a missing
 * field as absent rather than throw — the same reasoning as `JarProcessResult`.
 */
export interface ParSuccessResponse {
  request_uri?: string;
  expires_in?: number;
}

/**
 * Client credentials to present via HTTP Basic, for `client_secret_basic` clients.
 *
 * Authlete matches the channel credentials arrive on against the client's registered auth
 * method. A `client_secret_basic` client must use this header; a `client_secret_post` client
 * must instead carry `clientId`/`clientSecret` in the JSON body, which the server merges into
 * the pushed `parameters`. Sending the wrong one earns a 401 from Authlete either way.
 */
export interface BasicAuth {
  clientId: string;
  clientSecret: string;
}

function basicHeader(auth?: BasicAuth): Record<string, string> {
  if (!auth?.clientId) return {};
  return { Authorization: `Basic ${btoa(`${auth.clientId}:${auth.clientSecret}`)}` };
}

async function pushedAuthorization(
  // Values are optional: with `client_secret_basic` the credentials travel in the header, so the
  // body carries `parameters` alone. A required-value record cannot express that.
  body: Record<string, string | undefined>,
  basicAuth?: BasicAuth,
): Promise<unknown> {
  return http.postJson(PAR_ENDPOINT, body, basicHeader(basicAuth));
}

async function pushedAuthorizationWithDpop(
  // Values are optional: with `client_secret_basic` the credentials travel in the header, so the
  // body carries `parameters` alone. A required-value record cannot express that.
  body: Record<string, string | undefined>,
  dpopProof: DpopProofSource,
  basicAuth?: BasicAuth,
): Promise<ParResponseWithNonce> {
  return dpopRequest(PAR_ENDPOINT, dpopProof, (proof) => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      DPoP: proof,
      ...basicHeader(basicAuth),
    },
    body: JSON.stringify(body),
  }));
}

export const parService = { pushedAuthorization, pushedAuthorizationWithDpop };
