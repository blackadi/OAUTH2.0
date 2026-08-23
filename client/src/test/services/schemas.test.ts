import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  tokenResponseSchema,
  parResponseSchema,
  deviceAuthorizationSchema,
  dcrRegistrationSchema,
  asMetadataSchema,
  introspectionSchema,
  healthSchema,
  overallHealthSchema,
} from '@/services/schemas';
import { send, sendRaw, HttpError, SchemaError, NetworkError } from '@/services/transport';
import { clearTraces } from '@/services/trace-store';

/**
 * Response shapes, checked at the transport boundary.
 *
 * **The defect this closes.** T1-11 made `POST /api/par` answer RFC 9126 §2.2's body — `request_uri`,
 * snake_case — in place of Authlete's camelCase envelope. `RarSection` kept reading `requestUri`, got
 * `undefined`, and its button did nothing: no redirect, no error, and the error branch never ran
 * either, because the response object itself was truthy. `FapiSection` had the same bug by the same
 * route. Twenty driven section tests now catch that *per section*; a schema catches it once for every
 * caller, and catches the other direction too — the day the server's shape changes, the request that
 * used to work fails loudly instead of leaving one field quietly undefined three layers up.
 *
 * The last describe block is the one that would have caught the original, and it is worth reading
 * first: **the pre-T1-11 envelope is rejected by every schema that replaced it.**
 */

const mockFetch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  clearTraces();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});
afterEach(() => vi.restoreAllMocks());

function respond(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return Promise.resolve({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: 'OK',
    headers: new Headers(),
    text: () => Promise.resolve(raw),
  });
}

