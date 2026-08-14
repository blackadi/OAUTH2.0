import { NextFunction, Request, Response } from "express";
import { PushedAuthorizationResponseAction } from "@authlete/typescript-sdk/models";
import { ParService } from "../services/par.service";
import { sendSpecBody } from "../utils/http-utils";
import { validateOrThrow, parSchema } from "../utils/validation";
import logger from "../utils/logger";
import { AppError } from "../utils/app-error";
import { setDpopNonce } from "../utils/dpop";
import { hasDualChannelClientAuth } from "../utils/basic-auth";

function mapActionToStatus(action?: string): number {
  switch (action) {
    case PushedAuthorizationResponseAction.Created: return 201;
    case PushedAuthorizationResponseAction.BadRequest: return 400;
    case PushedAuthorizationResponseAction.Unauthorized: return 401;
    case PushedAuthorizationResponseAction.Forbidden: return 403;
    case PushedAuthorizationResponseAction.PayloadTooLarge: return 413;
    case PushedAuthorizationResponseAction.InternalServerError: return 500;
    default: return 500;
  }
}

export function createParControllers(parServiceInstance = new ParService()) {
  return {
    handle: async (req: Request, res: Response, next: NextFunction) => {
      try {
        validateOrThrow(parSchema, req.body);

        // RFC 6749 §2.3.1's single-method rule, which RFC 9126 §2 inherits by requiring the same
        // client authentication as the token endpoint. Enforced identically in `token.controller.ts`;
        // leaving one endpoint lenient would recreate the inconsistency this closes.
        if (hasDualChannelClientAuth(req.headers.authorization, req.body as Record<string, unknown>)) {
          throw new AppError(
            "Client credentials were presented both in the Authorization header and in the request body. RFC 6749 Section 2.3.1 permits only one authentication method per request.",
            400,
          );
        }

        const result = await parServiceInstance.process(req);
        // DPoP nonce — relay to client if Authlete returned one
        setDpopNonce(res, result.dpopNonce);
        // RFC 9126 §2.2's body, not Authlete's envelope (T1-11). A conforming client reads `request_uri`
        // and `expires_in`; it used to receive `requestUri` beside an `action` and a `resultCode`.
        sendSpecBody(res, mapActionToStatus(result.action), result);
      } catch (err) {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Pragma", "no-cache");
        if (err instanceof AppError && err.status === 400) {
          const log = req.logger || logger;
          log.error("PAR Validation Error", { message: err.message });
          return res.status(400).json({ error: "invalid_request", error_description: err.message });
        }
        const error = err instanceof Error ? err : new Error(String(err));
        const log = req.logger || logger;
        log.error("PAR Response Error", { message: error.message });
        const status = error instanceof AppError ? error.status : 500;
        if (status >= 400 && status < 500) {
          return res.status(status).json({ error: "invalid_request", error_description: error.message });
        }
        return next(error);
      }
    },
  };
}

const defaultControllers = createParControllers();
export const parController = defaultControllers;
