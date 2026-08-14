import { NextFunction, Request, Response } from "express";
import { server } from "../config/app.config";
import logger from "../utils/logger";

/**
 * Restrict a route to `NODE_ENV=development`, answering a flat **404** anywhere else.
 *
 * 404 rather than 401/403 on purpose: a deployed instance should not reveal that the endpoint exists. This
 * mirrors the guard `controllers/token.management.controller.ts:256` already applies to
 * `POST /api/token/createLocalToken`, so the repo has one way of saying "dev-only surface".
 *
 * Used for testing surfaces that would otherwise grant real authority. `POST /api/device/complete` is the
 * clearest case: it records approval of a pending device authorization **as any subject the caller names**, with
 * no authentication of that subject, so in production it is a token-minting oracle for anyone who can read a
 * user code off a screen (RFC 8628 §5.5). The authenticated path — `POST /device/consent`, which logs the user
 * in first — is unaffected and works in every environment.
 */
export function developmentOnly(req: Request, res: Response, next: NextFunction): void {
  if (server.nodeEnv !== "development") {
    res.status(404).json({ error: "not_found" });
    return;
  }
  next();
}

/**
 * Announce a development environment at startup, once, from `server.ts`.
 *
 * This exists because the opposite of this gate failed silently for months on a public deployment: `NODE_ENV`
 * was unset, `app.config.ts` defaulted it to `"development"`, and nothing anywhere said so. The endpoints
 * this module hides were reachable from the internet, and the only way to find out was to ask the running
 * service from outside. A deployment that has quietly chosen the permissive branch should say so in the first
 * lines of its log — the same reasoning as `warnIfManagementCredentialsMissing()`, which this sits beside.
 *
 * Not a `throw`: development is a legitimate mode, and refusing to boot would break every local workflow.
 */
export function warnIfDevelopmentEnvironment(): void {
  if (server.nodeEnv !== "development") return;
  logger.warn(
    "SECURITY: NODE_ENV=development. Development-only surfaces are REACHABLE — POST /api/device/complete " +
      "(approves a device authorization as any subject, unauthenticated) and GET /api/token/createLocalToken. " +
      "Stack traces are returned in error responses and HSTS is not sent. Set NODE_ENV=production to deploy."
  );
}
