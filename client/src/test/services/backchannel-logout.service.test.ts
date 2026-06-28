import { describe, it, expect, vi, beforeEach } from 'vitest';
import { backchannelLogoutService } from '@/services/backchannel-logout.service';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  globalThis.fetch = mockFetch;
});

function ok(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) } as Response);
}

describe('backchannelLogoutService.issue', () => {
  it('sends POST to issue endpoint with admin auth', async () => {
    mockFetch.mockResolvedValue(ok({ token: 'lt1' }));
    const result = await backchannelLogoutService.issue({ sub: 'user1' }, 'auth123');
    expect(result).toEqual({ token: 'lt1' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/backchannel_logout/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic auth123' },
      body: JSON.stringify({ sub: 'user1' }),
    });
  });
});

describe('backchannelLogoutService.deliver', () => {
  it('sends POST to deliver endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ delivered: true }));
    await backchannelLogoutService.deliver({ token: 'lt1' }, 'auth123');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/backchannel_logout/deliver', expect.anything());
  });
});

describe('backchannelLogoutService.deliverAll', () => {
  it('sends POST to deliver-all endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ count: 3 }));
    const result = await backchannelLogoutService.deliverAll({}, 'auth123');
    expect(result).toEqual({ count: 3 });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/backchannel_logout/deliver-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic auth123' },
      body: '{}',
    });
  });
});
