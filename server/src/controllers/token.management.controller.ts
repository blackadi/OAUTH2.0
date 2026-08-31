import { NextFunction, Request, Response } from "express";
import { TokenManagementService } from "../services/token.operations.service";
import logger from "../utils/logger";
import { server } from "../config/app.config";
import { jwt } from "../config/authlete.config";
import { requireBasicAuth } from "../middleware/require-basic-auth";

const tokenManagementService = new TokenManagementService();
const checkAuth = requireBasicAuth("token_management");

export const tokenCreateController = {
  handleCreateToken: async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!checkAuth(req, res)) return;
      const result = await tokenManagementService.create(req);

      switch (result.action) {
        case "OK":
          res.setHeader("Content-Type", "application/json");
          return res.status(200).send(result);

        case "INTERNAL_SERVER_ERROR":
          res.setHeader("Content-Type", "application/json");
          return res.status(500).send(result);

        case "BAD_REQUEST":
          res.setHeader("Content-Type", "application/json");
          return res.status(400).send(result);

        case "FORBIDDEN":
          res.setHeader("Content-Type", "application/json");
          return res.status(403).send(result);

        default: {
          const log2 = req.logger || logger;
          log2.error("Unknown token action", { action: result.action });
          return res.status(500).send("Unknown token action");
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Token Create Response Error", { message: error.message });
      return next(error);
    }
  },
};

export const tokenDeleteController = {
  handleDeleteToken: async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!checkAuth(req, res)) return;
      const accessTokenIdentifier = req.params.accessTokenIdentifier as string;
      const log = req.logger || logger;
      log.info("TokenDeleteService: calling Authlete token management endpoint", {
        accessTokenIdentifier,
      });

      if (!accessTokenIdentifier) {
        return res.status(400).json({
          result: {
            action: "BAD_REQUEST",
            message:
              "Access token identifier is required (accessTokenIdentifier parameter is missing)",
          },
        });
      }
      await tokenManagementService.delete(accessTokenIdentifier);

      return res
        .status(204)
        .send({ action: "OK", message: "Token deleted successfully" });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Token Delete Response Error", { message: error.message });
      return next(error);
    }
  },
};

export const tokenUpdateController = {
  handleUpdateToken: async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!checkAuth(req, res)) return;
      const result = await tokenManagementService.update(req);

      switch (result.action) {
        case "OK":
          res.setHeader("Content-Type", "application/json");
          return res.status(200).send(result);

        case "INTERNAL_SERVER_ERROR":
          res.setHeader("Content-Type", "application/json");
          return res.status(500).send(result);

        case "BAD_REQUEST":
          res.setHeader("Content-Type", "application/json");
          return res.status(400).send(result);

        case "FORBIDDEN":
          res.setHeader("Content-Type", "application/json");
          return res.status(403).send(result);

        case "NOT_FOUND":
          res.setHeader("Content-Type", "application/json");
          return res.status(404).send(result);

        default: {
          const log3 = req.logger || logger;
          log3.error("Unknown token action", { action: result.action });
          return res.status(500).send("Unknown token action");
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Token Update Response Error", { message: error.message });
      return next(error);
    }
  },
};

export const tokensListController = {
  handleListTokens: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!checkAuth(req, res)) return;
      const result = await tokenManagementService.list();
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Token List Response Error", { message: error.message });
      return next(error);
    }
  },
};

export const tokenRevokeToken = {
  handleRevokeToken: async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!checkAuth(req, res)) return;
      const result = await tokenManagementService.revoke(req);

      // TokenRevokeResponse has no `action` field — only `resultCode`, `resultMessage`, `count`.
      // The SDK throws ResultError for HTTP 400/401/403/500, so this switch only handles 200 responses.
      switch (result.resultCode) {
        // A000000: success, tokens revoked
        // A135001/A312001: token not found — per OAuth spec, revocation of non-existent token is success (RFC 7009 §2.1)
        case "A000000":
        case "A135001":
        case "A312001":
          res.setHeader("Content-Type", "application/json");
          return res.status(200).json({ count: result.count ?? 0 });

        default: {
          const log = req.logger || logger;
          log.error("Token Revoke: unexpected resultCode", {
            resultCode: result.resultCode,
            resultMessage: result.resultMessage,
          });
          res.setHeader("Content-Type", "application/json");
          return res.status(500).json({
            error: "server_error",
            error_description: "Token revocation failed",
          });
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Token Revoke Response Error", { message: error.message });

      // SDK throws ResultError for HTTP 400/401/403/500 from Authlete.
      // Extract resultCode if available for token-not-found detection.
      const errWithCode = err as Record<string, unknown>;
      const resultCode =
        typeof errWithCode.resultCode === "string" ? errWithCode.resultCode : undefined;

      if (resultCode?.startsWith("A313301") || error.message.includes("does not exist")) {
        return res.status(404).json({
          error: "not_found",
          error_description: "The specified access token does not exist.",
        });
      }

      return next(error);
    }
  },
};

