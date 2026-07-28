import { NextFunction, Request, RequestHandler, Response } from "express";
import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId as defaultServiceId } from "../services/authlete.service";
import { setDpopNonce } from "../utils/dpop";
import logger from "../utils/logger";

/**
 * Object-level authorization for the Grant Management API.
 *
 * Authlete's /gm API validates the access token (signature, expiry, scope) but does NOT check that the
 * grant being addressed belongs to the caller, and its response carries no owner information — so the
 * ownership decision cannot be made after the fact. This middleware therefore introspects the bearer
 * token *before* the grant-management call and requires the grant the token was itself issued under to
 * match the grant in the URL.
 *
 * Without this, any holder of a `grant_management_revoke` token could enumerate grant IDs and read or
 * destroy every other user's grant. That was verified end to end: one user's token deleted another's.
 *
 * Note this is deliberately stricter than Grant Management for OAuth 2.0, which entitles a *client* to
 * manage grants it owns using any suitably-scoped token. A client-credentials token has no grant, so it
 * is denied — machine-to-machine grant management is not supported by design.
 */

export type GrantManagementScope = "grant_management_query" | "grant_management_revoke";

/** Bearer-only, matching the Grant Management API's own contract. */
export function extractBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice(7).trim() || undefined;
  }
  return undefined;
}

export function requireGrantOwnership(
  requiredScope: GrantManagementScope,
  deps: { authleteApi?: Authlete; serviceId?: string } = {}
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const api = deps.authleteApi ?? defaultApi;
    const svcId = deps.serviceId ?? defaultServiceId;
    const log = req.logger || logger;

    const grantId = req.params.grantId;
    if (!grantId) {
      res.status(400).json({ error: "invalid_request", error_description: "Missing grantId" });
      return;
    }

    const token = extractBearerToken(req);
    if (!token) {
      res.setHeader(
        "WWW-Authenticate",
        `Bearer error="invalid_token", error_description="An access token is required", scope="${requiredScope}"`
      );
      res.status(401).json({ error: "invalid_token", error_description: "Access token is invalid or expired" });
      return;
    }

    // Ask Authlete to enforce the scope too, so an insufficiently-scoped token gets a proper
    // `insufficient_scope` challenge rather than a bare 401 from the grant-management endpoint.
    const introspectionRequest: Record<string, unknown> = { token, scopes: [requiredScope] };

    // UNVERIFIED: no DPoP-bound grant-management token exists on this deployment to test against.
    const dpop = req.headers["dpop"];
    if (typeof dpop === "string" && dpop) {
      introspectionRequest.dpop = dpop;
      introspectionRequest.htm = req.method;
      introspectionRequest.htu = `${req.protocol}://${req.get("host") ?? ""}${req.originalUrl}`;
    }

    let result;
    try {
      result = await api.introspection.process({
        serviceId: svcId,
        introspectionRequest: introspectionRequest as never,
      });
    } catch (err) {
      // Fail closed: an introspection failure must never fall through to the grant-management call.
      next(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    setDpopNonce(res, result?.dpopNonce);

    switch (result?.action) {
      case "OK":
        break;
      case "UNAUTHORIZED":
        if (result.responseContent) res.setHeader("WWW-Authenticate", result.responseContent);
        res.status(401).json({ error: "invalid_token", error_description: "Access token is invalid or expired" });
        return;
      case "FORBIDDEN":
        if (result.responseContent) res.setHeader("WWW-Authenticate", result.responseContent);
        res.status(403).json({
          error: "access_denied",
          error_description: "The access token does not permit this grant management operation",
        });
        return;
      case "BAD_REQUEST":
        log.error("Grant ownership check: introspection rejected the request", { grantId });
        res.status(400).json({ error: "invalid_request" });
        return;
      default:
        log.error("Grant ownership check: unusable introspection response", { grantId, action: result?.action });
        res.status(500).json({ error: "server_error" });
        return;
    }

    // The ownership decision. A token with no grant (client credentials) and a token bound to a different
    // grant get an identical response, so a caller cannot tell the two apart.
    if (!result.grantId || result.grantId !== grantId) {
      log.error("Grant ownership denied", {
        requestedGrantId: grantId,
        tokenIsGrantBound: Boolean(result.grantId),
        subject: result.subject,
        clientId: result.clientId,
      });
      res.status(403).json({
        error: "access_denied",
        error_description: "The access token is not associated with the requested grant",
      });
      return;
    }

    next();
  };
}
