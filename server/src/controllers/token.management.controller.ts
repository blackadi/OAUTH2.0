import { NextFunction, Request, Response } from "express";
import { TokenManagementService } from "../services/token.operations.service";
import logger from "../utils/logger";
import { server } from "../config/app.config";
import { jwt } from "../config/authlete.config";
import { Scope } from "@authlete/typescript-sdk/models";

const tokenManagementService = new TokenManagementService();

function requireBasicAuth(req: Request, res: Response): boolean {
  const mgmtClientId = process.env.MGMT_CLIENT_ID;
  const mgmtClientSecret = process.env.MGMT_CLIENT_SECRET;
  if (!mgmtClientId || !mgmtClientSecret) return true; // skip if unconfigured

  const { authorization } = req.headers;
  if (!authorization?.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="token_management"');
    res.status(401).json({ error: "invalid_client", error_description: "Client authentication required" });
    return false;
  }
  const credentials = Buffer.from(authorization.slice(6), "base64").toString("utf-8");
  const [id, secret] = credentials.split(":");
  if (id !== mgmtClientId || secret !== mgmtClientSecret) {
    res.setHeader("WWW-Authenticate", 'Basic realm="token_management"');
    res.status(401).json({ error: "invalid_client", error_description: "Invalid client credentials" });
    return false;
  }
  return true;
}

export const tokenCreateController = {
  handleCreateToken: async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!requireBasicAuth(req, res)) return;
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

        default:
          const log2 = req.logger || logger;
          log2.error("Unknown token action", { action: result.action });
          return res.status(500).send("Unknown token action");
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
      if (!requireBasicAuth(req, res)) return;
      const accessTokenIdentifier = req.params.accessTokenIdentifier as string;
      const log = req.logger || logger;
      log(
        "TokenDeleteService: calling Authlete token management endpoint",
        accessTokenIdentifier
      );

      if (!accessTokenIdentifier) {
        return res.status(400).json({
          result: {
            action: "BAD_REQUEST",
            message:
              "Access token identifier is required (accessTokenIdentifier parameter is missing)",
          },
        });
      }
      const result = await tokenManagementService.delete(accessTokenIdentifier);

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
      if (!requireBasicAuth(req, res)) return;
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

        default:
          const log3 = req.logger || logger;
          log3.error("Unknown token action", { action: result.action });
          return res.status(500).send("Unknown token action");
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
      if (!requireBasicAuth(req, res)) return;
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
      if (!requireBasicAuth(req, res)) return;
      const result = await tokenManagementService.revoke(req);

      switch (result.resultCode) {
        case "A135001":
          res.setHeader("Content-Type", "application/json");
          return res.status(200).send(result);

        case "A001201":
          res.setHeader("Content-Type", "application/json");
          return res.status(400).send(result);

        case "A001202":
          res.setHeader("Content-Type", "application/json");
          return res.status(401).send(result);

        case "A001215":
          res.setHeader("Content-Type", "application/json");
          return res.status(403).send(result);

        case "A001101":
          res.setHeader("Content-Type", "application/json");
          return res.status(500).send(result);

        default:
          res.setHeader("Content-Type", "application/json");
          return res.status(404).json(result);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Token Revoke Response Error", { message: error.message });
      // Handle Authlete API errors (e.g., token not found on this service)
      if (error.message.includes("A313301") || error.message.includes("The specified access token does not exist")) {
        return res.status(404).json({
          resultCode: "A313301",
          resultMessage: "[A313301] The specified access token does not exist.",
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
      if (!requireBasicAuth(req, res)) return;
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

        default:
          const log5 = req.logger || logger;
          log5.error("Unknown reissue id token action", {
            action: result.action,
          });
          return res.status(500).send("Unknown reissue id token action");
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("IDToken Reissue Response Error", { message: error.message });
      return next(error);
    }
  },
};

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
      const { ...reqBody } = req.query;
      logger("Local Signed Token parameters", { reqBody });
      //read iss parameter from env if not provided
      if (!reqBody.iss) {
        reqBody.iss = jwt.issuer;
      }
      //check empty parameters
      if (!reqBody.iss || !reqBody.sub || !reqBody.aud) {
        return res.status(400).json({
          error: "invalid_request",
          error_description: "Missing required parameters: iss, sub, aud",
        });
      }

      reqBody.aud =
        (typeof reqBody.aud === "string" ? reqBody.aud : "")
          .split(/\s+/)
          .filter(Boolean) ?? [];

      logger("Local Signed Token parameters", { reqBody });

      const result = tokenManagementService.localSignedToken(
        (reqBody.iss as string) ?? "",
        (reqBody.sub as string) ?? "",
        (reqBody.aud as string[]) ?? []
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
