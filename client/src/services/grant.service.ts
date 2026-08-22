import { GRANT_MANAGEMENT_ENDPOINT } from '@/config';
import { send } from './transport';
import { dpopRequest, type DpopProofSource } from './dpop-fetch';

/**
 * How the token is presented. `/api/gm` is a protected resource and follows RFC 6750 §2 / RFC 9449 §7
 * verbatim, so a DPoP-bound token has no bearer option — Authlete refuses the downgrade with
 * `[A281305]`.
 *
 * One thing not to simplify: **the proof must reach both Authlete calls.** `/api/gm` makes two —
 * `/auth/introspection` for the ownership gate, then `/gm` — and each checks the binding
 * independently, so omitting it on the second just moves the 401 one call later. The same proof serves
 * both; Authlete does not treat the second use as a replay. That is the server's concern, but it is
 * why a single proof header here is sufficient and why dropping it is not.
 */
export interface GrantAuth {
  accessToken: string;
  /** Supply a proof factory for a DPoP-bound token; omit it for a bearer token. */
  dpopProof?: DpopProofSource;
}

/**
 * Grant Management for OAuth 2.0. Both operations go through `send`, so a refusal reaches the trace
 * with its status and headers intact — which matters more here than almost anywhere else: `/api/gm`
 * runs `requireGrantOwnership` before Authlete's `/gm` API, so a 403 and a 401 mean entirely different
 * things (not your grant, versus the token itself is bad), and both used to arrive as bare red text.
 */
function grantUrl(grantId: string): string {
  return `${GRANT_MANAGEMENT_ENDPOINT}/${encodeURIComponent(grantId)}`;
}

async function queryGrant(auth: GrantAuth, grantId: string): Promise<unknown> {
  const url = grantUrl(grantId);
  if (auth.dpopProof) {
    const { data } = await dpopRequest(url, auth.dpopProof, (proof) => ({
      method: 'GET',
      headers: {
        Authorization: `DPoP ${auth.accessToken}`,
        Accept: 'application/json',
        DPoP: proof,
      },
    }));
    return data;
  }
  const { body } = await send({
    method: 'GET',
    url,
    headers: { Authorization: `Bearer ${auth.accessToken}`, Accept: 'application/json' },
    label: `gm: query ${grantId}`,
  });
  return body;
}

async function revokeGrant(auth: GrantAuth, grantId: string): Promise<unknown> {
  const url = grantUrl(grantId);
  if (auth.dpopProof) {
    const { data } = await dpopRequest(url, auth.dpopProof, (proof) => ({
      method: 'DELETE',
      headers: {
        Authorization: `DPoP ${auth.accessToken}`,
        Accept: 'application/json',
        DPoP: proof,
      },
    }));
    return data;
  }
  const result = await send({
    method: 'DELETE',
    url,
    headers: { Authorization: `Bearer ${auth.accessToken}`, Accept: 'application/json' },
    label: `gm: revoke ${grantId}`,
  });
  // A 204 carries no body; `parseBody` gives `{}` for an empty one, and this method has always
  // reported that as `null`.
  if (result.status === 204) return null;
  return result.body;
}

export const grantService = { queryGrant, revokeGrant };
