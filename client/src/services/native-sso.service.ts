import { NATIVE_SSO_PROCESS_ENDPOINT, NATIVE_SSO_LOGOUT_ENDPOINT } from '@/config';
import { http } from './http';

/** Mirrors the SDK's `NativeSsoRequest` — see `server/src/services/native-sso.service.ts`. */
export interface NativeSsoProcessBody {
  accessToken: string;
  deviceSecret: string;
  refreshToken?: string;
  sub?: string;
  claims?: string;
  idtHeaderParams?: string;
  idTokenAudType?: string;
  deviceSecretHash?: string;
  [key: string]: unknown;
}

/**
 * `POST /api/nativesso` — admin Basic auth (`MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET`, realm `nativesso`),
 * the same gate as DCR and Federation registration. **Not** a body credential — `docs/API.md` said so
 * until this was found stale against `server/src/controllers/native-sso.controller.ts`.
 */
async function process(body: NativeSsoProcessBody, auth: string): Promise<unknown> {
  return http.postAdmin(NATIVE_SSO_PROCESS_ENDPOINT, body, auth);
}

async function logout(sessionId: string, auth: string): Promise<unknown> {
  return http.postAdmin(NATIVE_SSO_LOGOUT_ENDPOINT, { sessionId }, auth);
}

export const nativeSsoService = { process, logout };
