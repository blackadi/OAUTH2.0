import {
  TOKEN_CREATE_ENDPOINT,
  TOKEN_LIST_ENDPOINT,
  TOKEN_UPDATE_ENDPOINT,
  TOKEN_REVOKE_ENDPOINT,
  TOKEN_DELETE_ENDPOINT,
  TOKEN_REISSUE_ENDPOINT,
  TOKEN_LOCAL_ENDPOINT,
} from '@/config';
import { http } from './http';

async function createToken(body: Record<string, string>, auth: string): Promise<unknown> {
  return http.postAdmin(TOKEN_CREATE_ENDPOINT, body, auth);
}

async function listTokens(auth: string): Promise<unknown> {
  return http.getJson(TOKEN_LIST_ENDPOINT, auth);
}

async function updateToken(body: Record<string, string>, auth: string): Promise<unknown> {
  return http.patch(TOKEN_UPDATE_ENDPOINT, body, auth);
}

async function revokeToken(body: Record<string, string>, auth: string): Promise<unknown> {
  return http.postAdmin(TOKEN_REVOKE_ENDPOINT, body, auth);
}

async function deleteToken(accessTokenIdentifier: string, auth: string): Promise<void> {
  const response = await fetch(
    `${TOKEN_DELETE_ENDPOINT}/${encodeURIComponent(accessTokenIdentifier)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Basic ${auth}` },
    },
  );
  if (!response.ok) throw new Error(await response.text());
}

async function reissueToken(body: Record<string, string>, auth: string): Promise<unknown> {
  return http.postAdmin(TOKEN_REISSUE_ENDPOINT, body, auth);
}

async function localToken(params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams(params).toString();
  return http.getJson(`${TOKEN_LOCAL_ENDPOINT}?${qs}`);
}

export const adminService = {
  createToken,
  listTokens,
  updateToken,
  revokeToken,
  deleteToken,
  reissueToken,
  localToken,
};
