import { NextFunction, Request, Response } from "express";
import { LoginService } from "../services/login.service";
import session from "express-session";
import { appConfig } from "../config/app.config";
import { AuthorizationService } from "../services/authorization.service";
import logger from "../utils/logger";
import { AppError } from "../utils/app-error";
import { sendAuthorizationIssueResponse } from "./authorization-response.handler";
import { sendAuthorizationFailResponse } from "./authorization-fail-response.handler";
import { checkStepUpRequirements } from "../utils/step-up";
import { validateOrThrow, loginSchema } from "../utils/validation";
import consentStore from "../services/consent-store.service";
import { claimsFromScopes, claimLabel } from "../utils/scope-claims";
import { SERVED_CLAIMS } from "../utils/demo-claims";
import { AUTHORIZATION_REDIRECT_STATUS } from "../utils/http-utils";

const loginAttempts = new Map<string, { count: number; banUntil: number }>()
const MAX_LOGIN_ATTEMPTS = 5
const BAN_DURATION_MS = 60_000

function checkBruteForce(ip: string): void {
  const record = loginAttempts.get(ip)
  if (record && Date.now() < record.banUntil) {
    throw new AppError("Too many login attempts. Try again later.", 429)
  }
  if (record && Date.now() >= record.banUntil) {
    loginAttempts.delete(ip)
  }
}

function recordFailedAttempt(ip: string): void {
  const record = loginAttempts.get(ip) || { count: 0, banUntil: 0 }
  record.count++
  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    record.banUntil = Date.now() + BAN_DURATION_MS
  }
  loginAttempts.set(ip, record)
}

function clearAttempts(ip: string): void {
  loginAttempts.delete(ip)
}

// `login.ejs` reads `clientName` as a bare reference, so a render site that omits it throws a
// ReferenceError and the sign-in page becomes a 500 — which is exactly what happened to the
// credentials-rejected branch below. One builder, used by both render sites, is what keeps them in step.
// `csrfToken` is deliberately absent: `middleware/csrf.ts` rotates it on POST and puts the new value on
// `res.locals`, so the re-rendered form already carries a token that will validate.
function loginViewLocals(
  authz: session.SessionData["authorization"],
  overrides: { username?: string; password?: string; error?: string } = {}
) {
  return {
    username: "",
    password: "",
    error: "",
    clientName: authz?.clientName || "",
    clientId: authz?.clientId || "",
    ...overrides,
  };
}

