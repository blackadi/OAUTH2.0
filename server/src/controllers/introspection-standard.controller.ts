import { NextFunction, Request, Response } from "express";
import { IntrospectionService } from "../services/introspection.service";
import logger from "../utils/logger";

const introspectionService = new IntrospectionService();

//Process OAuth 2.0 Introspection Request
export const introspectionStandardController = {
  handleIntrospectionStandard: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await introspectionService.standardProcess(req);

      switch (result.action) {
        case "BAD_REQUEST":
          res.setHeader("Content-Type", "application/json")
          return res.status(400).send(result.responseContent ?? "");

        case "INTERNAL_SERVER_ERROR":
          res.setHeader("Content-Type", "application/json")
          return res.status(500).send(result.responseContent ?? "");

        case "OK":
          res.setHeader("Content-Type", "application/json");
          return res.send(result.responseContent);

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
