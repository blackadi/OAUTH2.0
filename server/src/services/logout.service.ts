import { Request, Response } from "express";
import session from "express-session";
import logger from "../utils/logger";
import { BackchannelLogoutService } from "./backchannel-logout.service";
import { DiscoveryService } from "./discovery.service";
import { JwksService } from "./jwks.service";
import { HintVerificationJwk, verifyIdTokenHint } from "../utils/verify-id-token-hint";

/** The OP's own signing keys and advertised issuer — everything needed to verify an `id_token_hint`. */
export interface OpVerificationMaterial {
  jwks: HintVerificationJwk[];
  issuer: string;
}

/**
 * Fetch this OP's verification material, cached for five minutes.
 *
 * Both values are read from **live** sources rather than configuration, for the reason `AGENTS.md` gives for
 * `protected-resource-metadata.routes.ts`: derived values cannot drift. Specifically:
 *
 * - **Keys** come from Authlete's service JWKS, not from `JWKS_URI`. That env var is unset on this
 *   deployment (it is the root of the back-channel logout failure recorded as BCL-W3), so reusing it would
 *   have made hint verification fail for a reason unrelated to the hint.
 * - **The issuer** comes from the discovery document, not from `JWT_ISSUER`. That config exists for
 *   locally-minted development JWTs and is unset here; using it would silently disable the `iss` check.
 *
 * The five-minute TTL matches `utils/jwksClient.ts`'s default. Logout is not a hot path, so two Authlete
 * calls per cache window is not worth optimising further.
 */
const MATERIAL_TTL_MS = 300_000;
let materialCache: { expires: number; value: OpVerificationMaterial } | null = null;

/**
 * The cache is process-wide and deliberately has no reset hook: tests inject the whole provider through
 * `rpInitiatedLogoutService`'s second constructor argument, so nothing test-facing ever reaches this cache.
 */
async function fetchOpVerificationMaterial(req: Request): Promise<OpVerificationMaterial> {
  const now = Date.now();
  if (materialCache && materialCache.expires > now) return materialCache.value;

  const [rawJwks, rawDiscovery] = await Promise.all([
    new JwksService().serviceJwksGetApi(),
    new DiscoveryService().getConfiguration(req),
  ]);

  // Authlete hands both documents back as either a JSON string or an object, so both shapes are handled —
  // the same defensive parse `protected-resource-metadata.controller.ts:24-25` uses.
  const jwksDoc: Record<string, unknown> =
    typeof rawJwks === "string" ? JSON.parse(rawJwks) : ((rawJwks ?? {}) as Record<string, unknown>);
  const discovery: Record<string, unknown> =
    typeof rawDiscovery === "string"
      ? JSON.parse(rawDiscovery)
      : ((rawDiscovery ?? {}) as Record<string, unknown>);

  const value: OpVerificationMaterial = {
    jwks: Array.isArray(jwksDoc.keys) ? (jwksDoc.keys as HintVerificationJwk[]) : [],
    issuer: typeof discovery.issuer === "string" ? discovery.issuer : "",
  };

  materialCache = { expires: now + MATERIAL_TTL_MS, value };
  return value;
}

/**
 * Decide whether the OP may redirect the user agent to a supplied `post_logout_redirect_uri`.
 *
 * **OpenID Connect RP-Initiated Logout 1.0 §3:** *"The OP also MUST NOT perform post-logout redirection if the
 * `post_logout_redirect_uri` value supplied does not exactly match one of the previously registered
 * `post_logout_redirect_uris` values."*
 *
 * This deployment departs from that in one respect, deliberately: **no client registers
 * `post_logout_redirect_uris`**, so the allowlist is env-driven (`LOGOUT_REDIRECT_URI`, `ALLOWED_ORIGINS`)
 * rather than per-client. The *"exactly match"* half is enforced.
 *
 * Comparison is by **parsed origin**, never by string prefix. `startsWith` was an open redirect: with
 * `ALLOWED_ORIGINS=http://localhost:3000`, both `http://localhost:3000.evil.example.com/bye` (the allowed
 * origin is a subdomain prefix of the attacker's host) and `http://localhost:3001@evil.example.com/`
 * (everything before `@` is userinfo, so the real host is the attacker's) passed the check and earned a 302 —
 * verified live, and the second form survived `NODE_ENV=production`.
 *
 * Accepted only if one of:
 *   1. the value is byte-identical to `LOGOUT_REDIRECT_URI`;
 *   2. its origin exactly equals an `ALLOWED_ORIGINS` entry's origin;
 *   3. *(non-production only)* its host is exactly `localhost`, on any port — retained so the labs keep working.
 *
 * Anything unparseable, or on a scheme other than http/https, is refused: `new URL()` throws on
 * `http://localhost:3000.evil.example.com/bye` (an invalid port) and yields a `null` origin for
 * `javascript:`, so failing closed is both correct and necessary.
 */
