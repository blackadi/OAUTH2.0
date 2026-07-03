export interface JWK {
  kty?: string;
  kid?: string;
  crv?: string;
  x?: string;
  y?: string;
  d?: string;
  alg?: string;
  use?: string;
}

export interface SigningKeyPair {
  publicKey: JWK;
  privateKey: JWK;
  kid: string;
}

function base64UrlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function generateSigningKeyPair(): Promise<SigningKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );

  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey) as JWK;
  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey) as JWK;

  const kid = base64UrlEncode(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(publicJwk))),
  );

  return {
    publicKey: { ...publicJwk, kid, alg: 'ES256', use: 'sig' },
    privateKey: { ...privateJwk, kid, alg: 'ES256', use: 'sig' },
    kid,
  };
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
