import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tokenService } from '@/services/token.service';

const mockFetch = vi.fn();

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

describe('tokenService.exchangeCodeForToken', () => {
  it('sends POST form to TOKEN_ENDPOINT', async () => {
    mockFetch.mockResolvedValue(ok({ access_token: 'at1', refresh_token: 'rt1' }));
    const result = await tokenService.exchangeCodeForToken({
      grant_type: 'authorization_code',
      code: 'c1',
      redirect_uri: 'http://localhost:3001/callback',
      client_id: 'cid',
      code_verifier: 'v1',
    });
    expect(result).toEqual({ access_token: 'at1', refresh_token: 'rt1' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: expect.stringContaining('grant_type=authorization_code'),
    });
  });
});

describe('tokenService.clientCredentials', () => {
  it('sends POST with Basic auth', async () => {
    mockFetch.mockResolvedValue(ok({ access_token: 'at2' }));
    const result = await tokenService.clientCredentials('cid', 'secret', 'openid');
    expect(result).toEqual({ access_token: 'at2' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa('cid:secret')}`,
      },
      body: 'grant_type=client_credentials&scope=openid',
    });
  });
});

describe('tokenService.passwordGrant', () => {
  it('sends POST with Basic auth and credentials', async () => {
    mockFetch.mockResolvedValue(ok({ access_token: 'at3' }));
    const result = await tokenService.passwordGrant('user', 'pass', 'cid', 'secret', 'openid');
    expect(result).toEqual({ access_token: 'at3' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa('cid:secret')}`,
      },
      body: 'grant_type=password&username=user&password=pass&scope=openid',
    });
  });
});

describe('tokenService.refreshToken', () => {
  it('sends POST with Basic auth and refresh_token', async () => {
    mockFetch.mockResolvedValue(ok({ access_token: 'at4' }));
    const result = await tokenService.refreshToken('rt1', 'cid', 'secret');
    expect(result).toEqual({ access_token: 'at4' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa('cid:secret')}`,
      },
      body: 'grant_type=refresh_token&refresh_token=rt1',
    });
  });
});

describe('tokenService.userInfo', () => {
  it('sends GET with Bearer token', async () => {
    mockFetch.mockResolvedValue(ok({ sub: 'user1' }));
    const result = await tokenService.userInfo('at1');
    expect(result).toEqual({ sub: 'user1' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/userinfo', {
      method: 'GET',
      headers: { Authorization: 'Bearer at1', Accept: 'application/json' },
    });
  });
});

// RFC 7662 §2.1 requires the introspection endpoint to be protected. Since 2026-08-12 both endpoints take
// this deployment's admin Basic credentials; the header previously carried `Bearer <access token>`, which
// the server never read. See audit/02-findings/RFC7662-token-introspection.md F-1.
const ADMIN_BASIC = `Basic ${btoa('mgmt-id:mgmt-secret')}`;

describe('tokenService.introspection', () => {
  it('sends POST with admin Basic auth, not the access token', async () => {
    mockFetch.mockResolvedValue(ok({ active: true }));
    const result = await tokenService.introspection('tok1', 'mgmt-id', 'mgmt-secret');
    expect(result).toEqual({ active: true });
    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe('http://localhost:3000/api/introspection');
    expect(call[1].method).toBe('POST');
    expect(call[1].headers['Authorization']).toBe(ADMIN_BASIC);
    expect(call[1].body).toBe('token=tok1');
  });

  it('passes the RFC 9470 step-up options through in the body', async () => {
    mockFetch.mockResolvedValue(ok({ active: true }));
    await tokenService.introspection('tok1', 'mgmt-id', 'mgmt-secret', {
      acrValues: 'pwd',
      maxAge: 300,
    });
    const body = mockFetch.mock.calls[0][1].body as string;
    expect(body).toContain('token=tok1');
    expect(body).toContain('acrValues=pwd');
    expect(body).toContain('maxAge=300');
  });
});

describe('tokenService.introspectionStandard', () => {
  it('sends POST form to the standard endpoint with admin Basic auth', async () => {
    mockFetch.mockResolvedValue(ok({ active: true }));
    const result = await tokenService.introspectionStandard('tok1', 'mgmt-id', 'mgmt-secret');
    expect(result).toEqual({ active: true });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/introspection/standard', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: ADMIN_BASIC,
      },
      body: 'token=tok1',
    });
  });
});

describe('tokenService.revocation', () => {
  it('sends POST with Basic auth when credentials provided', async () => {
    mockFetch.mockResolvedValue(ok({}));
    await tokenService.revocation('tok1', 'cid', 'secret', 'access_token');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/revocation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa('cid:secret')}`,
      },
      body: 'token=tok1&token_type_hint=access_token',
    });
  });

  it('sends POST without auth when credentials omitted', async () => {
    mockFetch.mockResolvedValue(ok({}));
    await tokenService.revocation('tok1');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/revocation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'token=tok1',
    });
  });
});

describe('tokenService.discovery', () => {
  it('sends GET to discovery endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ issuer: 'https://example.com' }));
    const result = await tokenService.discovery();
    expect(result).toEqual({ issuer: 'https://example.com' });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/.well-known/openid-configuration',
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
    );
  });
});

describe('tokenService.getJwks', () => {
  it('sends GET to JWKS endpoint and validates response shape', async () => {
    mockFetch.mockResolvedValue(ok({ keys: [{ kty: 'RSA' }] }));
    const result = await tokenService.getJwks();
    expect(result.keys).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/.well-known/jwks.json', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  });

  it('throws on invalid JWKS response (missing keys)', async () => {
    mockFetch.mockResolvedValue(ok({ not_keys: [] }));
    await expect(tokenService.getJwks()).rejects.toThrow('Invalid JWKS response format');
  });

  it('throws on non-array keys', async () => {
    mockFetch.mockResolvedValue(ok({ keys: 'not-an-array' }));
    await expect(tokenService.getJwks()).rejects.toThrow('Invalid JWKS response format');
  });
});
