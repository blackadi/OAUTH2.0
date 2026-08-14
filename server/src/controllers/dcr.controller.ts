import { NextFunction, Request, Response } from "express";
import { DcrService } from "../services/dcr.service";
import {
  validateOrThrow,
  dcrRegisterSchema,
  dcrGetSchema,
  dcrUpdateSchema,
  dcrDeleteSchema,
} from "../utils/validation";
import { requireBasicAuth } from "../middleware/require-basic-auth";
import { handleControllerError } from "../utils/controller-error";

function safeParseJSON(str: string): unknown {
  try { return JSON.parse(str); } catch { return str; }
}

/**
 * T1-11 / 7591-W1. This used to return `{ ...result, responseContent: <parsed> }` — Authlete's envelope with
 * the specification's body **nested inside it**. So an RFC 7591 client looking for `client_id` at the top
 * level found `action`, `resultCode` and `resultMessage` instead, and had to know to unwrap a vendor field
 * to reach the registration response §3.2.1 defines.
 *
 * The parsed content is now the body itself. `responseContent` is a JSON *string* on the wire, so it is
 * parsed and re-serialised by `res.json` rather than passed through — that costs a round trip through the
 * parser but keeps the DELETE/204 branch and the error branches on one code path.
 */

const checkAuth = requireBasicAuth("dcr");

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
  // The envelope is the fallback, not the norm: with no `responseContent` there is no spec-shaped body, and
  // Authlete's `resultMessage` is more use to the caller than an empty object.
  const body = result.responseContent ? safeParseJSON(result.responseContent) : result;
  return { status, body };
}

export function createDcrControllers(dcrServiceInstance = new DcrService()) {
  return {
    register: {
      handleDcrRegister: async (req: Request, res: Response, next: NextFunction) => {
        try {
          if (!checkAuth(req, res)) return;
          validateOrThrow(dcrRegisterSchema, req.body);
          const result = await dcrServiceInstance.register(req);
          const { status, body } = buildResponse(result);
          if (status === 204) return res.status(status).send();
          return res.status(status).json(body);
        } catch (err) {
          handleControllerError(err, req, res, next, "Register");
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
          handleControllerError(err, req, res, next, "Get");
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
          handleControllerError(err, req, res, next, "Update");
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
          handleControllerError(err, req, res, next, "Delete");
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
