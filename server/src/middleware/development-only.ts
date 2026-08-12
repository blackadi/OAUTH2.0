import { NextFunction, Request, Response } from "express";
import { server } from "../config/app.config";

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
