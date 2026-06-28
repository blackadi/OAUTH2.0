import {
  DEVICE_AUTHORIZATION_ENDPOINT,
  DEVICE_VERIFICATION_ENDPOINT,
  DEVICE_COMPLETE_ENDPOINT,
} from '@/config';
import { http } from './http';

async function authorization(body: Record<string, string>): Promise<unknown> {
  return http.postJson(DEVICE_AUTHORIZATION_ENDPOINT, body);
}

async function verification(userCode: string): Promise<unknown> {
  return http.postJson(DEVICE_VERIFICATION_ENDPOINT, { userCode });
}

async function complete(
  userCode: string,
  result: string,
  subject: string,
): Promise<unknown> {
  return http.postJson(DEVICE_COMPLETE_ENDPOINT, { userCode, result, subject });
}

export const deviceService = { authorization, verification, complete };
