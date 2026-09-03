import { Request, NextFunction, Response } from "express";
import logger from "../utils/logger";
import { unverifiedStringClaim } from "../utils/jwt-claims";
import {
  TokenCreateRequest,
  TokenResponse,
} from "@authlete/typescript-sdk/models";
import { TokenManagementService } from "../services/token.operations.service";

const tokenManagementService = new TokenManagementService();

export async function handleTokenExchange(
  req: Request,
  res: Response,
  result: TokenResponse,
  next: NextFunction
) {
  try {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-cache, no-store");

    /**
     * **An unauthenticated client may not impersonate. Read this before deleting it as dead code.**
     *
     * This guard is **inert today** and that is not a reason to remove it — it is the reason it exists.
     * `tokenExchangeByConfidentialClientsOnly` is `true` on the service, so Authlete refuses a public
     * client with `[A311304]` before anything reaches here. The moment that flag is set `false` — which
     * Native SSO requires, because its target client type is a *native mobile app*, i.e. public — this
     * line becomes the only thing standing between any permitted public client and account takeover.
     *
     * **Why here, and why one condition is enough.** Authlete routes a device-secret exchange to
     * `action: NATIVE_SSO` and everything else to `TOKEN_EXCHANGE` (measured). So *reaching this
     * handler at all* means the request is not a Native SSO exchange — it is plain RFC 8693
     * impersonation, where `actor_token` is optional (§2.1) and the only thing presented is a subject
     * token. A `client_id` is not a secret, so an unauthenticated caller holding any user's ID token
     * would receive tokens for that user. Measured 2026-09-03 with the confidential-only flag on:
     * omitting `actor_token` returns 200 and a usable access token.
     *
     * **Authlete cannot express this rule.** Its three service-level restrictions are
     * `tokenExchangeByIdentifiableClientsOnly`, `tokenExchangeByConfidentialClientsOnly` and
     * `tokenExchangeByPermittedClientsOnly`, plus per-client `tokenExchangePermitted` — none of which
     * says *"public clients may exchange **with** a device secret and never without"*. That distinction
     * is the authorization server's to enforce, so it is enforced here.
     *
     * Fail-closed on a missing value: `clientAuthMethod` is populated on a real exchange (measured
     * `CLIENT_SECRET_BASIC`), so its absence means we cannot establish that the client authenticated —
     * and "cannot establish" must not read as "did". Any *named* method counts as authenticated, so a
     * method Authlete adds later is admitted rather than broken.
     */
    const method = result.clientAuthMethod;
    // Case-insensitively, for the same reason `token_type` is compared that way in this repo: the
    // vendor has answered a different case than the documentation shows before now.
    const clientAuthenticated = typeof method === "string" && method.toUpperCase() !== "NONE";
    if (!clientAuthenticated) {
      logger.warn("handleTokenExchange: refusing impersonation by an unauthenticated client", {
        clientId: result.clientId,
        clientAuthMethod: method ?? null,
      });
      // `.type().send()` rather than `.json()`, matching the four refusals below it. One idiom per file.
      return res
        .status(400)
        .type("application/json")
        .send({
          error: "unauthorized_client",
          error_description:
            "A client that does not authenticate may not exchange a subject token for its own tokens. A Native SSO exchange must present the device secret as actor_token.",
        });
    }

    const subjectToken = result.subjectToken;
    const clientId = result.clientId as number;
    const scopes = result.scopes;

    // ⚠️ DELIBERATE TEACHING DEFECT — do not "fix" without reading the note below.
    //
    // `|| subjectToken` substitutes the raw subject token when Authlete resolves no subject,
    // which is the correct-and-expected case for a client-credentials subject token (no user).
    // The result is a live access token sitting in an identity field, returned to the client and
    // served by the unauthenticated introspection endpoint. That is the finding Module 06
    // Exercise 6c has the learner discover; failing closed here would retire the exercise.
    /**
     * **An ID-token subject token resolves to its `sub`, and that is the fix for a 500 — not a change
     * to the defect below.**
     *
     * Measured 2026-09-03 for `subject_token_type=urn:ietf:params:oauth:token-type:id_token`: Authlete
     * answers `subject: null` **and** `subjectTokenInfo.subject: null`, reporting only
     * `subjectTokenType: "ID_TOKEN"`. It has verified the token but leaves subject resolution to the
     * authorization server, because the subject *is* the token's `sub` claim.
     *
     * Without this branch the fallback below handed Authlete the entire ID token JWT as a `subject`,
     * and token-create answered `[A144103] Failed to insert a new access token into the database` — an
     * HTTP **500** for a legitimate RFC 8693 impersonation request. Found by
     * `scripts/native-sso-verify.mjs` while probing Native SSO: an exchange with no `actor_token` is
     * not a Native SSO request, so it arrives here instead of at `handleNativeSso`.
     *
     * Reading `sub` unverified is safe *here* for the reason `utils/jwt-claims.ts` documents: Authlete
     * refuses an unsigned `subject_token` with `[A311335]` before this code runs.
     */
    const idTokenSubject =
      result.subjectTokenType === "ID_TOKEN" ? unverifiedStringClaim(subjectToken, "sub") : undefined;

    const subject = result.subject || idTokenSubject || subjectToken;

    // ⚠️ DELIBERATE TEACHING DEFECT — four request parameters are dropped here.
    //
    // Authlete's TOKEN_EXCHANGE response also carries `resources`, `audiences`,
    // `requestedTokenType`, `actorToken` and `actorTokenInfo`. Forwarding none of them means:
    // `resource`/`audience` do not audience-restrict (no `aud` on the issued token),
    // `actor_token` silently downgrades delegation to impersonation (no `act` claim), and
    // `requested_token_type` is ignored. Each returns HTTP 200, so a client cannot tell.
    // Passing no lifetime also leaves the token on the service default (24h here).
    //
    // Module 06 Exercise 6 (a/b/c) is built entirely on these being reproducible, and
    // `docs/TOKEN-EXCHANGE-TUTORIAL.md` Part 12 documents them as known gaps.
    // `tests/unit/controllers/token-exchange-response.handler.test.ts` locks the behaviour in:
    // if you change this file, that test fails and tells you which docs to update.
    const tokenCreateRequest: TokenCreateRequest = {
      grantType: "TOKEN_EXCHANGE",
      clientId,
      scopes,
      subject,
    } as TokenCreateRequest;

    req.body = tokenCreateRequest;

    logger.info("handleTokenExchange: tokenCreateRequest", req.body);

    // Call Authlete to create token
    const tokenCreateResponse = await tokenManagementService.create(req);

    switch (tokenCreateResponse.action) {
      case "OK":
        // ⚠️ DELIBERATE — `issued_token_type` is REQUIRED by RFC 8693 §2.2.1 and is not emitted;
        // `client_id` and `subject` are emitted though the spec defines neither. Module 06
        // Exercise 6a has the learner check this response against §2.2.1 and find exactly that.
        return res
          .status(200)
          .type("application/json")
          .send({
            access_token: tokenCreateResponse.accessToken,
            token_type: tokenCreateResponse.tokenType || "Bearer",
            expires_in: tokenCreateResponse.expiresIn,
            scope: tokenCreateResponse.scopes?.join(" ") || "",
            client_id: tokenCreateResponse.clientId,
            subject: tokenCreateResponse.subject,
          });

      case "BAD_REQUEST":
        return res
          .status(400)
          .type("application/json")
          .send(tokenCreateResponse);

      case "FORBIDDEN":
        return res
          .status(403)
          .type("application/json")
          .send(tokenCreateResponse);

      case "INTERNAL_SERVER_ERROR":
        return res
          .status(500)
          .type("application/json")
          .send(tokenCreateResponse);

      default:
        logger.error("Unknown TOKEN_EXCHANGE action", tokenCreateResponse);
        return res
          .status(500)
          .type("application/json")
          .send(tokenCreateResponse);
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error("tokenCreateResponse Error", { message: error.message });
    return next(error);
  }
}

export default { handleTokenExchange };
