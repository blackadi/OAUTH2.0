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

export async function processJar(request: string, clientId: string): Promise<JarProcessResult> {
  // An assertion, not validation: `http.postJson` returns `unknown` and nothing here parses the response.
  // Every member of `JarProcessResult` is therefore optional, so a missing field reads as `undefined`
  // rather than throwing — which is the honest shape for a debugging surface whose upstream can change.
  return (await http.postJson(JAR_ENDPOINT, { request, clientId })) as JarProcessResult;
}
