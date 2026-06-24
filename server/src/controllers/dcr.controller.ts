import { NextFunction, Request, Response } from "express";
import { DcrService } from "../services/dcr.service";
import logger from "../utils/logger";

const dcrService = new DcrService();

function safeParseJSON(str: string): unknown {
  try { return JSON.parse(str); } catch { return str; }
}

function requireBasicAuth(req: Request, res: Response): boolean {
  const mgmtClientId = process.env.MGMT_CLIENT_ID;
  const mgmtClientSecret = process.env.MGMT_CLIENT_SECRET;
  if (!mgmtClientId || !mgmtClientSecret) return true;

  const { authorization } = req.headers;
  if (!authorization?.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="dcr"');
    res.status(401).json({ error: "invalid_client", error_description: "Client authentication required" });
    return false;
  }
  const credentials = Buffer.from(authorization.slice(6), "base64").toString("utf-8");
  const [id, secret] = credentials.split(":");
  if (id !== mgmtClientId || secret !== mgmtClientSecret) {
    res.setHeader("WWW-Authenticate", 'Basic realm="dcr"');
    res.status(401).json({ error: "invalid_client", error_description: "Invalid client credentials" });
    return false;
  }
  return true;
}

function mapActionToStatus(action?: string): number {
  switch (action) {
    case "CREATED": return 201;
    case "OK":
    case "UPDATED": return 200;
    case "DELETED": return 204;
    case "BAD_REQUEST": return 400;
    case "UNAUTHORIZED": return 401;
    case "INTERNAL_SERVER_ERROR": return 500;
    default: return 500;
  }
}

export const dcrRegisterController = {
  handleDcrRegister: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!requireBasicAuth(req, res)) return;
      const result = await dcrService.register(req);
      const status = mapActionToStatus(result.action);
      if (status === 204) {
        return res.status(status).send();
      }
      const body = result.responseContent
        ? { ...result, responseContent: safeParseJSON(result.responseContent) }
        : result;
      return res.status(status).json(body);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("DCR Register Response Error", { message: error.message });
      return next(error);
    }
  },
};

export const dcrGetController = {
  handleDcrGet: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await dcrService.get(req);
      const status = mapActionToStatus(result.action);
      if (status === 204) {
        return res.status(status).send();
      }
      const body = result.responseContent
        ? { ...result, responseContent: safeParseJSON(result.responseContent) }
        : result;
      return res.status(status).json(body);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("DCR Get Response Error", { message: error.message });
      return next(error);
    }
  },
};

export const dcrUpdateController = {
  handleDcrUpdate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await dcrService.update(req);
      const status = mapActionToStatus(result.action);
      if (status === 204) {
        return res.status(status).send();
      }
      const body = result.responseContent
        ? { ...result, responseContent: safeParseJSON(result.responseContent) }
        : result;
      return res.status(status).json(body);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("DCR Update Response Error", { message: error.message });
      return next(error);
    }
  },
};

export const dcrDeleteController = {
  handleDcrDelete: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await dcrService.delete(req);
      const status = mapActionToStatus(result.action);
      if (status === 204) {
        return res.status(status).send();
      }
      const body = result.responseContent
        ? { ...result, responseContent: safeParseJSON(result.responseContent) }
        : result;
      return res.status(status).json(body);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("DCR Delete Response Error", { message: error.message });
      return next(error);
    }
  },
};
