/**
 * Decode a JWS compact token and verify its signature against a JWK Set, in the browser.
 *
 * **Why.** `jwt-decode` was used in exactly two places and only ever read an ID token's *payload* —
 * no header, no `kid`, no signature check, no expiry arithmetic. Access tokens were never decoded at
 * all, though this server can issue JWT access tokens and `createLocalToken` exists precisely to hand
 * a learner an RFC 9068 specimen. Meanwhile the app already fetched the JWKS and used it only to print
 * the key set on the Discovery panel. Everything needed to answer "is this signature good?" was
 * present and unconnected.
 *
 * A decoded-but-unverified token is the single most common way people misread OAuth: the payload looks
 * authoritative because it is legible. Showing the verification result beside it is the point.
 */

export interface JwtParts {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  /** base64url, exactly as it appeared. */
  signature: string;
  /** `header.payload` — the bytes the signature covers. */
  signingInput: string;
}

export type VerifyOutcome =
  | { status: 'valid'; kid?: string; alg: string }
  | { status: 'invalid'; kid?: string; alg: string; reason: string }
  | { status: 'unsupported'; alg: string; reason: string }
  | { status: 'no-key'; alg: string; kid?: string; reason: string };

export interface Jwk {
  kty?: string;
  kid?: string;
  alg?: string;
  use?: string;
  crv?: string;
  [key: string]: unknown;
}

/**
 * Returns `Uint8Array<ArrayBuffer>` rather than a bare `Uint8Array`: since TypeScript 5.7 the array is
 * generic over its buffer, and `crypto.subtle.verify` takes a `BufferSource` that excludes
 * `SharedArrayBuffer`. Allocating the buffer explicitly satisfies that without a cast.
 */
function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlToJson(value: string): Record<string, unknown> {
  const text = new TextDecoder().decode(base64UrlToBytes(value));
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JWT segment is not a JSON object');
  }
  return parsed as Record<string, unknown>;
}

/** Throws with a readable reason rather than returning a half-decoded object. */
export function decodeJwt(token: string): JwtParts {
  const trimmed = token.trim();
  const segments = trimmed.split('.');
  if (segments.length !== 3) {
    throw new Error(
      `Not a JWS compact token: expected 3 dot-separated segments, found ${segments.length}. ` +
        (segments.length === 5 ? 'Five segments is JWE — encrypted, not merely signed.' : ''),
    );
  }
  const [rawHeader, rawPayload, signature] = segments;
  return {
    header: base64UrlToJson(rawHeader),
    payload: base64UrlToJson(rawPayload),
    signature,
    signingInput: `${rawHeader}.${rawPayload}`,
  };
}

/**
 * JWS `alg` → the WebCrypto import and verify parameters.
 *
 * `HS*` is deliberately absent: verifying it needs the shared secret, which a browser client does not
 * have and should not be sent. `none` is absent because there is nothing to verify — and per RFC 9068
 * §4 a resource server must reject an access token that arrives with it.
 */
const ALGS: Record<
  string,
  { importParams: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams; verifyParams: AlgorithmIdentifier | RsaPssParams | EcdsaParams }
> = {
  RS256: {
    importParams: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    verifyParams: { name: 'RSASSA-PKCS1-v1_5' },
  },
  RS384: {
    importParams: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-384' },
    verifyParams: { name: 'RSASSA-PKCS1-v1_5' },
  },
  RS512: {
    importParams: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' },
    verifyParams: { name: 'RSASSA-PKCS1-v1_5' },
  },
  PS256: {
    importParams: { name: 'RSA-PSS', hash: 'SHA-256' },
    verifyParams: { name: 'RSA-PSS', saltLength: 32 },
  },
  PS384: {
    importParams: { name: 'RSA-PSS', hash: 'SHA-384' },
    verifyParams: { name: 'RSA-PSS', saltLength: 48 },
  },
  PS512: {
    importParams: { name: 'RSA-PSS', hash: 'SHA-512' },
    verifyParams: { name: 'RSA-PSS', saltLength: 64 },
  },
  ES256: {
    importParams: { name: 'ECDSA', namedCurve: 'P-256' },
    verifyParams: { name: 'ECDSA', hash: 'SHA-256' },
  },
  ES384: {
    importParams: { name: 'ECDSA', namedCurve: 'P-384' },
    verifyParams: { name: 'ECDSA', hash: 'SHA-384' },
  },
  ES512: {
    importParams: { name: 'ECDSA', namedCurve: 'P-521' },
    verifyParams: { name: 'ECDSA', hash: 'SHA-512' },
  },
};

