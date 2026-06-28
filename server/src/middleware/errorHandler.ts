import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";
import { server } from "../config/app.config";
import { AppError } from "../utils/app-error";

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const log = req.logger || logger;

  const status = err instanceof AppError ? err.status
    : err && typeof err === "object"
    ? Number((err as Record<string, unknown>).status || (err as Record<string, unknown>).statusCode || 500)
    : 500;

  const message = err instanceof Error ? err.message : "Internal Server Error";
  const code = err instanceof AppError ? err.code : undefined;

  log.error("Unhandled error", {
    message,
    stack: err instanceof Error ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  const isDevelopment = server.nodeEnv === "development";
  const isApiRoute = req.path.startsWith("/api");

  if (!isApiRoute && req.accepts("html")) {
    res.status(status).render("error", {
      title: `Error ${status}`,
      message,
      status,
      path: req.path,
      details: isDevelopment && err instanceof Error ? err.stack : null,
    });
  } else {
    const errorType = status >= 500 ? "Internal Server Error"
      : status === 404 ? "Not Found"
      : status === 403 ? "Forbidden"
      : status === 401 ? "Unauthorized"
      : "Bad Request";
    res.status(status).json({
      error: errorType,
      ...(code && { error_code: code }),
      message,
      ...(isDevelopment && err instanceof Error && err.stack ? { stack: err.stack } : {}),
    });
  }
};
