import { NextFunction, Request, Response } from "express";
import { IntrospectionService } from "../services/introspection.service";
import logger from "../utils/logger";
import { validateIntrospectionParams } from "../utils/validate";
import { setDpopNonce } from "../utils/dpop";
import { requireBasicAuth } from "../middleware/require-basic-auth";

const introspectionService = new IntrospectionService();

/**
 * RFC 7662 §2.1: *"the endpoint MUST also require some form of authorization to access this endpoint, such
 * as client authentication… or a separate OAuth 2.0 access token"*.
 *
 * **The credential here is this deployment's admin Basic auth, not per-client authentication**, and the
 * reason is worth recording. Nothing in this server can validate a client secret on its own — only Authlete
 * can — so "client authentication" would mean forwarding the credentials and relying on Authlete's
 * `/auth/introspection/standard` to reject bad ones. **Whether it does is `UNVERIFIED`**, and the evidence
 * points the other way: credentials were optional on this path and their absence was never an error. A check
 * that demands a credential nothing validates looks like protection and provides none, which is worse than
 * an honest admin gate.
 *
 * `requireBasicAuth` **fails closed**: with `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` unset, every request is
 * rejected rather than allowed through.
 *
 * The gate runs **before** any Authlete call, so a rejected caller learns nothing about the token — which is
 * the whole point of §2.1's anti-token-scanning rationale.
 *
 * Both endpoints use one realm deliberately: they are the same resource under two wire formats, and the
 * proprietary one at `/api/introspection` is the *richer* oracle — it also discloses the RFC 9470 `acr`,
 * `auth_time` and step-up challenge assembled below.
 */
const checkAuth = requireBasicAuth("introspection");

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

  // 9470-W6. This used to be `split(/,\s*/)`, which splits on EVERY comma — including the ones inside a
  // quoted value. RFC 9110 §11.2 gives auth-params as comma-separated `token "=" ( token / quoted-string )`,
  // and a comma is perfectly legal inside the quoted form. So an Authlete challenge carrying
  //
  //     error_description="Authentication is insufficient, re-authenticate"
  //
  // was cut in half: the client received "Authentication is insufficient and the rest became a stray
  // parameter. On this path that text is the whole point — RFC 9470 step-up tells the client *why* it must
  // re-authenticate — so a truncated description is a broken feature, not cosmetics.
  //
  // Scan instead of split: track whether we are inside quotes, and only treat a comma as a separator when
  // we are not. Backslash escapes inside a quoted-string are honoured per §5.6.4.
  const src = responseContent.replace(/^Bearer\s+/i, "");
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes && ch === "\\" && i + 1 < src.length) {
      current += src[i + 1];
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (ch === "," && !inQuotes) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);

  for (const pair of parts) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const key = pair.slice(0, eqIdx).trim();
    const val = pair.slice(eqIdx + 1).trim().replace(/^"|"$/g, "");
    if (key) result[key] = val;
  }
  return result;
}

export const introspectionController = {
  handleIntrospection: async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Authorise before validating: an unauthenticated caller must not be able to distinguish
      // "malformed request" from "no such token" — both are reconnaissance.
      if (!checkAuth(req, res)) return;

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
