import { Request, Response } from "express";
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

  authleteHealth: async (req: Request, res: Response) => {
    const extended = req.query.extended === "true";
    const result = await healthService.checkAuthlete(extended);
    res.status(result.healthy ? 200 : 502).json(result);
  },
};
