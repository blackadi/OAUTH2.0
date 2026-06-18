import { NextFunction, Request, Response } from "express";
import { IntrospectionService } from "../services/introspection.service";
import logger from "../utils/logger";
import { validateIntrospectionParams } from "../utils/validate";

const introspectionService = new IntrospectionService();

export const introspectionController = {
  handleIntrospection: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validationError = validateIntrospectionParams(
        req.body as Record<string, unknown>
      );
      if (validationError) {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Pragma", "no-cache");
        return res.status(400).json({
          error: "invalid_request",
          error_description: validationError,
        });
      }
      const result = await introspectionService.process(req);

      switch (result.action) {
        case "BAD_REQUEST":
          res.setHeader("WWW-Authenticate", result.responseContent ?? "");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(400).send(result.responseContent ?? "");

        case "UNAUTHORIZED":
          res.setHeader("WWW-Authenticate", result.responseContent ?? "");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(401).send(result.responseContent ?? "");

        case "INTERNAL_SERVER_ERROR":
          res.setHeader("WWW-Authenticate", result.responseContent ?? "");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(500).send(result.responseContent ?? "");

        case "FORBIDDEN":
          res.setHeader("WWW-Authenticate", result.responseContent ?? "");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(403).send(result.responseContent);

        case "OK":
          res.setHeader("Content-Type", "application/json");
          return res.json(result);

        default:
          req.logger?.error("Unknown introspection action", { action: result.action });
          logger.error("Unknown introspection action from Authlete /introspection", { action: result.action });
          return res.status(500).send("Unknown introspection action from Authlete /introspection");
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Introspection Response Error", { message: error.message });
      return next(error);
    }
  }
};
