import { NextFunction, Request, Response } from "express";
import { Scope } from "@authlete/typescript-sdk/models";
import { AuthorizationService } from "../services/authorization.service";
import { appConfig } from "../config/app.config";
import { validateAuthorizationParams } from "../utils/validate";
import { sendAuthorizationFailResponse } from "./authorization-fail-response.handler";

import session from "express-session";
import logger from "../utils/logger";
import consentStore from "../services/consent-store.service";
import { checkStepUpRequirements } from "../utils/step-up";
import type { AuthorizationResponse } from "@authlete/typescript-sdk/models";
import { AUTHORIZATION_REDIRECT_STATUS } from "../utils/http-utils";

const authorizationService = new AuthorizationService();

/**
 * Decide a request that must complete **without any user interaction**, then issue or fail.
 *
 * This is Authlete's documented contract for `action: NO_INTERACTION` — *"the service must follow the steps
 * described below"*: work out whether the request can be satisfied silently, then call
 * `/auth/authorization/issue` or `/auth/authorization/fail`. It is reached by `prompt=none`, which OIDC Core
 * §3.1.2.1 defines as *"the Authorization Server MUST NOT display any authentication or consent user
 * interface pages"* — and which must answer with a code or one of §3.1.2.6's four errors, never with
 * something the client cannot classify.
 *
 * **Until 2026-08-12 it did neither.** `NO_INTERACTION` was handled as `res.redirect(responseContent ?? "")`,
 * and `responseContent` is **null** for this action, so every silent-renewal request received a `302` with an
 * empty `Location`. The `prompt=none` logic that existed lived inside `case "INTERACTION"`, which such a
 * request never reaches — dead code that read as a feature. Worse, that dead code **invented an
 * authentication event** (`acr: "pwd"`, `auth_time: now`) whenever the session had none, so simply routing
 * `NO_INTERACTION` into it would have started attesting authentications this OP never observed.
 * See `audit/02-findings/OIDC-CORE-1.0.md` F-1 and `RFC9470-step-up-authentication.md` F-3.
 *
 * Nothing here invents anything. The authentication context is whatever the session recorded at login, and
 * when it recorded none, `checkStepUpRequirements` refuses any request that depends on it. A request that
 * depends on none is issued without `acr`/`auth_time` — Authlete simply does not stamp claims it was not
 * given, which is the honest outcome.
 */
/**
 * Build the authorization context the issue/fail calls read out of the session.
 *
 * Both `NO_INTERACTION` and `INTERACTION` need it — `authorization.service.issue()` takes the ticket, scopes,
 * claims and properties from here — so it is built once rather than in each branch. Before 2026-08-12 only
 * `INTERACTION` populated it, which is part of why `NO_INTERACTION` could not issue anything.
 */
function buildAuthorizationContext(
  req: Request & { session: Partial<session.SessionData> },
  result: AuthorizationResponse,
  params: Record<string, unknown>
): NonNullable<session.SessionData["authorization"]> {
  const prompt = req.query.prompt as string | undefined;

  const rawProperties = req.method === "GET" ? req.query.properties : req.body.properties;
  let storedProperties: Array<{ key?: string; value?: string; hidden?: boolean }> | undefined;
  if (rawProperties) {
    if (typeof rawProperties === "string") {
      try { storedProperties = JSON.parse(rawProperties as string); }
      catch { storedProperties = undefined; }
    } else {
      storedProperties = rawProperties as Array<{ key?: string; value?: string; hidden?: boolean }>;
    }
  }

  return {
    resultMessage: result.resultMessage ?? "",
    clientId: result.client?.clientId ?? 0,
    clientName: result.client?.clientName ?? "",
    prompt,
    redirectUri: (params.redirect_uri as string) || "",
    authorizationIssueRequest: {
      ticket: result.ticket ?? "",
      scopes: result.scopes?.map((scope: Scope) => scope.name as string) ?? [],
      subject: req.session.user ?? "",
      authorizationDetails: result.authorizationDetails,
      claims: result.idTokenClaims,
      ...(storedProperties ? { properties: storedProperties } : {}),
    },
    nativeSsoRequested: result.nativeSsoRequested ?? false,
    // RFC 9470: Store authentication requirements from Authlete
    acrs: result.acrs,
    acrEssential: result.acrEssential,
    maxAge: result.maxAge,
  };
}

