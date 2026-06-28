import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clientService } from '@/services/client.service';

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

const AUTH = 'basic123';

describe('clientService.listClients', () => {
  it('sends GET with start/end params', async () => {
    mockFetch.mockResolvedValue(ok([{ clientId: '1' }]));
    const result = await clientService.listClients(AUTH, 0, 20);
    expect(result).toEqual([{ clientId: '1' }]);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/client/list?start=0&end=20', {
      headers: { Accept: 'application/json', Authorization: 'Basic basic123' },
    });
  });

  it('sends GET without query params', async () => {
    mockFetch.mockResolvedValue(ok([]));
    await clientService.listClients(AUTH);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/client/list', {
      headers: { Accept: 'application/json', Authorization: 'Basic basic123' },
    });
  });
});

describe('clientService.getClient', () => {
  it('sends GET with encoded client ID', async () => {
    mockFetch.mockResolvedValue(ok({ clientId: '123' }));
    const result = await clientService.getClient('123', AUTH);
    expect(result).toEqual({ clientId: '123' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/client/get/123', expect.anything());
  });
});

describe('clientService.createClient', () => {
  it('sends POST to create endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ clientId: 'new1' }));
    const body = { client: { clientName: 'My App' } };
    const result = await clientService.createClient(body, AUTH);
    expect(result).toEqual({ clientId: 'new1' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/client/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic basic123' },
      body: JSON.stringify(body),
    });
  });
});

describe('clientService.updateClient', () => {
  it('sends PATCH with encoded client ID', async () => {
    mockFetch.mockResolvedValue(ok({ updated: true }));
    const body = { client: { clientName: 'Renamed' } };
    await clientService.updateClient('cid1', body, AUTH);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/client/update/cid1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic basic123' },
      body: JSON.stringify(body),
    });
  });
});

describe('clientService.deleteClient', () => {
  it('sends DELETE with encoded client ID', async () => {
    mockFetch.mockResolvedValue(Promise.resolve({ ok: true, text: () => Promise.resolve('') } as Response));
    await clientService.deleteClient('cid1', AUTH);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/client/delete/cid1', {
      method: 'DELETE',
      headers: { Authorization: 'Basic basic123' },
    });
  });

  it('throws on error', async () => {
    mockFetch.mockResolvedValue(err(400, 'bad'));
    await expect(clientService.deleteClient('cid1', AUTH)).rejects.toThrow('bad');
  });
});

describe('clientService.lockFlag', () => {
  it('sends PATCH to flag endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ locked: true }));
    await clientService.lockFlag('cid1', true, AUTH);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/client/flag/cid1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic basic123' },
      body: JSON.stringify({ clientLocked: true }),
    });
  });
});

describe('clientService.refreshSecret', () => {
  it('sends POST to secret refresh endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ newSecret: 's2' }));
    await clientService.refreshSecret('cid1', AUTH);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/client/secret/refresh/cid1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic basic123' },
      body: '{}',
    });
  });
});

describe('clientService.updateSecret', () => {
  it('sends PUT to secret update endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ updated: true }));
    await clientService.updateSecret('cid1', 'newsecret', AUTH);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/client/secret/update/cid1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic basic123' },
      body: JSON.stringify({ clientSecret: 'newsecret' }),
    });
  });
});

describe('clientService.listAuth', () => {
  it('sends GET with encoded subject', async () => {
    mockFetch.mockResolvedValue(ok([{ clientId: '1' }]));
    const result = await clientService.listAuth('user1', AUTH);
    expect(result).toEqual([{ clientId: '1' }]);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/client/auth/list/user1', expect.anything());
  });
});

describe('clientService.updateAuth', () => {
  it('sends POST to auth update endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ updated: true }));
    await clientService.updateAuth('cid1', { subject: 'user1', scopes: 'openid' }, AUTH);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/client/auth/update/cid1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic basic123' },
      body: JSON.stringify({ subject: 'user1', scopes: 'openid' }),
    });
  });
});

describe('clientService.deleteAuth', () => {
  it('sends DELETE with client/subject path', async () => {
    mockFetch.mockResolvedValue(ok({}));
    await clientService.deleteAuth('cid1', 'user1', AUTH);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/client/auth/delete/cid1/user1', {
      method: 'DELETE',
      headers: { Authorization: 'Basic basic123' },
      body: undefined,
    });
  });
});

describe('clientService.getGrantedScopes', () => {
  it('sends GET to granted scopes endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ scopes: ['openid'] }));
    const result = await clientService.getGrantedScopes('cid1', 'user1', AUTH);
    expect(result).toEqual({ scopes: ['openid'] });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/client/scopes/granted/cid1/user1', expect.anything());
  });
});

describe('clientService.deleteGrantedScopes', () => {
  it('sends DELETE to granted scopes endpoint', async () => {
    mockFetch.mockResolvedValue(ok({}));
    await clientService.deleteGrantedScopes('cid1', 'user1', AUTH);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/client/scopes/granted/cid1/user1', {
      method: 'DELETE',
      headers: { Authorization: 'Basic basic123' },
      body: undefined,
    });
  });
});

describe('clientService.getRequestableScopes', () => {
  it('sends GET to requestable scopes endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ scopes: [] }));
    await clientService.getRequestableScopes('cid1', AUTH);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/client/scopes/requestable/cid1', expect.anything());
  });
});

describe('clientService.updateRequestableScopes', () => {
  it('sends PUT to requestable scopes endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ updated: true }));
    await clientService.updateRequestableScopes('cid1', { requestableScopes: ['openid'] }, AUTH);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/client/scopes/requestable/cid1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic basic123' },
      body: JSON.stringify({ requestableScopes: ['openid'] }),
    });
  });
});

describe('clientService.deleteRequestableScopes', () => {
  it('sends DELETE to requestable scopes endpoint', async () => {
    mockFetch.mockResolvedValue(Promise.resolve({ ok: true, text: () => Promise.resolve('') } as Response));
    await clientService.deleteRequestableScopes('cid1', AUTH);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/client/scopes/requestable/cid1', {
      method: 'DELETE',
      headers: { Authorization: 'Basic basic123' },
    });
  });
});
