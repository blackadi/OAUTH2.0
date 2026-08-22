import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dpopRequest, getStoredNonce, type DpopRequestInit } from '@/services/dpop-fetch';

const mockFetch = vi.fn();
const URL_ = 'http://localhost:3000/api/token';

beforeEach(() => {
  vi.resetAllMocks();
  globalThis.fetch = mockFetch;
  sessionStorage.clear();
});

function res(
  ok: boolean,
  body: unknown,
  headers: Record<string, string> = {},
  status = ok ? 200 : 400,
) {
  return Promise.resolve({
    ok,
    status,
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    headers: new Headers(headers),
  } as Response);
}

/** RFC 9449 §8's refusal at an authorization server: 400, `use_dpop_nonce`, and a nonce to replay. */
const nonceRefusal = (nonce: string) =>
  res(
    false,
    {
      error: 'use_dpop_nonce',
      error_description:
        "[A254307] DPoP nonce error: The value of the 'nonce' claim in the DPoP proof JWT is different from the expected one.",
    },
    { 'dpop-nonce': nonce },
  );

const init = (proof: string): DpopRequestInit => ({ method: 'POST', headers: { DPoP: proof } });

describe('dpopRequest — the nonce dance (DR-20)', () => {
  it('retries once with a re-signed proof when the server demands a nonce', async () => {
    mockFetch
      .mockReturnValueOnce(nonceRefusal('nonce-from-server'))
      .mockReturnValueOnce(
        res(true, { access_token: 'at' }, { 'dpop-nonce': 'nonce-from-server' }),
      );

    // The factory records which nonce it was asked to sign with.
    const seen: (string | undefined)[] = [];
    const makeProof = async (nonce?: string) => {
      seen.push(nonce);
      return `proof-with-${nonce ?? 'none'}`;
    };

    const { data, dpopNonce } = await dpopRequest(URL_, makeProof, init);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    // First attempt had no nonce; the retry was signed with the one the refusal carried.
    expect(seen).toEqual([undefined, 'nonce-from-server']);
    const retryInit = mockFetch.mock.calls[1][1] as RequestInit;
    expect((retryInit.headers as Record<string, string>).DPoP).toBe('proof-with-nonce-from-server');
    expect(data).toEqual({ access_token: 'at' });
    expect(dpopNonce).toBe('nonce-from-server');
  });

  it('caches the nonce from an ERROR response even when it cannot retry', async () => {
    // This is the actual defect. A bare string proof cannot be re-signed, so no retry is possible —
    // but throwing the nonce away as well is what made the failure permanent rather than one-off.
    mockFetch.mockReturnValueOnce(nonceRefusal('nonce-abc'));

    await expect(dpopRequest(URL_, 'a-fixed-proof-string', init)).rejects.toThrow('use_dpop_nonce');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(getStoredNonce()).toBe('nonce-abc');
  });

  it('uses the cached nonce on the first attempt of a later request', async () => {
    sessionStorage.setItem('dpop_nonce', 'cached-nonce');
    mockFetch.mockReturnValueOnce(res(true, { ok: 1 }));

    const seen: (string | undefined)[] = [];
    await dpopRequest(
      URL_,
      async (nonce) => {
        seen.push(nonce);
        return 'p';
      },
      init,
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(['cached-nonce']);
  });

  it('does not retry a failure that is not a nonce error', async () => {
    mockFetch.mockReturnValueOnce(res(false, { error: 'invalid_dpop_proof' }, {}, 401));

    await expect(dpopRequest(URL_, async () => 'p', init)).rejects.toThrow('invalid_dpop_proof');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry a nonce error that carries no new nonce', async () => {
    // Nothing to replay with — retrying would send the identical proof and fail identically.
    mockFetch.mockReturnValueOnce(res(false, { error: 'use_dpop_nonce' }));

    await expect(dpopRequest(URL_, async () => 'p', init)).rejects.toThrow('use_dpop_nonce');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries at most once, then surfaces the second failure', async () => {
    mockFetch.mockReturnValueOnce(nonceRefusal('n1')).mockReturnValueOnce(nonceRefusal('n2'));

    await expect(dpopRequest(URL_, async () => 'p', init)).rejects.toThrow('use_dpop_nonce');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('caches a nonce returned on SUCCESS', async () => {
    // Observed live 2026-08-15/17: both the token endpoint and PAR return a nonce on success, and it is
    // time-based rather than one-time — so a client should cache and reuse it.
    mockFetch.mockReturnValueOnce(res(true, { access_token: 'at' }, { 'dpop-nonce': 'fresh' }));

    const { dpopNonce } = await dpopRequest(URL_, async () => 'p', init);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(dpopNonce).toBe('fresh');
    expect(getStoredNonce()).toBe('fresh');
  });

  it('handles a non-JSON error body without throwing a parse error', async () => {
    // `/api/vci/deferred/issue` answers with a `WWW-Authenticate`-shaped string, not JSON.
    mockFetch.mockReturnValueOnce(res(false, 'Bearer error="invalid_token"', {}, 401));

    await expect(dpopRequest(URL_, async () => 'p', init)).rejects.toThrow('invalid_token');
  });

  it('returns {} for an empty success body rather than failing to parse', async () => {
    mockFetch.mockReturnValueOnce(res(true, ''));
    const { data } = await dpopRequest(URL_, async () => 'p', init);
    expect(data).toEqual({});
  });
});
