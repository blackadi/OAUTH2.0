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

export interface CryptoKeyPair {
  publicKey: JWK;
  privateKey: JWK;
  kid: string;
}

export function base64UrlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
