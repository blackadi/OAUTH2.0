import { PAR_ENDPOINT } from '@/config';
import { http } from './http';

export interface RarPushRequest {
  parameters: string;
  clientId?: string;
  clientSecret?: string;
}

export interface RarResponseWithNonce {
  data: unknown;
  dpopNonce?: string;
}

async function pushAuthorization(body: RarPushRequest): Promise<unknown> {
  return http.postJson(PAR_ENDPOINT, body as unknown as Record<string, unknown>);
}

async function pushAuthorizationWithDpop(
  body: RarPushRequest,
  dpopProof: string,
): Promise<RarResponseWithNonce> {
  const response = await fetch(PAR_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      DPoP: dpopProof,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  const dpopNonce = response.headers.get('dpop-nonce') || undefined;
  return { data, dpopNonce };
}

export const rarService = { pushAuthorization, pushAuthorizationWithDpop };
