import { NextFunction, Request, Response } from "express";
import { GrantManagementService } from "../services/grant-management.service";
import logger from "../utils/logger";

function getLog(req: Request) { return req.logger || logger; }

const grantManagementService = new GrantManagementService();

export const grantManagementQueryController = {
  handleQueryGrant: async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const grantId = req.params.grantId as string;
      if (!grantId) {
        return res.status(400).json({ error: "invalid_request", error_description: "Missing grantId" });
      }

      const result = await grantManagementService.query(req, grantId);

      switch (result.action) {
        case "OK":
          if (result.responseContent) {
            return res.status(200).type("application/json").send(result.responseContent);
          }
          return res.status(200).json(result);

        case "NO_CONTENT":
          return res.status(204).send();

        case "UNAUTHORIZED":
          return res.status(401).type("application/json").send(result.responseContent || "");

        case "FORBIDDEN":
          return res.status(403).type("application/json").send(result.responseContent || "");

        case "NOT_FOUND":
          return res.status(404).type("application/json").send(result.responseContent || "");

        case "CALLER_ERROR":
          return res.status(400).json(result);

        case "AUTHLETE_ERROR":
          return res.status(500).json(result);

        default:
          return res.status(500).json({ error: "server_error" });
      }
    } catch (err) {
      const log = getLog(req);
      const error = err instanceof Error ? err : new Error(String(err));
      log.error("Grant management query error", { message: error.message });
      next(err);
    }
  },
};

export const grantManagementRevokeController = {
  handleRevokeGrant: async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const grantId = req.params.grantId as string;
      if (!grantId) {
        return res.status(400).json({ error: "invalid_request", error_description: "Missing grantId" });
      }

      const result = await grantManagementService.revoke(req, grantId);

      switch (result.action) {
        case "OK":
        case "NO_CONTENT":
          return res.status(204).send();

        case "UNAUTHORIZED":
          return res.status(401).type("application/json").send(result.responseContent || "");

        case "FORBIDDEN":
          return res.status(403).type("application/json").send(result.responseContent || "");

        case "NOT_FOUND":
          return res.status(404).type("application/json").send(result.responseContent || "");

        case "CALLER_ERROR":
          return res.status(400).json(result);

        case "AUTHLETE_ERROR":
          return res.status(500).json(result);

        default:
          return res.status(500).json({ error: "server_error" });
      }
    } catch (err) {
      const log = getLog(req);
      const error = err instanceof Error ? err : new Error(String(err));
      log.error("Grant management revoke error", { message: error.message });
      next(err);
    }
  },
};
