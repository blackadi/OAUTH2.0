import { jwt as pem } from "../config/authlete.config";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const privateKey = pem.privateKey;
const publicKey = pem.publicKey;

export interface LocalJWTOptions {
  acr?: string;
  authTime?: number;
  /** Space-delimited, per RFC 9068 §2.2.3 — a SHOULD, so absent is conformant. */
  scope?: string;
}

/**
 * Mint a locally-signed JWT access token, shaped by **RFC 9068 §2**.
 *
 * **DEV-ONLY.** This bypasses Authlete token issuance entirely. `POST /api/token/createLocalToken` answers a
 * flat 404 unless `NODE_ENV === "development"`, and requires admin Basic auth behind that gate. Nothing in
 * this deployment accepts the result as an access token — Authlete issued none of it.
 *
 * **Why the shape matters more than the endpoint does** (9068-W2). This is the only JWT in the repo a learner
 * can obtain and decode as an "access token", in a curriculum whose Module 04 objective is *"State the
 * required claims and the `typ` header value of an RFC 9068 JWT access token"*. It used to emit
 * `typ: JWT` and five claims, missing `client_id`, `jti` and `scope` — so the one available specimen was a
 * **counter-example** to the lesson, with nothing saying so.
 *
 * | RFC 9068 | Here |
 * |---|---|
 * | `typ: at+jwt` (§2.1) | set explicitly — `jsonwebtoken` defaults to `typ: JWT`, which §4 check 1 makes a resource server **MUST-reject** |
 * | `alg` MUST NOT be `none` (§2.1) | ES256 |
 * | `iss`, `exp`, `aud`, `sub`, `client_id`, `iat`, `jti` REQUIRED (§2.2) | all seven present |
 * | `auth_time`, `acr`, `amr` OPTIONAL (§2.2.1) | `acr` and `auth_time` on request; `amr` unsupported |
 * | `scope` SHOULD when requested (§2.2.3) | on request |
 *
 * `clientId` is a **required positional parameter**, not an option, because §2.2 makes `client_id` REQUIRED:
 * an optional field would let the specimen go on being non-conformant by omission, which is the defect this
 * closed.
 *
 * **Still not conformant in one respect, and it is `aud`.** §5's cross-JWT-confusion guidance wants a
 * distinct audience per resource, and §3 wants a default resource indicator when the request names none.
 * `aud` here is whatever the admin caller passes, unvalidated as an absolute URI or a known resource. That
 * is `RFC9068-jwt-access-tokens.md` **F-3**, which is latent for the main path (this deployment issues
 * opaque access tokens) and deliberately out of scope for a dev fixture.
 */
export const createLocalJWT = (
  iss: string,
  sub: string,
  aud: string[],
  clientId: string,
  options?: LocalJWTOptions,
) => {
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    iss,
    sub,
    aud,
    client_id: clientId,
    iat: now,
    exp: now + 300, // 5 minutes
    // §2.2: REQUIRED, and §4's replay guidance is the reason — a resource server can only detect a replayed
    // token if each one is distinguishable. A fresh UUID per call, never derived from the other claims.
    jti: crypto.randomUUID(),
  };

  // §2.2.3 — SHOULD be present when the request granted scopes. Omitted rather than emitted empty.
  if (options?.scope) payload.scope = options.scope;

  // §2.2.1 / RFC 9470 §6.1: bind the authentication context to the access token when there is one.
  if (options?.acr !== undefined) payload.acr = options.acr;
  if (options?.authTime !== undefined) payload.auth_time = options.authTime;

  const token = jwt.sign(payload, privateKey, {
    algorithm: "ES256",
    keyid: "jeQR9ibbekADE-Bb_szzi3pKK_WeLUvRJ4FneHEnk4s",
    // Merged over jsonwebtoken's defaults, which keeps `alg` and `kid` — it only replaces `typ`.
    header: { alg: "ES256", typ: "at+jwt" },
  });

  return { token, publicKey };
};

export default createLocalJWT;
