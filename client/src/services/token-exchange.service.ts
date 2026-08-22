import { TOKEN_ENDPOINT } from '@/config';
import { http } from './http';
import type { TokenResponse } from '@/types';

/**
 * RFC 8693 Token Exchange, at the ordinary token endpoint.
 *
 * There is no dedicated route: §2.1 defines a `grant_type` URN and the parameters ride in the same
 * form body as any other grant. That is worth being visible in the code as well as in the UI, because
 * "which endpoint does token exchange use" is a question people reliably get wrong.
 *
 * **Client authentication follows the same rule as every other grant here** — a secret means Basic, no
 * secret means `client_id` in the body. That rule is stated once in `token.service.ts`
 * (`postWithOptionalBasic`) and is repeated rather than imported because this service posts a
 * caller-assembled body rather than building one from named fields: RFC 8693 has nine request
 * parameters, four of them conditional, and a shared helper would have to know all of them.
 */
async function exchange(
  body: Record<string, string>,
  clientId: string,
  clientSecret?: string,
): Promise<TokenResponse> {
  const params = new URLSearchParams(body);
  if (clientSecret) {
    return http.postBasicAuth(
      TOKEN_ENDPOINT,
      params,
      clientId,
      clientSecret,
    ) as Promise<TokenResponse>;
  }
  // A bare `client_id` and no secret is one method, not two — the only one a public client has.
  params.set('client_id', clientId);
  return http.postForm(TOKEN_ENDPOINT, params) as Promise<TokenResponse>;
}

export const tokenExchangeService = { exchange };
