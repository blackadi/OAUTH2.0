import {
  HSK_CREATE_ENDPOINT,
  HSK_LIST_ENDPOINT,
  HSK_GET_ENDPOINT,
  HSK_DELETE_ENDPOINT,
} from '@/config';
import { http } from './http';

/** Mirrors the SDK's `HskCreateRequest` — see `server/src/services/hsk.service.ts`. */
export interface HskCreateBody {
  kty: string;
  hsmName: string;
  use?: string;
  kid?: string;
  alg?: string;
  [key: string]: unknown;
}

async function hskCreate(body: HskCreateBody, auth: string): Promise<unknown> {
  return http.postAdmin(HSK_CREATE_ENDPOINT, body, auth);
}

async function hskGet(handle: string, auth: string): Promise<unknown> {
  return http.getJson(`${HSK_GET_ENDPOINT}/${encodeURIComponent(handle)}`, auth);
}

/** Destructive — see the caller's confirmation dialog. This removes the handle at the Authlete service. */
async function hskDelete(handle: string, auth: string): Promise<unknown> {
  return http.del(`${HSK_DELETE_ENDPOINT}/${encodeURIComponent(handle)}`, auth);
}

async function hskList(auth: string): Promise<unknown> {
  return http.getJson(HSK_LIST_ENDPOINT, auth);
}

export const hskService = { hskCreate, hskGet, hskDelete, hskList };
