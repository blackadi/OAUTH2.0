import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rarService } from '@/services/rar.service';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  globalThis.fetch = mockFetch;
});

/**
 * RAR pushes `authorization_details` through the **PAR** endpoint (RFC 9396 §1: "used in conjunction
 * with... RFC 9126"), so the wire shape and the response schema are PAR's — `parResponseSchema` requires
 * `request_uri`, per RFC 9126 §2.2. A fixture missing it would be silently accepted by `postJson` if the
 * schema were bypassed, and rejected correctly if it were not; write real ones either way.
 */
function ok(data: unknown, headers?: Record<string, string>) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers(headers ?? {}),
  } as Response);
}

function fail(status: number, body: string, headers?: Record<string, string>) {
  return Promise.resolve({
    ok: false,
    status,
    text: () => Promise.resolve(body),
    headers: new Headers(headers ?? {}),
  } as Response);
}

const AUTHORIZATION_DETAILS = JSON.stringify([
  {
    type: 'payment_initiation',
    actions: ['initiate'],
    locations: ['https://example.com/payments'],
  },
]);

describe('rarService.pushAuthorization', () => {
  it('sends POST to the PAR endpoint carrying authorization_details', async () => {
    mockFetch.mockResolvedValue(
      ok({ expires_in: 600, request_uri: 'urn:ietf:params:oauth:request_uri:rar-1' }),
    );
    const result = await rarService.pushAuthorization({
      parameters: `response_type=code&client_id=cid&authorization_details=${encodeURIComponent(AUTHORIZATION_DETAILS)}`,
      clientId: 'cid',
    });
    expect(result).toEqual({
      expires_in: 600,
      request_uri: 'urn:ietf:params:oauth:request_uri:rar-1',
    });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/par', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parameters: `response_type=code&client_id=cid&authorization_details=${encodeURIComponent(AUTHORIZATION_DETAILS)}`,
        clientId: 'cid',
      }),
    });
  });

  it('forwards client_secret for a client_secret_post client rather than dropping it', async () => {
    mockFetch.mockResolvedValue(ok({ expires_in: 600, request_uri: 'urn:x' }));
    await rarService.pushAuthorization({
      parameters: 'response_type=code',
      clientId: 'cid',
      clientSecret: 'sec',
    });
    const [, init] = mockFetch.mock.calls[0];
    const sent = JSON.parse((init as { body: string }).body) as { clientSecret?: string };
    expect(sent.clientSecret).toBe('sec');
  });

  it('rejects with the raw error body on a non-ok response — e.g. an unregistered authorization_details type', async () => {
    mockFetch.mockResolvedValue(
      fail(400, '[A249302] The value of "type" in "authorization_details" is not supported.'),
    );
    await expect(
      rarService.pushAuthorization({
        parameters: `authorization_details=${AUTHORIZATION_DETAILS}`,
      }),
    ).rejects.toThrow('[A249302]');
  });
});

describe('rarService.pushAuthorizationWithDpop', () => {
  const dpopProof = 'dpop-proof-jwt-header.payload.signature';

  it('sends POST with a DPoP header and extracts the nonce from the response', async () => {
    mockFetch.mockResolvedValue(
      ok(
        { expires_in: 600, request_uri: 'urn:ietf:params:oauth:request_uri:rar-dpop' },
        { 'dpop-nonce': 'nonce-abc' },
      ),
    );
    const result = await rarService.pushAuthorizationWithDpop(
      { parameters: `authorization_details=${AUTHORIZATION_DETAILS}`, clientId: 'cid' },
      dpopProof,
    );
    expect(result.data).toEqual({
      expires_in: 600,
      request_uri: 'urn:ietf:params:oauth:request_uri:rar-dpop',
    });
    expect(result.dpopNonce).toBe('nonce-abc');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/par', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', DPoP: dpopProof },
      body: JSON.stringify({
        parameters: `authorization_details=${AUTHORIZATION_DETAILS}`,
        clientId: 'cid',
      }),
    });
  });

  it('returns undefined dpopNonce when the response carries none', async () => {
    mockFetch.mockResolvedValue(ok({ expires_in: 600, request_uri: 'urn:x' }));
    const result = await rarService.pushAuthorizationWithDpop(
      { parameters: 'authorization_details=[]' },
      dpopProof,
    );
    expect(result.dpopNonce).toBeUndefined();
  });

  it('throws on a non-ok response', async () => {
    mockFetch.mockResolvedValue(fail(401, 'invalid_client'));
    await expect(
      rarService.pushAuthorizationWithDpop({ parameters: 'bad' }, dpopProof),
    ).rejects.toThrow('invalid_client');
  });
});
