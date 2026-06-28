import { Request, Response, NextFunction } from "express";
import { HealthService } from "../services/health.service";

const healthService = new HealthService();

export const healthController = {
  serverHealth: (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  },

  authleteHealth: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const extended = req.query.extended === "true";
      const result = await healthService.checkAuthlete(extended);
      res.status(result.healthy ? 200 : 502).json(result);
    } catch (error) {
      next(error);
    }
  },

  overallHealth: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await healthService.checkOverall();
      res.status(result.status === "ok" ? 200 : 503).json(result);
    } catch (error) {
      next(error);
    }
  },
};
