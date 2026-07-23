import { NextFunction, Request, Response } from "express";
import { CibaService } from "../services/ciba.service";
import { sendApiResponse } from "../utils/http-utils";
import {
  validateOrThrow,
  cibaAuthenticationSchema,
  cibaIssueSchema,
  cibaFailSchema,
  cibaCompleteSchema,
} from "../utils/validation";
import logger from "../utils/logger";
import { AppError } from "../utils/app-error";

function mapAuthActionToStatus(action?: string): number {
  switch (action) {
    case "INTERNAL_SERVER_ERROR": return 500;
    case "BAD_REQUEST": return 400;
    case "UNAUTHORIZED": return 401;
    case "USER_IDENTIFICATION": return 200;
    default: return 500;
  }
}

function mapIssueActionToStatus(action?: string): number {
  switch (action) {
    case "INTERNAL_SERVER_ERROR": return 500;
    case "INVALID_TICKET": return 400;
    case "OK": return 200;
    default: return 500;
  }
}

function mapFailActionToStatus(action?: string): number {
  switch (action) {
    case "INTERNAL_SERVER_ERROR": return 500;
    case "BAD_REQUEST": return 400;
    case "FORBIDDEN": return 403;
    default: return 500;
  }
}

function mapCompleteActionToStatus(action?: string): number {
  switch (action) {
    case "SERVER_ERROR": return 500;
    case "NO_ACTION": return 200;
    case "NOTIFICATION": return 200;
    default: return 500;
  }
}

function handleControllerError(err: unknown, req: Request, next: NextFunction, label: string): void {
  const error = err instanceof Error ? err : new Error(String(err));
  const log = req.logger || logger;
  log.error(`CIBA ${label} Error`, { message: error.message });
  next(error);
}

function handleValidationError(err: unknown, req: Request, res: Response): boolean {
  if (err instanceof AppError && err.status === 400) {
    const log = req.logger || logger;
    log.error("CIBA Validation Error", { message: err.message });
    res.status(400).json({ error: "invalid_request", error_description: err.message });
    return true;
  }
  return false;
}

export function createCibaControllers(cibaServiceInstance = new CibaService()) {
  return {
    authentication: {
      handle: async (req: Request, res: Response, next: NextFunction) => {
        try {
          validateOrThrow(cibaAuthenticationSchema, req.body);
          const result = await cibaServiceInstance.process(req);
          sendApiResponse(res, mapAuthActionToStatus(result.action), result);
        } catch (err) {
          if (handleValidationError(err, req, res)) return;
          handleControllerError(err, req, next, "Authentication");
        }
      },
    },
    issue: {
      handle: async (req: Request, res: Response, next: NextFunction) => {
        try {
          const { ticket } = validateOrThrow(cibaIssueSchema, req.body);
          const result = await cibaServiceInstance.issue(ticket);
          sendApiResponse(res, mapIssueActionToStatus(result.action), result);
        } catch (err) {
          if (handleValidationError(err, req, res)) return;
          handleControllerError(err, req, next, "Issue");
        }
      },
    },
    fail: {
      handle: async (req: Request, res: Response, next: NextFunction) => {
        try {
          const { ticket, reason } = validateOrThrow(cibaFailSchema, req.body);
          const result = await cibaServiceInstance.fail(ticket, reason);
          sendApiResponse(res, mapFailActionToStatus(result.action), result);
        } catch (err) {
          if (handleValidationError(err, req, res)) return;
          handleControllerError(err, req, next, "Fail");
        }
      },
    },
    complete: {
      handle: async (req: Request, res: Response, next: NextFunction) => {
        try {
          const { ticket, result, subject } = validateOrThrow(cibaCompleteSchema, req.body);
          const apiResult = await cibaServiceInstance.complete(ticket, result, subject);
          sendApiResponse(res, mapCompleteActionToStatus(apiResult.action), apiResult);
        } catch (err) {
          if (handleValidationError(err, req, res)) return;
          handleControllerError(err, req, next, "Complete");
        }
      },
    },
  };
}

const defaultControllers = createCibaControllers();
export const cibaAuthenticationController = defaultControllers.authentication;
export const cibaIssueController = defaultControllers.issue;
export const cibaFailController = defaultControllers.fail;
export const cibaCompleteController = defaultControllers.complete;
