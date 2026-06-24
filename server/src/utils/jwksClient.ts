import jwkToPem from "jwk-to-pem";
import logger from "./logger";

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

interface JwksResponse {
  keys: JwkKey[];
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
    return jwkToPem(jwk as any);
  }

  async getAllPublicKeys(): Promise<string[]> {
    const keys = await this.fetchJwks();
    return keys.map((jwk) => jwkToPem(jwk as any));
  }
}
