import { HEALTH_ENDPOINT, HEALTH_AUTHLETE_ENDPOINT } from '@/config';
import { http } from './http';
import type { HealthResponse, AuthleteHealthResponse } from '@/types';

async function serverHealth(): Promise<HealthResponse> {
  return http.getJson(HEALTH_ENDPOINT) as Promise<HealthResponse>;
}

async function authleteHealth(extended: boolean): Promise<AuthleteHealthResponse> {
  const url = extended
    ? `${HEALTH_AUTHLETE_ENDPOINT}?extended=true`
    : HEALTH_AUTHLETE_ENDPOINT;
  return http.getJson(url) as Promise<AuthleteHealthResponse>;
}

export const healthService = { serverHealth, authleteHealth };
