import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cibaService } from '@/services/ciba.service';

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

function raw(status: number, data: unknown, statusText = '') {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: new Headers(),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response);
}

describe('cibaService.backchannelAuthentication', () => {
  it('sends POST to authentication endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ ticket: 't1' }));
    const result = await cibaService.backchannelAuthentication({
      parameters: 'login_hint=admin',
      clientId: 'cid',
    });
    expect(result).toEqual({ ticket: 't1' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/ciba/authentication', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters: 'login_hint=admin', clientId: 'cid' }),
    });
  });

  /**
   * `client_secret_basic` clients authenticate over this header rather than in the body — the server
   * matches the channel credentials arrive on against the client's registered auth method, and sending
   * the wrong one earns `401 [A157357]`. This branch of `basicHeader` had no test at all.
   */
  it('sends an Authorization: Basic header when a client_secret_basic credential is supplied', async () => {
    mockFetch.mockResolvedValue(ok({ ticket: 't1' }));
    await cibaService.backchannelAuthentication(
      { parameters: 'login_hint=admin' },
      { clientId: 'basic-cid', clientSecret: 'basic-secret' },
    );
    const [, init] = mockFetch.mock.calls[0];
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe(
      `Basic ${btoa('basic-cid:basic-secret')}`,
    );
  });

  it('omits the Authorization header when no basic credential is given', async () => {
    mockFetch.mockResolvedValue(ok({ ticket: 't1' }));
    await cibaService.backchannelAuthentication({ parameters: 'login_hint=admin' });
    const [, init] = mockFetch.mock.calls[0];
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBeUndefined();
  });

  it('omits the Authorization header when the credential object carries no clientId', async () => {
    mockFetch.mockResolvedValue(ok({ ticket: 't1' }));
    await cibaService.backchannelAuthentication(
      { parameters: 'login_hint=admin' },
      { clientId: '', clientSecret: 'x' },
    );
    const [, init] = mockFetch.mock.calls[0];
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBeUndefined();
  });
});

describe('cibaService.issue', () => {
  it('sends POST to issue endpoint with ticket', async () => {
    mockFetch.mockResolvedValue(ok({ authReqId: 'ar1' }));
    const result = await cibaService.issue('t1');
    expect(result).toEqual({ authReqId: 'ar1' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/ciba/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: 't1' }),
    });
  });
});

describe('cibaService.fail', () => {
  it('sends POST to fail endpoint with ticket and reason', async () => {
    mockFetch.mockResolvedValue(ok({}));
    await cibaService.fail('t1', 'ACCESS_DENIED');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/ciba/fail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: 't1', reason: 'ACCESS_DENIED' }),
    });
  });
});

describe('cibaService.complete', () => {
  it('sends POST to complete endpoint with ticket, result, subject', async () => {
    mockFetch.mockResolvedValue(ok({}));
    await cibaService.complete('t1', 'AUTHORIZED', 'admin');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/ciba/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: 't1', result: 'AUTHORIZED', subject: 'admin' }),
    });
  });
});

describe('cibaService.pollToken', () => {
  it('posts the CIBA grant type and auth_req_id as a form body', async () => {
    mockFetch.mockResolvedValue(raw(200, { access_token: 'at' }));
    await cibaService.pollToken('req-1');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/token');
    expect((init as RequestInit).method).toBe('POST');
    const params = new URLSearchParams((init as { body: string }).body);
    expect(params.get('grant_type')).toBe('urn:openid:params:grant-type:ciba');
    expect(params.get('auth_req_id')).toBe('req-1');
    expect(params.has('client_id')).toBe(false);
  });

  it('includes client_id and client_secret only when both are supplied', async () => {
    mockFetch.mockResolvedValue(raw(200, {}));
    await cibaService.pollToken('req-1', 'cid', 'csecret');

    const params = new URLSearchParams((mockFetch.mock.calls[0][1] as { body: string }).body);
    expect(params.get('client_id')).toBe('cid');
    expect(params.get('client_secret')).toBe('csecret');
  });

  it('omits both when only one of client_id/client_secret is supplied', async () => {
    mockFetch.mockResolvedValue(raw(200, {}));
    await cibaService.pollToken('req-1', 'cid-only', undefined);

    const params = new URLSearchParams((mockFetch.mock.calls[0][1] as { body: string }).body);
    expect(params.has('client_id')).toBe(false);
    expect(params.has('client_secret')).toBe(false);
  });

  /**
   * The whole reason this uses `sendRaw` and not the throwing `send`/`http.*` helpers: CIBA Core §11
   * makes `authorization_pending` and `slow_down` the *normal* states of a poll loop, not failures. A
   * throwing client would turn every in-progress poll into a caught exception.
   */
  it('resolves (does not throw) on a non-2xx authorization_pending response, and returns the status', async () => {
    mockFetch.mockResolvedValue(raw(400, { error: 'authorization_pending' }, 'Bad Request'));
    const result = await cibaService.pollToken('req-1');

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: 'authorization_pending' });
  });

  it('resolves a successful poll with the issued token body', async () => {
    mockFetch.mockResolvedValue(raw(200, { access_token: 'at-final', token_type: 'Bearer' }));
    const result = await cibaService.pollToken('req-1');

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ access_token: 'at-final', token_type: 'Bearer' });
  });
});
