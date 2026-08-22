import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tokenExchangeService } from '@/services/token-exchange.service';

/**
 * RFC 8693 Token Exchange goes to the **ordinary token endpoint**.
 *
 * That is the fact people reliably get wrong — there is no `/token-exchange` route, because §2.1 defines
 * a `grant_type` URN and the parameters ride in the same form body as any other grant. Asserting the URL
 * here is not padding: a future refactor that "tidied" this onto its own path would be wrong, and this
 * is what would say so.
 */

const mockFetch = vi.fn<typeof fetch>();

/** Narrowed once — see the note in `token.service.test.ts`. */
function initOf(call: number): { method?: string; body: string; headers: Record<string, string> } {
  const init = mockFetch.mock.calls[call]?.[1];
  return {
    method: init?.method,
    body: typeof init?.body === 'string' ? init.body : '',
    headers: (init?.headers ?? {}) as Record<string, string>,
  };
}

function ok(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response);
}

beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch;
});
afterEach(() => vi.restoreAllMocks());

const BODY = {
  grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
  subject_token: 'subject-at',
  subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
};

describe('tokenExchangeService.exchange', () => {
  it('posts to the ordinary token endpoint, not a dedicated one', async () => {
    mockFetch.mockReturnValue(ok({ access_token: 'new-at' }));
    await tokenExchangeService.exchange(BODY, '4277838306');

    expect(mockFetch.mock.calls[0]?.[0]).toBe('http://localhost:3000/api/token');
    expect(initOf(0).method).toBe('POST');
    expect(initOf(0).headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });

  it('form-encodes the caller-assembled body verbatim', async () => {
    mockFetch.mockReturnValue(ok({ access_token: 'new-at' }));
    await tokenExchangeService.exchange(
      { ...BODY, actor_token: 'actor-at', audience: 'https://api.example.com' },
      '4277838306',
    );

    const body = initOf(0).body;
    expect(body).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Atoken-exchange');
    expect(body).toContain('subject_token=subject-at');
    expect(body).toContain('actor_token=actor-at');
    expect(body).toContain('audience=https%3A%2F%2Fapi.example.com');
  });

  /**
   * The same rule as every other grant in this client, and the reason it matters: Authlete refuses a
   * public client for carrying *any* client-authentication data — `[A157303]` — so a Basic header sent
   * unconditionally would break the flow for the SPA's own client. Three grants in `token.service.ts`
   * shipped exactly that bug.
   */
  it('sends no Authorization header for a public client, and client_id in the body', async () => {
    mockFetch.mockReturnValue(ok({ access_token: 'new-at' }));
    await tokenExchangeService.exchange(BODY, '4277838306');

    expect(initOf(0).headers.Authorization).toBeUndefined();
    expect(initOf(0).body).toContain('client_id=4277838306');
  });

  it('sends Basic and keeps client_id out of the body when a secret is supplied', async () => {
    mockFetch.mockReturnValue(ok({ access_token: 'new-at' }));
    await tokenExchangeService.exchange(BODY, 'conf-client', 's3cr3t');

    expect(initOf(0).headers.Authorization).toBe(`Basic ${btoa('conf-client:s3cr3t')}`);
    // One method, not two: with Basic in play, `client_id` in the body would be a second credential
    // channel — which RFC 6749 §2.3.1 forbids and this server refuses outright.
    expect(initOf(0).body).not.toContain('client_id=');
  });

  it('treats an empty secret as no secret rather than as an empty credential', async () => {
    mockFetch.mockReturnValue(ok({ access_token: 'new-at' }));
    await tokenExchangeService.exchange(BODY, '4277838306', '');

    expect(initOf(0).headers.Authorization).toBeUndefined();
    expect(initOf(0).body).toContain('client_id=4277838306');
  });

  it('resolves to the parsed token response', async () => {
    mockFetch.mockReturnValue(
      ok({ access_token: 'new-at', issued_token_type: 'urn:x', token_type: 'Bearer' }),
    );
    const result = await tokenExchangeService.exchange(BODY, '4277838306');
    expect(result).toEqual({
      access_token: 'new-at',
      issued_token_type: 'urn:x',
      token_type: 'Bearer',
    });
  });

  it('rejects with the body on a refusal, so the explainer can decode it', async () => {
    mockFetch.mockReturnValue(
      Promise.resolve({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers(),
        text: () => Promise.resolve('{"error":"invalid_grant"}'),
      } as Response),
    );
    await expect(tokenExchangeService.exchange(BODY, '4277838306')).rejects.toThrow(
      /invalid_grant/,
    );
  });
});
