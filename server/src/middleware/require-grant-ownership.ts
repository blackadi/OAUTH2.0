import { NextFunction, Request, RequestHandler, Response } from "express";
import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId as defaultServiceId } from "../services/authlete.service";
import {
  authChallenge,
  dpopHttpTarget,
  extractAccessToken,
  isTokenPresentationError,
  setDpopNonce,
  TokenPresentationError,
} from "../utils/dpop";
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

/**
 * Answer a presentation the resource refuses locally. Authlete was never called, so the challenge is
 * built here — the same shape `userinfo.controller.ts` uses. RFC 6750 §3.1 wants no body and no error
 * code when the request carried no authentication information at all, which is why `code === null`
 * sends an empty response rather than a JSON error.
 */
function sendPresentationError(res: Response, err: TokenPresentationError): void {
  res.setHeader("WWW-Authenticate", authChallenge(err.schemes, err.code, err.description));
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  if (!err.code) {
    res.status(err.status).send();
    return;
  }
  res.status(err.status).json({ error: err.code, error_description: err.description });
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

    // Token presentation, per RFC 6750 §2 and RFC 9449 §7 — the same four cases
    // `userinfo.service.ts` handles, because this is the deployment's other protected resource.
    // All of them fail before any Authlete call.
    let presented;
    try {
      presented = extractAccessToken(req);
    } catch (err) {
      if (isTokenPresentationError(err)) return sendPresentationError(res, err);
      throw err;
    }

    const dpopHeader = req.headers["dpop"] as string | undefined;

    if (!presented) {
      // RFC 6750 §3.1: the request carried no authentication information, so the challenge names
      // the schemes and carries no error code. Both schemes are advertised (RFC 9449 §7.2).
      return sendPresentationError(res, new TokenPresentationError(401, null, null));
    }

    // RFC 9449 §7.1: a DPoP-bound token is presented with the `DPoP` scheme *and* a proof. The
    // scheme without a proof can never satisfy that, so refuse it rather than spend a round trip.
    if (presented.scheme === "dpop" && !dpopHeader) {
      return sendPresentationError(
        res,
        new TokenPresentationError(
          401,
          "invalid_dpop_proof",
          "The DPoP authentication scheme was used but no DPoP proof was provided in the DPoP header field.",
          ["dpop"],
        ),
      );
    }

    // RFC 9449 §7.2: a protected resource "MUST reject a DPoP-bound access token received as a
    // bearer token". Honouring the proof here would make `Bearer` a working route for bound tokens
    // — the downgrade §7.2 forbids — and dropping it silently would report "no DPoP header" to a
    // client that plainly sent one.
    if (presented.scheme === "bearer" && dpopHeader) {
      return sendPresentationError(
        res,
        new TokenPresentationError(
          400,
          "invalid_request",
          "A DPoP proof was provided with the Bearer authentication scheme. RFC 9449 Section 7.1 requires the DPoP scheme when presenting a DPoP proof.",
        ),
      );
    }

    const token = presented.token;

    // Ask Authlete to enforce the scope too, so an insufficiently-scoped token gets a proper
    // `insufficient_scope` challenge rather than a bare 401 from the grant-management endpoint.
    const introspectionRequest: Record<string, unknown> = { token, scopes: [requiredScope] };

    // Verified 2026-08-12: Authlete enforces the `cnf.jkt` binding here even when no proof is
    // forwarded (`[A065308]`), so this is a conformance path, not a fail-open one.
    if (presented.scheme === "dpop" && dpopHeader) {
      introspectionRequest.dpop = dpopHeader;
      introspectionRequest.htm = req.method;
      introspectionRequest.htu = dpopHttpTarget(req).htu;
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
