import {
  DEVICE_AUTHORIZATION_ENDPOINT,
  DEVICE_VERIFICATION_ENDPOINT,
  DEVICE_COMPLETE_ENDPOINT,
  TOKEN_ENDPOINT,
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

async function pollToken(
  deviceCode: string,
  clientId: string,
  clientSecret?: string,
): Promise<unknown> {
  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    device_code: deviceCode,
    client_id: clientId,
  });
  if (clientSecret) {
    params.append('client_secret', clientSecret);
  }
  return http.postForm(TOKEN_ENDPOINT, params);
}

export const deviceService = { authorization, verification, complete, pollToken };