describe('validation at the boundary', () => {
  it('lets a conformant body through untouched', async () => {
    mockFetch.mockReturnValue(respond({ access_token: 'at', token_type: 'Bearer' }));
    const result = await send({
      method: 'POST',
      url: '/api/token',
      schema: tokenResponseSchema,
    });
    expect(result.body).toEqual({ access_token: 'at', token_type: 'Bearer' });
  });

  /**
   * The caller gets the body it was sent, unknown members and all.
   *
   * **This assertion is weaker than it looks, and saying so is the point.** `validate` discards the
   * parsed value and returns the original `result.body`, so this would pass even if the schema stripped
   * unknown keys — it was written expecting to pin looseness and, on being mutation-checked, turned out
   * to pin the *discard* instead. Both are worth having; the looseness itself is asserted directly
   * against the schema below, where a `strictObject` would genuinely fail.
   */
  it('hands the caller the original body, not zod’s copy', async () => {
    mockFetch.mockReturnValue(
      respond({
        access_token: 'at',
        token_type: 'DPoP',
        authorization_details: [{ type: 'payment_initiation' }],
        some_vendor_field: 42,
      }),
    );
    const result = await send({ method: 'POST', url: '/api/token', schema: tokenResponseSchema });

    expect(result.body).toMatchObject({
      authorization_details: [{ type: 'payment_initiation' }],
      some_vendor_field: 42,
    });
  });

  it('throws SchemaError naming the member that is missing', async () => {
    mockFetch.mockReturnValue(respond({ access_token: 'at' }));

    await expect(
      send({ method: 'POST', url: '/api/token', schema: tokenResponseSchema }),
    ).rejects.toThrow(SchemaError);

    const err = await send({
      method: 'POST',
      url: '/api/token',
      schema: tokenResponseSchema,
    }).catch((e: unknown) => e);

    // `instanceof` rather than a cast: a cast would type-check even if the rejection were an
    // `HttpError`, which is the one thing this test most needs to distinguish.
    expect(err).toBeInstanceOf(SchemaError);
    const schemaError = err as SchemaError;
    expect(schemaError.issues.map((i) => i.path)).toContain('token_type');
    expect(schemaError.status).toBe(200);
    expect(schemaError.url).toBe('/api/token');
  });

  /**
   * The raw body travels with the error, because a debugger that says "the response was wrong" without
   * showing the response has taken away the only thing worth looking at. `ErrorExplainer` renders
   * `message` verbatim, so this is what a user actually sees.
   */
  it('carries the raw body in the message, so the user still sees what arrived', async () => {
    mockFetch.mockReturnValue(respond({ access_token: 'at', vendor: 'x' }));
    const err = await send({
      method: 'POST',
      url: '/api/token',
      schema: tokenResponseSchema,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(SchemaError);
    expect((err as SchemaError).message).toContain('token_type');
    expect((err as SchemaError).message).toContain('{"access_token":"at","vendor":"x"}');
  });

  it('checks nothing when no schema is supplied', async () => {
    mockFetch.mockReturnValue(respond({ anything: 'at all' }));
    const result = await send({ method: 'POST', url: '/api/anything' });
    expect(result.body).toEqual({ anything: 'at all' });
  });

  /**
   * **Success-only, and not a detail.** A non-2xx must stay an `HttpError`: validating an error body
   * against a success schema would report "access_token is missing" for a response whose actual problem
   * is `invalid_client`, sending the reader after the wrong thing entirely.
   */
  it('leaves a non-2xx as HttpError rather than reporting a schema mismatch', async () => {
    mockFetch.mockReturnValue(respond({ error: 'invalid_client' }, { ok: false, status: 401 }));
    const err = await send({
      method: 'POST',
      url: '/api/token',
      schema: tokenResponseSchema,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpError);
    expect(err).not.toBeInstanceOf(SchemaError);
  });

  /**
   * `sendRaw` never validates, because at that layer a non-2xx is **data**: a CIBA poll's
   * `authorization_pending` and a DPoP `use_dpop_nonce` are the normal states of their flows, and
   * `cibaService.pollToken` switches on the status precisely because the body reaches it intact.
   */
  it('does not validate in sendRaw, where a non-2xx is data', async () => {
    mockFetch.mockReturnValue(
      respond({ error: 'authorization_pending' }, { ok: false, status: 400 }),
    );
    const result = await sendRaw({
      method: 'POST',
      url: '/api/token',
      schema: tokenResponseSchema,
    });
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: 'authorization_pending' });
  });

  it('still reports a network failure as NetworkError, not a schema problem', async () => {
    mockFetch.mockRejectedValue(new Error('fetch failed'));
    await expect(
      send({ method: 'GET', url: '/api/health', schema: healthSchema }),
    ).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('the shapes themselves', () => {
  it.each([
    ['token', tokenResponseSchema, { access_token: 'at', token_type: 'Bearer' }],
    [
      'par',
      parResponseSchema,
      { expires_in: 600, request_uri: 'urn:ietf:params:oauth:request_uri:1' },
    ],
    [
      'device',
      deviceAuthorizationSchema,
      {
        device_code: 'dc',
        user_code: 'WDJB-MJHT',
        verification_uri: 'http://localhost:3000/device',
        expires_in: 1800,
      },
    ],
    ['dcr', dcrRegistrationSchema, { client_id: 'c1' }],
    [
      'as-metadata',
      asMetadataSchema,
      { issuer: 'https://as.example', response_types_supported: ['code'] },
    ],
    ['introspection', introspectionSchema, { active: false }],
    ['health', healthSchema, { status: 'ok', uptime: 12, timestamp: '2026-08-23T00:00:00Z' }],
    [
      'overall-health',
      overallHealthSchema,
      {
        status: 'ok',
        uptime: 12,
        timestamp: '2026-08-23T00:00:00Z',
        checks: { redis: { healthy: true, connected: true, configured: true } },
      },
    ],
  ] as const)('%s accepts the minimum a conformant server may send', (_name, schema, body) => {
    // The *minimum*, deliberately: every optional member omitted. A schema that only passed a fully
    // populated response would reject servers that are entirely correct — `{"active": false}` is a
    // complete RFC 7662 §2.2 body, and a device flow with `deviceFlowPollingInterval` of 0 omits
    // `interval` altogether.
    expect(schema.safeParse(body).success).toBe(true);
  });

  /**
   * **The one assertion that makes `looseObject` load-bearing.**
   *
   * RFC 6749 §5.1 says the authorization server may issue parameters beyond the five it defines, and
   * Authlete does — `grant_id`, `authorization_details`, vendor fields. `z.strictObject` would reject
   * every one of those responses outright, turning a correct server into a broken one, so the schemas
   * must accept unknown members and be seen to. (`z.object` would merely *strip* them, which is
   * invisible here because `validate` discards the parsed value — the distinction that matters is
   * strict versus not.)
   */
  it.each([
    ['token', tokenResponseSchema, { access_token: 'at', token_type: 'Bearer' }],
    ['par', parResponseSchema, { request_uri: 'urn:x' }],
    ['introspection', introspectionSchema, { active: true }],
    [
      'as-metadata',
      asMetadataSchema,
      { issuer: 'https://as.example', response_types_supported: [] },
    ],
  ] as const)('%s accepts members it does not model', (_name, schema, body) => {
    const withVendor = { ...body, some_vendor_field: 42, another: { nested: true } };
    expect(schema.safeParse(withVendor).success).toBe(true);
  });

  it('accepts an introspection response with a DPoP confirmation', () => {
    const parsed = introspectionSchema.safeParse({ active: true, cnf: { jkt: 'R05VIe6r11s' } });
    expect(parsed.success).toBe(true);
    // `cnf.jkt`, not the scheme the caller chose, is what makes a token sender-constrained — so it has
    // to survive parsing rather than being dropped as an unmodelled member.
    expect(parsed.data).toMatchObject({ cnf: { jkt: 'R05VIe6r11s' } });
  });

  it('accepts an aud that is a string or an array, because RFC 7662 permits both', () => {
    expect(introspectionSchema.safeParse({ active: true, aud: 'rs1' }).success).toBe(true);
    expect(introspectionSchema.safeParse({ active: true, aud: ['rs1', 'rs2'] }).success).toBe(true);
  });

  it('rejects a number where a string belongs, which is how a silent coercion starts', () => {
    // `expires_in: "600"` is the classic: JavaScript compares and arithmetics it into something that
    // looks almost right, and the countdown is wrong by a factor nobody notices.
    expect(parResponseSchema.safeParse({ request_uri: 'urn:x', expires_in: '600' }).success).toBe(
      false,
    );
  });
});

/**
 * **The regression, stated once.**
 *
 * Every body below is the *pre-T1-11* envelope — Authlete's camelCase, which these endpoints answered
 * until 2026-08-14 and which three of this repo's own service-test fixtures were still describing when
 * this file was written. Each must now be rejected, because reading one of them is exactly the state
 * that made a button enabled and inert.
 */
describe('the envelope T1-11 replaced is rejected', () => {
  it.each([
    [
      'par',
      parResponseSchema,
      { requestUri: 'urn:ietf:params:oauth:request_uri:1', expiresIn: 600 },
    ],
    ['device', deviceAuthorizationSchema, { deviceCode: 'dc', userCode: 'WDJB-MJHT' }],
    ['dcr', dcrRegistrationSchema, { clientId: 'c1', clientSecret: 's1' }],
  ] as const)('%s refuses the camelCase envelope', (_name, schema, body) => {
    expect(schema.safeParse(body).success).toBe(false);
  });

  it('names the snake_case member that is missing, not just "invalid"', () => {
    const parsed = parResponseSchema.safeParse({ requestUri: 'urn:x' });
    expect(parsed.success).toBe(false);
    // The message a developer reads has to point at the field, or it sends them looking at the wrong
    // half of the boundary.
    expect(parsed.error!.issues[0].path).toEqual(['request_uri']);
  });

  /**
   * And the vendor envelope itself — `action`/`resultCode`/`resultMessage` with the real body nested
   * inside a `responseContent` **string**. That is what `/api/client/dcr/register` returned before
   * T1-11, and a client that unwrapped it would find `client_id` only after knowing to look.
   */
  it('refuses the whole Authlete envelope for DCR', () => {
    const envelope = {
      action: 'CREATED',
      resultCode: 'A085001',
      resultMessage: '[A085001] Created.',
      responseContent: '{"client_id":"c1"}',
    };
    expect(dcrRegistrationSchema.safeParse(envelope).success).toBe(false);
  });
});
