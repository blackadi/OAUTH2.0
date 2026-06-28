import {
  CLIENT_LIST_ENDPOINT,
  CLIENT_GET_ENDPOINT,
  CLIENT_CREATE_ENDPOINT,
  CLIENT_UPDATE_ENDPOINT,
  CLIENT_DELETE_ENDPOINT,
  CLIENT_FLAG_ENDPOINT,
  CLIENT_SECRET_REFRESH_ENDPOINT,
  CLIENT_SECRET_UPDATE_ENDPOINT,
  CLIENT_AUTH_LIST_ENDPOINT,
  CLIENT_AUTH_UPDATE_ENDPOINT,
  CLIENT_AUTH_DELETE_ENDPOINT,
  CLIENT_SCOPES_GRANTED_ENDPOINT,
  CLIENT_SCOPES_REQUESTABLE_ENDPOINT,
} from '@/config';
import { http } from './http';

async function listClients(auth: string, start?: number, end?: number): Promise<unknown> {
  let url = CLIENT_LIST_ENDPOINT;
  const params = new URLSearchParams();
  if (start !== undefined) params.set('start', String(start));
  if (end !== undefined) params.set('end', String(end));
  const qs = params.toString();
  if (qs) url += `?${qs}`;
  return http.getJson(url, auth);
}

async function getClient(clientId: string, auth: string): Promise<unknown> {
  return http.getJson(`${CLIENT_GET_ENDPOINT}/${encodeURIComponent(clientId)}`, auth);
}

async function createClient(body: Record<string, unknown>, auth: string): Promise<unknown> {
  return http.postAdmin(CLIENT_CREATE_ENDPOINT, body, auth);
}

async function updateClient(
  clientId: string,
  body: Record<string, unknown>,
  auth: string,
): Promise<unknown> {
  return http.patch(`${CLIENT_UPDATE_ENDPOINT}/${encodeURIComponent(clientId)}`, body, auth);
}

async function deleteClient(clientId: string, auth: string): Promise<void> {
  const response = await fetch(`${CLIENT_DELETE_ENDPOINT}/${encodeURIComponent(clientId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!response.ok) throw new Error(await response.text());
}

async function lockFlag(
  clientIdentifier: string,
  locked: boolean,
  auth: string,
): Promise<unknown> {
  return http.patch(
    `${CLIENT_FLAG_ENDPOINT}/${encodeURIComponent(clientIdentifier)}`,
    { clientLocked: locked },
    auth,
  );
}

async function refreshSecret(clientIdentifier: string, auth: string): Promise<unknown> {
  return http.postAdmin(
    `${CLIENT_SECRET_REFRESH_ENDPOINT}/${encodeURIComponent(clientIdentifier)}`,
    {},
    auth,
  );
}

async function updateSecret(
  clientIdentifier: string,
  clientSecret: string,
  auth: string,
): Promise<unknown> {
  return http.put(
    `${CLIENT_SECRET_UPDATE_ENDPOINT}/${encodeURIComponent(clientIdentifier)}`,
    { clientSecret },
    auth,
  );
}

async function listAuth(subject: string, auth: string): Promise<unknown> {
  return http.getJson(`${CLIENT_AUTH_LIST_ENDPOINT}/${encodeURIComponent(subject)}`, auth);
}

async function updateAuth(
  clientId: string,
  body: Record<string, unknown>,
  auth: string,
): Promise<unknown> {
  return http.postAdmin(`${CLIENT_AUTH_UPDATE_ENDPOINT}/${encodeURIComponent(clientId)}`, body, auth);
}

async function deleteAuth(
  clientId: string,
  subject: string,
  auth: string,
): Promise<unknown> {
  return http.del(
    `${CLIENT_AUTH_DELETE_ENDPOINT}/${encodeURIComponent(clientId)}/${encodeURIComponent(subject)}`,
    auth,
  );
}

async function getGrantedScopes(
  clientId: string,
  subject: string,
  auth: string,
): Promise<unknown> {
  return http.getJson(
    `${CLIENT_SCOPES_GRANTED_ENDPOINT}/${encodeURIComponent(clientId)}/${encodeURIComponent(subject)}`,
    auth,
  );
}

async function deleteGrantedScopes(
  clientId: string,
  subject: string,
  auth: string,
): Promise<unknown> {
  return http.del(
    `${CLIENT_SCOPES_GRANTED_ENDPOINT}/${encodeURIComponent(clientId)}/${encodeURIComponent(subject)}`,
    auth,
  );
}

async function getRequestableScopes(clientId: string, auth: string): Promise<unknown> {
  return http.getJson(`${CLIENT_SCOPES_REQUESTABLE_ENDPOINT}/${encodeURIComponent(clientId)}`, auth);
}

async function updateRequestableScopes(
  clientId: string,
  body: Record<string, unknown>,
  auth: string,
): Promise<unknown> {
  return http.put(
    `${CLIENT_SCOPES_REQUESTABLE_ENDPOINT}/${encodeURIComponent(clientId)}`,
    body,
    auth,
  );
}

async function deleteRequestableScopes(clientId: string, auth: string): Promise<void> {
  const response = await fetch(
    `${CLIENT_SCOPES_REQUESTABLE_ENDPOINT}/${encodeURIComponent(clientId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Basic ${auth}` },
    },
  );
  if (!response.ok) throw new Error(await response.text());
}

export const clientService = {
  listClients,
  getClient,
  createClient,
  updateClient,
  deleteClient,
  lockFlag,
  refreshSecret,
  updateSecret,
  listAuth,
  updateAuth,
  deleteAuth,
  getGrantedScopes,
  deleteGrantedScopes,
  getRequestableScopes,
  updateRequestableScopes,
  deleteRequestableScopes,
};
