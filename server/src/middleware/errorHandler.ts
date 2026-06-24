import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";
import { server } from "../config/app.config";

export const errorHandler = (
  err: Error | any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log error for debugging (use request-scoped logger when available)
  const log = req.logger || logger;
  log.error("Unhandled error", {
    message: err?.message || "Unknown error",
    stack: err?.stack,
    path: req.path,
    method: req.method,
  });

  // Extract status code (default to 500)
  const status = err?.status || err?.statusCode || 500;
  const message = err?.message || "Internal Server Error";
  const isDevelopment = server.nodeEnv === "development";

  const isApiRoute = req.path.startsWith("/api");

  // Always return JSON for API routes, otherwise check Accept header
  if (!isApiRoute && req.accepts("html")) {
    // Render error view for HTML requests
    res.status(status).render("error", {
      title: `Error ${status}`,
      message,
      details: isDevelopment ? err?.stack : null,
    });
  } else {
    // Respond with JSON for API requests — map status to appropriate error type
    const errorType = status >= 500 ? "Internal Server Error"
      : status === 404 ? "Not Found"
      : status === 403 ? "Forbidden"
      : status === 401 ? "Unauthorized"
      : "Bad Request";
    res.status(status).json({
      error: errorType,
      message,
      ...(isDevelopment && { stack: err?.stack }),
    });
  }
};
