import { NextFunction, Request, Response } from "express";
import { VciService } from "../services/vci.service";
import { requireBasicAuth } from "../middleware/require-basic-auth";
import { handleControllerError } from "../utils/controller-error";
import { extractAccessToken } from "../utils/dpop";

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
      handleIssueDeferred: async (req: Request, res: Response, next: NextFunction) => {
        try {
          const { order } = req.body as { order?: any };
          if (!order?.transactionId && !order?.requestIdentifier) {
            res.status(400).json({ error: "invalid_request", error_description: "Missing order with transactionId for deferred credential retrieval." });
            return;
          }
          const result = await serviceInstance.issueDeferred(order);
          const status = statusForAction(result.action, DEFERRED_ISSUE_MAP);
          res.status(status).json(result);
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
