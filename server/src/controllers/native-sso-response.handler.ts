import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Request, NextFunction, Response } from "express";
import logger from "../utils/logger";
import { TokenResponse } from "@authlete/typescript-sdk/models";
import { NativeSsoService } from "../services/native-sso.service";

const nativeSsoService = new NativeSsoService();

/** Native SSO 1.0 names this actor token type; it is what distinguishes Phase 2 from Phase 1. */
const DEVICE_SECRET_TOKEN_TYPE = "urn:openid:params:token-type:device-secret";

const deviceSecretHashOf = (secret: string) =>
  createHash("sha256").update(secret).digest("base64url");

/**
 * The `ds_hash` claim of a subject token, **read without verifying its signature.**
 *
 * That is deliberate and it is load-bearing, so it is stated rather than left implicit: Authlete has
 * already validated this token by the time we are here. `action: NATIVE_SSO` on a token-exchange leg is
 * only reached because Authlete resolved the token's `sid` into a live `sessionId`, which it cannot do
 * for a token it did not issue. Decoding is therefore a read of an already-authenticated value, not a
 * trust decision — the distinction `utils/verify-id-token-hint.ts` exists to enforce for `id_token_hint`,
 * where nothing upstream had verified anything.
 *
 * **If that assumption ever stops holding, this becomes a forgery route**, so the probe
 * (`scripts/native-sso-verify.mjs`) asserts it directly with a self-signed subject token rather than
 * leaving it as a comment.
 */
function dsHashOf(subjectToken: unknown): string | undefined {
  if (typeof subjectToken !== "string") return undefined;
  try {
    const payload = JSON.parse(
      Buffer.from(subjectToken.split(".")[1] ?? "", "base64url").toString("utf8")
    ) as Record<string, unknown>;
    return typeof payload.ds_hash === "string" ? payload.ds_hash : undefined;
  } catch {
    return undefined;
  }
}

