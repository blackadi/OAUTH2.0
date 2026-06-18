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

// Simple in-memory cache
const jwksCache: Record<string, { expires: number; keys: JwkKey[] }> = {};

export class JwksClient {
  constructor(private jwksUri: string, private cacheTtlMs: number = 300_000) {}

  private async fetchJwks(): Promise<JwkKey[]> {
    const now = Date.now();

    // Cache hit
    const cached = jwksCache[this.jwksUri];
    if (cached && cached.expires > now) {
      return cached.keys;
    }

    // Fetch JWKS fresh
    const resp = await fetch(this.jwksUri);
    // const resp = await axios.get<JwksResponse>(this.jwksUri);

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

    jwksCache[this.jwksUri] = {
      keys: data.keys,
      expires: now + this.cacheTtlMs,
    };

    // jwksCache[this.jwksUri] = {
    //   keys: resp.data.keys,
    //   expires: now + this.cacheTtlMs,
    // };

    return data.keys;
  }

  async getPublicKey(kid: string): Promise<string | undefined> {
    const keys = await this.fetchJwks();
    const jwk = keys.find((k) => k.kid === kid);

    if (!jwk) return undefined;

    // Convert JWK → PEM
    return jwkToPem(jwk as any);
  }
}
