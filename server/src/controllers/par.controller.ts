import { NextFunction, Request, Response } from "express";
import { PushedAuthorizationResponseAction } from "@authlete/typescript-sdk/models";
import { ParService } from "../services/par.service";
import { sendApiResponse } from "../utils/http-utils";
import { validateOrThrow, parSchema } from "../utils/validation";
import logger from "../utils/logger";
import { AppError } from "../utils/app-error";
import { setDpopNonce } from "../utils/dpop";

function mapActionToStatus(action?: string): number {
  switch (action) {
    case PushedAuthorizationResponseAction.Created: return 201;
    case PushedAuthorizationResponseAction.BadRequest: return 400;
    case PushedAuthorizationResponseAction.Unauthorized: return 401;
    case PushedAuthorizationResponseAction.Forbidden: return 403;
    case PushedAuthorizationResponseAction.PayloadTooLarge: return 413;
    case PushedAuthorizationResponseAction.InternalServerError: return 500;
    default: return 500;
  }
}

export function createParControllers(parServiceInstance = new ParService()) {
  return {
    handle: async (req: Request, res: Response, next: NextFunction) => {
      try {
        validateOrThrow(parSchema, req.body);
        const result = await parServiceInstance.process(req);
        // DPoP nonce — relay to client if Authlete returned one
        setDpopNonce(res, result.dpopNonce);
        sendApiResponse(res, mapActionToStatus(result.action), result);
      } catch (err) {
        if (err instanceof AppError && err.status === 400) {
          const log = req.logger || logger;
          log.error("PAR Validation Error", { message: err.message });
          return res.status(400).json({ error: "invalid_request", error_description: err.message });
        }
        const error = err instanceof Error ? err : new Error(String(err));
        const log = req.logger || logger;
        log.error("PAR Response Error", { message: error.message });
        const status = error instanceof AppError ? error.status : 500;
        if (status >= 400 && status < 500) {
          return res.status(status).json({ error: "invalid_request", error_description: error.message });
        }
        return next(error);
      }
    },
  };
}

const defaultControllers = createParControllers();
export const parController = defaultControllers;
