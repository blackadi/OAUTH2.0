import { JWK, CryptoKeyPair, base64UrlEncode, generateP256KeyPair } from './crypto-utils';

export type { JWK };

export type SigningKeyPair = CryptoKeyPair;

/**
 * A `private_key_jwt` signing key: P-256, tagged `alg: ES256, use: sig`.
 *
 * The tags matter here and not for DPoP, because this key is *published* — `getJwkSetDisplay` renders
 * it as a JWK Set for registration against the client, and a consumer of that set reads `use` to know
 * it is a signature key and `alg` to know how to verify. They are attached after the `kid` is derived,
 * which the shared generator preserves and `keygen-characterization.test.ts` asserts explicitly.
 */
export async function generateSigningKeyPair(): Promise<SigningKeyPair> {
  return generateP256KeyPair({ alg: 'ES256', use: 'sig' });
}

export async function createClientAssertion(
  privateKeyJwk: JWK,
  clientId: string,
  tokenEndpoint: string,
): Promise<string> {
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    privateKeyJwk as any,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign'],
  );

  const now = Math.floor(Date.now() / 1000);

  const payload: Record<string, unknown> = {
    iss: clientId,
    sub: clientId,
    aud: tokenEndpoint,
    exp: now + 300,
    iat: now,
    jti: crypto.randomUUID(),
  };

  const header = { alg: 'ES256', kid: privateKeyJwk.kid, typ: 'JWT' };

  const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const message = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    message,
  );

  const rawSignature = new Uint8Array(signature);
  const encodedSignature = base64UrlEncode(rawSignature);

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

export function getJwkSetDisplay(publicKey: JWK): string {
  return JSON.stringify({ keys: [publicKey] }, null, 2);
}
