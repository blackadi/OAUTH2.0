import { NextFunction, Request, Response } from "express";
import { DeviceService } from "../services/device.service";
import { sendApiResponse } from "../utils/http-utils";
import logger from "../utils/logger";

const deviceService = new DeviceService();

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

export const deviceAuthorizationController = {
  handle: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await deviceService.authorization(req);
      sendApiResponse(res, mapAuthActionToStatus(result.action), result);
    } catch (err) {
      handleControllerError(err, req, next, "Authorization");
    }
  },
};

export const deviceVerificationController = {
  handle: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userCode } = req.body as { userCode?: string };
      if (!userCode) {
        return res.status(400).json({ error: "invalid_request", error_description: "Missing required field: userCode" });
      }
      const result = await deviceService.verification(userCode);
      sendApiResponse(res, mapVerificationActionToStatus(result.action), result);
    } catch (err) {
      handleControllerError(err, req, next, "Verification");
    }
  },
};

export const deviceCompleteController = {
  handle: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userCode, result, subject } = req.body as {
        userCode?: string;
        result?: string;
        subject?: string;
      };
      if (!userCode) {
        return res.status(400).json({ error: "invalid_request", error_description: "Missing required field: userCode" });
      }
      if (!result) {
        return res.status(400).json({ error: "invalid_request", error_description: "Missing required field: result" });
      }
      if (!subject) {
        return res.status(400).json({ error: "invalid_request", error_description: "Missing required field: subject" });
      }
      const apiResult = await deviceService.complete(userCode, result, subject);
      sendApiResponse(res, mapCompleteActionToStatus(apiResult.action), apiResult);
    } catch (err) {
      handleControllerError(err, req, next, "Complete");
    }
  },
};
