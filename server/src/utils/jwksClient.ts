import { createPublicKey, type webcrypto } from "node:crypto";
import logger from "./logger";

/**
 * JWK → SPKI PEM, using Node's own crypto rather than `jwk-to-pem`.
 *
 * `jwk-to-pem` depends on `elliptic`, which carries an unfixable advisory (GHSA-848j-6mx2-7j84 — no
 * patched release exists). Node has done this natively since 15.12, so the dependency bought nothing.
 *
 * The swap was proven equivalent before it was made, not assumed: over EC P-256/P-384/P-521 and RSA
 * 2048 the exported PEM is **byte-identical** to `jwk-to-pem`'s, `jsonwebtoken` verifies against
 * either, and the failure behaviour matches case for case — `kid`/`use`/`alg` extras ignored, and
 * malformed keys, unknown `kty`, `oct` and `{}` all throwing. A JWK carrying a private `d` yields a
 * **public** key from both, so no private half can leak into a value named "public key".
 *
 * Do not reintroduce `jwk-to-pem`.
 */
function jwkToPem(jwk: webcrypto.JsonWebKey): string {
  return createPublicKey({ key: jwk, format: "jwk" })
    .export({ type: "spki", format: "pem" })
    .toString();
}

interface JwkKey {
  kid: string;
  kty: string;
  use?: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
  alg?: string;
}

export class JwksClient {
  constructor(private jwksUri: string, private cacheTtlMs: number = 300_000) {}

  private cache: { expires: number; keys: JwkKey[] } | null = null;

  private async fetchJwks(): Promise<JwkKey[]> {
    const now = Date.now();

    // Cache hit
    if (this.cache && this.cache.expires > now) {
      return this.cache.keys;
    }

    // Fetch JWKS fresh
    const resp = await fetch(this.jwksUri);

    if (!resp.ok) {
      logger.error("Failed to fetch service configuration", {
        status: resp.status,
        statusText: resp.statusText,
      });
      throw new Error(
        `Failed to fetch service configuration: ${resp.statusText}`
      );
    }

    const data = await resp.json();

    this.cache = {
      keys: data.keys,
      expires: now + this.cacheTtlMs,
    };

    return data.keys;
  }

  async getPublicKey(kid: string): Promise<string | undefined> {
    const keys = await this.fetchJwks();
    const jwk = keys.find((k) => k.kid === kid);

    if (!jwk) return undefined;

    // Convert JWK → PEM
    return jwkToPem(jwk as webcrypto.JsonWebKey);
  }

  async getAllPublicKeys(): Promise<string[]> {
    const keys = await this.fetchJwks();
    return keys.map((jwk) => jwkToPem(jwk as webcrypto.JsonWebKey));
  }
}
