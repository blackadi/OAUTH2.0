import { NextFunction, Request, Response } from "express";
import { VciService } from "../services/vci.service";
import { requireBasicAuth } from "../middleware/require-basic-auth";
import { handleControllerError } from "../utils/controller-error";
import { extractAccessToken } from "../utils/dpop";
import { sendSpecBody } from "../utils/http-utils";

const checkAuth = requireBasicAuth("vci");

/**
 * The credential endpoints are protected resources, so token presentation goes through the shared extractor
 * (`utils/dpop.ts`) rather than a fourth hand-rolled `startsWith("Bearer ")`. That gains them the `DPoP`
 * scheme (RFC 9449 §7.1 — the only conformant way to present a bound token) and case-insensitive scheme
 * matching (RFC 9110 §11.1), both of which this endpoint refused before 2026-08-13.
 *
 * The `accessToken` body fallback below is kept and is unaffected: it is a JSON field, so it cannot collide
 * with RFC 6750 §2.2's form-encoded `access_token`, which is what the shared extractor guards against.
 */
function extractBearerToken(req: Request): string | null {
  return extractAccessToken(req)?.token ?? null;
}

/**
 * Relay Authlete's token-presentation failure as a challenge, not as a vendor envelope (T1-11).
 *
 * `/vci/deferred/parse`'s `responseContent` on `UNAUTHORIZED` is a `WWW-Authenticate` value — confirmed live:
 * `Bearer error="invalid_token", error_description="[A375304] The access token does not exist."` — so it
 * belongs in the header per RFC 6750 §3, which is where `userinfo.controller.ts` already puts the identical
 * shape. The body carries the OAuth-shaped error so a client that reads bodies is not left guessing, and
 * `resultMessage` rides along because it names the specific Authlete condition, which is this repo's
 * pedagogical value. `action`/`resultCode` are dropped: they are vendor control flow, not the client's.
 */
function sendChallenge(
  res: Response,
  status: number,
  result: { responseContent?: string | null; resultMessage?: string }
): void {
  if (typeof result.responseContent === "string" && result.responseContent !== "") {
    res.setHeader("WWW-Authenticate", result.responseContent);
  }
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({
    error: status === 401 ? "invalid_token" : "invalid_request",
    error_description: result.resultMessage ?? "The deferred credential request was refused.",
  });
}

function statusForAction(action: string | undefined, mapping: Record<string, number>, fallback = 500): number {
  if (action && mapping[action] !== undefined) return mapping[action];
  return fallback;
}

const DISCOVERY_MAP: Record<string, number> = {
  OK: 200,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
};

const OFFER_CREATE_MAP: Record<string, number> = {
  CREATED: 201,
  FORBIDDEN: 403,
  CALLER_ERROR: 400,
  AUTHLETE_ERROR: 500,
};

const OFFER_INFO_MAP: Record<string, number> = {
  OK: 200,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CALLER_ERROR: 400,
  AUTHLETE_ERROR: 500,
};

const SINGLE_ISSUE_MAP: Record<string, number> = {
  OK: 200,
  ACCEPTED: 202,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INTERNAL_SERVER_ERROR: 500,
  CALLER_ERROR: 400,
};

const BATCH_ISSUE_MAP: Record<string, number> = {
  OK: 200,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INTERNAL_SERVER_ERROR: 500,
  CALLER_ERROR: 400,
};

const DEFERRED_ISSUE_MAP: Record<string, number> = {
  OK: 200,
  FORBIDDEN: 403,
  INTERNAL_SERVER_ERROR: 500,
  CALLER_ERROR: 400,
};

/**
 * `/vci/deferred/parse`'s actions. `UNAUTHORIZED` is the one that matters: it is how Authlete reports a bad
 * or absent access token on the deferred path, and until 2026-08-13 nothing here could receive it because
 * the API was never called. See `VciService.parseDeferred`.
 */
const DEFERRED_PARSE_MAP: Record<string, number> = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INTERNAL_SERVER_ERROR: 500,
};

/**
 * Which members of `CredentialIssuanceOrder` a caller may set on a deferred *retrieval*, as an allowlist so
 * the next field the SDK adds cannot be forwarded by default — the same reasoning as `jar.controller.ts`'s
 * `EXPOSED_FIELDS`, in the opposite direction.
 *
 * `requestIdentifier` is absent deliberately: it is server-derived, from `parse`. So is `transactionId`,
 * which is not an order member at all — it is this endpoint's input and becomes the `requestContent`.
 * `issuanceDeferred` is absent because re-deferring a request the caller is currently retrieving is not a
 * meaningful instruction.
 */
const CALLER_SETTABLE_ORDER_FIELDS = ["credentialPayload", "credentialDuration", "signingKeyId"] as const;

