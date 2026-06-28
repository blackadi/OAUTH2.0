import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cibaService } from '@/services/ciba.service';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  globalThis.fetch = mockFetch;
});

function ok(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) } as Response);
}

describe('cibaService.backchannelAuthentication', () => {
  it('sends POST to authentication endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ ticket: 't1' }));
    const result = await cibaService.backchannelAuthentication({ parameters: 'login_hint=admin', clientId: 'cid' });
    expect(result).toEqual({ ticket: 't1' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/ciba/authentication', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters: 'login_hint=admin', clientId: 'cid' }),
    });
  });
});

describe('cibaService.issue', () => {
  it('sends POST to issue endpoint with ticket', async () => {
    mockFetch.mockResolvedValue(ok({ authReqId: 'ar1' }));
    const result = await cibaService.issue('t1');
    expect(result).toEqual({ authReqId: 'ar1' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/ciba/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: 't1' }),
    });
  });
});

describe('cibaService.fail', () => {
  it('sends POST to fail endpoint with ticket and reason', async () => {
    mockFetch.mockResolvedValue(ok({}));
    await cibaService.fail('t1', 'ACCESS_DENIED');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/ciba/fail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: 't1', reason: 'ACCESS_DENIED' }),
    });
  });
});

describe('cibaService.complete', () => {
  it('sends POST to complete endpoint with ticket, result, subject', async () => {
    mockFetch.mockResolvedValue(ok({}));
    await cibaService.complete('t1', 'AUTHORIZED', 'admin');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/ciba/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: 't1', result: 'AUTHORIZED', subject: 'admin' }),
    });
  });
});
