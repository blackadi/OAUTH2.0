import { NextFunction, Request, Response } from "express";
import { HskService } from "../services/hsk.service";
import { requireBasicAuth } from "../middleware/require-basic-auth";
import { handleControllerError } from "../utils/controller-error";

const checkAuth = requireBasicAuth("hsk");

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

export function createHskControllers(serviceInstance = new HskService()) {
  return {
    create: {
      handleCreate: async (req: Request, res: Response, next: NextFunction) => {
        try {
          if (!checkAuth(req, res)) return;
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
          if (!checkAuth(req, res)) return;
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
          if (!checkAuth(req, res)) return;
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
          if (!checkAuth(req, res)) return;
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
