import { NextFunction, Request, Response } from "express";
import { HskService } from "../services/hsk.service";
import logger from "../utils/logger";
import { AppError } from "../utils/app-error";

function requireBasicAuth(req: Request, res: Response): boolean {
  const mgmtClientId = process.env.MGMT_CLIENT_ID;
  const mgmtClientSecret = process.env.MGMT_CLIENT_SECRET;
  if (!mgmtClientId || !mgmtClientSecret) return true;

  const { authorization } = req.headers;
  if (!authorization?.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="hsk"');
    res.status(401).json({ error: "invalid_client", error_description: "Client authentication required" });
    return false;
  }
  const credentials = Buffer.from(authorization.slice(6), "base64").toString("utf-8");
  const [id, secret] = credentials.split(":");
  if (id !== mgmtClientId || secret !== mgmtClientSecret) {
    res.setHeader("WWW-Authenticate", 'Basic realm="hsk"');
    res.status(401).json({ error: "invalid_client", error_description: "Invalid client credentials" });
    return false;
  }
  return true;
}

function mapCreateActionToStatus(action?: string): number {
  switch (action) {
    case "SUCCESS": return 201;
    case "INVALID_REQUEST": return 400;
    case "NOT_FOUND": return 404;
    case "SERVER_ERROR": return 500;
    default: return 500;
  }
}

function mapGetActionToStatus(action?: string): number {
  switch (action) {
    case "SUCCESS": return 200;
    case "INVALID_REQUEST": return 400;
    case "NOT_FOUND": return 404;
    case "SERVER_ERROR": return 500;
    default: return 500;
  }
}

function mapDeleteActionToStatus(action?: string): number {
  switch (action) {
    case "SUCCESS": return 204;
    case "INVALID_REQUEST": return 400;
    case "NOT_FOUND": return 404;
    case "SERVER_ERROR": return 500;
    default: return 500;
  }
}

function mapListActionToStatus(action?: string): number {
  switch (action) {
    case "SUCCESS": return 200;
    case "INVALID_REQUEST": return 400;
    case "SERVER_ERROR": return 500;
    default: return 500;
  }
}

function handleControllerError(err: unknown, req: Request, res: Response, next: NextFunction, label: string): void {
  if (err instanceof AppError && err.status === 400) {
    const log = req.logger || logger;
    log.error(`HSK ${label} Validation Error`, { message: err.message });
    res.status(400).json({ error: "invalid_request", error_description: err.message });
    return;
  }
  const error = err instanceof Error ? err : new Error(String(err));
  const log = req.logger || logger;
  log.error(`HSK ${label} Response Error`, { message: error.message });
  next(error);
}

export function createHskControllers(serviceInstance = new HskService()) {
  return {
    create: {
      handleCreate: async (req: Request, res: Response, next: NextFunction) => {
        try {
          if (!requireBasicAuth(req, res)) return;
          const result = await serviceInstance.create(req);
          const status = mapCreateActionToStatus(result.action);
          if (status === 204) return res.status(status).send();
          return res.status(status).json(result);
        } catch (err) {
          handleControllerError(err, req, res, next, "Create");
        }
      },
    },
    get: {
      handleGet: async (req: Request, res: Response, next: NextFunction) => {
        try {
          if (!requireBasicAuth(req, res)) return;
          const handle = req.params.handle as string;
          const result = await serviceInstance.get(handle);
          const status = mapGetActionToStatus(result.action);
          if (status === 204) return res.status(status).send();
          return res.status(status).json(result);
        } catch (err) {
          handleControllerError(err, req, res, next, "Get");
        }
      },
    },
    delete: {
      handleDelete: async (req: Request, res: Response, next: NextFunction) => {
        try {
          if (!requireBasicAuth(req, res)) return;
          const handle = req.params.handle as string;
          const result = await serviceInstance.delete(handle);
          const status = mapDeleteActionToStatus(result.action);
          if (status === 204) return res.status(status).send();
          return res.status(status).json(result);
        } catch (err) {
          handleControllerError(err, req, res, next, "Delete");
        }
      },
    },
    list: {
      handleList: async (req: Request, res: Response, next: NextFunction) => {
        try {
          if (!requireBasicAuth(req, res)) return;
          const result = await serviceInstance.list();
          const status = mapListActionToStatus(result.action);
          if (status === 204) return res.status(status).send();
          return res.status(status).json(result);
        } catch (err) {
          handleControllerError(err, req, res, next, "List");
        }
      },
    },
  };
}

const defaultControllers = createHskControllers();
export const hskCreateController = defaultControllers.create;
export const hskGetController = defaultControllers.get;
export const hskDeleteController = defaultControllers.delete;
export const hskListController = defaultControllers.list;
