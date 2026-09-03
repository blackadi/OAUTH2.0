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
