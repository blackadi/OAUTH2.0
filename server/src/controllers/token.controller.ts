import { NextFunction, Request, Response } from "express";
import { TokenService } from "../services/token.service";
import { LoginService } from "../services/login.service";
import session from "express-session";
import logger from "../utils/logger";
import {
  TokenFailRequest,
  TokenIssueRequest,
} from "@authlete/typescript-sdk/models";
import { handleTokenExchange } from "./token-exchange-response.handler";
import { handleNativeSso } from "./native-sso-response.handler";
import { sendTokenFailResponse } from "./token-fail-response.handler";
import { sendTokenIssueResponse } from "./token-issue-response.handler";
import { validateTokenParams } from "../utils/validate";
import { parseProperties } from "../utils/properties";
import { JwtVerificationService } from "../services/jwt-verification.service";
import { TokenManagementService } from "../services/token.operations.service";
import { setDpopNonce } from "../utils/dpop";
import { hasDualChannelClientAuth } from "../utils/basic-auth";

const tokenService = new TokenService();
const loginService = new LoginService();
const jwtVerificationService = new JwtVerificationService();
const tokenManagementService = new TokenManagementService();

/**
 * The `aud` claim type asked of `POST /idtoken/reissue`. It must track the service's
 * `idTokenAudType`, because the request parameter takes precedence over the service property and
 * defaults to `"array"` when omitted — see the comment in the `ID_TOKEN_REISSUABLE` branch.
 */
const ID_TOKEN_AUD_TYPE = "string";

