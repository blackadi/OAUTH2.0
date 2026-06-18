import jwt, { JwtHeader, JwtPayload } from "jsonwebtoken";
import { JwksClient } from "./jwksClient";

export interface JwtValidationResult {
  valid: boolean;
  payload?: JwtPayload;
  error?: string;
}

export async function validateJwtAssertionWithJwks(
  assertion: string,
  jwksUri: string
): Promise<JwtValidationResult> {
  try {
    // Decode header to extract kid
    const decoded = jwt.decode(assertion, { complete: true });
    if (!decoded || typeof decoded === "string") {
      return { valid: false, error: "Invalid JWT format" };
    }

    const header = decoded.header as JwtHeader;
    const kid = header.kid;

    if (!kid) {
      return { valid: false, error: "Missing kid in JWT header" };
    }

    // Load key from JWKS
    const client = new JwksClient(jwksUri);
    const publicKey = await client.getPublicKey(kid);

    if (!publicKey) {
      return { valid: false, error: "Key not found in JWKS" };
    }

    // Verify signature + exp/nbf/iat
    const payload = jwt.verify(assertion, publicKey, {
      algorithms: ["RS256", "ES256"],
    }) as JwtPayload;

    // Required claims per RFC 7523
    if (!payload.iss) return { valid: false, error: "Missing iss claim" };
    if (!payload.sub) return { valid: false, error: "Missing sub claim" };
    if (!payload.aud) return { valid: false, error: "Missing aud claim" };

    return { valid: true, payload };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}
