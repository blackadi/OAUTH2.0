import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";
import { server } from "../config/app.config";
import { AppError } from "../utils/app-error";

/**
 * Derive an HTTP status from an arbitrary thrown object, trusting it only inside **400–599**.
 *
 * The clamp is the point. The Authlete SDK's `AuthleteError` subclasses — `ResponseValidationError` above
 * all — set `statusCode` from the HTTP response they were *reading*, not from a failure. When Authlete
 * answers `200` with a body the pinned SDK cannot parse (today: `supportedTokenAuthMethods` containing
 * `SPIFFE_JWT`, absent from SDK 1.0.0's strict `ClientAuthMethod` enum), `statusCode === 200`. Emitting
 * that verbatim turned every unparseable Authlete response into an HTTP **success** carrying an error
 * body — verified live 2026-08-10 against `service.get()`, which produced:
 *
 *     HTTP/1.1 200 OK
 *     {"error":"Bad Request","message":"Response validation failed", …}
 *
 * Monitors, load balancers and client libraries all read the status line, so the failure was silent. This
 * fires for any 2xx the SDK cannot parse, across all 57 call sites — not just the two FAPI endpoints.
 *
 * `status` is preferred over `statusCode`, matching the previous fallback order. Anything outside the
 * range — 2xx, 3xx, `NaN`, a non-integer — is not a usable error status and becomes 500.
 */
function errorStatusFrom(err: unknown): number {
  if (!err || typeof err !== "object") return 500;
  const candidate = err as Record<string, unknown>;
  for (const raw of [candidate.status, candidate.statusCode]) {
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed >= 400 && parsed <= 599) return parsed;
  }
  return 500;
}

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const log = req.logger || logger;

  // AppError is this repo's own type and carries deliberate statuses, so it is taken verbatim.
  const status = err instanceof AppError ? err.status : errorStatusFrom(err);

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
