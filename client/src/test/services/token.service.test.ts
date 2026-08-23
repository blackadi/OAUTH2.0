import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tokenService } from '@/services/token.service';

/**
 * Typed as `fetch`, so `mock.calls[0]` is a real `[input, init?]` tuple.
 *
 * A bare `vi.fn()` makes every read off `.mock.calls` an `any` — including `init.body`, which is the
 * thing these tests exist to assert. The assertions were unchecked in exactly the file that checks what
 * this app puts on the wire.
 */
const mockFetch = vi.fn<typeof fetch>();

/**
 * The `RequestInit` of the nth call, narrowed once.
 *
 * `mock.calls[n]` is a tuple whose second element is optional and whose `headers` is the `HeadersInit`
 * union, so every assertion below would otherwise need its own cast. Narrowing here keeps the casts to
 * one place and states the assumption plainly: every call site in this app passes a plain object.
 */
function initOf(call: number): { method?: string; body?: string; headers: Record<string, string> } {
  const init = mockFetch.mock.calls[call]?.[1];
  return {
    method: init?.method,
    body: typeof init?.body === 'string' ? init.body : undefined,
    headers: (init?.headers ?? {}) as Record<string, string>,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  globalThis.fetch = mockFetch;
});

/**
 * **Fixtures are conformant response bodies, not the minimum that made an assertion pass.**
 *
 * When `services/schemas.ts` began validating at the transport boundary, this file's mocks were among
 * the ones it rejected — and rejected correctly. They described bodies no authorization server would
 * send, and in three files they described the *specific* body T1-11 stopped sending: `par` mocked
 * `requestUri`, `device` mocked `deviceCode`/`userCode`, `dcr` mocked `clientId`. Those are Authlete's
 * camelCase envelope, replaced by the specification's snake_case body months ago. Nothing noticed,
 * because these tests assert the outgoing *request* and never read the response.
 *
 * A fixture is documentation of what the server sends. One that is wrong teaches the next reader the
 * wrong shape, and it is the only thing standing between a schema and a false pass.
 */

function ok(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response);
}

describe('tokenService.exchangeCodeForToken', () => {
  it('sends POST form to TOKEN_ENDPOINT', async () => {
    mockFetch.mockReturnValue(
      ok({ access_token: 'at1', token_type: 'Bearer', refresh_token: 'rt1' }),
    );
    const result = await tokenService.exchangeCodeForToken({
      grant_type: 'authorization_code',
      code: 'c1',
      redirect_uri: 'http://localhost:3001/callback',
      client_id: 'cid',
      code_verifier: 'v1',
    });
    expect(result).toEqual({ access_token: 'at1', token_type: 'Bearer', refresh_token: 'rt1' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: expect.stringContaining('grant_type=authorization_code'),
    });
  });
});

