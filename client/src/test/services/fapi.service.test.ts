import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fapiService } from '@/services/fapi.service';

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

/**
 * These two endpoints exist to report this deployment's own FAPI 2.0 posture, and the server-side finding
 * `FAPI-2.0-SECURITY-PROFILE.md` (FAPI2-W1/W4) is specifically that they once **asserted six hardcoded
 * literals instead of reading the live service** — the exact failure mode a service test like this one
 * would not catch (it was never a client-side defect), but which makes it worth pinning the client's own
 * contract precisely: it must render whatever the endpoint sends, including a field that is `false`, and
 * must not invent a value the endpoint omitted.
 */
describe('fapiService.getConfig', () => {
  it('fetches /api/fapi/config and returns the live posture verbatim', async () => {
    mockFetch.mockResolvedValue(
      ok({
        mode: 'disabled',
        dpopEnabled: false,
        supportedTokenAuthMethods: ['private_key_jwt', 'client_secret_basic'],
        certificateBoundAccessTokens: false,
        parRequired: false,
        pkceRequired: false,
        refreshTokenRotation: true,
        scopeRequired: false,
        cimdSupported: true,
        specs: { securityProfile: 'FAPI 2.0 Security Profile', messageSigning: false },
      }),
    );
    const result = await fapiService.getConfig();
    expect(result).toMatchObject({
      mode: 'disabled',
      // A falsy-but-real value must survive the round trip — this is the exact shape of bug FAPI2-W1
      // was: a hardcoded `true` where the live value is `false`.
      parRequired: false,
      pkceRequired: false,
      cimdSupported: true,
    });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/fapi/config');
    expect((init as RequestInit).method).toBe('GET');
  });

  it('propagates a server error rather than swallowing it into a false "disabled" report', async () => {
    mockFetch.mockResolvedValue(fail(500, 'Internal Server Error'));
    await expect(fapiService.getConfig()).rejects.toThrow('Internal Server Error');
  });
});

describe('fapiService.getStatus', () => {
  it('fetches /api/fapi/status and returns all eight §5.3.2.1-relevant fields', async () => {
    mockFetch.mockResolvedValue(
      ok({
        mode: 'disabled',
        dpopEnabled: false,
        issuer: 'http://localhost:3000',
        fapiModes: undefined,
        dpopNonceRequired: false,
        dpopNonceDuration: undefined,
        scopeRequired: false,
        refreshTokenKept: true,
        refreshTokenIdempotent: undefined,
        pkceRequired: false,
        parRequired: false,
        clientIdMetadataDocumentSupported: true,
        pkceS256Required: false,
        tlsClientCertificateBoundAccessTokens: false,
      }),
    );
    const result = (await fapiService.getStatus()) as Record<string, unknown>;
    expect(result.issuer).toBe('http://localhost:3000');
    // `refreshTokenKept: true` means NOT rotated — the console-label trap the server-side comment
    // documents. This test only asserts the field survives the round trip; the *inversion* itself is
    // FapiSection's job, covered by FapiSection.driven.test.tsx.
    expect(result.refreshTokenKept).toBe(true);
    expect(result.pkceS256Required).toBe(false);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/fapi/status');
  });
});
