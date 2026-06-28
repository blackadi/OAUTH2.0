import { NextFunction, Request, Response } from "express";
import { DeviceService } from "../services/device.service";
import { sendApiResponse } from "../utils/http-utils";
import {
  validateOrThrow,
  deviceAuthorizationSchema,
  deviceVerificationSchema,
  deviceCompleteSchema,
} from "../utils/validation";
import logger from "../utils/logger";
import { AppError } from "../utils/app-error";

function mapAuthActionToStatus(action?: string): number {
  switch (action) {
    case "INTERNAL_SERVER_ERROR": return 500;
    case "BAD_REQUEST": return 400;
    case "UNAUTHORIZED": return 401;
    case "OK": return 200;
    default: return 500;
  }
}

function mapVerificationActionToStatus(action?: string): number {
  switch (action) {
    case "INTERNAL_SERVER_ERROR": return 500;
    case "NOT_EXIST": return 404;
    case "EXPIRED": return 400;
    case "VALID": return 200;
    default: return 500;
  }
}

function mapCompleteActionToStatus(action?: string): number {
  switch (action) {
    case "SERVER_ERROR": return 500;
    case "USER_CODE_NOT_EXIST": return 404;
    case "USER_CODE_EXPIRED": return 400;
    case "INVALID_REQUEST": return 400;
    case "SUCCESS": return 200;
    default: return 500;
  }
}

function handleControllerError(err: unknown, req: Request, next: NextFunction, label: string): void {
  const error = err instanceof Error ? err : new Error(String(err));
  const log = req.logger || logger;
  log.error(`Device ${label} Error`, { message: error.message });
  next(error);
}

function handleValidationError(err: unknown, req: Request, res: Response): boolean {
  if (err instanceof AppError && err.status === 400) {
    const log = req.logger || logger;
    log.error("Device Validation Error", { message: err.message });
    res.status(400).json({ error: "invalid_request", error_description: err.message });
    return true;
  }
  return false;
}

export function createDeviceControllers(deviceService = new DeviceService()) {
  return {
    authorization: {
      handle: async (req: Request, res: Response, next: NextFunction) => {
        try {
          validateOrThrow(deviceAuthorizationSchema, req.body);
          const result = await deviceService.authorization(req);
          sendApiResponse(res, mapAuthActionToStatus(result.action), result);
        } catch (err) {
          if (handleValidationError(err, req, res)) return;
          handleControllerError(err, req, next, "Authorization");
        }
      },
    },
    verification: {
      handle: async (req: Request, res: Response, next: NextFunction) => {
        try {
          const { userCode } = validateOrThrow(deviceVerificationSchema, req.body);
          const result = await deviceService.verification(userCode);
          sendApiResponse(res, mapVerificationActionToStatus(result.action), result);
        } catch (err) {
          if (handleValidationError(err, req, res)) return;
          handleControllerError(err, req, next, "Verification");
        }
      },
    },
    complete: {
      handle: async (req: Request, res: Response, next: NextFunction) => {
        try {
          const { userCode, result, subject } = validateOrThrow(deviceCompleteSchema, req.body);
          const apiResult = await deviceService.complete(userCode, result, subject);
          sendApiResponse(res, mapCompleteActionToStatus(apiResult.action), apiResult);
        } catch (err) {
          if (handleValidationError(err, req, res)) return;
          handleControllerError(err, req, next, "Complete");
        }
      },
    },
  };
}

const defaultControllers = createDeviceControllers();
export const deviceAuthorizationController = defaultControllers.authorization;
export const deviceVerificationController = defaultControllers.verification;
export const deviceCompleteController = defaultControllers.complete;
