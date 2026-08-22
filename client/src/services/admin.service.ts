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
  await http.del(`${TOKEN_DELETE_ENDPOINT}/${encodeURIComponent(accessTokenIdentifier)}`, auth);
}

async function reissueToken(body: Record<string, string>, auth: string): Promise<unknown> {
  return http.postAdmin(TOKEN_REISSUE_ENDPOINT, body, auth);
}

/**
 * `auth` was missing, making this the one admin call in this file that sent no credentials.
 *
 * `GET /api/token/createLocalToken` is development-only *and* admin-authenticated — the `checkAuth`
 * call sits deliberately after the `nodeEnv` guard, so production answers a flat 404 and development
 * answers 401 without credentials. It had been the only admin route with no auth check at all; when
 * that was closed on the server, this caller was not updated, so the button could not work in the one
 * environment where the endpoint exists.
 */
async function localToken(params: Record<string, string>, auth: string): Promise<unknown> {
  const qs = new URLSearchParams(params).toString();
  return http.getJson(`${TOKEN_LOCAL_ENDPOINT}?${qs}`, auth);
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
