import { NextFunction, Request, Response } from "express";
import { DiscoveryService } from "../services/discovery.service";
import logger from "../utils/logger";

const discoveryService = new DiscoveryService();

export const discoveryController = {
   handleDiscovery: async (req: Request, res: Response, next: NextFunction) =>{
    try {

      const result = await discoveryService.getConfiguration(req);

      res.status(200).send(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("Discovery Response Error", { message: error.message });
      return next(error);
    }
  }
}
