import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mcpService } from '@/services/mcp.service';

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

const BASE = {
  tokenEndpoint: 'http://localhost:3000/api/token',
  code: 'code-1',
  clientId: 'c-1',
  redirectUri: 'http://localhost:3001/callback',
  codeVerifier: 'v'.repeat(43),
};

function sentBody(): string {
  const [, init] = mockFetch.mock.calls[0];
  return (init as { body: string }).body;
}

/**
 * The wizard registers its own client by DCR, and step 4 has to authenticate the way step 2 registered.
 *
 * It used to ask for `CLIENT_SECRET_BASIC`, read the returned `client_secret` into a local, mention it
 * in a toast and drop it — so the exchange carried no client authentication for a client that required
 * some. Registration now asks for `NONE` (a public client with PKCE, which is what MCP and OAuth 2.1
 * expect of a browser app), and the secret is threaded through anyway because Authlete is on record
 * overriding the requested method on DCR-created clients.
 */
describe('mcpService.exchangeCode', () => {
  it('omits client_secret entirely for a public client', async () => {
    mockFetch.mockResolvedValue(ok({ access_token: 'at', token_type: 'Bearer' }));
    await mcpService.exchangeCode(BASE);
    // Not `client_secret=`: an empty value is still a parameter, and a public client presenting
    // client-auth data is refused with [A157303].
    expect(sentBody()).not.toContain('client_secret');
    expect(sentBody()).toContain('client_id=c-1');
    expect(sentBody()).toContain('code_verifier=');
  });

  it('omits it for an empty secret too', async () => {
    mockFetch.mockResolvedValue(ok({ access_token: 'at', token_type: 'Bearer' }));
    await mcpService.exchangeCode({ ...BASE, clientSecret: '' });
    expect(sentBody()).not.toContain('client_secret');
  });

  it('sends it when the registration came back confidential', async () => {
    mockFetch.mockResolvedValue(ok({ access_token: 'at', token_type: 'Bearer' }));
    await mcpService.exchangeCode({ ...BASE, clientSecret: 's3cr3t' });
    expect(sentBody()).toContain('client_secret=s3cr3t');
  });

  it('keeps `resource` on the token request — MCP requires it on both', async () => {
    mockFetch.mockResolvedValue(ok({ access_token: 'at', token_type: 'Bearer' }));
    await mcpService.exchangeCode({ ...BASE, resource: 'https://api.example.com/mcp' });
    expect(sentBody()).toContain('resource=https%3A%2F%2Fapi.example.com%2Fmcp');
  });
});
