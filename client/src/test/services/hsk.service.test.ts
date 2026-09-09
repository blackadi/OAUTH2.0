import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hskService } from '@/services/hsk.service';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  globalThis.fetch = mockFetch;
});

function okJson(data: unknown, status = 200) {
  return Promise.resolve({
    ok: true,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers(),
  } as Response);
}

function noContent() {
  return Promise.resolve({
    ok: true,
    status: 204,
    json: () => Promise.reject(new Error('no body')),
    text: () => Promise.resolve(''),
    headers: new Headers(),
  } as Response);
}

function fail(status: number, body: string) {
  return Promise.resolve({
    ok: false,
    status,
    text: () => Promise.resolve(body),
    headers: new Headers(),
  } as Response);
}

const adminAuth = btoa('mgmt-id:mgmt-secret');

describe('hskService.hskCreate', () => {
  it('sends the admin credential as a header and the required fields', async () => {
    mockFetch.mockResolvedValue(
      okJson({ action: 'SUCCESS', hsk: { handle: 'h-1', kty: 'EC' } }, 201),
    );
    await hskService.hskCreate({ kty: 'EC', hsmName: 'google' }, adminAuth);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/hsk/create');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe(
      `Basic ${adminAuth}`,
    );
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      kty: 'EC',
      hsmName: 'google',
    });
  });

  it('forwards optional fields only when supplied', async () => {
    mockFetch.mockResolvedValue(okJson({ action: 'SUCCESS' }, 201));
    await hskService.hskCreate(
      { kty: 'RSA', hsmName: 'google', use: 'sig', kid: 'k1', alg: 'RS256' },
      adminAuth,
    );
    const body = JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body);
    expect(body).toEqual({ kty: 'RSA', hsmName: 'google', use: 'sig', kid: 'k1', alg: 'RS256' });
  });

  it('rejects with the vendor error text when the HSM cannot honour the request', async () => {
    mockFetch.mockResolvedValue(
      fail(
        400,
        JSON.stringify({
          error: 'invalid_request',
          error_description: 'The HSM does not support this algorithm.',
        }),
      ),
    );
    await expect(hskService.hskCreate({ kty: 'EC', hsmName: 'google' }, adminAuth)).rejects.toThrow(
      'does not support',
    );
  });
});

describe('hskService.hskGet', () => {
  it('appends the handle to the endpoint and sends the admin credential', async () => {
    mockFetch.mockResolvedValue(okJson({ action: 'SUCCESS', hsk: { handle: 'h-1' } }));
    await hskService.hskGet('h-1', adminAuth);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/hsk/get/h-1');
    expect((init as RequestInit).method).toBe('GET');
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe(
      `Basic ${adminAuth}`,
    );
  });

  it('URL-encodes a handle with special characters', async () => {
    mockFetch.mockResolvedValue(okJson({ action: 'NOT_FOUND' }, 404));
    await hskService.hskGet('h/1 2', adminAuth).catch(() => {});
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/hsk/get/h%2F1%202');
  });
});

describe('hskService.hskList', () => {
  it('sends the admin credential with no body', async () => {
    mockFetch.mockResolvedValue(okJson({ action: 'SUCCESS', hsks: [] }));
    await hskService.hskList(adminAuth);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/hsk/list');
    expect((init as RequestInit).method).toBe('GET');
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe(
      `Basic ${adminAuth}`,
    );
  });
});

describe('hskService.hskDelete', () => {
  it('sends DELETE with the handle in the path and resolves the 204', async () => {
    mockFetch.mockResolvedValue(noContent());
    const result = await hskService.hskDelete('h-1', adminAuth);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/hsk/delete/h-1');
    expect((init as RequestInit).method).toBe('DELETE');
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe(
      `Basic ${adminAuth}`,
    );
    // `transport.ts` parses an empty body to `{}` rather than `undefined` — real for a 204.
    expect(result).toEqual({});
  });
});
