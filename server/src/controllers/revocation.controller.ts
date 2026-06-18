import { NextFunction, Request, Response } from "express";
import { RevocationService } from "../services/revocation.service";
import logger from "../utils/logger";

const revocationService = new RevocationService();

export const revocationController = {
  handleRevocation: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await revocationService.process(req);

      switch (result.action) {
        case "OK":
          // RFC 7009: revocation returns 200 with empty body (or responseContent)
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          if (result.responseContent) {
            res.setHeader("Content-Type", "application/json");
            return res.status(200).send(result.responseContent);
          }
          return res.status(200).end();

        case "BAD_REQUEST":
          // Invalid request e.g., malformed token / unsupported token type
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(400).send(result.responseContent ?? "");

        case "INVALID_CLIENT":
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          // If the client attempted HTTP Basic auth, return 401 with
          // WWW-Authenticate. Otherwise 400 is acceptable per RFC 7009.
          if (req.headers["authorization"]) {
            res.setHeader(
              "WWW-Authenticate",
              'Basic realm="token_revocation"',
            );
            return res.status(401).send(result.responseContent ?? "");
          }
          return res.status(400).send(result.responseContent ?? "");

        case "INTERNAL_SERVER_ERROR":
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(500).send(result.responseContent ?? "");

        default:
          // Authlete never returns undefined actions unless misconfigured
          req.logger?.error("Unknown revokation action", {
            action: result.action,
          });
          logger.error("Unknown revokation action", { action: result.action });
          return res.status(500).send(result);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      if (error.message === "Revocation request body is empty") {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Pragma", "no-cache");
        return res.status(400).json({ error: "invalid_request", error_description: "The revocation request body is empty." });
      }

      logger.error("Revocation Response Error", { message: error.message });
      return next(error);
    }
  },
};
