import {
  DCR_REGISTER_ENDPOINT,
  DCR_GET_ENDPOINT,
  DCR_UPDATE_ENDPOINT,
  DCR_DELETE_ENDPOINT,
} from '@/config';
import { http } from './http';

async function dcrRegister(body: Record<string, string>, auth: string): Promise<unknown> {
  return http.postAdmin(DCR_REGISTER_ENDPOINT, body, auth);
}

async function dcrGet(token: string, clientId: string): Promise<unknown> {
  return http.postJson(DCR_GET_ENDPOINT, { token, clientId });
}

async function dcrUpdate(json: string, token: string, clientId: string): Promise<unknown> {
  return http.postJson(DCR_UPDATE_ENDPOINT, { json, token, clientId });
}

async function dcrDelete(token: string, clientId: string): Promise<unknown> {
  return http.postJson(DCR_DELETE_ENDPOINT, { token, clientId });
}

export const dcrService = { dcrRegister, dcrGet, dcrUpdate, dcrDelete };