export function isAllowedPostLogoutRedirectUri(
  candidate: string,
  allowedRedirectUri: string
): boolean {
  // Exact, full-URI match against the single configured redirect target.
  if (candidate === allowedRedirectUri) return true;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false; // unparseable — fail closed
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const allowedOrigins = new Set(
    (process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        try {
          return new URL(entry).origin;
        } catch {
          return null; // a malformed ALLOWED_ORIGINS entry must not widen the allowlist
        }
      })
      .filter((origin): origin is string => origin !== null)
  );

  if (allowedOrigins.has(url.origin)) return true;

  // Development convenience: any localhost port. Exact host test, not a prefix test.
  if (process.env.NODE_ENV !== "production" && url.hostname === "localhost") return true;

  return false;
}

export class rpInitiatedLogoutService {
  constructor(
    private backchannelLogoutService: BackchannelLogoutService = new BackchannelLogoutService(),
    private verificationMaterial: (req: Request) => Promise<OpVerificationMaterial> = fetchOpVerificationMaterial
  ) {}

  async rpInitiatedLogout(
    req: Request & { session: Partial<session.SessionData> },
    res: Response
  ) {
    const log = req.logger || logger;

    const { id_token_hint, post_logout_redirect_uri, state, client_id, backchannel } =
      req.query as Record<string, string | undefined>;

    // 1. Identify the user — from local session or id_token_hint
    let subject: string | undefined = req.session.user;

    // An `id_token_hint` is a signed assertion (RP-Initiated Logout §2: *"ID Token previously issued by the
    // OP"*), so it identifies the End-User only once its signature is verified. This used to call
    // `jwt.decode` and trust `payload.sub`, which let anyone name any subject — and that subject drives the
    // back-channel delivery below. An unverifiable hint now yields no subject at all; it is never an error
    // to the caller, and logout proceeds either way.
    //
    // `aud` is pinned only when the caller supplied `client_id`. §2 makes `client_id` OPTIONAL, so demanding
    // it would refuse conformant requests; a genuine OP-signed token issued to a different client still
    // names the right subject, which is why an unpinned `aud` is logged rather than refused.
    if (!subject && id_token_hint) {
      try {
        const { jwks, issuer } = await this.verificationMaterial(req);
        const result = verifyIdTokenHint(id_token_hint, {
          jwks,
          issuer,
          audience: client_id,
        });

        if (result.subject) {
          subject = result.subject;
          log("Logout: verified subject from id_token_hint", {
            subject,
            audiencePinned: !!client_id,
            hintExpired: !!result.expired,
          });
        } else {
          log("Logout: id_token_hint rejected, continuing without a subject", {
            reason: result.reason,
          });
        }
      } catch (err) {
        // Losing the key set or the issuer must not identify anybody, and must not fail the logout.
        log.error("Logout: could not verify id_token_hint", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    log("RP-Initiated Logout", {
      subject,
      hasPostLogoutRedirectUri: !!post_logout_redirect_uri,
      clientId: client_id,
      backchannel: !!backchannel,
    });

    // 2. If backchannel=true, fire deliver-all BEFORE session destruction
    //    so we can log the subject while it's still available
    let backchannelResults: unknown = null;
    if (backchannel === "true" && subject) {
      try {
        backchannelResults = await this.backchannelLogoutService.issueAndDeliverToAll(subject);
        log("Backchannel logout deliver-all completed", { subject });
      } catch (err) {
        log.error("Backchannel logout deliver-all failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 3. Destroy the local session and clear cookie
    req.session.destroy((err) => {
      if (err) log.error("Failed to destroy session", { err });
    });
    res.clearCookie("connect.sid", { path: "/" });

    // 4. Validate post_logout_redirect_uri against allowed URIs
    const allowedRedirectUri = process.env.LOGOUT_REDIRECT_URI || "http://localhost:3000";

    if (post_logout_redirect_uri) {
      const isAllowed = isAllowedPostLogoutRedirectUri(
        post_logout_redirect_uri,
        allowedRedirectUri
      );

      if (isAllowed) {
        const separator = post_logout_redirect_uri.includes("?") ? "&" : "?";
        const redirectUrl = state
          ? `${post_logout_redirect_uri}${separator}state=${encodeURIComponent(state)}`
          : post_logout_redirect_uri;

        log("Logout: redirecting to post_logout_redirect_uri", { redirectUrl });
        return res.redirect(redirectUrl);
      }

      log("Logout: post_logout_redirect_uri not allowed, rendering page", {
        post_logout_redirect_uri,
      });
    }

    // 5. No valid redirect — render logout confirmation
    return res.render("logout", {
      client_id: client_id || process.env.LOGOUT_CLIENT_ID || "",
      post_logout_redirect_uri: allowedRedirectUri,
      subject: subject || "",
      backchannelResults: backchannelResults ? JSON.stringify(backchannelResults, null, 2) : null,
    });
  }
}
