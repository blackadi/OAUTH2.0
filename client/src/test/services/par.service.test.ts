import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parService } from '@/services/par.service';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  globalThis.fetch = mockFetch;
});

function ok(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) } as Response);
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
});
