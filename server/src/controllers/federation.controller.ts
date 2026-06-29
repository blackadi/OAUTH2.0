import { NextFunction, Request, Response } from "express";
import { FederationService } from "../services/federation.service";
import {
  validateOrThrow,
  federationRegistrationSchema,
} from "../utils/validation";
import logger from "../utils/logger";
import { AppError } from "../utils/app-error";

function requireBasicAuth(req: Request, res: Response): boolean {
  const mgmtClientId = process.env.MGMT_CLIENT_ID;
  const mgmtClientSecret = process.env.MGMT_CLIENT_SECRET;
  if (!mgmtClientId || !mgmtClientSecret) return true;

  const { authorization } = req.headers;
  if (!authorization?.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="federation"');
    res.status(401).json({ error: "invalid_client", error_description: "Client authentication required" });
    return false;
  }
  const credentials = Buffer.from(authorization.slice(6), "base64").toString("utf-8");
  const [id, secret] = credentials.split(":");
  if (id !== mgmtClientId || secret !== mgmtClientSecret) {
    res.setHeader("WWW-Authenticate", 'Basic realm="federation"');
    res.status(401).json({ error: "invalid_client", error_description: "Invalid client credentials" });
    return false;
  }
  return true;
}

function mapConfigurationActionToStatus(action?: string): number {
  switch (action) {
    case "OK": return 200;
    case "NOT_FOUND": return 404;
    case "INTERNAL_SERVER_ERROR": return 500;
    default: return 500;
  }
}

function mapRegistrationActionToStatus(action?: string): number {
  switch (action) {
    case "OK": return 200;
    case "BAD_REQUEST": return 400;
    case "NOT_FOUND": return 404;
    case "INTERNAL_SERVER_ERROR": return 500;
    default: return 500;
  }
}

function handleControllerError(err: unknown, req: Request, res: Response, next: NextFunction, label: string): void {
  if (err instanceof AppError && err.status === 400) {
    const log = req.logger || logger;
    log.error(`Federation ${label} Validation Error`, { message: err.message });
    res.status(400).json({ error: "invalid_request", error_description: err.message });
    return;
  }
  const error = err instanceof Error ? err : new Error(String(err));
  const log = req.logger || logger;
  log.error(`Federation ${label} Response Error`, { message: error.message });
  next(error);
}

export function createFederationControllers(serviceInstance = new FederationService()) {
  return {
    configuration: {
      handleConfiguration: async (req: Request, res: Response, next: NextFunction) => {
        try {
          const result = await serviceInstance.configuration(req);
          const status = mapConfigurationActionToStatus(result.action);

          if (status === 200) {
            res.setHeader("Content-Type", "application/entity-statement+jwt");
            return res.send(result.responseContent ?? "");
          }

          const body = result.responseContent
            ? { error: "federation_error", error_description: result.responseContent }
            : { error: "federation_error", error_description: "Entity configuration unavailable" };
          return res.status(status).json(body);
        } catch (err) {
          handleControllerError(err, req, res, next, "Configuration");
        }
      },
    },
    registration: {
      handleRegistration: async (req: Request, res: Response, next: NextFunction) => {
        try {
          if (!requireBasicAuth(req, res)) return;
          validateOrThrow(federationRegistrationSchema, req.body);
          const result = await serviceInstance.registration(req);
          const status = mapRegistrationActionToStatus(result.action);

          if (status === 200) {
            return res.status(200).json(result);
          }

          const body = result.responseContent
            ? { error: "federation_error", error_description: result.responseContent }
            : { error: "federation_error", error_description: "Federation registration failed" };
          return res.status(status).json(body);
        } catch (err) {
          handleControllerError(err, req, res, next, "Registration");
        }
      },
    },
  };
}

const defaultControllers = createFederationControllers();
export const federationConfigurationController = defaultControllers.configuration;
export const federationRegistrationController = defaultControllers.registration;