export const tokenController = {
  handleToken: async (
    req: Request & { session: Partial<session.SessionData> },
    res: Response,
    next: NextFunction
  ) => {
    try {
      const validationError = validateTokenParams(
        req.body as Record<string, unknown>
      );
      if (validationError) {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Pragma", "no-cache");
        return res.status(400).json({
          error: "invalid_request",
          error_description: validationError,
        });
      }

      // RFC 6749 §2.3.1: "The client MUST NOT use more than one authentication method in each
      // request." Neither Authlete nor this server resolves that — both channels reach Authlete
      // because `parameters` is the raw body — so it is refused here, before any Authlete call.
      if (hasDualChannelClientAuth(req.headers.authorization, req.body as Record<string, unknown>)) {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Pragma", "no-cache");
        return res.status(400).json({
          error: "invalid_request",
          error_description:
            "Client credentials were presented both in the Authorization header and in the request body. RFC 6749 Section 2.3.1 permits only one authentication method per request.",
        });
      }
      const result = await tokenService.process(req);

      // DPoP nonce — relay to client if Authlete returned one
      setDpopNonce(res, result.dpopNonce);

      switch (result.action as string) {
        case "BAD_REQUEST":
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(400).send(result.responseContent ?? result);

        case "INVALID_CLIENT":
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          // If the client attempted HTTP Basic auth, return 401 with
          // WWW-Authenticate. Otherwise 400 is acceptable per RFC 6749.
          if (req.headers["authorization"]) {
            res.setHeader("WWW-Authenticate", 'Basic realm="Authlete"');
            return res.status(401).send(result.responseContent ?? result);
          }
          return res.status(400).send(result.responseContent ?? result);

        case "INTERNAL_SERVER_ERROR":
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(500).send(result.responseContent ?? result);

        case "JWT_BEARER": {
          const jwtResult = await jwtVerificationService.processJwtBearer(result);
          if (jwtResult.ok) {
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("Pragma", "no-cache");
            const body = JSON.stringify({
              access_token: jwtResult.accessToken,
              token_type: jwtResult.tokenType,
              expires_in: jwtResult.expiresIn,
              scope: jwtResult.scope,
            });
            return res.status(200).send(body);
          }
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(jwtResult.status).json(jwtResult.body);
        }

        case "OK":
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(200).send(result.responseContent);

        case "PASSWORD":
          // Resource Owner Password Credentials flow. Authlete returned
          // username/password and a ticket. Validate credentials then call
          // /auth/token/issue or /auth/token/fail accordingly.
          try {
            const username = result.username;
            const password = result.password;
            const ticket = result.ticket;

            if (!username || !password || !ticket) {
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Cache-Control", "no-store");
              res.setHeader("Pragma", "no-cache");
              return res.status(400).send(result.responseContent ?? result);
            }

            const user = await loginService.validateUser(username, password);
            if (!user) {
              // invalid credentials -> call Authlete /auth/token/fail
              const reqFail: TokenFailRequest = {
                ticket,
                reason: "INVALID_RESOURCE_OWNER_CREDENTIALS",
              };
              const failResp = await tokenService.fail(reqFail);

              return sendTokenFailResponse(res, failResp);
            }

            // valid credentials -> issue token using ticket and subject
            const issueReq: TokenIssueRequest = {
              ticket,
              subject: user.subject,
              ...(req.body.properties ? { properties: parseProperties(req.body.properties) } : {}),
            };
            const issueResp = await tokenService.issue(issueReq);

            return sendTokenIssueResponse(res, issueResp);
          } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            const log1 = req.logger || logger;
            log1.error("Password grant handling failed", { message: err.message });
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("Pragma", "no-cache");
            return res
              .status(500)
              .send({ error: "server_error", error_description: err.message });
          }

        case "TOKEN_EXCHANGE":
          return handleTokenExchange(req, res, result, next);

        case "NATIVE_SSO":
          return handleNativeSso(req, res, result, next);

        case "ID_TOKEN_REISSUABLE": {
          // Refresh-token flow with `openid` scope. Authlete has ALREADY issued the access and
          // refresh tokens — `responseContent` is a complete, returnable token response — and is
          // telling us an ID token may additionally be reissued.
          //
          // This action has its own API: `POST /idtoken/reissue`, which the vendored 3.0.16 spec
          // says is "expected to be called only when the value of the `action` parameter in a
          // response from the `/auth/token` API is ID_TOKEN_REISSUABLE". It is NOT
          // `/auth/token/issue`: that one takes a `ticket`, and Authlete sends no ticket with this
          // action. This branch used to demand one and fell through to a 400 carrying a valid token
          // body, so every refresh failed while `idTokenReissuable` was on (audit B1-W6).
          const log3 = req.logger || logger;

          // Spec's own precedence: "(a) the value of `jwtAccessToken` … when available, or (b) the
          // value of `accessToken` … when `jwtAccessToken` is not available". `jwtAccessToken` is
          // absent while JWT access tokens are off, so today this always takes (b) — it is here so
          // the call stays correct if that is ever enabled.
          const accessToken = result.jwtAccessToken ?? result.accessToken;
          const refreshToken = result.refreshToken;

          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");

          if (!accessToken || !refreshToken) {
            // Both are REQUIRED by the reissue API. Return the tokens Authlete already issued
            // rather than inventing anything or failing a valid refresh.
            log3.error("ID_TOKEN_REISSUABLE without the tokens the reissue API requires", {
              hasAccessToken: !!accessToken,
              hasRefreshToken: !!refreshToken,
            });
            return res.status(200).send(result.responseContent ?? result);
          }

          // Every field is server-derived, from Authlete's response. Nothing here comes from
          // `req.body`: a client able to set `sub` could name any subject in an ID token this OP
          // signs, and `claims`/`idtHeaderParams` would let it choose the payload and JWS header.
          const reissueResp = await tokenManagementService.reissueIdToken({
            accessToken,
            refreshToken,
            sub: result.subject,
            // The reissue request's own `idTokenAudType` DEFAULTS TO "array" ON OMISSION and, per
            // the spec, "takes precedence over the `idTokenAudType` property of Service". The
            // service is deliberately set to "string" (AGENTS.md, Mistake #7 / FAPI WG Nov 2024),
            // so omitting this would give reissued ID tokens an array `aud` while every other ID
            // token from this service carries a string. Keep in step with the service flag.
            idTokenAudType: ID_TOKEN_AUD_TYPE,
          });

          if (reissueResp.action === "OK") {
            return res.status(200).send(reissueResp.responseContent ?? result.responseContent);
          }

          // The reissue failed, but the access and refresh tokens are already live and no
          // specification requires an ID token on a refresh (OIDC Core §12.2 is a SHOULD). Return
          // what Authlete already issued, so enabling `idTokenReissuable` cannot break a refreshing
          // client on a server-side fault. The operator learns from this log, not the client.
          log3.error("ID token reissuance failed; returning the token response without a new ID token", {
            action: reissueResp.action,
            resultCode: reissueResp.resultCode,
          });
          return res.status(200).send(result.responseContent ?? result);
        }

        default: {
          const log2 = req.logger || logger;
          log2.error("Unknown token action", { action: result.action });
          return res.status(500).send("Unknown token action");
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Token Response Error", { message: error.message });
      return next(error);
    }
  },
};
