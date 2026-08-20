import { NextFunction, Request, Response } from "express";
import { NativeSsoService } from "../services/native-sso.service";
import { sendApiResponse } from "../utils/http-utils";
import {
  validateOrThrow,
  nativeSsoProcessSchema,
  nativeSsoLogoutSchema,
} from "../utils/validation";
import { requireBasicAuth } from "../middleware/require-basic-auth";
import { handleControllerError } from "../utils/controller-error";

const checkAuth = requireBasicAuth("nativesso");

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

export function createNativeSsoControllers(serviceInstance = new NativeSsoService()) {
  return {
    process: {
      handle: async (req: Request, res: Response, next: NextFunction) => {
        try {
          if (!checkAuth(req, res)) return;
          validateOrThrow(nativeSsoProcessSchema, req.body);
          const result = await serviceInstance.process(req);
          sendApiResponse(res, mapProcessActionToStatus(result.action), result);
        } catch (err) {
          handleControllerError(err, req, res, next, "NativeSso Process");
        }
      },
    },
    logout: {
      handle: async (req: Request, res: Response, next: NextFunction) => {
        try {
          if (!checkAuth(req, res)) return;
          validateOrThrow(nativeSsoLogoutSchema, req.body);
          const result = await serviceInstance.logout(req);
          sendApiResponse(res, mapLogoutActionToStatus(result.action), result);
        } catch (err) {
          handleControllerError(err, req, res, next, "NativeSso Logout");
        }
      },
    },
  };
}

const defaultControllers = createNativeSsoControllers();
export const nativeSsoProcessController = defaultControllers.process;
export const nativeSsoLogoutController = defaultControllers.logout;
