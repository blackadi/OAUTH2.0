import { PAR_ENDPOINT } from '@/config';
import { http } from './http';

async function pushedAuthorization(body: Record<string, string>): Promise<unknown> {
  return http.postJson(PAR_ENDPOINT, body);
}

export const parService = { pushedAuthorization };
