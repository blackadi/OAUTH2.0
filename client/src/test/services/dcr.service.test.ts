import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dcrService } from '@/services/dcr.service';

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

describe('dcrService.dcrRegister', () => {
  it('sends POST to register endpoint with admin auth', async () => {
    mockFetch.mockResolvedValue(ok({ client_id: 'new1' }));
    const result = await dcrService.dcrRegister({ json: '{}' }, 'auth123');
    expect(result).toEqual({ client_id: 'new1' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/client/dcr/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic auth123' },
      body: JSON.stringify({ json: '{}' }),
    });
  });
});

describe('dcrService.dcrGet', () => {
  it('sends POST to get endpoint with token and clientId', async () => {
    mockFetch.mockResolvedValue(ok({ clientId: 'c1' }));
    const result = await dcrService.dcrGet('regtok', 'c1');
    expect(result).toEqual({ clientId: 'c1' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/client/dcr/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'regtok', clientId: 'c1' }),
    });
  });
});

describe('dcrService.dcrUpdate', () => {
  it('sends POST to update endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ updated: true }));
    await dcrService.dcrUpdate('{"name":"new"}', 'regtok', 'c1');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/client/dcr/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: '{"name":"new"}', token: 'regtok', clientId: 'c1' }),
    });
  });
});

describe('dcrService.dcrDelete', () => {
  it('sends POST to delete endpoint', async () => {
    mockFetch.mockResolvedValue(ok({}));
    await dcrService.dcrDelete('regtok', 'c1');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/client/dcr/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'regtok', clientId: 'c1' }),
    });
  });
});
