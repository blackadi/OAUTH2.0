import { Request, Response, NextFunction } from "express";

export function requestTimeout(ms: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({
          error: "gateway_timeout",
          message: `Request timed out after ${ms}ms`,
        });
      }
    }, ms);

    res.on("close", () => clearTimeout(timer));
    next();
  };
}