export const tokenReissueIdToken = {
  handleReissueIdToken: async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!checkAuth(req, res)) return;
      const result = await tokenManagementService.reissueIdToken(req);

      switch (result.action) {
        case "OK":
          res.setHeader("Content-Type", "application/json");
          return res.status(200).send(result);

        case "INTERNAL_SERVER_ERROR":
          res.setHeader("Content-Type", "application/json");
          return res.status(500).send(result);

        case "CALLER_ERROR":
          res.setHeader("Content-Type", "application/json");
          return res.status(400).send(result);

        default: {
          const log5 = req.logger || logger;
          log5.error("Unknown reissue id token action", {
            action: result.action,
          });
          return res.status(500).send("Unknown reissue id token action");
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("IDToken Reissue Response Error", { message: error.message });
      return next(error);
    }
  },
};

/**
 * Parse an `authTime` query value, or yield nothing.
 *
 * Absence must not become a value. An unparseable or non-positive input yields `undefined` so no
 * `auth_time` claim is stamped at all — the same rule `utils/step-up.ts` follows, and for the same reason
 * 9470-W3 exists: an invented authentication time is one a resource server will enforce a `max_age` against.
 */
function authTimeOrUndefined(raw: unknown): number | undefined {
  const parsed = Number(raw);
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export const localSignedToken = {
  handleLocalSignedToken: async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (server.nodeEnv !== "development") {
        return res.status(404).json({ error: "not_found" });
      }
      // After the nodeEnv guard, so production keeps returning a flat 404 rather than revealing that
      // the endpoint exists. This is an admin route and was previously the only one with no auth check.
      if (!checkAuth(req, res)) return;
      const { ...reqBody } = req.query;
      logger.info("Local Signed Token parameters", { reqBody });
      //read iss parameter from env if not provided
      if (!reqBody.iss) {
        reqBody.iss = jwt.issuer;
      }
      // `client_id` joined this list in 9068-W2: RFC 9068 §2.2 marks it REQUIRED alongside iss/sub/aud, and
      // the token this endpoint hands out is the only RFC 9068 specimen a learner can obtain here. Demanding
      // it is what stops the specimen contradicting the lesson. `scope` is a §2.2.3 SHOULD, so it stays
      // optional and is omitted rather than emitted empty.
      if (!reqBody.iss || !reqBody.sub || !reqBody.aud || !reqBody.client_id) {
        return res.status(400).json({
          error: "invalid_request",
          error_description:
            "Missing required parameters: iss, sub, aud, client_id",
        });
      }

      reqBody.aud =
        (typeof reqBody.aud === "string" ? reqBody.aud : "")
          .split(/\s+/)
          .filter(Boolean) ?? [];

      logger.info("Local Signed Token parameters", { reqBody });

      const result = tokenManagementService.localSignedToken(
        (reqBody.iss as string) ?? "",
        (reqBody.sub as string) ?? "",
        (reqBody.aud as string[]) ?? [],
        reqBody.client_id as string,
        {
          scope: typeof reqBody.scope === "string" ? reqBody.scope : undefined,
          acr: typeof reqBody.acr === "string" ? reqBody.acr : undefined,
          // `authTime` was advertised in the OpenAPI spec and reached nothing. Passed only when it parses
          // as a positive integer: `Number("")` is 0, which is finite and would stamp `auth_time` as the
          // Unix epoch — a fabricated authentication time, which is the mistake 9470-W3 exists to prevent.
          authTime: authTimeOrUndefined(reqBody.authTime),
        }
      );

      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Local Signed Token Response Error", {
        message: error.message,
      });
      return next(error);
    }
  },
};
