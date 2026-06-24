import { NextFunction, Request, Response } from "express";
import { TokenService } from "../services/token.service";
import { TokenManagementService } from "../services/token.operations.service";
import { LoginService } from "../services/login.service";
import session from "express-session";
import logger from "../utils/logger";
import {
  TokenFailRequest,
  TokenIssueRequest,
} from "@authlete/typescript-sdk/models";
import { handleTokenExchange } from "./token-exchange-response.handler";
import { sendTokenFailResponse } from "./token-fail-response.handler";
import { sendTokenIssueResponse } from "./token-issue-response.handler";
import { validateTokenParams } from "../utils/validate";
import { JwtVerificationService } from "../services/jwt-verification.service";

const tokenService = new TokenService();
const loginService = new LoginService();
const tokenManagementService = new TokenManagementService();
const jwtVerificationService = new JwtVerificationService();

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
          const jwtResult = await jwtVerificationService.processJwtBearer(result);
          if (jwtResult.ok) {
            res.setHeader("Content-Type", "application/json");
            const body = JSON.stringify({
              access_token: jwtResult.accessToken,
              token_type: jwtResult.tokenType,
              expires_in: jwtResult.expiresIn,
              scope: jwtResult.scope,
              client_id: jwtResult.clientId,
              subject: jwtResult.subject,
            });
            return res.status(200).send(body);
          }
          return res.status(jwtResult.status).json(jwtResult.body);

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

        default:
          const log2 = req.logger || logger;
          log2.error("Unknown token action", { action: result.action });
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
