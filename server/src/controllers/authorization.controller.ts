import { NextFunction, Request, Response } from "express";
import { Scope } from "@authlete/typescript-sdk/models";
import { AuthorizationService } from "../services/authorization.service";
import { appConfig } from "../config/app.config";
import { validateAuthorizationParams } from "../utils/validate";

import session from "express-session";
import logger from "../utils/logger";

const authorizationService = new AuthorizationService();

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
          return res.redirect(result.responseContent ?? "");

        case "FORM":
          res.setHeader("Content-Type", "text/html;charset=UTF-8");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(200).send(result.responseContent);

        case "NO_INTERACTION":
          return res.redirect(result.responseContent ?? "");

        case "INTERACTION":
          req.session.authorization = {
            resultMessage: result.resultMessage ?? "",
            clientId: result.client?.clientId ?? 0,
            clientName: result.client?.clientName ?? "",
            authorizationIssueRequest: {
              ticket: result.ticket ?? "",
              scopes:
                result.scopes?.map((scope: Scope) => scope.name as string) ??
                [],
              subject: req.session.user ?? "",
              authorizationDetails: result.authorizationDetails,
              claims: result.idTokenClaims,
            },
          };
          const currentQueryParams = req.query;
          const searchParams = new URLSearchParams(
            currentQueryParams as Record<string, string>
          );
          const newUrl = `${appConfig.loginUrl}?${searchParams.toString()}`;
          req.logger("Redirecting to login", { url: newUrl });
          return res.redirect(newUrl);

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
