/**
 * Thin request shapes over `transport.ts`.
 *
 * Each function here is one *kind* of request this app makes — form-encoded, Basic-authenticated,
 * admin JSON, and so on. They used to call `fetch` directly and end with
 * `if (!response.ok) throw new Error(await response.text())`, which discarded the status and every
 * response header nine times over. They now delegate to `send`, so every call is captured once and
 * appears in the request trace.
 *
 * **The signatures and behaviour are unchanged.** Each still resolves to the parsed body and still
 * rejects with an error whose `message` is the response body verbatim — `HttpError` sets it from the
 * raw text for exactly that reason. Callers that want the status can now read `err.status`; callers
 * that only ever did `toast.error(err)` are unaffected.
 */

import { sendForBody } from './transport';

const FORM = 'application/x-www-form-urlencoded';
const JSON_TYPE = 'application/json';

function basic(clientId: string, clientSecret: string): string {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

async function postForm(
  url: string,
  params: URLSearchParams,
  extraHeaders?: Record<string, string>,
): Promise<unknown> {
  return sendForBody({
    method: 'POST',
    url,
    headers: { 'Content-Type': FORM, ...extraHeaders },
    body: params.toString(),
  });
}

async function postBasicAuth(
  url: string,
  params: URLSearchParams,
  clientId: string,
  clientSecret: string,
): Promise<unknown> {
  return sendForBody({
    method: 'POST',
    url,
    headers: { 'Content-Type': FORM, Authorization: basic(clientId, clientSecret) },
    body: params.toString(),
  });
}

async function postAdmin(
  url: string,
  body: Record<string, unknown>,
  auth: string,
): Promise<unknown> {
  return sendForBody({
    method: 'POST',
    url,
    headers: { 'Content-Type': JSON_TYPE, Authorization: `Basic ${auth}` },
    body: JSON.stringify(body),
  });
}

async function postJson(
  url: string,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<unknown> {
  return sendForBody({
    method: 'POST',
    url,
    headers: { 'Content-Type': JSON_TYPE, ...headers },
    body: JSON.stringify(body),
  });
}

async function getJson(url: string, auth?: string): Promise<unknown> {
  return sendForBody({
    method: 'GET',
    url,
    headers: { Accept: JSON_TYPE, ...(auth ? { Authorization: `Basic ${auth}` } : {}) },
  });
}

async function getWithBearer(url: string, token: string): Promise<unknown> {
  return sendForBody({
    method: 'GET',
    url,
    headers: { Authorization: `Bearer ${token}`, Accept: JSON_TYPE },
  });
}

async function del(
  url: string,
  auth?: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  return sendForBody({
    method: 'DELETE',
    url,
    headers: {
      ...(auth ? { Authorization: `Basic ${auth}` } : {}),
      ...(body ? { 'Content-Type': JSON_TYPE } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function patch(url: string, body: Record<string, unknown>, auth: string): Promise<unknown> {
  return sendForBody({
    method: 'PATCH',
    url,
    headers: { 'Content-Type': JSON_TYPE, Authorization: `Basic ${auth}` },
    body: JSON.stringify(body),
  });
}

async function put(url: string, body: Record<string, unknown>, auth: string): Promise<unknown> {
  return sendForBody({
    method: 'PUT',
    url,
    headers: { 'Content-Type': JSON_TYPE, Authorization: `Basic ${auth}` },
    body: JSON.stringify(body),
  });
}

/**
 * The full result — status, headers, timing — rather than just the body.
 *
 * Exposed so a section can render "401 · WWW-Authenticate: DPoP …" instead of a bare red string. The
 * body-only helpers above stay the default because most call sites genuinely only want the body.
 */
export { send as sendRequest } from './transport';
export { HttpError, NetworkError } from './transport';
export type { HttpResult, SendInit } from './transport';

export const http = {
  postForm,
  postBasicAuth,
  postAdmin,
  postJson,
  getJson,
  getWithBearer,
  del,
  patch,
  put,
};
