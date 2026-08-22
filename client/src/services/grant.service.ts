import { GRANT_MANAGEMENT_ENDPOINT } from '@/config';
import { send } from './transport';

/**
 * Grant Management for OAuth 2.0. Both operations go through `send`, so a refusal reaches the trace
 * with its status and headers intact — which matters more here than almost anywhere else: `/api/gm`
 * runs `requireGrantOwnership` before Authlete's `/gm` API, so a 403 and a 401 mean entirely different
 * things (not your grant, versus the token itself is bad), and both used to arrive as bare red text.
 */
async function queryGrant(accessToken: string, grantId: string): Promise<unknown> {
  const { body } = await send({
    method: 'GET',
    url: `${GRANT_MANAGEMENT_ENDPOINT}/${encodeURIComponent(grantId)}`,
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    label: `gm: query ${grantId}`,
  });
  return body;
}

async function revokeGrant(accessToken: string, grantId: string): Promise<unknown> {
  const result = await send({
    method: 'DELETE',
    url: `${GRANT_MANAGEMENT_ENDPOINT}/${encodeURIComponent(grantId)}`,
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    label: `gm: revoke ${grantId}`,
  });
  // A 204 carries no body; `parseBody` gives `{}` for an empty one, and this method has always
  // reported that as `null`.
  if (result.status === 204) return null;
  return result.body;
}

export const grantService = { queryGrant, revokeGrant };
