import { PAR_ENDPOINT } from '@/config';
import { http } from './http';

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
  body: Record<string, string>,
  basicAuth?: BasicAuth,
): Promise<unknown> {
  return http.postJson(PAR_ENDPOINT, body, basicHeader(basicAuth));
}

async function pushedAuthorizationWithDpop(
  body: Record<string, string>,
  dpopProof: string,
  basicAuth?: BasicAuth,
): Promise<ParResponseWithNonce> {
  const response = await fetch(PAR_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      DPoP: dpopProof,
      ...basicHeader(basicAuth),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  const dpopNonce = response.headers.get('dpop-nonce') || undefined;
  return { data, dpopNonce };
}

export const parService = { pushedAuthorization, pushedAuthorizationWithDpop };
