import { NextFunction, Request, Response } from "express";
import { NativeSsoService } from "../services/native-sso.service";
import { sendApiResponse } from "../utils/http-utils";
import {
  validateOrThrow,
  nativeSsoProcessSchema,
  nativeSsoLogoutSchema,
} from "../utils/validation";
import logger from "../utils/logger";
import { AppError } from "../utils/app-error";

function mapProcessActionToStatus(action?: string): number {
  switch (action) {
    case "OK": return 200;
    case "CALLER_ERROR": return 400;
    case "INTERNAL_SERVER_ERROR": return 500;
    default: return 500;
  }
}

function mapLogoutActionToStatus(action?: string): number {
  switch (action) {
    case "OK": return 200;
    case "CALLER_ERROR": return 400;
    case "SERVER_ERROR": return 500;
    default: return 500;
  }
}

function handleControllerError(err: unknown, req: Request, next: NextFunction, label: string): void {
  const error = err instanceof Error ? err : new Error(String(err));
  const log = req.logger || logger;
  log.error(`NativeSso ${label} Error`, { message: error.message });
  next(error);
}

function handleValidationError(err: unknown, req: Request, res: Response): boolean {
  if (err instanceof AppError && err.status === 400) {
    const log = req.logger || logger;
    log.error("NativeSso Validation Error", { message: err.message });
    res.status(400).json({ error: "invalid_request", error_description: err.message });
    return true;
  }
  return false;
}

function requireBasicAuth(req: Request, res: Response): boolean {
  const mgmtClientId = process.env.MGMT_CLIENT_ID;
  const mgmtClientSecret = process.env.MGMT_CLIENT_SECRET;
  if (!mgmtClientId || !mgmtClientSecret) return true;

  const { authorization } = req.headers;
  if (!authorization?.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="nativesso"');
    res.status(401).json({ error: "invalid_client", error_description: "Client authentication required" });
    return false;
  }
  const credentials = Buffer.from(authorization.slice(6), "base64").toString("utf-8");
  const [id, secret] = credentials.split(":");
  if (id !== mgmtClientId || secret !== mgmtClientSecret) {
    res.setHeader("WWW-Authenticate", 'Basic realm="nativesso"');
    res.status(401).json({ error: "invalid_client", error_description: "Invalid client credentials" });
    return false;
  }
  return true;
}

export function createNativeSsoControllers(serviceInstance = new NativeSsoService()) {
  return {
    process: {
      handle: async (req: Request, res: Response, next: NextFunction) => {
        try {
          if (!requireBasicAuth(req, res)) return;
          validateOrThrow(nativeSsoProcessSchema, req.body);
          const result = await serviceInstance.process(req);
          sendApiResponse(res, mapProcessActionToStatus(result.action), result);
        } catch (err) {
          if (handleValidationError(err, req, res)) return;
          handleControllerError(err, req, next, "Process");
        }
      },
    },
    logout: {
      handle: async (req: Request, res: Response, next: NextFunction) => {
        try {
          if (!requireBasicAuth(req, res)) return;
          validateOrThrow(nativeSsoLogoutSchema, req.body);
          const result = await serviceInstance.logout(req);
          sendApiResponse(res, mapLogoutActionToStatus(result.action), result);
        } catch (err) {
          if (handleValidationError(err, req, res)) return;
          handleControllerError(err, req, next, "Logout");
        }
      },
    },
  };
}

const defaultControllers = createNativeSsoControllers();
export const nativeSsoProcessController = defaultControllers.process;
export const nativeSsoLogoutController = defaultControllers.logout;
