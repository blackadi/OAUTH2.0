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
import { validateOrThrow, loginSchema, otpSchema } from "../utils/validation";
import consentStore from "../services/consent-store.service";
import { claimsFromScopes, claimLabel } from "../utils/scope-claims";
import { SERVED_CLAIMS } from "../utils/demo-claims";
import { AUTHORIZATION_REDIRECT_STATUS } from "../utils/http-utils";

const loginAttempts = new Map<string, { count: number; banUntil: number }>()
const MAX_LOGIN_ATTEMPTS = 5
const BAN_DURATION_MS = 60_000

/**
 * RFC 9470 second-factor ACR this deployment can now actually satisfy, via a real (if toy-scope) TOTP
 * step — see `docs/investigations/toy-otp-feasibility.md`. Deliberately distinct from `"mfa"`, which stays
 * registered-but-unreachable so Module 09a's essential-ACR-refusal lab keeps teaching what it teaches
 * (`docs/curriculum/modules/09a-interaction-extensions/lab.md`).
 */
const OTP_ACR = "otp"

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
  /**
   * The shared tail of authenticating — record `authTime`/`acr`, run `checkStepUpRequirements`, bind
   * `session.stepUp`, then either auto-issue (persistent consent) or redirect to consent. Extracted so
   * the password-only path and the OTP-success path (below) cannot drift: before this, only the
   * password path existed and always asserted `acr: "pwd"`; now `acr` is a parameter, and it is the ONLY
   * thing that differs between a login that needed a second factor and one that didn't.
   *
   * Callers must have already decided the authentication event genuinely happened with this `acr` at
   * this `authTimeNow` — this function does not re-derive either. `req.session.user` is set here, not
   * before; see `handleLogin`'s OTP-gate comment for why that ordering is the point.
   */
  const finishAuthentication = async (
    req: Request & { session: Partial<session.SessionData> },
    res: Response,
    authz: session.SessionData["authorization"],
    subject: string,
    acr: string,
    authTimeNow: number
  ) => {
    req.session.user = subject;

    // Store authTime in session so subsequent authorizations can check maxAge
    if (req.session.authorization) {
      req.session.authorization.authTime = authTimeNow;
    }

    // RFC 9470 §4 / OIDC Core §3.1.2.1 — the same check the non-interactive `prompt=none` path runs, from
    // the same function (`utils/step-up.ts`), so the two cannot drift. The authentication event here is the
    // one that just completed (password alone, or password + a second factor), which is why `max_age`
    // passes by construction on this path: the End-User has actively (re-)authenticated just now. The place
    // `max_age` can genuinely fail is `authorization.controller.ts`'s `decideWithoutInteraction`, where
    // nobody re-authenticated.
    const stepUpFailure = checkStepUpRequirements(
      { acrs: authz?.acrs, acrEssential: authz?.acrEssential, maxAge: authz?.maxAge },
      { acr, authTime: authTimeNow },
      authTimeNow
    );
    if (stepUpFailure) {
      req.logger.info("RFC 9470: step-up requirements not satisfied at login", {
        reason: stepUpFailure,
        requested: authz?.acrs,
        satisfied: acr,
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
      acr,
      authTime: authTimeNow,
    };

    // Check if persistent consent covers the requested scopes
    const requiredScopes = authz?.authorizationIssueRequest?.scopes || [];
    const clientId = authz?.clientId;
    const prompt = authz?.prompt;

    if (
      clientId &&
      prompt !== "consent" &&
      consentStore.isConsentGranted(clientId, subject, requiredScopes)
    ) {
      req.logger.info("Persistent consent found, auto-approving", {
        clientId,
        subject,
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
  };

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

      // RFC 9470: if the authorization request named the OTP ACR as essential, the password alone does
      // not finish authenticating — hold the subject in a PENDING state and route to the OTP step,
      // rather than the password-only tail below. This is checked, and `req.session.user` stays unset,
      // BEFORE anything else: `req.session.user` is what gates `/session/consent` and
      // `AuthorizationService.issue()` (`authorization.service.ts:87`), so setting it here and sorting
      // out the second factor afterwards would let it be skipped by simply never entering a code.
      if (authz?.acrEssential && (authz?.acrs ?? []).includes(OTP_ACR)) {
        req.session.otpPending = { subject: user.subject };
        delete req.session.user;
        req.logger.info("RFC 9470: essential OTP ACR requested, routing to second factor", {
          clientId: authz?.clientId,
          subject: user.subject,
        });
        return res.redirect(AUTHORIZATION_REDIRECT_STATUS, appConfig.otpUrl);
      }

      // RFC 9470: for this demo server, password authentication alone satisfies ACR "pwd".
      return finishAuthentication(req, res, authz, user.subject, "pwd", Math.floor(Date.now() / 1000));
    } catch (err) {
      next(err);
    }
  },

  showOtp: (
    req: Request & { session: Partial<session.SessionData> },
    res: Response,
    next: NextFunction
  ) => {
    if (!req.session.otpPending) {
      return next(new AppError("No pending second factor - session not found", 401));
    }
    const { secret, otpauthUri } = loginServiceInstance.otpEnrollmentInfo();
    res.render("otp", { error: "", secret, otpauthUri });
  },

  handleOtp: async (
    req: Request & { session: Partial<session.SessionData> },
    res: Response,
    next: NextFunction
  ) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown"
      checkBruteForce(ip)

      const pending = req.session.otpPending;
      const authz = req.session.authorization;
      if (!pending || !authz || !authz.authorizationIssueRequest?.ticket) {
        return next(new AppError("No pending second factor - session not found", 401));
      }

      const otpDecision = req.body.otp; // "submit" or "cancel"
      if (otpDecision === "cancel") {
        const log = req.logger || logger;
        log.info("OTP step canceled for ticket", {
          ticket: authz.authorizationIssueRequest?.ticket,
        });
        // Same DENIED semantics as Cancel on the login screen — see the long comment on that branch
        // above for why DENIED (not NOT_LOGGED_IN) is the correct RFC 6749 §4.1.2.1 mapping for a user
        // refusing on a screen they were actually shown.
        const response = await authorizationServiceInstance.fail(
          authz.authorizationIssueRequest?.ticket ?? "",
          "DENIED"
        );
        delete req.session.otpPending;
        delete req.session.authorization;
        req.logger.info("OTP fail response", { content: response.responseContent });
        return sendAuthorizationFailResponse(res, response);
      }

      const { code } = validateOrThrow(otpSchema, req.body);
      const { secret, otpauthUri } = loginServiceInstance.otpEnrollmentInfo();

      if (!loginServiceInstance.verifyOtp(code)) {
        recordFailedAttempt(ip)
        return res.render("otp", { error: "Invalid code", secret, otpauthUri });
      }

      clearAttempts(ip)
      const subject = pending.subject;
      delete req.session.otpPending;

      return finishAuthentication(req, res, authz, subject, OTP_ACR, Math.floor(Date.now() / 1000));
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
