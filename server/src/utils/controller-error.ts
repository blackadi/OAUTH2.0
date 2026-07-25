import { NextFunction, Request, Response } from "express";
import logger from "../utils/logger";
import { AppError } from "./app-error";

export function handleControllerError(
  err: unknown,
  req: Request,
  res: Response | undefined,
  next: NextFunction,
  label: string,
): void {
  if (err instanceof AppError && err.status === 400) {
    const log = req.logger || logger;
    log.error(`${label} Validation Error`, { message: err.message });
    if (res) {
      res.status(400).json({ error: "invalid_request", error_description: err.message });
      return;
    }
  }
  const error = err instanceof Error ? err : new Error(String(err));
  const log = req.logger || logger;
  log.error(`${label} Response Error`, { message: error.message });
  next(error);
}
