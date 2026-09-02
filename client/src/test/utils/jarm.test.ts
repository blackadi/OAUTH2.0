import { describe, it, expect } from 'vitest';
import { readJarmResponse } from '@/utils/jarm';
import type { Jwk } from '@/utils/jwt';

/**
 * The JARM unwrap, driven with real signatures.
 *
 * **Why every case here signs a key it generated.** The whole value of this function is the difference
 * between a JWT that verifies and one that merely decodes — a test that stubbed the verification would
 * assert the decode and prove nothing about the property that matters. The repo has this scar already:
 * the server's old `jwksClient` tests mocked the JWK→PEM step and fed it `{ kty: 'EC', x: 'xval' }`,
 * which is not a key, and read as coverage for years.
 */

const ISSUER = 'https://as.example.com';
const CLIENT_ID = '1241400020';
const enc = new TextEncoder();

function b64url(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlJson(value: unknown): string {
  return b64url(enc.encode(JSON.stringify(value)));
}

function future(): number {
  return Math.floor(Date.now() / 1000) + 300;
}

/** A JARM response as the authorization server would mint it, plus the public key to check it with. */
async function signResponse(
  claims: Record<string, unknown>,
  alg: 'ES256' | 'RS256' = 'ES256',
): Promise<{ token: string; jwk: Jwk }> {
  const algorithm =
    alg === 'ES256'
      ? ({ name: 'ECDSA', namedCurve: 'P-256' } as const)
      : ({
          name: 'RSASSA-PKCS1-v1_5',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256',
        } as const);
  const pair = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as Jwk;
  jwk.kid = 'as-key';
  const head = b64urlJson({ alg, typ: 'JWT', kid: 'as-key' });
  const body = b64urlJson(claims);
  const signature = await crypto.subtle.sign(
    alg === 'ES256' ? { name: 'ECDSA', hash: 'SHA-256' } : 'RSASSA-PKCS1-v1_5',
    pair.privateKey,
    enc.encode(`${head}.${body}`),
  );
  return { token: `${head}.${body}.${b64url(signature)}`, jwk };
}

const happy = () => ({
  iss: ISSUER,
  aud: CLIENT_ID,
  exp: future(),
  code: 'authz-code-01',
  state: 'state-01',
});

describe('readJarmResponse', () => {
  it('hands back the response parameters the callback reads by name', async () => {
    const { token, jwk } = await signResponse(happy());
    const outcome = await readJarmResponse(token, [jwk], {
      issuer: ISSUER,
      clientId: CLIENT_ID,
    });

    expect(outcome.ok, outcome.ok ? '' : outcome.error).toBe(true);
    if (!outcome.ok) return;
    // These three are the whole point: `CallbackPage` redeems `code`, binds on `state` and performs
    // RFC 9207's check on `iss`, and under `response_mode=jwt` none of them is on the query string.
    expect(outcome.params.get('code')).toBe('authz-code-01');
    expect(outcome.params.get('state')).toBe('state-01');
    expect(outcome.params.get('iss')).toBe(ISSUER);
    expect(outcome.alg).toBe('ES256');
  });

  it('carries an error response through, because that is also a JARM response', async () => {
    const { token, jwk } = await signResponse({
      iss: ISSUER,
      aud: CLIENT_ID,
      exp: future(),
      error: 'access_denied',
      error_description: 'The user refused consent.',
      state: 'state-01',
    });
    const outcome = await readJarmResponse(token, [jwk], { issuer: ISSUER, clientId: CLIENT_ID });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // An allowlist of expected parameters would have dropped these, and the callback's error branch
    // reads all three. A signed refusal must still be legible as a refusal.
    expect(outcome.params.get('error')).toBe('access_denied');
    expect(outcome.params.get('error_description')).toBe('The user refused consent.');
  });

  /** The property the whole function exists for. A decoded payload is legible, not authentic. */
  it('refuses a tampered payload even though it decodes cleanly', async () => {
    const { token, jwk } = await signResponse(happy());
    const [head, , signature] = token.split('.');
    const forged = [head, b64urlJson({ ...happy(), code: 'attacker-code' }), signature].join('.');

    const outcome = await readJarmResponse(forged, [jwk], { issuer: ISSUER, clientId: CLIENT_ID });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toMatch(/signature was not verified|not verified/i);
  });

  it('refuses a response signed by a key that is not the authorization server’s', async () => {
    const { token } = await signResponse(happy());
    const { jwk: otherKey } = await signResponse(happy());

    const outcome = await readJarmResponse(token, [otherKey], {
      issuer: ISSUER,
      clientId: CLIENT_ID,
    });
    expect(outcome.ok).toBe(false);
  });

  it('refuses an unsigned token outright rather than reading its claims', async () => {
    const unsigned = `${b64urlJson({ alg: 'none' })}.${b64urlJson(happy())}.`;
    const { jwk } = await signResponse(happy());

    const outcome = await readJarmResponse(unsigned, [jwk], {
      issuer: ISSUER,
      clientId: CLIENT_ID,
    });
    expect(outcome.ok).toBe(false);
  });

  /** RFC 9207's mix-up case, arriving with a signature that is perfectly good. */
  it('refuses a validly signed response from the wrong issuer', async () => {
    const { token, jwk } = await signResponse({ ...happy(), iss: 'https://evil.example' });

    const outcome = await readJarmResponse(token, [jwk], { issuer: ISSUER, clientId: CLIENT_ID });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toMatch(/mix-up/i);
  });

  it('refuses a response minted for another client', async () => {
    const { token, jwk } = await signResponse({ ...happy(), aud: 'some-other-client' });

    const outcome = await readJarmResponse(token, [jwk], { issuer: ISSUER, clientId: CLIENT_ID });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toMatch(/another client/i);
  });

  it('accepts an aud array that contains this client', async () => {
    const { token, jwk } = await signResponse({ ...happy(), aud: ['other', CLIENT_ID] });

    const outcome = await readJarmResponse(token, [jwk], { issuer: ISSUER, clientId: CLIENT_ID });
    expect(outcome.ok).toBe(true);
  });

  it('refuses an expired response, and refuses one with no exp at all', async () => {
    const expired = await signResponse({ ...happy(), exp: Math.floor(Date.now() / 1000) - 600 });
    await expect(
      readJarmResponse(expired.token, [expired.jwk], { issuer: ISSUER, clientId: CLIENT_ID }),
    ).resolves.toMatchObject({ ok: false });

    const withoutExp: Record<string, unknown> = happy();
    delete withoutExp.exp;
    const bare = await signResponse(withoutExp);
    const outcome = await readJarmResponse(bare.token, [bare.jwk], {
      issuer: ISSUER,
      clientId: CLIENT_ID,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toMatch(/exp/);
  });

  /**
   * A clock a few seconds fast must not turn a working flow into an expiry error — the reason
   * `EXP_LEEWAY_SECONDS` exists rather than a bare `<` comparison.
   */
  it('tolerates a few seconds of clock skew on exp', async () => {
    const { token, jwk } = await signResponse({
      ...happy(),
      exp: Math.floor(Date.now() / 1000) - 5,
    });

    await expect(
      readJarmResponse(token, [jwk], { issuer: ISSUER, clientId: CLIENT_ID }),
    ).resolves.toMatchObject({ ok: true });
  });

  /**
   * FAPI 2.0 Message Signing §5.4.1 permits PS256, ES256 and EdDSA. RS256 verifies fine — the
   * algorithm is the objection, and the message has to say so or it reads as a signature failure.
   */
  it('refuses a permitted-looking response signed with an algorithm the profile forbids', async () => {
    const { token, jwk } = await signResponse(happy(), 'RS256');

    const outcome = await readJarmResponse(token, [jwk], { issuer: ISSUER, clientId: CLIENT_ID });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toMatch(/5\.4\.1/);
  });

  it('names the decode failure rather than reporting a bad signature', async () => {
    const { jwk } = await signResponse(happy());

    const outcome = await readJarmResponse('not-a-jwt', [jwk], {
      issuer: ISSUER,
      clientId: CLIENT_ID,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toMatch(/not a decodable JWS/i);
  });
});
