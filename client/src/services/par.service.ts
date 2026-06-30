import { PAR_ENDPOINT } from '@/config';
import { http } from './http';

export interface ParResponseWithNonce {
  data: unknown;
  dpopNonce?: string;
}

async function pushedAuthorization(body: Record<string, string>): Promise<unknown> {
  return http.postJson(PAR_ENDPOINT, body);
}

async function pushedAuthorizationWithDpop(
  body: Record<string, string>,
  dpopProof: string,
): Promise<ParResponseWithNonce> {
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

export const parService = { pushedAuthorization, pushedAuthorizationWithDpop };
