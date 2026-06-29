import {
  FEDERATION_CONFIGURATION_ENDPOINT,
  FEDERATION_REGISTRATION_ENDPOINT,
} from '@/config';
import { http } from './http';

async function getConfiguration(): Promise<unknown> {
  return http.getJson(FEDERATION_CONFIGURATION_ENDPOINT);
}

async function register(body: Record<string, string>, auth: string): Promise<unknown> {
  return http.postAdmin(FEDERATION_REGISTRATION_ENDPOINT, body, auth);
}

export const federationService = { getConfiguration, register };
