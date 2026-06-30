interface JWK {
  kty?: string;
  kid?: string;
  crv?: string;
  x?: string;
  y?: string;
  d?: string;
  alg?: string;
  use?: string;
}

export interface DPoPKeyPair {
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

export async function generateKeyPair(): Promise<DPoPKeyPair> {
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
    publicKey: { ...publicJwk, kid },
    privateKey: { ...privateJwk, kid },
    kid,
  };
}

export async function computeAth(accessToken: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(accessToken),
  );
  return base64UrlEncode(hash);
}

export async function createProof(
  privateKeyJwk: JWK,
  htm: string,
  htu: string,
  ath?: string,
  nonce?: string,
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
    iat: now,
    jti: crypto.randomUUID(),
    htm,
    htu,
  };

  if (ath) {
    payload.ath = ath;
  }

  if (nonce) {
    payload.nonce = nonce;
  }

  const publicJwk = { ...privateKeyJwk };
  delete publicJwk.d;
  publicJwk.alg = 'ES256';
  const header = { typ: 'dpop+jwt', alg: 'ES256', jwk: publicJwk };

  const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const message = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    message,
  );

  // JWS/DPoP requires raw R||S (IEEE P1363) format, not DER
  const rawSignature = new Uint8Array(signature);
  const encodedSignature = base64UrlEncode(rawSignature);

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}
