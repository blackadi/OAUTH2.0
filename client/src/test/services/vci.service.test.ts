import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vciService } from '@/services/vci.service';

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

function sent() {
  const calls = mockFetch.mock.calls;
  const [url, init] = calls[calls.length - 1];
  return { url, init: init as RequestInit };
}

/**
 * VCI has three auth categories on the same router (`docs/agents/server-endpoints.md`), and the one
 * real bug this surface has had was an *asymmetry* between them: `/vci/deferred/issue` collected no
 * token at all while its two siblings both required one (fixed 2026-08-13, found by
 * `check-route-coverage.mjs` rather than by reading the code — no controller test drove the route).
 * These tests assert the three auth categories directly so a client-side regression in any one of
 * them — a dropped `accessToken`, a wrongly-added `Authorization` header where the server expects a
 * JSON field, or vice versa — fails loudly instead of only showing up as a live 401/authenticates-nobody
 * asymmetry nobody is looking at.
 */

describe('vciService discovery (public GET, no auth)', () => {
  it('getMetadata fetches the OID4VCI issuer metadata with no Authorization header', async () => {
    mockFetch.mockResolvedValue(
      ok({
        credential_issuer: 'http://localhost:3000',
        credential_endpoint: 'http://localhost:3000/api/vci/credential/issue',
        credential_configurations_supported: {},
      }),
    );
    const result = await vciService.getMetadata();
    expect(result).toMatchObject({ credential_issuer: 'http://localhost:3000' });
    const { url, init } = sent();
    expect(url).toBe('http://localhost:3000/api/vci/metadata');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('getJwtIssuer, getJwks and getWellKnown are all unauthenticated GETs', async () => {
    mockFetch.mockResolvedValue(ok({ keys: [] }));
    await vciService.getJwks();
    expect(sent().url).toBe('http://localhost:3000/api/vci/jwks');

    mockFetch.mockResolvedValue(ok({ issuer: 'http://localhost:3000' }));
    await vciService.getJwtIssuer();
    expect(sent().url).toBe('http://localhost:3000/api/vci/jwtissuer');

    mockFetch.mockResolvedValue(ok({}));
    await vciService.getWellKnown();
    expect(sent().url).toBe('http://localhost:3000/api/vci/well-known');
  });
});

describe('vciService offers (admin Basic auth)', () => {
  const adminAuth = btoa('admin:sekret');

  it('createOffer sends Authorization: Basic with the caller-supplied credentials, not double-encoded', async () => {
    mockFetch.mockResolvedValue(ok({ credential_offer_uri: 'openid-credential-offer://...' }));
    await vciService.createOffer({ credentialConfigurationIds: ['UniversityDegree'] }, adminAuth);
    const { url, init } = sent();
    expect(url).toBe('http://localhost:3000/api/vci/offer/create');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${adminAuth}`);
    expect(JSON.parse(init.body as string)).toEqual({
      credentialConfigurationIds: ['UniversityDegree'],
    });
  });

  it('getOfferInfo also authenticates via the admin channel', async () => {
    mockFetch.mockResolvedValue(ok({ status: 'ISSUABLE' }));
    await vciService.getOfferInfo({ identifier: 'offer-123' }, adminAuth);
    const { url, init } = sent();
    expect(url).toBe('http://localhost:3000/api/vci/offer/info');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${adminAuth}`);
  });

  it('rejects with the raw error body when the admin credentials are wrong', async () => {
    mockFetch.mockResolvedValue(fail(401, 'Unauthorized'));
    await expect(vciService.createOffer({}, 'bad-auth')).rejects.toThrow('Unauthorized');
  });
});

describe('vciService credential issuance (access token as a JSON body field, never a header)', () => {
  /**
   * This is the shape `server-endpoints.md` documents as one of the token channels this router accepts
   * — `Authorization: Bearer`/`DPoP` **or** a JSON `accessToken` field — and it is the channel the client
   * actually uses. Asserting `Authorization` is absent here is what would have caught the historical
   * defect from the other direction: a change that started sending the token as a header *instead of*
   * the body field would silently stop authenticating on a server expecting the field, and vice versa.
   */
  it('issueCredential sends accessToken and order in the JSON body with no Authorization header', async () => {
    mockFetch.mockResolvedValue(
      ok({
        credential: 'eyJhbGciOiJFUzI1NiJ9...credential...',
        notification_id: 'notif-1',
      }),
    );
    await vciService.issueCredential({
      accessToken: 'at-123',
      order: { requestIdentifier: 'cred-1' },
    });
    const { url, init } = sent();
    expect(url).toBe('http://localhost:3000/api/vci/credential/issue');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(init.body as string)).toEqual({
      accessToken: 'at-123',
      order: { requestIdentifier: 'cred-1' },
    });
  });

  it('batchCredential sends the same shape for a batch order', async () => {
    mockFetch.mockResolvedValue(ok({ credential_responses: [] }));
    await vciService.batchCredential({
      accessToken: 'at-123',
      order: [{ format: 'jwt_vc_json', credential_definition: { type: ['VerifiableCredential'] } }],
    });
    const { url, init } = sent();
    expect(url).toBe('http://localhost:3000/api/vci/credential/batch');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('issueDeferred sends accessToken alongside the transaction order — the asymmetry the historical bug had', async () => {
    mockFetch.mockResolvedValue(ok({ credential: 'eyJhbGciOiJFUzI1NiJ9...deferred...' }));
    await vciService.issueDeferred({
      accessToken: 'at-123',
      order: { transactionId: 'txn-1' },
    });
    const { url, init } = sent();
    expect(url).toBe('http://localhost:3000/api/vci/deferred/issue');
    const body = JSON.parse(init.body as string) as {
      accessToken?: string;
      order?: Record<string, unknown>;
    };
    // The regression this locks in: a caller holding only a `transactionId` (a handle, not a
    // credential) must not be able to omit `accessToken` and still reach issuance.
    expect(body.accessToken).toBe('at-123');
    expect(body.order).toEqual({ transactionId: 'txn-1' });
  });

  it('rejects with the raw WWW-Authenticate-shaped challenge text on a bad or missing token', async () => {
    // Confirmed live shape (docs/agents/quirks.md): `/vci/deferred/issue`'s UNAUTHORIZED responseContent
    // is a WWW-Authenticate *string*, not JSON — parseBody falls back to the raw string in that case,
    // and the rejection message must carry it verbatim so a learner can read the vendor code inside it.
    mockFetch.mockResolvedValue(
      fail(
        401,
        'Bearer error="invalid_token", error_description="[A375304] The access token does not exist."',
      ),
    );
    await expect(
      vciService.issueDeferred({ accessToken: 'bogus', order: { transactionId: 'txn-1' } }),
    ).rejects.toThrow('[A375304]');
  });
});
