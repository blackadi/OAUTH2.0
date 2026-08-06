import { Request, NextFunction, Response } from "express";
import logger from "../utils/logger";
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
    const subject = result.subject || subjectToken;

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

    logger("handleTokenExchange: tokenCreateRequest", req.body);

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
