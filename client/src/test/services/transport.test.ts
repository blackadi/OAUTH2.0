import { describe, it, expect, vi, beforeEach } from 'vitest';
import { send, sendRaw, sendForBody, HttpError, NetworkError } from '@/services/transport';
import { getTraces, clearTraces } from '@/services/trace-store';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  globalThis.fetch = mockFetch;
  clearTraces();
});

function response(
  status: number,
  body: string,
  headers: Record<string, string> = {},
  statusText = '',
) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: new Headers(headers),
    text: () => Promise.resolve(body),
  } as Response);
}

describe('what the old transport threw away', () => {
  it('keeps the status, status text and every response header', async () => {
    mockFetch.mockReturnValue(
      response(429, '{"error":"too_many_requests"}', { 'retry-after': '30' }, 'Too Many Requests'),
    );

    const result = await sendRaw({ method: 'POST', url: 'https://as.example/token' });

    expect(result.status).toBe(429);
    expect(result.statusText).toBe('Too Many Requests');
    expect(result.headers['retry-after']).toBe('30');
    expect(result.ok).toBe(false);
  });

  it('lower-cases header names so a lookup is reliable', async () => {
    mockFetch.mockReturnValue(
      response(401, 'no', { 'WWW-Authenticate': 'DPoP error="invalid_token"' }),
    );
    const result = await sendRaw({ method: 'GET', url: 'https://rs.example/userinfo' });
    expect(result.headers['www-authenticate']).toBe('DPoP error="invalid_token"');
  });

  it('records a duration', async () => {
    mockFetch.mockReturnValue(response(200, '{}'));
    const result = await sendRaw({ method: 'GET', url: 'https://as.example/x' });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(result.durationMs)).toBe(true);
  });
});

describe('body parsing', () => {
  it('parses JSON', async () => {
    mockFetch.mockReturnValue(response(200, '{"access_token":"at"}'));
    expect(await sendForBody({ method: 'POST', url: 'u' })).toEqual({ access_token: 'at' });
  });

  it('returns a non-JSON body as its raw string', async () => {
    mockFetch.mockReturnValue(response(200, 'plain text'));
    expect(await sendForBody({ method: 'GET', url: 'u' })).toBe('plain text');
  });

  it('returns {} for an empty body, which is what a 204 sends', async () => {
    mockFetch.mockReturnValue(response(204, ''));
    expect(await sendForBody({ method: 'DELETE', url: 'u' })).toEqual({});
  });
});

describe('error shape', () => {
  it('throws HttpError whose message is the raw body — the contract every caller was written against', async () => {
    mockFetch.mockReturnValue(response(400, 'bad request'));
    await expect(send({ method: 'POST', url: 'u' })).rejects.toThrow('bad request');
  });

  it('carries the status and headers as fields', async () => {
    mockFetch.mockReturnValue(
      response(403, '{"error":"insufficient_user_authentication"}', {
        'www-authenticate': 'Bearer acr_values="urn:example:silver"',
      }),
    );
    await expect(send({ method: 'POST', url: 'u' })).rejects.toBeInstanceOf(HttpError);
    await expect(send({ method: 'POST', url: 'u' })).rejects.toMatchObject({
      status: 403,
      headers: { 'www-authenticate': 'Bearer acr_values="urn:example:silver"' },
    });
  });

  it('sendRaw does NOT throw on a non-2xx — a 401 is an answer, not an exception', async () => {
    mockFetch.mockReturnValue(response(401, 'nope'));
    const result = await sendRaw({ method: 'GET', url: 'u' });
    expect(result.status).toBe(401);
  });

  it('reports a network failure as NetworkError, with no status to invent', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(send({ method: 'GET', url: 'u' })).rejects.toBeInstanceOf(NetworkError);
  });

  it('tolerates a response with no headers, as the older partial mocks provide', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{}'),
    } as Response);
    const result = await sendRaw({ method: 'GET', url: 'u' });
    expect(result.headers).toEqual({});
  });
});

describe('tracing', () => {
  it('records every call, successful or not', async () => {
    mockFetch.mockReturnValueOnce(response(200, '{"a":1}'));
    await sendForBody({ method: 'GET', url: 'https://as.example/ok', label: 'first' });
    mockFetch.mockReturnValueOnce(response(500, 'boom'));
    await expect(send({ method: 'POST', url: 'https://as.example/bad' })).rejects.toThrow('boom');

    const traces = getTraces();
    expect(traces).toHaveLength(2);
    // Newest first, so the panel shows the most recent call at the top without reversing on render.
    expect(traces[0].status).toBe(500);
    expect(traces[1].status).toBe(200);
    expect(traces[1].label).toBe('first');
  });

  it('records a network failure with status 0 rather than omitting it', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(send({ method: 'GET', url: 'https://gone.example' })).rejects.toBeInstanceOf(
      NetworkError,
    );
    const [entry] = getTraces();
    expect(entry.status).toBe(0);
    expect(entry.networkError).toBe('Failed to fetch');
    expect(entry.ok).toBe(false);
  });

  it('captures the request as sent, so the trace can reproduce it', async () => {
    mockFetch.mockReturnValue(response(200, '{}'));
    await sendForBody({
      method: 'POST',
      url: 'https://as.example/token',
      headers: { Authorization: 'Basic c2VjcmV0' },
      body: 'grant_type=client_credentials',
    });
    const [entry] = getTraces();
    expect(entry.requestHeaders).toEqual({ Authorization: 'Basic c2VjcmV0' });
    expect(entry.requestBody).toBe('grant_type=client_credentials');
  });
});
