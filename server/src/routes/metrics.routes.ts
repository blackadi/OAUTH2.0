import { Router, Request, Response, NextFunction } from "express";
import { getMetrics } from "../services/metrics.service";

const router = Router();

router.get("/metrics", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(await getMetrics());
  } catch (error) {
    next(error);
  }
});

export default router;
