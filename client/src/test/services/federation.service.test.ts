import { describe, it, expect, vi, beforeEach } from 'vitest';
import { federationService } from '@/services/federation.service';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  globalThis.fetch = mockFetch;
});

function okText(rawText: string, contentType = 'application/entity-statement+jwt') {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.reject(new Error('not JSON')),
    text: () => Promise.resolve(rawText),
    headers: new Headers({ 'content-type': contentType }),
  } as unknown as Response);
}

function okJson(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
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

describe('federationService.getConfiguration', () => {
  /**
   * On success the server sends `Content-Type: application/entity-statement+jwt` and a **raw JWT
   * string** (`federation.controller.ts`: `res.send(result.responseContent)`), not a JSON envelope —
   * this endpoint has never actually returned 200 on the live deployment (blocked on a missing
   * federation JWK Set, DR-21/FED-W2), so this success path had no test anywhere. `transport.ts`'s
   * `parseBody` falls back to the raw string when `JSON.parse` throws, so this asserts that fallback
   * is what a genuine caller receives — a string, not a parse error and not `undefined`.
   */
  it('resolves to the raw entity statement JWT string on success, not a parse error', async () => {
    const jwt = 'header.payload.signature';
    mockFetch.mockResolvedValue(okText(jwt));
    const result = await federationService.getConfiguration();
    expect(result).toBe(jwt);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/federation/configuration');
    expect((init as RequestInit).method).toBe('GET');
  });

  it('rejects with the vendor error text when the federation JWK Set is not configured (the current live state)', async () => {
    mockFetch.mockResolvedValue(
      fail(
        500,
        JSON.stringify({
          error: 'federation_error',
          error_description: '[A316201] The federation JWK Set is not configured.',
        }),
      ),
    );
    await expect(federationService.getConfiguration()).rejects.toThrow('A316201');
  });
});

describe('federationService.register', () => {
  const adminAuth = btoa('admin:sekret');

  it('sends Authorization: Basic with the caller-supplied credentials, not double-encoded', async () => {
    mockFetch.mockResolvedValue(
      okJson({ client_id: 'https://rp.example.com', client_id_issued_at: 1_700_000_000 }),
    );
    await federationService.register({ entity_type: 'openid_relying_party' }, adminAuth);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/federation/registration');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe(
      `Basic ${adminAuth}`,
    );
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      entity_type: 'openid_relying_party',
    });
  });

  it('rejects with the raw error body on a bad request', async () => {
    mockFetch.mockResolvedValue(
      fail(
        400,
        JSON.stringify({ error: 'federation_error', error_description: 'Malformed entity type' }),
      ),
    );
    await expect(federationService.register({}, adminAuth)).rejects.toThrow(
      'Malformed entity type',
    );
  });
});
