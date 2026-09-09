import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deviceService } from '@/services/device.service';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  globalThis.fetch = mockFetch;
});

/**
 * **Fixtures are conformant response bodies, not the minimum that made an assertion pass.**
 *
 * When `services/schemas.ts` began validating at the transport boundary, this file's mocks were among
 * the ones it rejected — and rejected correctly. They described bodies no authorization server would
 * send, and in three files they described the *specific* body T1-11 stopped sending: `par` mocked
 * `requestUri`, `device` mocked `deviceCode`/`userCode`, `dcr` mocked `clientId`. Those are Authlete's
 * camelCase envelope, replaced by the specification's snake_case body months ago. Nothing noticed,
 * because these tests assert the outgoing *request* and never read the response.
 *
 * A fixture is documentation of what the server sends. One that is wrong teaches the next reader the
 * wrong shape, and it is the only thing standing between a schema and a false pass.
 */

function ok(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response);
}

describe('deviceService.authorization', () => {
  it('sends POST to device authorization endpoint', async () => {
    mockFetch.mockResolvedValue(
      ok({
        device_code: 'dc1',
        user_code: 'uc1',
        verification_uri: 'http://localhost:3000/device',
        expires_in: 1800,
      }),
    );
    const result = await deviceService.authorization({
      parameters: 'client_id=123&scope=openid',
      clientId: 'cid',
    });
    expect(result).toEqual({
      device_code: 'dc1',
      user_code: 'uc1',
      verification_uri: 'http://localhost:3000/device',
      expires_in: 1800,
    });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/device/authorization', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters: 'client_id=123&scope=openid', clientId: 'cid' }),
    });
  });
});

describe('deviceService.verification', () => {
  it('sends POST to verification endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ valid: true }));
    const result = await deviceService.verification('uc1');
    expect(result).toEqual({ valid: true });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/device/verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userCode: 'uc1' }),
    });
  });
});

describe('deviceService.complete', () => {
  it('sends POST to complete endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ result: 'SUCCESS' }));
    await deviceService.complete('uc1', 'AUTHORIZED', 'admin');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/device/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userCode: 'uc1', result: 'AUTHORIZED', subject: 'admin' }),
    });
  });
});

/**
 * `pollToken` had no test at all — every one of its three branches (public client, `client_secret_post`,
 * `client_secret_basic`) was unexercised, on the call that actually redeems a device code for a token.
 */
describe('deviceService.pollToken', () => {
  it('sends grant_type and device_code as a public client, with no credential at all', async () => {
    mockFetch.mockResolvedValue(ok({ access_token: 'at' }));
    await deviceService.pollToken('device-code-1', 'cid');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/token');
    const params = new URLSearchParams((init as { body: string }).body);
    expect(params.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:device_code');
    expect(params.get('device_code')).toBe('device-code-1');
    expect(params.get('client_id')).toBe('cid');
    expect(params.has('client_secret')).toBe(false);
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBeUndefined();
  });

  it('sends the secret in the body for client_secret_post, not as a Basic header', async () => {
    mockFetch.mockResolvedValue(ok({ access_token: 'at' }));
    await deviceService.pollToken('device-code-1', 'cid', 'csecret', 'post');

    const [, init] = mockFetch.mock.calls[0];
    const params = new URLSearchParams((init as { body: string }).body);
    expect(params.get('client_secret')).toBe('csecret');
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBeUndefined();
  });

  it('sends the secret as a Basic header for client_secret_basic, and defaults to it', async () => {
    mockFetch.mockResolvedValue(ok({ access_token: 'at' }));
    // No fourth argument — `authMethod` defaults to 'basic'.
    await deviceService.pollToken('device-code-1', 'cid', 'csecret');

    const [, init] = mockFetch.mock.calls[0];
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe(
      `Basic ${btoa('cid:csecret')}`,
    );
    const params = new URLSearchParams((init as { body: string }).body);
    // The secret authenticates the request over the header; it must not also ride in the body.
    expect(params.has('client_secret')).toBe(false);
  });
});
