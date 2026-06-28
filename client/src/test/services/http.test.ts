import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http } from '@/services/http';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  globalThis.fetch = mockFetch;
});

function okResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
  } as Response);
}

function errorResponse(status: number, body: string) {
  return Promise.resolve({
    ok: false,
    status,
    text: () => Promise.resolve(body),
  } as Response);
}

describe('http.postForm', () => {
  it('sends POST with URL-encoded body', async () => {
    mockFetch.mockResolvedValue(okResponse({ result: 'ok' }));
    const params = new URLSearchParams({ grant_type: 'client_credentials' });
    const result = await http.postForm('https://example.com/token', params);
    expect(result).toEqual({ result: 'ok' });
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(errorResponse(400, 'bad request'));
    await expect(http.postForm('https://example.com/token', new URLSearchParams())).rejects.toThrow('bad request');
  });
});

describe('http.postBasicAuth', () => {
  it('sends POST with Basic auth header', async () => {
    mockFetch.mockResolvedValue(okResponse({ access_token: 'abc' }));
    const params = new URLSearchParams({ grant_type: 'client_credentials' });
    const result = await http.postBasicAuth('https://example.com/token', params, 'client1', 'secret1');
    expect(result).toEqual({ access_token: 'abc' });
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa('client1:secret1')}`,
      },
      body: 'grant_type=client_credentials',
    });
  });
});

describe('http.postAdmin', () => {
  it('sends POST with JSON body and Basic auth', async () => {
    mockFetch.mockResolvedValue(okResponse({ id: '123' }));
    const result = await http.postAdmin('https://example.com/create', { name: 'test' }, 'basic123');
    expect(result).toEqual({ id: '123' });
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic basic123',
      },
      body: JSON.stringify({ name: 'test' }),
    });
  });
});

describe('http.postJson', () => {
  it('sends POST with JSON body', async () => {
    mockFetch.mockResolvedValue(okResponse({ ok: true }));
    const result = await http.postJson('https://example.com/api', { ticket: 'xyz' });
    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: 'xyz' }),
    });
  });

  it('handles empty response body', async () => {
    mockFetch.mockResolvedValue(okResponse(''));
    const result = await http.postJson('https://example.com/api', {});
    expect(result).toEqual({});
  });

  it('handles non-JSON text response', async () => {
    mockFetch.mockResolvedValue(okResponse('plain text'));
    const result = await http.postJson('https://example.com/api', {});
    expect(result).toBe('plain text');
  });
});

describe('http.getJson', () => {
  it('sends GET without auth', async () => {
    mockFetch.mockResolvedValue(okResponse({ status: 'ok' }));
    const result = await http.getJson('https://example.com/health');
    expect(result).toEqual({ status: 'ok' });
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/health', {
      headers: { Accept: 'application/json' },
    });
  });

  it('sends GET with Basic auth when provided', async () => {
    mockFetch.mockResolvedValue(okResponse({ items: [] }));
    await http.getJson('https://example.com/list', 'auth123');
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/list', {
      headers: { Accept: 'application/json', Authorization: 'Basic auth123' },
    });
  });
});

describe('http.getWithBearer', () => {
  it('sends GET with Bearer token', async () => {
    mockFetch.mockResolvedValue(okResponse({ sub: 'user1' }));
    const result = await http.getWithBearer('https://example.com/userinfo', 'tok123');
    expect(result).toEqual({ sub: 'user1' });
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/userinfo', {
      headers: { Authorization: 'Bearer tok123', Accept: 'application/json' },
    });
  });
});

describe('http.del', () => {
  it('sends DELETE without body', async () => {
    mockFetch.mockResolvedValue(okResponse({}));
    const result = await http.del('https://example.com/delete/1', 'auth123');
    expect(result).toEqual({});
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/delete/1', {
      method: 'DELETE',
      headers: { Authorization: 'Basic auth123' },
      body: undefined,
    });
  });

  it('sends DELETE with JSON body', async () => {
    mockFetch.mockResolvedValue(okResponse({}));
    await http.del('https://example.com/delete', 'auth123', { id: '1' });
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/delete', {
      method: 'DELETE',
      headers: { Authorization: 'Basic auth123', 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '1' }),
    });
  });

  it('sends DELETE without auth', async () => {
    mockFetch.mockResolvedValue(okResponse({}));
    await http.del('https://example.com/delete');
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/delete', {
      method: 'DELETE',
      headers: {},
      body: undefined,
    });
  });
});

describe('http.patch', () => {
  it('sends PATCH with JSON body and Basic auth', async () => {
    mockFetch.mockResolvedValue(okResponse({ updated: true }));
    const result = await http.patch('https://example.com/update', { name: 'new' }, 'auth123');
    expect(result).toEqual({ updated: true });
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic auth123' },
      body: JSON.stringify({ name: 'new' }),
    });
  });
});

describe('http.put', () => {
  it('sends PUT with JSON body and Basic auth', async () => {
    mockFetch.mockResolvedValue(okResponse({ ok: true }));
    const result = await http.put('https://example.com/resource', { key: 'val' }, 'auth123');
    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/resource', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic auth123' },
      body: JSON.stringify({ key: 'val' }),
    });
  });
});
