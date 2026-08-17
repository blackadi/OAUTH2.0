import { PAR_ENDPOINT } from '@/config';
import { http } from './http';
import { dpopRequest, type DpopProofSource } from './dpop-fetch';

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
  dpopProof: DpopProofSource,
): Promise<RarResponseWithNonce> {
  return dpopRequest(PAR_ENDPOINT, dpopProof, (proof) => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      DPoP: proof,
    },
    body: JSON.stringify(body),
  }));
}

export const rarService = { pushAuthorization, pushAuthorizationWithDpop };
