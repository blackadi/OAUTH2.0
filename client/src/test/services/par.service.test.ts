import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parService } from '@/services/par.service';

const mockFetch = vi.fn();

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

function ok(data: unknown, headers?: Record<string, string>) {
  const h = new Headers(headers ?? {});
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: h,
  } as Response);
}

// `headers` is not optional on a real `Response`, and this double used to omit it. That went unnoticed
// for as long as nothing read a header on the error path — which is exactly the bug DR-20 is about: the
// `DPoP-Nonce` on a `use_dpop_nonce` refusal was being discarded. An unfaithful double hides the defect
// its own code path contains.
function fail(status: number, body: string, headers?: Record<string, string>) {
  return Promise.resolve({
    ok: false,
    status,
    text: () => Promise.resolve(body),
    headers: new Headers(headers ?? {}),
  } as Response);
}

describe('parService.pushedAuthorization', () => {
  it('sends POST to PAR endpoint', async () => {
    mockFetch.mockResolvedValue(
      ok({ expires_in: 600, request_uri: 'urn:ietf:params:oauth:request_uri:abc' }),
    );
    const result = await parService.pushedAuthorization({
      parameters: 'response_type=code&client_id=cid',
      clientId: 'cid',
    });
    expect(result).toEqual({
      expires_in: 600,
      request_uri: 'urn:ietf:params:oauth:request_uri:abc',
    });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/par', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters: 'response_type=code&client_id=cid', clientId: 'cid' }),
    });
  });

  it('rejects with error on non-ok response', async () => {
    mockFetch.mockResolvedValue(fail(400, 'Bad request'));
    await expect(parService.pushedAuthorization({ parameters: 'bad' })).rejects.toThrow(
      'Bad request',
    );
  });

  it('sends an Authorization: Basic header when basic credentials are supplied', async () => {
    mockFetch.mockResolvedValue(ok({ expires_in: 600, request_uri: 'urn:x' }));
    await parService.pushedAuthorization(
      { parameters: 'response_type=code' },
      {
        clientId: 'cid',
        clientSecret: 'sec',
      },
    );
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/par', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${btoa('cid:sec')}`,
      },
      body: JSON.stringify({ parameters: 'response_type=code' }),
    });
  });

  it('omits the Authorization header when no basic credentials are supplied', async () => {
    mockFetch.mockResolvedValue(ok({ expires_in: 600, request_uri: 'urn:x' }));
    await parService.pushedAuthorization({ parameters: 'response_type=code', clientId: 'cid' });
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });
});

describe('parService.pushedAuthorizationWithDpop', () => {
  const dpopProof = 'dpop-proof-jwt-header.payload.signature';

  it('sends POST with DPoP header and extracts nonce from response', async () => {
    mockFetch.mockResolvedValue(
      ok(
        { requestUri: 'urn:ietf:params:oauth:request_uri:dpop-test' },
        { 'dpop-nonce': 'test-nonce-123' },
      ),
    );
    const result = await parService.pushedAuthorizationWithDpop(
      { parameters: 'response_type=code&client_id=cid', clientId: 'cid' },
      dpopProof,
    );
    expect(result.data).toEqual({ requestUri: 'urn:ietf:params:oauth:request_uri:dpop-test' });
    expect(result.dpopNonce).toBe('test-nonce-123');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/par', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        DPoP: dpopProof,
      },
      body: JSON.stringify({ parameters: 'response_type=code&client_id=cid', clientId: 'cid' }),
    });
  });

  it('returns undefined dpopNonce when no nonce header present', async () => {
    mockFetch.mockResolvedValue(
      ok({ expires_in: 600, request_uri: 'urn:ietf:params:oauth:request_uri:test' }),
    );
    const result = await parService.pushedAuthorizationWithDpop(
      { parameters: 'response_type=code&client_id=cid' },
      dpopProof,
    );
    expect(result.data).toEqual({
      expires_in: 600,
      request_uri: 'urn:ietf:params:oauth:request_uri:test',
    });
    expect(result.dpopNonce).toBeUndefined();
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue(fail(401, 'Unauthorized'));
    await expect(
      parService.pushedAuthorizationWithDpop({ parameters: 'bad' }, dpopProof),
    ).rejects.toThrow('Unauthorized');
  });

  it('sends both DPoP and Authorization: Basic when basic credentials are supplied', async () => {
    mockFetch.mockResolvedValue(ok({ expires_in: 600, request_uri: 'urn:x' }));
    await parService.pushedAuthorizationWithDpop({ parameters: 'response_type=code' }, dpopProof, {
      clientId: 'cid',
      clientSecret: 'sec',
    });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/par', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        DPoP: dpopProof,
        Authorization: `Basic ${btoa('cid:sec')}`,
      },
      body: JSON.stringify({ parameters: 'response_type=code' }),
    });
  });
});
