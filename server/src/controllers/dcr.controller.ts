import { NextFunction, Request, Response } from "express";
import { DcrService } from "../services/dcr.service";
import {
  validateOrThrow,
  dcrRegisterSchema,
  dcrGetSchema,
  dcrUpdateSchema,
  dcrDeleteSchema,
} from "../utils/validation";
import logger from "../utils/logger";
import { AppError } from "../utils/app-error";

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

function buildResponse(result: any) {
  const status = mapActionToStatus(result.action);
  if (status === 204) {
    return { status, body: undefined };
  }
  const body = result.responseContent
    ? { ...result, responseContent: safeParseJSON(result.responseContent) }
    : result;
  return { status, body };
}

function handleDcrError(err: unknown, req: Request, res: Response, next: NextFunction, label: string): void {
  if (err instanceof AppError && err.status === 400) {
    const log = req.logger || logger;
    log.error(`DCR ${label} Validation Error`, { message: err.message });
    res.status(400).json({ error: "invalid_request", error_description: err.message });
    return;
  }
  const error = err instanceof Error ? err : new Error(String(err));
  const log = req.logger || logger;
  log.error(`DCR ${label} Response Error`, { message: error.message });
  next(error);
}

export function createDcrControllers(dcrServiceInstance = new DcrService()) {
  return {
    register: {
      handleDcrRegister: async (req: Request, res: Response, next: NextFunction) => {
        try {
          if (!requireBasicAuth(req, res)) return;
          validateOrThrow(dcrRegisterSchema, req.body);
          const result = await dcrServiceInstance.register(req);
          const { status, body } = buildResponse(result);
          if (status === 204) return res.status(status).send();
          return res.status(status).json(body);
        } catch (err) {
          handleDcrError(err, req, res, next, "Register");
        }
      },
    },
    get: {
      handleDcrGet: async (req: Request, res: Response, next: NextFunction) => {
        try {
          validateOrThrow(dcrGetSchema, req.body);
          const result = await dcrServiceInstance.get(req);
          const { status, body } = buildResponse(result);
          if (status === 204) return res.status(status).send();
          return res.status(status).json(body);
        } catch (err) {
          handleDcrError(err, req, res, next, "Get");
        }
      },
    },
    update: {
      handleDcrUpdate: async (req: Request, res: Response, next: NextFunction) => {
        try {
          validateOrThrow(dcrUpdateSchema, req.body);
          const result = await dcrServiceInstance.update(req);
          const { status, body } = buildResponse(result);
          if (status === 204) return res.status(status).send();
          return res.status(status).json(body);
        } catch (err) {
          handleDcrError(err, req, res, next, "Update");
        }
      },
    },
    delete: {
      handleDcrDelete: async (req: Request, res: Response, next: NextFunction) => {
        try {
          validateOrThrow(dcrDeleteSchema, req.body);
          const result = await dcrServiceInstance.delete(req);
          const { status, body } = buildResponse(result);
          if (status === 204) return res.status(status).send();
          return res.status(status).json(body);
        } catch (err) {
          handleDcrError(err, req, res, next, "Delete");
        }
      },
    },
  };
}

const defaultControllers = createDcrControllers();
export const dcrRegisterController = defaultControllers.register;
export const dcrGetController = defaultControllers.get;
export const dcrUpdateController = defaultControllers.update;
export const dcrDeleteController = defaultControllers.delete;
