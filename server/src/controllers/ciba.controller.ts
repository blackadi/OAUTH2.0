import { NextFunction, Request, Response } from "express";
import { CibaService } from "../services/ciba.service";
import logger from "../utils/logger";

const cibaService = new CibaService();

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
    case "INVALID_TICKET": return 500;
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

function sendResponse(res: Response, status: number, result: any): void {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.status(status).json(result);
}

export const cibaAuthenticationController = {
  handle: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await cibaService.process(req);
      const status = mapAuthActionToStatus(result.action);
      sendResponse(res, status, result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("CIBA Authentication Error", { message: error.message });
      return next(error);
    }
  },
};

export const cibaIssueController = {
  handle: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ticket } = req.body as { ticket?: string };
      if (!ticket) {
        return res.status(400).json({ error: "invalid_request", error_description: "Missing required field: ticket" });
      }
      const result = await cibaService.issue(ticket);
      const status = mapIssueActionToStatus(result.action);
      sendResponse(res, status, result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("CIBA Issue Error", { message: error.message });
      return next(error);
    }
  },
};

export const cibaFailController = {
  handle: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ticket, reason } = req.body as { ticket?: string; reason?: string };
      if (!ticket) {
        return res.status(400).json({ error: "invalid_request", error_description: "Missing required field: ticket" });
      }
      if (!reason) {
        return res.status(400).json({ error: "invalid_request", error_description: "Missing required field: reason" });
      }
      const result = await cibaService.fail(ticket, reason);
      const status = mapFailActionToStatus(result.action);
      sendResponse(res, status, result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("CIBA Fail Error", { message: error.message });
      return next(error);
    }
  },
};

export const cibaCompleteController = {
  handle: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ticket, result, subject } = req.body as {
        ticket?: string;
        result?: string;
        subject?: string;
      };
      if (!ticket) {
        return res.status(400).json({ error: "invalid_request", error_description: "Missing required field: ticket" });
      }
      if (!result) {
        return res.status(400).json({ error: "invalid_request", error_description: "Missing required field: result" });
      }
      if (!subject) {
        return res.status(400).json({ error: "invalid_request", error_description: "Missing required field: subject" });
      }
      const apiResult = await cibaService.complete(ticket, result, subject);
      const status = mapCompleteActionToStatus(apiResult.action);
      sendResponse(res, status, apiResult);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("CIBA Complete Error", { message: error.message });
      return next(error);
    }
  },
};
