import {
  CIBA_AUTHENTICATION_ENDPOINT,
  CIBA_ISSUE_ENDPOINT,
  CIBA_FAIL_ENDPOINT,
  CIBA_COMPLETE_ENDPOINT,
  TOKEN_ENDPOINT,
} from '@/config';
import { http } from './http';

const CIBA_GRANT_TYPE = 'urn:openid:params:grant-type:ciba';

/**
 * Client credentials to present via HTTP Basic, for `client_secret_basic` clients.
 *
 * Authlete matches the channel credentials arrive on against the client's registered auth method, so the
 * caller picks the channel. A `client_secret_basic` client must use this header; a `client_secret_post`
 * client must instead carry `clientId`/`clientSecret` in the JSON body, which the server merges into
 * `parameters`. Sending the wrong one earns `401 [A157357]` either way — the same rule PAR follows.
 *
 * `AGENTS.md` recommends `CLIENT_SECRET_BASIC` for CIBA, per Authlete's own guide, and until 2026-08-13 the
 * server never read this header at all, so that recommended configuration could not authenticate.
 */
export interface BasicAuth {
  clientId: string;
  clientSecret: string;
}

function basicHeader(auth?: BasicAuth): Record<string, string> {
  if (!auth?.clientId) return {};
  return { Authorization: `Basic ${btoa(`${auth.clientId}:${auth.clientSecret}`)}` };
}

async function backchannelAuthentication(
  body: Record<string, string>,
  basicAuth?: BasicAuth,
): Promise<unknown> {
  return http.postJson(CIBA_AUTHENTICATION_ENDPOINT, body, basicHeader(basicAuth));
}

async function issue(ticket: string): Promise<unknown> {
  return http.postJson(CIBA_ISSUE_ENDPOINT, { ticket });
}

async function fail(ticket: string, reason: string): Promise<unknown> {
  return http.postJson(CIBA_FAIL_ENDPOINT, { ticket, reason });
}

async function complete(ticket: string, result: string, subject: string): Promise<unknown> {
  return http.postJson(CIBA_COMPLETE_ENDPOINT, { ticket, result, subject });
}

async function pollToken(
  authReqId: string,
  clientId?: string,
  clientSecret?: string,
): Promise<{ status: number; body: unknown }> {
  const params = new URLSearchParams({
    grant_type: CIBA_GRANT_TYPE,
    auth_req_id: authReqId,
  });
  if (clientId && clientSecret) {
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
  }
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const body = await response.json();
  return { status: response.status, body };
}

export const cibaService = { backchannelAuthentication, issue, fail, complete, pollToken };