function sendDiscoverResponse(res: Response, response: any, _label: string): void {
  if (response.responseContent) {
    try {
      const parsed = JSON.parse(response.responseContent);
      return void res.status(200).json(parsed);
    } catch {
      return void res.status(200).send(response.responseContent);
    }
  }
  return void res.status(200).json(response);
}

export function createVciControllers(serviceInstance = new VciService()) {
  return {
    metadata: {
      handleMetadata: async (req: Request, res: Response, next: NextFunction) => {
        try {
          const result = await serviceInstance.getMetadata(true);
          const status = statusForAction(result.action, DISCOVERY_MAP);
          if (status !== 200) {
            return void res.status(status).json(result);
          }
          sendDiscoverResponse(res, result, "Metadata");
        } catch (err) {
          handleControllerError(err, req, res, next, "Metadata");
        }
      },
    },
    jwtIssuer: {
      handleJwtIssuer: async (req: Request, res: Response, next: NextFunction) => {
        try {
          const result = await serviceInstance.getJwtIssuer(true);
          const status = statusForAction(result.action, DISCOVERY_MAP);
          if (status !== 200) {
            return void res.status(status).json(result);
          }
          sendDiscoverResponse(res, result, "JwtIssuer");
        } catch (err) {
          handleControllerError(err, req, res, next, "JwtIssuer");
        }
      },
    },
    jwks: {
      handleJwks: async (req: Request, res: Response, next: NextFunction) => {
        try {
          const result = await serviceInstance.getJwks(true);
          const status = statusForAction(result.action, DISCOVERY_MAP);
          if (status !== 200) {
            return void res.status(status).json(result);
          }
          sendDiscoverResponse(res, result, "Jwks");
        } catch (err) {
          handleControllerError(err, req, res, next, "Jwks");
        }
      },
    },
    offer: {
      handleCreateOffer: async (req: Request, res: Response, next: NextFunction) => {
        try {
          if (!checkAuth(req, res)) return;
          const result = await serviceInstance.createOffer(req);
          const status = statusForAction(result.action, OFFER_CREATE_MAP);
          res.status(status).json(result);
        } catch (err) {
          handleControllerError(err, req, res, next, "CreateOffer");
        }
      },
      handleGetOfferInfo: async (req: Request, res: Response, next: NextFunction) => {
        try {
          if (!checkAuth(req, res)) return;
          const { identifier } = req.body as { identifier?: string };
          const result = await serviceInstance.getOfferInfo(identifier || "");
          const status = statusForAction(result.action, OFFER_INFO_MAP);
          res.status(status).json(result);
        } catch (err) {
          handleControllerError(err, req, res, next, "GetOfferInfo");
        }
      },
    },
    credential: {
      handleIssueSingle: async (req: Request, res: Response, next: NextFunction) => {
        try {
          const bearerToken = extractBearerToken(req);
          const { accessToken: bodyToken, order } = req.body as { accessToken?: string; order?: any };
          const accessToken = bearerToken || bodyToken;
          if (!accessToken) {
            res.status(401).json({ error: "invalid_token", error_description: "Access token is required. Provide via Authorization: Bearer header or accessToken field in body." });
            return;
          }
          const result = await serviceInstance.issueSingle(accessToken, order);
          const status = statusForAction(result.action, SINGLE_ISSUE_MAP);
          res.status(status).json(result);
        } catch (err) {
          handleControllerError(err, req, res, next, "IssueSingle");
        }
      },
      handleBatchIssue: async (req: Request, res: Response, next: NextFunction) => {
        try {
          const bearerToken = extractBearerToken(req);
          const { accessToken: bodyToken, credential_requests, orders } = req.body as {
            accessToken?: string;
            credential_requests?: any[];
            orders?: any[];
          };
          const accessToken = bearerToken || bodyToken;
          if (!accessToken) {
            res.status(401).json({ error: "invalid_token", error_description: "Access token is required. Provide via Authorization: Bearer header or accessToken field in body." });
            return;
          }
          let ordersParam: any[];
          if (orders && Array.isArray(orders)) {
            ordersParam = orders;
          } else if (credential_requests && Array.isArray(credential_requests)) {
            // Convert OID4VCI §10 credential_requests format to Authlete CredentialIssuanceOrder format.
            // Each credential request is JSON-stringified into credentialPayload.
            ordersParam = credential_requests.map((req, i) => ({
              requestIdentifier: `cred-${i + 1}`,
              credentialPayload: JSON.stringify(req),
            }));
          } else {
            res.status(400).json({ error: "invalid_request", error_description: "Missing or invalid credential_requests (OID4VCI) or orders (Authlete format) array in body." });
            return;
          }
          const result = await serviceInstance.batchIssue(accessToken, ordersParam);
          const status = statusForAction(result.action, BATCH_ISSUE_MAP);
          res.status(status).json(result);
        } catch (err) {
          handleControllerError(err, req, res, next, "BatchIssue");
        }
      },
      /**
       * OID4VCI §9's Deferred Credential Endpoint. **Two Authlete calls, and that is not incidental.**
       *
       * Until 2026-08-13 this handler collected no access token at all — it checked only that the body
       * carried an `order`, then called `/vci/deferred/issue`, whose request model has no `accessToken`
       * field. So a caller holding a `transactionId` (a handle, not a credential) reached issuance, and
       * neither this server nor Authlete had anything to authenticate. Its two siblings on this router both
       * answered `401` without a token; the asymmetry was the bug.
       *
       * The fix is `/vci/deferred/parse` first, which is the only Authlete API on this path that accepts a
       * token — see `VciService.parseDeferred` for why the siblings need no equivalent.
       *
       * Two rules to keep:
       *
       * 1. **`requestIdentifier` comes from `parse`, never from the body.** It names the credential request
       *    Authlete resolved from the *validated* `transaction_id`. Taking it from `req.body` would let a
       *    caller with any valid token name any pending request — the same server-determined-fields rule
       *    `introspection.service.ts` and `userinfo.service.ts` follow. The decorative members of
       *    `CredentialIssuanceOrder` (`credentialPayload` and friends) stay caller-supplied, matching what
       *    the two siblings already permit.
       * 2. **`transactionId` is required and `requestIdentifier` alone is refused.** A bare
       *    `requestIdentifier` is exactly the shape that used to bypass validation, and it carries no
       *    `transaction_id` to build a `requestContent` from, so there is nothing to validate against.
       *
       * UNVERIFIED: that Authlete accepts this `requestContent` and returns `info.identifier` on this
       * deployment. `verifiableCredentialsEnabled` is `false`, so `parse` answers `FORBIDDEN` before
       * reaching that logic; the shape is taken from the vendored 3.0.16 schema and §9.1's REQUIRED
       * `transaction_id`. Named next action: re-run this path if VCI is ever enabled.
       *
       * NOTE for T1-11: the request shape here is still Authlete's (`{ order: { transactionId } }`) rather
       * than §9.1's (`{ transaction_id }`), and the response is still the vendor envelope. That is the
       * wire-format batch's scope, deliberately not this change's — this endpoint is a fourth site for it,
       * alongside PAR, Device and DCR.
       */
      handleIssueDeferred: async (req: Request, res: Response, next: NextFunction) => {
        try {
          const bearerToken = extractBearerToken(req);
          const { accessToken: bodyToken, order } = req.body as { accessToken?: string; order?: any };
          const accessToken = bearerToken || bodyToken;
          if (!accessToken) {
            res.status(401).json({ error: "invalid_token", error_description: "Access token is required. Provide via Authorization: Bearer header or accessToken field in body." });
            return;
          }

          const transactionId = order?.transactionId;
          if (!transactionId) {
            res.status(400).json({ error: "invalid_request", error_description: "Missing order with transactionId for deferred credential retrieval." });
            return;
          }

          const parsed = await serviceInstance.parseDeferred(
            accessToken,
            JSON.stringify({ transaction_id: transactionId }),
          );
          const parseStatus = statusForAction(parsed.action, DEFERRED_PARSE_MAP);
          if (parseStatus !== 200) {
            // T1-11, and this one is not a JSON body. On `UNAUTHORIZED` Authlete's `responseContent` here is a
            // **`WWW-Authenticate` challenge string** — verified live: `Bearer error="invalid_token",
            // error_description="[A375304] The access token does not exist."` — not an object. RFC 6750 §3
            // puts that in the header, which is what `userinfo.controller.ts` already does with the same
            // shape, so it goes in the header and the body carries the OAuth-shaped error.
            sendChallenge(res, parseStatus, parsed);
            return;
          }

          const callerOrder: Record<string, unknown> = {};
          for (const key of CALLER_SETTABLE_ORDER_FIELDS) {
            if (order[key] !== undefined) callerOrder[key] = order[key];
          }
          const result = await serviceInstance.issueDeferred({
            ...callerOrder,
            requestIdentifier: parsed.info?.identifier,
          });
          // OID4VCI §9's credential response, not Authlete's envelope (T1-11).
          const status = statusForAction(result.action, DEFERRED_ISSUE_MAP);
          sendSpecBody(res, status, result);
        } catch (err) {
          handleControllerError(err, req, res, next, "IssueDeferred");
        }
      },
    },
  };
}

const defaultControllers = createVciControllers();
export const vciMetadataController = defaultControllers.metadata;
export const vciJwtIssuerController = defaultControllers.jwtIssuer;
export const vciJwksController = defaultControllers.jwks;
export const vciOfferController = defaultControllers.offer;
export const vciCredentialController = defaultControllers.credential;
export const serviceInstance = new VciService();
export { sendDiscoverResponse, DISCOVERY_MAP, statusForAction };
