import { jwt as pem } from "../config/authlete.config";
import jwt from "jsonwebtoken";

const privateKey = pem.privateKey;
const publicKey = pem.publicKey;

export interface LocalJWTOptions {
  acr?: string;
  authTime?: number;
}

export const createLocalJWT = (iss: string, sub: string, aud: string[], options?: LocalJWTOptions) => {
  // DEV-ONLY: Bypasses Authlete token issuance. Do not use in production.
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    iss,
    sub,
    aud,
    iat: now,
    exp: now + 300, // 5 minutes
  };

  // RFC 9470: Bind authentication context to the access token
  if (options?.acr !== undefined) payload.acr = options.acr;
  if (options?.authTime !== undefined) payload.auth_time = options.authTime;

  const token = jwt.sign(payload, privateKey, {
    algorithm: "ES256",
    keyid: "jeQR9ibbekADE-Bb_szzi3pKK_WeLUvRJ4FneHEnk4s",
  });

  return { token, publicKey };
};

export default createLocalJWT;
