import { NextFunction, Request, Response } from "express";
import { LoginService } from "../services/login.service";
import session from "express-session";
import { appConfig } from "../config/app.config";
import { AuthorizationService } from "../services/authorization.service";
import logger from "../utils/logger";
import { AppError } from "../utils/app-error";
import { sendAuthorizationIssueResponse } from "./authorization-response.handler";

const loginService = new LoginService();
const authorizationService = new AuthorizationService();

export const sessionController = {
  showLogin: (req: Request, res: Response) => {
    res.render("login", { username: "", password: "" });
  },

  handleLogin: async (
    req: Request & { session: Partial<session.SessionData> },
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { username, password } = req.body;

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
        const response = await authorizationService.fail(
          authz?.authorizationIssueRequest?.ticket ?? "",
          "NOT_LOGGED_IN"
        );
        req.logger("Login fail response", {
          content: response.responseContent,
        });
        return res.redirect(response.responseContent ?? "");
      }

      if (!username || !password) {
        return next(new AppError("Missing username or password", 400));
      }

      const user = await loginService.validateUser(username, password);
      if (!user) {
        return next(new AppError("Invalid username or password", 401));
      }

      // Save user subject in session (used as the Authlete subject parameter)
      req.session.user = user.subject;

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
    const { clientName = "", authorizationIssueRequest: { scopes = [] } = {} } =
      req.session.authorization || {};
    res.render("consent", { clientName, scopes });
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

      let resultUrl = "";

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
        const response = await authorizationService.issue(req);
        log("Authorization issue response", { response });

        // Clear session authorization info before sending result
        delete req.session.authorization;

        // Delegate response handling to the shared helper so the
        // same action handling logic is used as in the dedicated
        // authorization-response controller.
        return sendAuthorizationIssueResponse(res, response);
      } else {
        // Call Authlete /authorization/fail API
        const response = await authorizationService.fail(
          ticket ?? "",
          "CONSENT_REQUIRED"
        ); // https://docs.authlete.com/en/shared/latest#post-/api/-serviceId-/auth/authorization

        req.logger("Authorization fail response", {
          content: response.responseContent,
        });
        resultUrl = response.responseContent ?? ""; // Authelete returned redirect URI with error
      }

      // Clear session authorization info
      delete req.session.authorization;

      return res.redirect(resultUrl);
    } catch (err) {
      // Pass all errors to the error handler middleware
      next(err);
    }
  },
};
