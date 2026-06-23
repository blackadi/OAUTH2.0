import { NextFunction, Request, Response } from "express";
import { BackchannelLogoutService } from "../services/backchannel-logout.service";
import logger from "../utils/logger";

const backchannelLogoutService = new BackchannelLogoutService();

function requireBasicAuth(req: Request, res: Response): boolean {
  const mgmtClientId = process.env.MGMT_CLIENT_ID;
  const mgmtClientSecret = process.env.MGMT_CLIENT_SECRET;
  if (!mgmtClientId || !mgmtClientSecret) return true;

  const { authorization } = req.headers;
  if (!authorization?.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="client_management"');
    res.status(401).json({ error: "invalid_client", error_description: "Client authentication required" });
    return false;
  }
  const credentials = Buffer.from(authorization.slice(6), "base64").toString("utf-8");
  const [id, secret] = credentials.split(":");
  if (id !== mgmtClientId || secret !== mgmtClientSecret) {
    res.setHeader("WWW-Authenticate", 'Basic realm="client_management"');
    res.status(401).json({ error: "invalid_client", error_description: "Invalid client credentials" });
    return false;
  }
  return true;
}

export const backchannelLogoutIssueController = {
  handleIssueToken: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!requireBasicAuth(req, res)) return;

      const { clientIdentifier, subject, sessionId } = req.body as Record<string, string | undefined>;

      if (!clientIdentifier) {
        res.status(400).json({ error: "invalid_request", error_description: "Missing required field: clientIdentifier" });
        return;
      }

      const result = await backchannelLogoutService.issueToken(clientIdentifier, subject, sessionId);
      res.setHeader("Content-Type", "application/json");

      if (result.action === "OK") {
        return res.status(200).send(result);
      }
      if (result.action === "CALLER_ERROR") {
        return res.status(400).send(result);
      }
      return res.status(500).send(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Backchannel logout issue error", { message: error.message });
      return next(error);
    }
  },
};

export const backchannelLogoutDeliverController = {
  handleDeliver: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!requireBasicAuth(req, res)) return;

      const { clientIdentifier, subject, sessionId } = req.body as Record<string, string | undefined>;

      if (!clientIdentifier) {
        res.status(400).json({ error: "invalid_request", error_description: "Missing required field: clientIdentifier" });
        return;
      }

      const result = await backchannelLogoutService.issueAndDeliver(clientIdentifier, subject, sessionId);
      res.setHeader("Content-Type", "application/json");

      const httpStatus = result.success ? 200 : 502;
      return res.status(httpStatus).send(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Backchannel logout deliver error", { message: error.message });
      return next(error);
    }
  },
};

export const backchannelLogoutDeliverAllController = {
  handleDeliverAll: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!requireBasicAuth(req, res)) return;

      const { subject, sessionId } = req.body as Record<string, string | undefined>;

      if (!subject && !sessionId) {
        res.status(400).json({ error: "invalid_request", error_description: "At least one of subject or sessionId is required" });
        return;
      }

      const results = await backchannelLogoutService.issueAndDeliverToAll(subject, sessionId);
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(results);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Backchannel logout deliver-all error", { message: error.message });
      return next(error);
    }
  },
};
