import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nativeSsoService } from '@/services/native-sso.service';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  globalThis.fetch = mockFetch;
});

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

describe('nativeSsoService.process', () => {
  const adminAuth = btoa('mgmt-id:mgmt-secret');

  /**
   * `docs/API.md` described this endpoint as taking a body `clientId`/`clientSecret` until this
   * session found it stale against `native-sso.controller.ts`'s `requireBasicAuth("nativesso")` — an
   * admin Basic-auth gate, the same one DCR and Federation registration use. This pins the corrected
   * behaviour: the credential travels as an `Authorization: Basic` header, not as body fields.
   */
  it('sends the admin credential as an Authorization header, not as body fields', async () => {
    mockFetch.mockResolvedValue(
      okJson({
        action: 'OK',
        responseContent: JSON.stringify({ access_token: 'at', device_secret: 'ds' }),
      }),
    );
    await nativeSsoService.process({ accessToken: 'at-1', deviceSecret: 'ds-1' }, adminAuth);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/nativesso');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe(
      `Basic ${adminAuth}`,
    );
    const body = JSON.parse((init as { body: string }).body) as Record<string, unknown>;
    expect(body).toEqual({ accessToken: 'at-1', deviceSecret: 'ds-1' });
    expect(body.clientId).toBeUndefined();
    expect(body.clientSecret).toBeUndefined();
  });

  it('forwards optional fields only when the caller supplied them', async () => {
    mockFetch.mockResolvedValue(okJson({ action: 'OK', responseContent: '{}' }));
    await nativeSsoService.process(
      {
        accessToken: 'at-1',
        deviceSecret: 'ds-1',
        sub: 'user-1',
        idTokenAudType: 'string',
      },
      adminAuth,
    );

    const body = JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body);
    expect(body).toEqual({
      accessToken: 'at-1',
      deviceSecret: 'ds-1',
      sub: 'user-1',
      idTokenAudType: 'string',
    });
  });

  it('rejects with the vendor error text on a device-secret mismatch', async () => {
    mockFetch.mockResolvedValue(
      fail(
        400,
        JSON.stringify({
          error: 'invalid_request',
          error_description: 'The device secret does not match.',
        }),
      ),
    );
    await expect(
      nativeSsoService.process({ accessToken: 'at-1', deviceSecret: 'wrong' }, adminAuth),
    ).rejects.toThrow('does not match');
  });
});

describe('nativeSsoService.logout', () => {
  const adminAuth = btoa('mgmt-id:mgmt-secret');

  it('sends the session ID with the admin credential as a header', async () => {
    mockFetch.mockResolvedValue(okJson({ action: 'OK', count: 3 }));
    await nativeSsoService.logout('session-abc', adminAuth);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/nativesso/logout');
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe(
      `Basic ${adminAuth}`,
    );
    expect(JSON.parse((init as { body: string }).body)).toEqual({ sessionId: 'session-abc' });
  });
});
