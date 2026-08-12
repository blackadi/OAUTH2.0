import { NextFunction, Request, Response } from "express";
import { IntrospectionService } from "../services/introspection.service";
import logger from "../utils/logger";
import { requireBasicAuth } from "../middleware/require-basic-auth";

const introspectionService = new IntrospectionService();

/**
 * The RFC 7662 §2.1 authorisation gate. Same realm and same rationale as the proprietary endpoint — see the
 * long note in `introspection.controller.ts`, which explains why this is admin Basic auth rather than
 * per-client authentication, and what would have to be established before that could change.
 */
const checkAuth = requireBasicAuth("introspection");

//Process OAuth 2.0 Introspection Request
export const introspectionStandardController = {
  handleIntrospectionStandard: async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Before the Authlete call, so a rejected caller learns nothing about the token (§2.1, token scanning).
      if (!checkAuth(req, res)) return;

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

        default: {
          const log = req.logger || logger;
          log.error("Unknown introspection action", { action: result.action });
          return res.status(500).send("Unknown introspection action from Authlete /introspection");
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Introspection Response Error", { message: error.message });
      return next(error);
    }
  }
};
