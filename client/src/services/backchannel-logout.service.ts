import {
  BACKCHANNEL_LOGOUT_ISSUE_ENDPOINT,
  BACKCHANNEL_LOGOUT_DELIVER_ENDPOINT,
  BACKCHANNEL_LOGOUT_DELIVER_ALL_ENDPOINT,
} from '@/config';
import { http } from './http';

async function issue(body: Record<string, string>, auth: string): Promise<unknown> {
  return http.postAdmin(BACKCHANNEL_LOGOUT_ISSUE_ENDPOINT, body, auth);
}

async function deliver(body: Record<string, string>, auth: string): Promise<unknown> {
  return http.postAdmin(BACKCHANNEL_LOGOUT_DELIVER_ENDPOINT, body, auth);
}

async function deliverAll(body: Record<string, string>, auth: string): Promise<unknown> {
  return http.postAdmin(BACKCHANNEL_LOGOUT_DELIVER_ALL_ENDPOINT, body, auth);
}

export const backchannelLogoutService = { issue, deliver, deliverAll };