describe('tokenService.clientCredentials', () => {
  it('sends POST with Basic auth', async () => {
    mockFetch.mockReturnValue(ok({ access_token: 'at2', token_type: 'Bearer' }));
    const result = await tokenService.clientCredentials('cid', 'secret', 'openid');
    expect(result).toEqual({ access_token: 'at2', token_type: 'Bearer' });
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
    mockFetch.mockReturnValue(ok({ access_token: 'at3', token_type: 'Bearer' }));
    const result = await tokenService.passwordGrant('user', 'pass', 'cid', 'secret', 'openid');
    expect(result).toEqual({ access_token: 'at3', token_type: 'Bearer' });
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
    mockFetch.mockReturnValue(ok({ access_token: 'at4', token_type: 'Bearer' }));
    const result = await tokenService.refreshToken('rt1', 'cid', 'secret');
    expect(result).toEqual({ access_token: 'at4', token_type: 'Bearer' });
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

/**
 * A public client gets `client_id` in the body and **no** `Authorization` header.
 *
 * These three grants sent Basic unconditionally, and their secret fields were pre-filled from
 * `CLIENT_SECRET`, whose default was the literal `your_client_secret`. Probed live at the token
 * endpoint: `Basic 4277838306:your_client_secret` earns `401 [A157303] The request contains data for
 * client authentication although the client type is 'public' and the client authentication method is
 * 'none'.` The Refresh Token button therefore failed for the same reason the code exchange did.
 *
 * The three cases above still pin the confidential path, so this pins the public one. `jwtBearerGrant`,
 * `revocation` and `device.service.pollToken` already behaved this way; the point of the change was to
 * make all six agree.
 */
describe('the three secret-bearing grants, with no secret', () => {
  const noHeader = (call: number) => initOf(call).headers.Authorization;

  it('client_credentials: client_id in the body, no Basic header', async () => {
    mockFetch.mockReturnValue(ok({ access_token: 'at', token_type: 'Bearer' }));
    await tokenService.clientCredentials('4277838306', '', 'openid');
    const init = initOf(0);
    expect(noHeader(0)).toBeUndefined();
    expect(init.body).toContain('client_id=4277838306');
  });

  it('password: client_id in the body, no Basic header', async () => {
    mockFetch.mockReturnValue(ok({ access_token: 'at', token_type: 'Bearer' }));
    await tokenService.passwordGrant('user', 'pass', '4277838306', '', 'openid');
    const init = initOf(0);
    expect(noHeader(0)).toBeUndefined();
    expect(init.body).toContain('client_id=4277838306');
  });

  it('refresh_token: client_id in the body, no Basic header', async () => {
    mockFetch.mockReturnValue(ok({ access_token: 'at', token_type: 'Bearer' }));
    await tokenService.refreshToken('rt1', '4277838306', '');
    const init = initOf(0);
    expect(noHeader(0)).toBeUndefined();
    expect(init.body).toContain('client_id=4277838306');
    // The grant's own parameters survive the added one.
    expect(init.body).toContain('refresh_token=rt1');
  });

  it('never sends an empty client_secret, which would still be client-auth data', async () => {
    mockFetch.mockReturnValue(ok({ access_token: 'at', token_type: 'Bearer' }));
    await tokenService.refreshToken('rt1', '4277838306', '');
    const init = initOf(0);
    expect(init.body).not.toContain('client_secret');
  });
});

describe('tokenService.userInfo', () => {
  it('sends GET with Bearer token', async () => {
    mockFetch.mockReturnValue(ok({ sub: 'user1' }));
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
    mockFetch.mockReturnValue(ok({ active: true }));
    const result = await tokenService.introspection('tok1', 'mgmt-id', 'mgmt-secret');
    expect(result).toEqual({ active: true });
    expect(mockFetch.mock.calls[0]?.[0]).toBe('http://localhost:3000/api/introspection');
    expect(initOf(0).method).toBe('POST');
    expect(initOf(0).headers.Authorization).toBe(ADMIN_BASIC);
    expect(initOf(0).body).toBe('token=tok1');
  });

  it('passes the RFC 9470 step-up options through in the body', async () => {
    mockFetch.mockReturnValue(ok({ active: true }));
    await tokenService.introspection('tok1', 'mgmt-id', 'mgmt-secret', {
      acrValues: 'pwd',
      maxAge: 300,
    });
    const body = initOf(0).body ?? '';
    expect(body).toContain('token=tok1');
    expect(body).toContain('acrValues=pwd');
    expect(body).toContain('maxAge=300');
  });
});

describe('tokenService.introspectionStandard', () => {
  it('sends POST form to the standard endpoint with admin Basic auth', async () => {
    mockFetch.mockReturnValue(ok({ active: true }));
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
    mockFetch.mockReturnValue(ok({}));
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
    mockFetch.mockReturnValue(ok({}));
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
    mockFetch.mockReturnValue(
      ok({ issuer: 'https://example.com', response_types_supported: ['code'] }),
    );
    const result = await tokenService.discovery();
    expect(result).toEqual({ issuer: 'https://example.com', response_types_supported: ['code'] });
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
    mockFetch.mockReturnValue(ok({ keys: [{ kty: 'RSA' }] }));
    const result = await tokenService.getJwks();
    expect(result.keys).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/.well-known/jwks.json', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  });

  it('throws on invalid JWKS response (missing keys)', async () => {
    mockFetch.mockReturnValue(ok({ not_keys: [] }));
    await expect(tokenService.getJwks()).rejects.toThrow('Invalid JWKS response format');
  });

  it('throws on non-array keys', async () => {
    mockFetch.mockReturnValue(ok({ keys: 'not-an-array' }));
    await expect(tokenService.getJwks()).rejects.toThrow('Invalid JWKS response format');
  });
});
