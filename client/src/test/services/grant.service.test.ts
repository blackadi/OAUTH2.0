import { describe, it, expect, vi, beforeEach } from 'vitest';
import { grantService } from '@/services/grant.service';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  globalThis.fetch = mockFetch;
});

function ok(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) } as Response);
}

function err(status: number, body: string) {
  return Promise.resolve({ ok: false, status, text: () => Promise.resolve(body) } as Response);
}

describe('grantService.queryGrant', () => {
  it('sends GET to grant management endpoint with Bearer token', async () => {
    mockFetch.mockResolvedValue(ok({ grantId: 'g1', status: 'ACTIVE' }));
    const result = await grantService.queryGrant('bearertok', 'g1');
    expect(result).toEqual({ grantId: 'g1', status: 'ACTIVE' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/gm/g1', {
      headers: { Authorization: 'Bearer bearertok', Accept: 'application/json' },
    });
  });

  it('encodes special characters in grant ID', async () => {
    mockFetch.mockResolvedValue(ok({}));
    await grantService.queryGrant('tok', 'grant/id');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/gm/grant%2Fid', expect.anything());
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(err(404, 'not found'));
    await expect(grantService.queryGrant('tok', 'g1')).rejects.toThrow('not found');
  });
});

describe('grantService.revokeGrant', () => {
  it('sends DELETE to grant management endpoint with Bearer token', async () => {
    mockFetch.mockResolvedValue(ok({ result: 'REVOKED' }));
    const result = await grantService.revokeGrant('bearertok', 'g1');
    expect(result).toEqual({ result: 'REVOKED' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/gm/g1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer bearertok', Accept: 'application/json' },
    });
  });
});
