import { PAR_ENDPOINT } from '@/config';
import { http } from './http';
import { dpopRequest, type DpopProofSource } from './dpop-fetch';

export interface ParResponseWithNonce {
  data: unknown;
  dpopNonce?: string;
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