async function decideWithoutInteraction(
  req: Request & { session: Partial<session.SessionData> },
  res: Response,
  result: AuthorizationResponse
) {
  const log = req.logger || logger;
  const ticket = result.ticket ?? "";
  const subject = req.session.user;
  const clientId = result.client?.clientId;
  const requiredScopes = result.scopes?.map((scope: Scope) => scope.name as string) ?? [];

  const fail = async (reason: "NOT_LOGGED_IN" | "CONSENT_REQUIRED" | "ACR_NOT_SATISFIED" | "EXCEEDS_MAX_AGE") => {
    log("prompt=none cannot be satisfied silently", { reason, clientId, hasSubject: !!subject });
    const failResponse = await authorizationService.fail(ticket, reason);
    delete req.session.authorization;
    return sendAuthorizationFailResponse(res, failResponse);
  };

  // §3.1.2.6 `login_required` — no End-User is authenticated here.
  if (!subject) return fail("NOT_LOGGED_IN");

  // §3.1.2.6 `consent_required` — we may not prompt, so only previously stored consent can carry it.
  if (!clientId || !consentStore.isConsentGranted(clientId, subject, requiredScopes)) {
    return fail("CONSENT_REQUIRED");
  }

  // RFC 9470. This is the only path where these can genuinely fail: on the login POST the End-User has just
  // actively authenticated, so any `max_age` is satisfied by construction. Here nobody re-authenticated.
  const stepUpFailure = checkStepUpRequirements(
    { acrs: result.acrs, acrEssential: result.acrEssential, maxAge: result.maxAge },
    req.session.stepUp ?? {},
    Math.floor(Date.now() / 1000)
  );
  if (stepUpFailure) return fail(stepUpFailure);

  log("prompt=none satisfied silently, issuing", { clientId, subject });
  const issueResponse = await authorizationService.issue(req);
  delete req.session.authorization;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  return res.redirect(AUTHORIZATION_REDIRECT_STATUS, issueResponse.responseContent ?? "");
}

export const authorizationController = {
  handleAuthorization: async (
    req: Request & { session: Partial<session.SessionData> },
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = req.method === "GET" ? req.query : req.body;
      const validationError = validateAuthorizationParams(
        params as Record<string, unknown>
      );
      if (validationError) {
        return res
          .status(400)
          .json({ error: "invalid_request", error_description: validationError });
      }
      const result = await authorizationService.process(req);

      switch (result.action) {
        case "BAD_REQUEST":
          return res.status(400).send(result.responseContent);

        case "INTERNAL_SERVER_ERROR":
          return res.status(500).send(result.responseContent);

        case "LOCATION":
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.redirect(AUTHORIZATION_REDIRECT_STATUS, result.responseContent ?? "");

        case "FORM":
          res.setHeader("Content-Type", "text/html;charset=UTF-8");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(200).send(result.responseContent);

        // Authlete answers `prompt=none` with this action, a ticket, and `responseContent: null`. It used to
        // be redirected to — emitting `Location:` empty — which is neither success nor one of OIDC Core
        // §3.1.2.6's four errors. It now decides, then issues or fails.
        case "NO_INTERACTION": {
          req.session.authorization = buildAuthorizationContext(req, result, params as Record<string, unknown>);
          return decideWithoutInteraction(req, res, result);
        }

        case "INTERACTION": {
          const prompt = req.query.prompt as string | undefined;

          req.session.authorization = buildAuthorizationContext(req, result, params as Record<string, unknown>);

          // `prompt=none` should arrive as NO_INTERACTION, not here — but if Authlete ever routes it this
          // way, it must not be answered by showing a login page, which is precisely what §3.1.2.1 forbids.
          // Delegating to the same decision keeps the two from drifting; it does not duplicate it.
          if (prompt === "none") {
            return decideWithoutInteraction(req, res, result);
          }

          const currentQueryParams = req.query;
          const searchParams = new URLSearchParams(
            currentQueryParams as Record<string, string>
          );
          const newUrl = `${appConfig.loginUrl}?${searchParams.toString()}`;
          req.logger("Redirecting to login", { url: newUrl });
          return res.redirect(AUTHORIZATION_REDIRECT_STATUS, newUrl);
        }

        default:
          return res.status(500).send("Unknown authorization action");
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Authorization controller error", { message: error.message });
      return next(error);
    }
  },
};
