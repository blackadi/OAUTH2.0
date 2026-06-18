import { jwt as pem } from "../config/authlete.config";
import jwt from "jsonwebtoken";

const privateKey = pem.privateKey;
const publicKey = pem.publicKey;

export const createLocalJWT = (iss: string, sub: string, aud: string[]) => {
  // DEV-ONLY: Bypasses Authlete token issuance. Do not use in production.
  const token = jwt.sign(
    {
      iss,
      sub,
      aud,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300, // 5 minutes
    },
    privateKey,
    {
      algorithm: "ES256",
      keyid: "jeQR9ibbekADE-Bb_szzi3pKK_WeLUvRJ4FneHEnk4s",
    }
  );

  return { token, publicKey };
};

export default createLocalJWT;
