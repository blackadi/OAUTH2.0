// Simple PKCE utilities using browser crypto.
// `base64UrlEncode` comes from `services/crypto-utils`, where the DPoP and client-assertion code
// already uses it — this file had a byte-identical private copy.
import { base64UrlEncode } from '@/services/crypto-utils';

export async function generateCodeVerifier(length = 64): Promise<string> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  let verifier = '';
  for (let i = 0; i < length; i += 1) {
    verifier += chars[randomValues[i] % chars.length];
  }
  return verifier;
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

export async function createPkcePair() {
  const codeVerifier = await generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  return { codeVerifier, codeChallenge };
}
