import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parService } from '@/services/par.service';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  globalThis.fetch = mockFetch;
});

function ok(data: unknown, headers?: Record<string, string>) {
  const h = new Headers(headers ?? {});
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: h,
  } as Response);
}

function fail(status: number, body: string) {
  return Promise.resolve({
    ok: false,
    status,
    text: () => Promise.resolve(body),
  } as Response);
}

describe('parService.pushedAuthorization', () => {
  it('sends POST to PAR endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ requestUri: 'urn:ietf:params:oauth:request_uri:abc' }));
    const result = await parService.pushedAuthorization({ parameters: 'response_type=code&client_id=cid', clientId: 'cid' });
    expect(result).toEqual({ requestUri: 'urn:ietf:params:oauth:request_uri:abc' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/par', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters: 'response_type=code&client_id=cid', clientId: 'cid' }),
    });
  });

  it('rejects with error on non-ok response', async () => {
    mockFetch.mockResolvedValue(fail(400, 'Bad request'));
    await expect(parService.pushedAuthorization({ parameters: 'bad' })).rejects.toThrow('Bad request');
  });
});

describe('parService.pushedAuthorizationWithDpop', () => {
  const dpopProof = 'dpop-proof-jwt-header.payload.signature';

  it('sends POST with DPoP header and extracts nonce from response', async () => {
    mockFetch.mockResolvedValue(
      ok(
        { requestUri: 'urn:ietf:params:oauth:request_uri:dpop-test' },
        { 'dpop-nonce': 'test-nonce-123' },
      ),
    );
    const result = await parService.pushedAuthorizationWithDpop(
      { parameters: 'response_type=code&client_id=cid', clientId: 'cid' },
      dpopProof,
    );
    expect(result.data).toEqual({ requestUri: 'urn:ietf:params:oauth:request_uri:dpop-test' });
    expect(result.dpopNonce).toBe('test-nonce-123');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/par', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        DPoP: dpopProof,
      },
      body: JSON.stringify({ parameters: 'response_type=code&client_id=cid', clientId: 'cid' }),
    });
  });

  it('returns undefined dpopNonce when no nonce header present', async () => {
    mockFetch.mockResolvedValue(
      ok({ requestUri: 'urn:ietf:params:oauth:request_uri:test' }),
    );
    const result = await parService.pushedAuthorizationWithDpop(
      { parameters: 'response_type=code&client_id=cid' },
      dpopProof,
    );
    expect(result.data).toEqual({ requestUri: 'urn:ietf:params:oauth:request_uri:test' });
    expect(result.dpopNonce).toBeUndefined();
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue(fail(401, 'Unauthorized'));
    await expect(
      parService.pushedAuthorizationWithDpop({ parameters: 'bad' }, dpopProof),
    ).rejects.toThrow('Unauthorized');
  });
});
