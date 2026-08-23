import { describe, it, expect, vi, beforeEach } from 'vitest';
import { grantService } from '@/services/grant.service';

// Typed as `fetch` so `mock.calls` is a real tuple rather than `any[]` — see token.service.test.ts.
const mockFetch = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.resetAllMocks();
  globalThis.fetch = mockFetch;
});

function ok(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response);
}

function err(status: number, body: string) {
  return Promise.resolve({ ok: false, status, text: () => Promise.resolve(body) } as Response);
}

/**
 * The headers of the nth call, as the record this app actually sends.
 *
 * `RequestInit['headers']` is `HeadersInit` — a union of `Headers`, a `[string,string][]` and a record —
 * so a direct `.headers.Authorization` does not type-check once the mock is typed. Narrowing once here
 * beats a cast at every read, and it is honest: every call site in this app passes a plain object.
 */
function headersOf(call: number): Record<string, string> {
  return (mockFetch.mock.calls[call]?.[1]?.headers ?? {}) as Record<string, string>;
}

describe('grantService.queryGrant', () => {
  it('sends GET to grant management endpoint with Bearer token', async () => {
    mockFetch.mockReturnValue(ok({ grantId: 'g1', status: 'ACTIVE' }));
    const result = await grantService.queryGrant({ accessToken: 'bearertok' }, 'g1');
    expect(result).toEqual({ grantId: 'g1', status: 'ACTIVE' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/gm/g1', {
      method: 'GET',
      headers: { Authorization: 'Bearer bearertok', Accept: 'application/json' },
    });
  });

  it('encodes special characters in grant ID', async () => {
    mockFetch.mockReturnValue(ok({}));
    await grantService.queryGrant({ accessToken: 'tok' }, 'grant/id');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/gm/grant%2Fid',
      expect.anything(),
    );
  });

  it('throws on error response', async () => {
    mockFetch.mockReturnValue(err(404, 'not found'));
    await expect(grantService.queryGrant({ accessToken: 'tok' }, 'g1')).rejects.toThrow(
      'not found',
    );
  });
});

describe('grantService.revokeGrant', () => {
  it('sends DELETE to grant management endpoint with Bearer token', async () => {
    mockFetch.mockReturnValue(ok({ result: 'REVOKED' }));
    const result = await grantService.revokeGrant({ accessToken: 'bearertok' }, 'g1');
    expect(result).toEqual({ result: 'REVOKED' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/gm/g1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer bearertok', Accept: 'application/json' },
    });
  });
});

describe('presentation scheme (RFC 9449 §7.1)', () => {
  it('uses the DPoP scheme and sends a proof when one is supplied', async () => {
    mockFetch.mockReturnValue(ok({ grantId: 'g1' }));
    await grantService.queryGrant(
      { accessToken: 'bound-token', dpopProof: async () => 'proof-jwt' },
      'g1',
    );
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/gm/g1', {
      method: 'GET',
      headers: {
        Authorization: 'DPoP bound-token',
        Accept: 'application/json',
        DPoP: 'proof-jwt',
      },
    });
  });

  it('uses DPoP on revoke too, since the same rule applies to both', async () => {
    mockFetch.mockReturnValue(ok({ result: 'REVOKED' }));
    await grantService.revokeGrant(
      { accessToken: 'bound-token', dpopProof: async () => 'proof-jwt' },
      'g1',
    );
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/gm/g1', {
      method: 'DELETE',
      headers: {
        Authorization: 'DPoP bound-token',
        Accept: 'application/json',
        DPoP: 'proof-jwt',
      },
    });
  });

  it('still sends Bearer when no proof is supplied', async () => {
    mockFetch.mockReturnValue(ok({}));
    await grantService.queryGrant({ accessToken: 'plain' }, 'g1');
    expect(headersOf(0).Authorization).toBe('Bearer plain');
  });
});
