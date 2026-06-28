import {
  CIBA_AUTHENTICATION_ENDPOINT,
  CIBA_ISSUE_ENDPOINT,
  CIBA_FAIL_ENDPOINT,
  CIBA_COMPLETE_ENDPOINT,
} from '@/config';
import { http } from './http';

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

export const cibaService = { backchannelAuthentication, issue, fail, complete };
