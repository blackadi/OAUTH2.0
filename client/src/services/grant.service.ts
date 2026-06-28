import { GRANT_MANAGEMENT_ENDPOINT } from '@/config';

async function queryGrant(accessToken: string, grantId: string): Promise<unknown> {
  const response = await fetch(
    `${GRANT_MANAGEMENT_ENDPOINT}/${encodeURIComponent(grantId)}`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } },
  );
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function revokeGrant(accessToken: string, grantId: string): Promise<unknown> {
  const response = await fetch(
    `${GRANT_MANAGEMENT_ENDPOINT}/${encodeURIComponent(grantId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    },
  );
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export const grantService = { queryGrant, revokeGrant };
