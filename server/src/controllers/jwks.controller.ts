import { Request, Response, NextFunction } from "express";
import { JwksService } from "../services/jwks.service";
import logger from "../utils/logger";

const jwksService = new JwksService();

export const jwksController = {
  handle: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await jwksService.serviceJwksGetApi();

      res.status(200).send(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("JWKS Response Error", { message: error.message });
      return next(error);
    }
  },
};