/** Constant-time, because this compares a credential. Unequal lengths are answered before comparing. */
function hashesMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function handleNativeSso(
  req: Request,
  res: Response,
  result: TokenResponse,
  next: NextFunction
) {
  try {
    // Captured before `req.body` is overwritten below to build the Native SSO request. Reading
    // `actor_token` after that point would silently see the rewritten object.
    const originalBody = req.body as
      | { actor_token?: unknown; actor_token_type?: unknown; subject_token?: unknown }
      | undefined;

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");

    const accessToken = result.jwtAccessToken || result.accessToken;

    if (!accessToken) {
      logger.error("handleNativeSso: missing accessToken in token response");
      return res.status(500).json({
        error: "server_error",
        error_description: "Missing accessToken for Native SSO",
      });
    }

    /**
     * **Phase 1 mints the secret. Phase 2 must VERIFY it — and this used to do neither.**
     *
     * The two legs arrive at the same `action: NATIVE_SSO` and need opposite handling, which is what
     * made the old single-expression version wrong in a way that read as careful:
     *
     * ```ts
     * const deviceSecret = result.deviceSecret || randomBytes(32).toString("base64url");
     * const deviceSecretHash = createHash("sha256").update(deviceSecret).digest("base64url");
     * ```
     *
     * Its comment reasoned correctly that the secret "must be forwarded unchanged rather than replaced"
     * — and it *was* forwarded unchanged. What nobody noticed is that the **hash** was recomputed from
     * it. On Phase 2 Authlete echoes back whatever `actor_token` the caller sent, so recomputing the
     * hash **re-bound** the session to the caller's value instead of comparing it to the one already
     * bound. Measured 2026-09-03 with `scripts/native-sso-verify.mjs`: 32 random bytes as `actor_token`
     * returned **200**, the victim's `sub` and `sid`, and an ID token whose `ds_hash` was the hash of
     * the attacker's own secret. Possession of an ID token was enough to complete Phase 2, so the
     * device secret — the only value in that exchange that is meant to be secret — proved nothing.
     *
     * Native SSO 1.0 §4 requires the AS to check the presented secret against the subject token's
     * `ds_hash`. Authlete demonstrably does not do it for us (it echoed the bogus secret without
     * complaint), so it is this server's job.
     */
    const presentedSecret = originalBody?.actor_token;
    const isDeviceSecretExchange =
      originalBody?.actor_token_type === DEVICE_SECRET_TOKEN_TYPE || typeof presentedSecret === "string";

    let deviceSecret: string;
    let deviceSecretHash: string;

    if (isDeviceSecretExchange) {
      const boundHash = dsHashOf(originalBody?.subject_token);

      // No `ds_hash` means the subject token was never bound to a device secret, so there is nothing
      // this exchange could be proving. Refused rather than treated as "nothing to check" — the
      // fail-open reading is what turns a missing value into a bypass.
      if (!boundHash) {
        logger.warn("handleNativeSso: device-secret exchange with no ds_hash in the subject token");
        return res.status(400).json({
          error: "invalid_grant",
          error_description:
            "The subject token carries no ds_hash, so it is not bound to a device secret and cannot be exchanged with one.",
        });
      }

      if (typeof presentedSecret !== "string" || !hashesMatch(boundHash, deviceSecretHashOf(presentedSecret))) {
        logger.warn("handleNativeSso: device secret does not match the subject token's ds_hash");
        return res.status(400).json({
          error: "invalid_grant",
          error_description:
            "The presented device secret does not match the ds_hash bound to the subject token.",
        });
      }

      // Verified. The secret is forwarded unchanged and the hash is the one **already bound to the
      // session** rather than a fresh computation — identical values at this point, and writing it this
      // way makes re-binding impossible to reintroduce by editing one line.
      deviceSecret = presentedSecret;
      deviceSecretHash = boundHash;
    } else {
      /**
       * Phase 1: the AS mints the secret, because Authlete's `NATIVE_SSO` response to an
       * *authorization-code* exchange carries none — there is no prior secret to carry forward, and SDK
       * 1.0.0's own model says the AS "is free to generate a new device secret". Requiring
       * `result.deviceSecret` here made Phase 1 a guaranteed 500 the moment `nativeSsoSupported` was
       * enabled (`NATIVE-SSO-1.0.md` F-4, 2026-08-17).
       *
       * Native SSO 1.0 leaves the hash computation to the AS ("based on its own logic"), so
       * base64url(SHA-256) is a choice rather than a derivation — it matches the `at_hash`/`c_hash`
       * family, and Authlete echoed exactly this value back as `ds_hash` when confirmed end to end.
       */
      deviceSecret = result.deviceSecret || randomBytes(32).toString("base64url");
      deviceSecretHash = deviceSecretHashOf(deviceSecret);
    }

    // Build the Native SSO request from the token response
    req.body = {
      accessToken,
      deviceSecret,
      deviceSecretHash,
      ...(result.refreshToken && { refreshToken: result.refreshToken }),
      ...(result.sessionId && { sub: result.subject }),
      /**
       * `nonce` and `s_hash` reach the ID token only through here.
       *
       * Authlete's `/nativesso` takes them as a JSON string in `claims`, sourced from the token
       * response's `additionalClaims`. Omitting it dropped the `nonce` a client had sent in its
       * authorization request, so the ID token arrived without one and OIDC Core §3.1.3.7's check
       * could not be performed — measured 2026-09-03, `nonce` ABSENT from a Phase 1 ID token.
       */
      ...(result.additionalClaims && { claims: result.additionalClaims }),
    };

    logger.info("handleNativeSso: calling nativeSsoService.process", { accessToken: accessToken.substring(0, 20) + "..." });

    const nativeSsoResponse = await nativeSsoService.process(req);

    switch (nativeSsoResponse.action) {
      case "OK":
        return res.status(200).send(nativeSsoResponse.responseContent);

      case "CALLER_ERROR":
        return res.status(400).json({
          error: "invalid_request",
          error_description: nativeSsoResponse.resultMessage || "Native SSO caller error",
        });

      case "INTERNAL_SERVER_ERROR":
        return res.status(500).json({
          error: "server_error",
          error_description: nativeSsoResponse.resultMessage || "Internal server error",
        });

      default:
        logger.error("handleNativeSso: unknown action", { action: nativeSsoResponse.action });
        return res.status(500).json({
          error: "server_error",
          error_description: "Unknown Native SSO action",
        });
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error("handleNativeSso Error", { message: error.message });
    return next(error);
  }
}

export default { handleNativeSso };
