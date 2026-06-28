import { NextFunction, Request, Response } from "express";
import { LoginService } from "../services/login.service";
import session from "express-session";
import { appConfig } from "../config/app.config";
import { AuthorizationService } from "../services/authorization.service";
import logger from "../utils/logger";
import { AppError } from "../utils/app-error";
import { sendAuthorizationIssueResponse } from "./authorization-response.handler";
import { sendAuthorizationFailResponse } from "./authorization-fail-response.handler";
import { validateOrThrow, loginSchema } from "../utils/validation";
import consentStore from "../services/consent-store.service";

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
    res.render("login", {
      username: "",
      password: "",
      error: "",
      clientName: authz?.clientName || "",
      clientId: authz?.clientId || "",
    });
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
        log("Login canceled for ticket", {
          ticket: authz?.authorizationIssueRequest?.ticket,
        });
        const response = await authorizationServiceInstance.fail(
          authz?.authorizationIssueRequest?.ticket ?? "",
          "NOT_LOGGED_IN"
        );
        req.logger("Login fail response", {
          content: response.responseContent,
        });
        return sendAuthorizationFailResponse(res, response);
      }

      const { username, password } = validateOrThrow(loginSchema, req.body);

      const user = await loginServiceInstance.validateUser(username, password);
      if (!user) {
        recordFailedAttempt(ip)
        return res.render("login", {
          username,
          password: "",
          error: "Invalid username or password",
        });
      }

      clearAttempts(ip)

      // Save user subject in session (used as the Authlete subject parameter)
      req.session.user = user.subject;

      // Check if persistent consent covers the requested scopes
      const requiredScopes = authz?.authorizationIssueRequest?.scopes || [];
      const clientId = authz?.clientId;
      const prompt = authz?.prompt;

      if (
        clientId &&
        prompt !== "consent" &&
        consentStore.isConsentGranted(clientId, user.subject, requiredScopes)
      ) {
        req.logger("Persistent consent found, auto-approving", {
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
      req.logger("consent scopes", { scopes });
      return res.redirect(
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
    const { clientName = "", redirectUri = "", authorizationIssueRequest: { scopes = [] } = {} } =
      req.session.authorization || {};
    res.render("consent", { clientName, scopes, redirectUri });
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

      if (decision === "approve") {
        // Call Authlete /authorization/issue API
        const log = req.logger || logger;
        log("Issuing authorization", {
          ticket,
          user: req.session.user,
          clientId: req.session.authorization.clientId,
          scopes: req.session.authorization.authorizationIssueRequest?.scopes,
          clientName: req.session.authorization.clientName,
        });
        const response = await authorizationServiceInstance.issue(req);
        log("Authorization issue response", { response });

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
        // Call Authlete /authorization/fail API
        const response = await authorizationServiceInstance.fail(
          ticket ?? "",
          "CONSENT_REQUIRED"
        ); // https://docs.authlete.com/en/shared/latest#post-/api/-serviceId-/auth/authorization

        req.logger("Authorization fail response", {
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
