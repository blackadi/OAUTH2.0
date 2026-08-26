import { HEALTH_ENDPOINT, HEALTH_ALL_ENDPOINT, HEALTH_AUTHLETE_ENDPOINT } from '@/config';
import { http } from './http';
import { healthSchema, overallHealthSchema } from './schemas';
import type { HealthResponse, AuthleteHealthResponse, OverallHealthResponse } from '@/types';

async function serverHealth(): Promise<HealthResponse> {
  return http.getJson(HEALTH_ENDPOINT, undefined, healthSchema) as Promise<HealthResponse>;
}

async function overallHealth(): Promise<OverallHealthResponse> {
  return http.getJson(
    HEALTH_ALL_ENDPOINT,
    undefined,
    overallHealthSchema,
  ) as Promise<OverallHealthResponse>;
}

async function authleteHealth(extended: boolean): Promise<AuthleteHealthResponse> {
  const url = extended ? `${HEALTH_AUTHLETE_ENDPOINT}?extended=true` : HEALTH_AUTHLETE_ENDPOINT;
  return http.getJson(url) as Promise<AuthleteHealthResponse>;
}

export const healthService = { serverHealth, overallHealth, authleteHealth };
