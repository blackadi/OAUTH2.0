import { API_BASE_URL } from '@/config';
import { http } from './http';

const JAR_ENDPOINT = `${API_BASE_URL}/api/jar/process`;

/**
 * What `POST /api/jar/process` returns — **an allowlist, mirroring the server's** `EXPOSED_FIELDS`
 * (`server/src/controllers/jar.controller.ts`).
 *
 * Since 2026-08-13 that endpoint returns exactly these five fields instead of Authlete's whole authorization
 * response, because the full response carries a `ticket` — a credential — plus the `service` configuration
 * and `client` metadata. Typing this as `any` here is what let the UI keep rendering
 * `requestObjectPayload`, a field the server had stopped sending; the type now makes that a compile error
 * rather than an empty panel.
 */
export interface JarProcessResult {
  action?: string;
  resultCode?: string;
  resultMessage?: string;
  responseContent?: string;
  scopes?: { name?: string; description?: string }[];
}

/**
 * `auth` is base64 `MGMT_CLIENT_ID:MGMT_CLIENT_SECRET` — **required**, and it was missing for months.
 *
 * The server put this endpoint behind `requireBasicAuth("jar")` on 2026-08-13 because the response it
 * used to forward carried a `ticket`, and a ticket is a credential: whoever holds one can drive an
 * authorization to completion. This function kept calling `http.postJson`, so the entire JAR section
 * answered **401 `Client authentication required`** for every user, with no way to supply credentials.
 *
 * Module 05's lab had passed `-u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET"` since the day of that change.
 * The documentation was updated and this caller was not — which is the actual lesson: **an auth gate
 * added on the server is a client change too, and the docs being right is not the client being right.**
 */
export async function processJar(
  request: string,
  clientId: string,
  auth: string,
): Promise<JarProcessResult> {
  // An assertion, not validation: `http.postAdmin` returns `unknown` and nothing here parses the response.
  // Every member of `JarProcessResult` is therefore optional, so a missing field reads as `undefined`
  // rather than throwing — which is the honest shape for a debugging surface whose upstream can change.
  return (await http.postAdmin(JAR_ENDPOINT, { request, clientId }, auth)) as JarProcessResult;
}
