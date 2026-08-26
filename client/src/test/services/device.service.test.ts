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
