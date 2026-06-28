import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deviceService } from '@/services/device.service';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  globalThis.fetch = mockFetch;
});

function ok(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) } as Response);
}

describe('deviceService.authorization', () => {
  it('sends POST to device authorization endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ deviceCode: 'dc1', userCode: 'uc1' }));
    const result = await deviceService.authorization({ parameters: 'client_id=123&scope=openid', clientId: 'cid' });
    expect(result).toEqual({ deviceCode: 'dc1', userCode: 'uc1' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/device/authorization', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters: 'client_id=123&scope=openid', clientId: 'cid' }),
    });
  });
});

describe('deviceService.verification', () => {
  it('sends POST to verification endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ valid: true }));
    const result = await deviceService.verification('uc1');
    expect(result).toEqual({ valid: true });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/device/verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userCode: 'uc1' }),
    });
  });
});

describe('deviceService.complete', () => {
  it('sends POST to complete endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ result: 'SUCCESS' }));
    await deviceService.complete('uc1', 'AUTHORIZED', 'admin');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/device/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userCode: 'uc1', result: 'AUTHORIZED', subject: 'admin' }),
    });
  });
});
