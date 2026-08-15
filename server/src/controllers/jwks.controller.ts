import { Request, Response, NextFunction } from "express";
import { JwksService } from "../services/jwks.service";
import logger from "../utils/logger";

const jwksService = new JwksService();

/**
 * The service JWK Set, served at `jwks_uri`.
 *
 * **"No keys" is reported as a server fault, not as an empty document** (JOSE-W5, 2026-08-14). Authlete
 * answers `/service/jwks/get` with **204** when the service has no keys configured, and this controller used
 * to translate that into `200 {"keys":[]}` — a perfectly valid JWK Set meaning *"this OP publishes no keys"*.
 *
 * That is the wrong thing to tell a relying party, and the failure it causes is worse than an outage. An RP
 * that fetches an empty set caches it, then rejects **every** token this OP signs for an unknown `kid`. From
 * the RP's side that is indistinguishable from forged tokens; from ours it is a configuration fault reported
 * as a successful answer, invisible to any monitor watching status codes. A 5xx, by contrast, makes a
 * well-built RP retry and keep serving from its cached key set — which is exactly the behaviour you want
 * while somebody fixes the service.
 *
 * **The trade is deliberate**: a service that genuinely has zero keys now gets a 500 here rather than a
 * technically-valid empty document. That is the right default for an *OpenID Provider*, which cannot sign an
 * ID token without keys and so is not functional in that state anyway. This deployment has both an EC key
 * (`kid: "1"`) and an RSA key (`rsa-1`, registered by T1-2), so 204 means something broke.
 *
 * Same reasoning as `middleware/errorHandler.ts`'s `errorStatusFrom`, which maps a 204 to 500 for the
 * identical reason: a success status attached to a failure hides it from everything that watches statuses.
 */
export const jwksController = {
  handle: async (req: Request, res: Response, next: NextFunction) => {
    const log = req.logger || logger;
    try {
      const result = await jwksService.serviceJwksGetApi();

      // Two ways to arrive at "no keys": the SDK resolves with `undefined`/no `keys` member, or it throws
      // with statusCode 204 below. Both are the same fault and both are reported the same way.
      if (!result || !Array.isArray(result.keys)) {
        log.error("JWKS: Authlete returned no key set for this service", {
          hint: "service has no JWKs configured — ID token and JWT introspection signing are broken",
        });
        return next(new Error("JWKS unavailable: the service has no key set configured"));
      }

      res.status(200).json(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if ((err as { statusCode?: number }).statusCode === 204) {
        log.error("JWKS: Authlete answered 204 — no keys configured for this service", {
          hint: "service has no JWKs configured — ID token and JWT introspection signing are broken",
        });
        return next(new Error("JWKS unavailable: the service has no key set configured"));
      }
      log.error("JWKS Response Error", { message: error.message });
      return next(error);
    }
  },
};
