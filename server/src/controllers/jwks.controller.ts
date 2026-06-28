import { Request, Response, NextFunction } from "express";
import { JwksService } from "../services/jwks.service";
import logger from "../utils/logger";

const jwksService = new JwksService();

export const jwksController = {
  handle: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await jwksService.serviceJwksGetApi();

      res.status(200).json(result ?? { keys: [] });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      // Authlete returns 204 when no JWKS keys are configured for the
      // service.  Treat this as an empty key set rather than an error.
      if ((err as any).statusCode === 204) {
        const log = req.logger || logger;
        log("JWKS: no keys configured, returning empty set");
        return res.status(200).json({ keys: [] });
      }
      const log = req.logger || logger;
      log.error("JWKS Response Error", { message: error.message });
      return next(error);
    }
  },
};
