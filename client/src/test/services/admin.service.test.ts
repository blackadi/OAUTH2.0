import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminService } from '@/services/admin.service';

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

describe('adminService.createToken', () => {
  it('sends POST with JSON body and Basic auth', async () => {
    mockFetch.mockResolvedValue(ok({ id: 'tok1' }));
    const result = await adminService.createToken({ grantType: 'CLIENT_CREDENTIALS', clientId: 'cid' }, 'auth123');
    expect(result).toEqual({ id: 'tok1' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/token/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic auth123' },
      body: JSON.stringify({ grantType: 'CLIENT_CREDENTIALS', clientId: 'cid' }),
    });
  });
});

describe('adminService.listTokens', () => {
  it('sends GET with Basic auth', async () => {
    mockFetch.mockResolvedValue(ok([{ id: 'tok1' }]));
    const result = await adminService.listTokens('auth123');
    expect(result).toEqual([{ id: 'tok1' }]);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/token/list', {
      headers: { Accept: 'application/json', Authorization: 'Basic auth123' },
    });
  });
});

describe('adminService.updateToken', () => {
  it('sends PATCH with JSON body', async () => {
    mockFetch.mockResolvedValue(ok({ updated: true }));
    const result = await adminService.updateToken({ accessToken: 'at1', scopes: 'openid' }, 'auth123');
    expect(result).toEqual({ updated: true });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/token/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic auth123' },
      body: JSON.stringify({ accessToken: 'at1', scopes: 'openid' }),
    });
  });
});

describe('adminService.revokeToken', () => {
  it('sends POST to revoke endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ revoked: true }));
    await adminService.revokeToken({ accessTokenIdentifier: 'id1' }, 'auth123');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/token/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic auth123' },
      body: JSON.stringify({ accessTokenIdentifier: 'id1' }),
    });
  });
});

describe('adminService.deleteToken', () => {
  it('sends DELETE with encoded identifier', async () => {
    mockFetch.mockResolvedValue(Promise.resolve({ ok: true, text: () => Promise.resolve('') } as Response));
    await adminService.deleteToken('id/1', 'auth123');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/token/delete/id%2F1', {
      method: 'DELETE',
      headers: { Authorization: 'Basic auth123' },
    });
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(err(404, 'not found'));
    await expect(adminService.deleteToken('id1', 'auth123')).rejects.toThrow('not found');
  });
});

describe('adminService.reissueToken', () => {
  it('sends POST to reissue endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ access_token: 'at2' }));
    const result = await adminService.reissueToken({ accessToken: 'at1', refreshToken: 'rt1' }, 'auth123');
    expect(result).toEqual({ access_token: 'at2' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/token/reissue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic auth123' },
      body: JSON.stringify({ accessToken: 'at1', refreshToken: 'rt1' }),
    });
  });
});

describe('adminService.localToken', () => {
  it('sends GET with query params', async () => {
    mockFetch.mockResolvedValue(ok({ token: 'jwt' }));
    const result = await adminService.localToken({ iss: 'me', sub: 'user', aud: 'you' });
    expect(result).toEqual({ token: 'jwt' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/token/createLocalToken?iss=me&sub=user&aud=you', {
      headers: { Accept: 'application/json' },
    });
  });
});
