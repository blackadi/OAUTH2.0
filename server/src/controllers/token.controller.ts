import { NextFunction, Request, Response } from "express";
import { TokenService } from "../services/token.service";
import { TokenManagementService } from "../services/token.operations.service";
import { LoginService } from "../services/login.service";
import session from "express-session";
import logger from "../utils/logger";
import {
  TokenCreateRequest,
  TokenFailRequest,
  TokenIssueRequest,
} from "@authlete/typescript-sdk/models";
import { handleTokenExchange } from "./token-exchange-response.handler";
import { sendTokenFailResponse } from "./token-fail-response.handler";
import { sendTokenIssueResponse } from "./token-issue-response.handler";
import { jwks, jwt } from "../config/authlete.config";
import {
  validateJwtAssertionWithJwks,
  JwtValidationResult,
} from "../utils/jwtAssertionValidator";
import { validateTokenParams } from "../utils/validate";

const tokenService = new TokenService();
const loginService = new LoginService();
const tokenManagementService = new TokenManagementService();

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
      const result = await tokenService.process(req);

      switch (result.action) {
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

        case "JWT_BEARER":
          const assertion = result.assertion;
          if (!assertion) {
            return res.status(400).json({
              error: "invalid_request",
              error_description: "Missing assertion",
            });
          }

          const jwksUri = jwks.uri;

          // Validate JWT using JWKS
          const { valid, payload, error } = await validateJwtAssertionWithJwks(
            assertion,
            jwksUri
          );

          if (!valid) {
            logger.error("JWT assertion validation failed:", error);
            return res.status(400).json({
              error: "invalid_request",
              error_description: "Invalid assertion",
            });
          }

          const subject = payload!.sub;
          const issuer = payload!.iss;
          const audience = payload!.aud;

          // Build Authlete TokenCreateRequest
          const createRequest = {
            grantType: "JWT_BEARER",
            subject,
            clientId: result.clientId,
            issuer,
            audience: Array.isArray(audience) ? audience : [audience],
            scopes: result.scopes,
          } as TokenCreateRequest;

          const createResp = await tokenManagementService.create(createRequest);

          switch (createResp.action) {
            case "OK": {
              res.setHeader("Content-Type", "application/json");
              const body = JSON.stringify({
                access_token: createResp.accessToken,
                token_type: createResp.tokenType || "Bearer",
                expires_in: createResp.expiresIn,
                scope: createResp.scopes?.join(" ") || "",
                client_id: createResp.clientId,
                subject: createResp.subject,
              });
              return res.status(200).send(body);
            }
            case "BAD_REQUEST":
              res.setHeader("Content-Type", "application/json");
              return res.status(400).json(createResp);
            case "FORBIDDEN":
              res.setHeader("Content-Type", "application/json");
              return res.status(403).json(createResp);
            default:
              res.setHeader("Content-Type", "application/json");
              return res.status(500).json(createResp);
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
            };
            const issueResp = await tokenService.issue(issueReq);

            return sendTokenIssueResponse(res, issueResp);
          } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            req.logger?.error("Password grant handling failed", {
              message: err.message,
            });
            logger.error("Password grant handling failed", {
              message: err.message,
            });
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("Pragma", "no-cache");
            return res
              .status(500)
              .send({ error: "server_error", error_description: err.message });
          }

        case "TOKEN_EXCHANGE":
          return handleTokenExchange(req, res, result, next);

        default:
          req.logger?.error("Unknown token action", { action: result.action });
          logger.error("Unknown token action", { action: result.action });
          return res.status(500).send("Unknown token action");
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Token Response Error", { message: error.message });
      return next(error);
    }
  },
};