export function createSessionController(
  loginServiceInstance = new LoginService(),
  authorizationServiceInstance = new AuthorizationService(),
) {
  return {
  showLogin: (
    req: Request & { session: Partial<session.SessionData> },
    res: Response
  ) => {
    const authz = req.session.authorization;
    res.render("login", loginViewLocals(authz));
  },

  handleLogin: async (
    req: Request & { session: Partial<session.SessionData> },
    res: Response,
    next: NextFunction
  ) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown"
      checkBruteForce(ip)

      // Must have ticket from OAuth2 authorization request
      const authz = req.session.authorization;
      if (!authz || !authz.authorizationIssueRequest?.ticket) {
        return next(new AppError("Missing authorization context - session not found", 401));
      }

      const loginDecision = req.body.login; // "submit" or "cancel"
      if (loginDecision === "cancel") {
        const log = req.logger || logger;
        log.info("Login canceled for ticket", {
          ticket: authz?.authorizationIssueRequest?.ticket,
        });
        // `DENIED`, not `NOT_LOGGED_IN`. RFC 6749 §4.1.2.1 gives `access_denied` for *"The resource
        // owner or authorization server denied the request"*, and pressing Cancel on a login screen the
        // user was shown is precisely that. `NOT_LOGGED_IN` was here until 2026-09-01 and produced
        // `login_required`, which tells the RP to retry with interaction — so a client would loop rather
        // than learn the user refused. Its canned description made that worse by asserting something
        // untrue about the request: *"[A060301] The authorization request contains prompt=none, but no
        // end-user has logged in this service."*
        //
        // Measured against service 2147478188, four fresh tickets, because the vendored spec documents
        // the `action` values but not this mapping:
        //
        //   DENIED           -> access_denied     [A060306] The end-user denied the authorization request.
        //   NOT_LOGGED_IN    -> login_required    [A060301] ...contains prompt=none...
        //   CONSENT_REQUIRED -> consent_required  [A060311] ...cannot obtain consent...
        //   ACCESS_DENIED    -> server_error      [A060201] ...does not contain 'reason'
        //
        // `ACCESS_DENIED` is a trap: it is the *CIBA* fail API's value, and this API treats it as a
        // missing `reason` rather than rejecting it.
        //
        // `NOT_LOGGED_IN` remains correct in `authorization.service.ts`'s `decideWithoutInteraction` —
        // there the user genuinely is not logged in and `prompt=none` forbids asking, which is what OIDC
        // Core §3.1.2.6's `login_required` exists for. Do not unify the two.
        const response = await authorizationServiceInstance.fail(
          authz?.authorizationIssueRequest?.ticket ?? "",
          "DENIED"
        );
        req.logger.info("Login fail response", {
          content: response.responseContent,
        });
        return sendAuthorizationFailResponse(res, response);
      }

      const { username, password } = validateOrThrow(loginSchema, req.body);

      const user = await loginServiceInstance.validateUser(username, password);
      if (!user) {
        recordFailedAttempt(ip)
        return res.render("login", loginViewLocals(authz, {
          username,
          error: "Invalid username or password",
        }));
      }

      clearAttempts(ip)

      // Save user subject in session (used as the Authlete subject parameter)
      req.session.user = user.subject;

      // RFC 9470: Record authentication time and ACR for step-up checks.
      // For this demo server, password authentication satisfies ACR "pwd".
      const authTimeNow = Math.floor(Date.now() / 1000);
      const satisfiedAcr = "pwd";

      // Store authTime in session so subsequent authorizations can check maxAge
      if (req.session.authorization) {
        req.session.authorization.authTime = authTimeNow;
      }

      // RFC 9470 §4 / OIDC Core §3.1.2.1 — the same check the non-interactive `prompt=none` path runs, from
      // the same function (`utils/step-up.ts`), so the two cannot drift. The authentication event here is the
      // one that just happened, which is why `max_age` passes by construction on this path: the End-User has
      // actively re-authenticated, and that satisfies any maximum age. The place `max_age` can genuinely fail
      // is `authorization.controller.ts`'s `decideWithoutInteraction`, where nobody re-authenticated.
      const stepUpFailure = checkStepUpRequirements(
        { acrs: authz?.acrs, acrEssential: authz?.acrEssential, maxAge: authz?.maxAge },
        { acr: satisfiedAcr, authTime: authTimeNow },
        authTimeNow
      );
      if (stepUpFailure) {
        req.logger.info("RFC 9470: step-up requirements not satisfied at login", {
          reason: stepUpFailure,
          requested: authz?.acrs,
          satisfied: satisfiedAcr,
          maxAge: authz?.maxAge,
        });
        const failResponse = await authorizationServiceInstance.fail(
          authz?.authorizationIssueRequest?.ticket ?? "",
          stepUpFailure
        );
        delete req.session.authorization;
        return sendAuthorizationFailResponse(res, failResponse);
      }

      // RFC 9470: Bind authentication context to the session so
      // authorization.service.issue() can pass it to Authlete.
      req.session.stepUp = {
        acr: satisfiedAcr,
        authTime: authTimeNow,
      };

      // Check if persistent consent covers the requested scopes
      const requiredScopes = authz?.authorizationIssueRequest?.scopes || [];
      const clientId = authz?.clientId;
      const prompt = authz?.prompt;

      if (
        clientId &&
        prompt !== "consent" &&
        consentStore.isConsentGranted(clientId, user.subject, requiredScopes)
      ) {
        req.logger.info("Persistent consent found, auto-approving", {
          clientId,
          subject: user.subject,
          scopes: requiredScopes,
        });
        const response = await authorizationServiceInstance.issue(req);
        delete req.session.authorization;
        return sendAuthorizationIssueResponse(res, response);
      }

      // After login, show consent page
      const scopes = authz?.authorizationIssueRequest?.scopes?.join(",") || "";
      req.logger.info("consent scopes", { scopes });
      return res.redirect(
        AUTHORIZATION_REDIRECT_STATUS,
        appConfig.consentUrl +
          "?clientId=" +
          authz?.clientId +
          "&clientName=" +
          authz?.clientName +
          "&scopes=" +
          scopes
      );
    } catch (err) {
      next(err);
    }
  },

  showConsent: (
    req: Request & { session: Partial<session.SessionData> },
    res: Response,
    next: NextFunction
  ) => {
    // Show the consent UI
    if (!req.session.user || !req.session.authorization) {
      return next(new AppError("Unauthorized - no ticket in session", 403));
    }
    const { clientName = "", redirectUri = "", authorizationIssueRequest: { scopes = [], authorizationDetails } = {} } =
      req.session.authorization || {};

    /**
     * Derive claim names from scopes per OIDC Core 1.0 §5.4, then **keep only the ones this
     * deployment can actually issue.**
     *
     * `claimsFromScopes` is a faithful §5.4 mapping and stays one — `profile` really does expand to
     * fourteen claims. But this server produces ten of them, so rendering the raw expansion asked the
     * user to share a `birthdate`, `gender` and `address` that no response has ever contained. On a
     * server people learn from, a consent screen that overstates what is disclosed teaches the wrong
     * thing; and once `supportedClaims` was trimmed to the truth (2026-09-01), Authlete would refuse
     * those names anyway, so the checkbox could not have meant anything.
     *
     * Filtering here rather than in `scope-claims.ts` keeps the spec mapping and the deployment's
     * capability as separate facts — this is the point where the question is "what can we actually
     * give away".
     */
    const claimNames = claimsFromScopes(scopes as string[])
      .filter((name) => (SERVED_CLAIMS as readonly string[]).includes(name));
    const claims = claimNames.map(name => ({ name, label: claimLabel(name) }));

    res.render("consent", { clientName, scopes, redirectUri, authorizationDetails, claims });
  },

  handleConsent: async (
    req: Request & { session: Partial<session.SessionData> },
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!req.session.user || !req.session.authorization) {
        return next(new AppError("Unauthorized - no ticket in session", 403));
      }

      const decision = req.body.decision; // "approve" or "deny"
      const ticket =
        req.session.authorization.authorizationIssueRequest?.ticket;

      // Capture claim-level consent from form checkboxes
      const consentedClaimsRaw = req.body.consentedClaims;
      const consentedClaims: string[] | undefined = Array.isArray(consentedClaimsRaw)
        ? consentedClaimsRaw
        : consentedClaimsRaw
          ? [consentedClaimsRaw]
          : undefined;
      if (consentedClaims) {
        req.session.authorization.consentedClaims = consentedClaims;
      }

      if (decision === "approve") {
        // Call Authlete /authorization/issue API
        const log = req.logger || logger;
        log.info("Issuing authorization", {
          ticket,
          user: req.session.user,
          clientId: req.session.authorization.clientId,
          scopes: req.session.authorization.authorizationIssueRequest?.scopes,
          clientName: req.session.authorization.clientName,
        });
        const response = await authorizationServiceInstance.issue(req);
        log.info("Authorization issue response", { response });

        // Store persistent consent
        const subject = req.session.user
        const clientId = req.session.authorization.clientId
        const scopes = req.session.authorization.authorizationIssueRequest?.scopes || []
        if (subject && clientId) {
          consentStore.storeConsent(clientId, subject, scopes)
        }

        // Clear session authorization info before sending result
        delete req.session.authorization;

        // Delegate response handling to the shared helper so the
        // same action handling logic is used as in the dedicated
        // authorization-response controller.
        return sendAuthorizationIssueResponse(res, response);
      } else {
        // Call Authlete /authorization/fail API.
        //
        // `DENIED`, not `CONSENT_REQUIRED` — same rule as the Cancel branch above, and the same reason
        // it was wrong: `consent_required` means *"I would have to ask the user and cannot"*, which is
        // the `prompt=none` situation. Here the user **was** asked, on this screen, and pressed Deny.
        // RFC 6749 §4.1.2.1 makes that `access_denied`. Changed 2026-09-01; see the measured mapping
        // table in the Cancel branch.
        const response = await authorizationServiceInstance.fail(
          ticket ?? "",
          "DENIED"
        ); // https://docs.authlete.com/en/shared/latest#post-/api/-serviceId-/auth/authorization

        req.logger.info("Authorization fail response", {
          content: response.responseContent,
        });
        delete req.session.authorization;
        return sendAuthorizationFailResponse(res, response);
      }
    } catch (err) {
      // Pass all errors to the error handler middleware
      next(err);
    }
  },
};
}

const defaultController = createSessionController();
export const sessionController = defaultController;
