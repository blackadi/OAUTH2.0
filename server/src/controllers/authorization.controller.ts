import { NextFunction, Request, Response } from "express";
import { Scope } from "@authlete/typescript-sdk/models";
import { AuthorizationService } from "../services/authorization.service";
import { appConfig } from "../config/app.config";
import { validateAuthorizationParams } from "../utils/validate";
import { sendAuthorizationFailResponse } from "./authorization-fail-response.handler";

import session from "express-session";
import logger from "../utils/logger";
import consentStore from "../services/consent-store.service";

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
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.redirect(result.responseContent ?? "");

        case "FORM":
          res.setHeader("Content-Type", "text/html;charset=UTF-8");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(200).send(result.responseContent);

        case "NO_INTERACTION":
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.redirect(result.responseContent ?? "");

        case "INTERACTION": {
          const prompt = req.query.prompt as string | undefined;

          // Parse properties from the original authorization request
          const rawProperties = req.method === "GET" ? req.query.properties : req.body.properties;
          let storedProperties: Array<{ key?: string; value?: string; hidden?: boolean }> | undefined;
          if (rawProperties) {
            if (typeof rawProperties === 'string') {
              try { storedProperties = JSON.parse(rawProperties as string); } 
              catch { storedProperties = undefined; }
            } else {
              storedProperties = rawProperties as Array<{ key?: string; value?: string; hidden?: boolean }>;
            }
          }

          const redirectUri = (params.redirect_uri as string) || "";

          req.session.authorization = {
            resultMessage: result.resultMessage ?? "",
            clientId: result.client?.clientId ?? 0,
            clientName: result.client?.clientName ?? "",
            prompt,
            redirectUri,
            authorizationIssueRequest: {
              ticket: result.ticket ?? "",
              scopes:
                result.scopes?.map((scope: Scope) => scope.name as string) ??
                [],
              subject: req.session.user ?? "",
              authorizationDetails: result.authorizationDetails,
              claims: result.idTokenClaims,
              ...(storedProperties ? { properties: storedProperties } : {}),
            },
            nativeSsoRequested: result.nativeSsoRequested ?? false,
          };

          // If prompt=none and user is logged in, check persistent consent
          if (prompt === "none" && req.session.user) {
            const clientId = result.client?.clientId
            const subject = req.session.user
            const requiredScopes = result.scopes?.map((s: Scope) => s.name as string) || []
            if (
              clientId &&
              consentStore.isConsentGranted(clientId, subject, requiredScopes)
            ) {
              req.logger("prompt=none with valid consent, auto-issuing", {
                clientId,
                subject,
              })
              const issueResponse = await authorizationService.issue(req)
              delete req.session.authorization
              res.setHeader("Cache-Control", "no-store");
              res.setHeader("Pragma", "no-cache");
              return res.redirect(issueResponse.responseContent ?? "")
            }
            // No valid consent — respond with error per OIDC spec
            req.logger("prompt=none but no valid consent", { clientId, subject })
            const failResponse = await authorizationService.fail(
              result.ticket ?? "",
              "CONSENT_REQUIRED"
            )
            delete req.session.authorization
            return sendAuthorizationFailResponse(res, failResponse)
          }

          const currentQueryParams = req.query;
          const searchParams = new URLSearchParams(
            currentQueryParams as Record<string, string>
          );
          const newUrl = `${appConfig.loginUrl}?${searchParams.toString()}`;
          req.logger("Redirecting to login", { url: newUrl });
          return res.redirect(newUrl);
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