/**
 * Pick the key that signed this token.
 *
 * `kid` first, which is what it is for. Without one, fall back to keys whose `kty` is plausible for the
 * algorithm — a single-key JWKS is common and refusing to try it would be unhelpful pedantry — but
 * never guess between two keys of the same type, because a "valid" result from the wrong key is worse
 * than no result.
 */
function selectKeys(jwks: Jwk[], header: Record<string, unknown>, alg: string): Jwk[] {
  const kid = typeof header.kid === 'string' ? header.kid : undefined;
  if (kid) return jwks.filter((k) => k.kid === kid);
  const wantedKty = alg.startsWith('ES') ? 'EC' : 'RSA';
  return jwks.filter((k) => k.kty === wantedKty && (!k.use || k.use === 'sig'));
}

export async function verifyJwt(token: string, jwks: Jwk[]): Promise<VerifyOutcome> {
  let parts: JwtParts;
  try {
    parts = decodeJwt(token);
  } catch (e) {
    return {
      status: 'invalid',
      alg: 'unknown',
      reason: e instanceof Error ? e.message : 'Could not decode',
    };
  }

  const alg = typeof parts.header.alg === 'string' ? parts.header.alg : 'unknown';
  const kid = typeof parts.header.kid === 'string' ? parts.header.kid : undefined;

  if (alg === 'none') {
    return {
      status: 'unsupported',
      alg,
      reason:
        'Unsigned. `alg: none` carries no signature at all — RFC 9068 §4 makes an access token with it a MUST-reject.',
    };
  }
  if (alg.startsWith('HS')) {
    return {
      status: 'unsupported',
      alg,
      reason:
        'Symmetric (HMAC). Verifying needs the shared client secret, which a browser must not hold — so this can only be checked server-side.',
    };
  }
  const spec = ALGS[alg];
  if (!spec) {
    return { status: 'unsupported', alg, reason: `No browser verifier for "${alg}".` };
  }

  const candidates = selectKeys(jwks, parts.header, alg);
  if (candidates.length === 0) {
    return {
      status: 'no-key',
      alg,
      kid,
      reason: kid
        ? `No key in the JWK Set has kid "${kid}".`
        : `The token has no kid and the JWK Set has no ${alg.startsWith('ES') ? 'EC' : 'RSA'} signing key to try.`,
    };
  }

  const signature = base64UrlToBytes(parts.signature);
  const data = new TextEncoder().encode(parts.signingInput);

  for (const jwk of candidates) {
    try {
      const key = await crypto.subtle.importKey('jwk', jwk as JsonWebKey, spec.importParams, false, [
        'verify',
      ]);
      const ok = await crypto.subtle.verify(spec.verifyParams, key, signature, data);
      if (ok) return { status: 'valid', alg, kid: jwk.kid ?? kid };
    } catch {
      // A key that cannot be imported for this algorithm is simply not the right key; keep looking.
      continue;
    }
  }

  return {
    status: 'invalid',
    alg,
    kid,
    reason:
      candidates.length === 1
        ? 'The signature does not verify against that key. The token was altered, or it was signed by a different key.'
        : `The signature does not verify against any of the ${candidates.length} candidate keys.`,
  };
}

// ── time helpers ──────────────────────────────────────────────────────────────────────────────────

export interface TimeClaim {
  seconds: number;
  iso: string;
  /** Signed seconds relative to now: negative is in the past. */
  delta: number;
}

export function readTimeClaim(value: unknown): TimeClaim | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;

  // A NumericDate outside JavaScript's ±8.64e15 ms range makes an Invalid Date, and `toISOString()`
  // throws a RangeError on one. That crashed the inspector at render — `JwtInspector` reads `exp`
  // outside any try — so a token carrying `exp: 99999999999999`, malformed or hostile, replaced the
  // whole panel with the error boundary's "Something went wrong". A claim that cannot be a time is
  // treated the same as a claim that is not a number: absent, and the raw value still shown beside it.
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return null;

  return {
    seconds: value,
    iso: date.toISOString(),
    delta: value - Math.floor(Date.now() / 1000),
  };
}

/**
 * "in 4m 12s" / "45s ago" — a countdown is more use than an epoch integer.
 *
 * Precision drops as the span grows, so the result stays readable: hours suppress seconds entirely, and
 * a whole number of minutes does not trail a pointless "0s".
 */
export function formatDelta(delta: number): string {
  const abs = Math.abs(delta);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;

  let span: string;
  if (h) span = m ? `${h}h ${m}m` : `${h}h`;
  else if (m) span = s ? `${m}m ${s}s` : `${m}m`;
  else span = `${s}s`;

  return delta < 0 ? `${span} ago` : `in ${span}`;
}
