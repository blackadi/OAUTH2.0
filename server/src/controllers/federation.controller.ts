import { NextFunction, Request, Response } from "express";
import { FederationService } from "../services/federation.service";
import {
  validateOrThrow,
  federationRegistrationSchema,
} from "../utils/validation";
import { requireBasicAuth } from "../middleware/require-basic-auth";
import { handleControllerError } from "../utils/controller-error";

const checkAuth = requireBasicAuth("federation");

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
          if (!checkAuth(req, res)) return;
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
