import { NextFunction, Request, Response } from "express";
import { IntrospectionService } from "../services/introspection.service";
import logger from "../utils/logger";
import { validateIntrospectionParams } from "../utils/validate";
import { setDpopNonce } from "../utils/dpop";

const introspectionService = new IntrospectionService();

/**
 * RFC 9470: Parse a WWW-Authenticate Bearer error string from Authlete
 * into structured fields. Authlete returns strings like:
 *   Bearer error="insufficient_user_authentication",
 *     error_description="...",
 *     acr_values="acrX acrY"
 * or:
 *   Bearer error="insufficient_user_authentication",
 *     error_description="...",
 *     max_age="600"
 */
function parseBearerError(responseContent: string): {
  error?: string;
  error_description?: string;
  acr_values?: string;
  max_age?: string;
} {
  const result: Record<string, string> = {};
  const pairs = responseContent.replace(/^Bearer\s+/i, "").split(/,\s*/);
  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const key = pair.slice(0, eqIdx).trim();
    const val = pair.slice(eqIdx + 1).replace(/^"|"$/g, "").trim();
    result[key] = val;
  }
  return result;
}

export const introspectionController = {
  handleIntrospection: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validationError = validateIntrospectionParams(
        req.body as Record<string, unknown>
      );
      if (validationError) {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Pragma", "no-cache");
        return res.status(400).json({
          error: "invalid_request",
          error_description: validationError,
        });
      }
      const result = await introspectionService.process(req);

      // DPoP nonce — relay to client if Authlete returned one
      setDpopNonce(res, result.dpopNonce);

      switch (result.action) {
        case "BAD_REQUEST":
          res.setHeader("WWW-Authenticate", result.responseContent ?? "");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(400).send(result.responseContent ?? "");

        case "UNAUTHORIZED":
          res.setHeader("WWW-Authenticate", result.responseContent ?? "");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(401).send(result.responseContent ?? "");

        case "INTERNAL_SERVER_ERROR":
          res.setHeader("WWW-Authenticate", result.responseContent ?? "");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(500).send(result.responseContent ?? "");

        case "FORBIDDEN": {
          res.setHeader("WWW-Authenticate", result.responseContent ?? "");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");

          // RFC 9470: Parse the responseContent to detect step-up auth challenges.
          // Authlete returns insufficient_user_authentication with acr_values or max_age
          // so the client knows how to re-authorize.
          if (result.responseContent?.includes("insufficient_user_authentication")) {
            const parsed = parseBearerError(result.responseContent);
            return res.status(403).json({
              error: parsed.error || "insufficient_user_authentication",
              error_description: parsed.error_description || "",
              error_uri: result.responseContent.match(/error_uri="([^"]+)"/)?.[1] || "",
              // RFC 9470 parameters — the client uses these to re-authorize
              ...(parsed.acr_values ? { acr_values: parsed.acr_values } : {}),
              ...(parsed.max_age ? { max_age: parsed.max_age } : {}),
              // Also include the token metadata Authlete returned
              acr: result.acr,
              auth_time: result.authTime,
            });
          }

          // Non-step-up FORBIDDEN (e.g. insufficient_scope)
          return res.status(403).send(result.responseContent);
        }

        case "OK":
          res.setHeader("Content-Type", "application/json");
          return res.json(result);

        default: {
          const log = req.logger || logger;
          log.error("Unknown introspection action", { action: result.action });
          return res.status(500).send("Unknown introspection action from Authlete /introspection");
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("Introspection Response Error", { message: error.message });
      return next(error);
    }
  }
};
