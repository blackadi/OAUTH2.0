import { FAPI_CONFIG_ENDPOINT, FAPI_STATUS_ENDPOINT } from '@/config';
import { http } from './http';

async function getConfig(): Promise<unknown> {
  return http.getJson(FAPI_CONFIG_ENDPOINT);
}

async function getStatus(): Promise<unknown> {
  return http.getJson(FAPI_STATUS_ENDPOINT);
}

export const fapiService = { getConfig, getStatus };
