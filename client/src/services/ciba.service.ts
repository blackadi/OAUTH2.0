import {
  CIBA_AUTHENTICATION_ENDPOINT,
  CIBA_ISSUE_ENDPOINT,
  CIBA_FAIL_ENDPOINT,
  CIBA_COMPLETE_ENDPOINT,
  TOKEN_ENDPOINT,
} from '@/config';
import { http } from './http';

const CIBA_GRANT_TYPE = 'urn:openid:params:grant-type:ciba';

async function backchannelAuthentication(body: Record<string, string>): Promise<unknown> {
  return http.postJson(CIBA_AUTHENTICATION_ENDPOINT, body);
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
