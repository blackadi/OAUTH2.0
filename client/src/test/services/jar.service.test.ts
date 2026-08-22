import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processJar } from '@/services/jar.service';

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

/**
 * `/api/jar/process` requires this deployment's admin credentials, and this service sent none.
 *
 * The server added `requireBasicAuth("jar")` on 2026-08-13, because the response it used to forward
 * carried a `ticket` — a credential that lets whoever holds it drive an authorization to completion.
 * `processJar` kept calling `http.postJson`, so **the entire JAR section answered 401 for every user**,
 * with no field in the UI to supply credentials either. Probed live before the fix:
 * `{"error":"invalid_client","error_description":"Client authentication required"}`.
 *
 * There was no test naming this service at all — `check-route-coverage.mjs` guards the *server* side of
 * that question and has no client equivalent. Module 05's lab had authenticated its `curl` since the day
 * of the change, which is the part worth remembering: **the documentation being right is not the client
 * being right.**
 */
describe('processJar', () => {
  it('sends the admin credentials — the endpoint answers 401 without them', async () => {
    mockFetch.mockResolvedValue(ok({ action: 'INTERACTION', resultCode: 'A004001' }));

    const result = await processJar('eyJhbGciOiJFUzI1NiJ9.e30.sig', '4277838306', 'auth123');

    expect(result).toEqual({ action: 'INTERACTION', resultCode: 'A004001' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/jar/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic auth123' },
      body: JSON.stringify({ request: 'eyJhbGciOiJFUzI1NiJ9.e30.sig', clientId: '4277838306' }),
    });
  });

  it('returns the five-field allowlist as-is, with no ticket among it', async () => {
    // The server drops everything else. Asserting the absence documents why the endpoint is gated.
    mockFetch.mockResolvedValue(
      ok({
        action: 'BAD_REQUEST',
        resultCode: 'A005328',
        resultMessage: '[A005328] signature verification failed',
        responseContent: '{"error":"invalid_request"}',
        scopes: [{ name: 'openid' }],
      }),
    );

    const result = await processJar('bad.jwt.sig', 'c1', 'auth123');

    expect(result.resultMessage).toContain('A005328');
    expect(result.scopes?.[0]?.name).toBe('openid');
    expect('ticket' in (result as Record<string, unknown>)).toBe(false);
  });
});
