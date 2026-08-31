import {
  TokenCreateRequest,
  TokenCreateResponse,
  TokenUpdateRequest,
  TokenUpdateResponse,
} from "@authlete/typescript-sdk/models";
import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";
import { Request } from "express";
import logger from "../utils/logger";
import { AppError } from "../utils/app-error";
import {
  GrantType,
  IdtokenReissueResponse,
  TokenGetListResponse,
  TokenRevokeResponse,
} from "@authlete/typescript-sdk/models";
import createLocalJWT, { LocalJWTOptions } from "../utils/createLocalJWT";

export class TokenManagementService {
  constructor(private authleteApi: Authlete = defaultApi) {}

  /**
   * Resolve a caller-supplied grant type onto Authlete's `GrantType` enum, or refuse.
   *
   * **B1-W3. This used to end `|| "AUTHORIZATION_CODE"`, and that default was the defect.** `grantType` is
   * how Authlete records *what authorised a token*. Coercing an unrecognised — or entirely absent — value
   * onto authorization-code does not fail to answer the question; it answers it **wrongly**, and the token
   * carries that answer for its whole life. A typo in the admin UI minted a token whose provenance was a
   * fiction, with HTTP 200 and nothing in the log to say so. Absence is now refused, which is the same rule
   * `utils/step-up.ts` applies to an unknown `acr` and `middleware/require-basic-auth.ts` to unset
   * management credentials: **an absent value selects the safest behaviour, and for an assertion the safest
   * behaviour is to make none.**
   *
   * Keyed by **both** spellings a caller might legitimately use — the canonical `grant_type` wire value and
   * Authlete's own enum name — because `create()` is reached from an admin route that speaks Authlete's
   * vocabulary *and* from paths that speak the RFCs'. Wire values verified against primary sources:
   *
   * | Wire value | Source |
   * |---|---|
   * | `urn:ietf:params:oauth:grant-type:jwt-bearer` | RFC 7523 §2.1 |
   * | `urn:ietf:params:oauth:grant-type:device_code` | RFC 8628 §3.4 (Standards Track, Aug 2019) |
   * | `urn:ietf:params:oauth:grant-type:token-exchange` | RFC 8693 §2.1 (Standards Track, Jan 2020) |
   * | `urn:openid:params:grant-type:ciba` | CIBA Core 1.0; also in Authlete's vendored `docs/openapi-spec.json` |
   * | `urn:ietf:params:oauth:grant-type:pre-authorized_code` | OID4VCI 1.0; also in the vendored spec |
   *
   * Two things the previous version got wrong beyond the default. **`CIBA` had no entry at all** though it
   * is a member of the SDK enum, so a CIBA token was recorded as authorization-code. And the three URNs
   * above for device code, token exchange and CIBA were absent — only the short forms `device_code` and
   * `token_exchange` mapped, and neither is what any client sends.
   *
   * The return type is `GrantType`, not `string`, so the compiler checks every value against SDK 1.0.0's
   * closed enum. The `as GrantType` cast at the call site is gone with it: a cast there would have hidden
   * exactly the `CIBA`-shaped omission this fixes.
   */
  private normalizeGrantType(raw: string): GrantType {
    const GRANT_TYPE_MAP: Record<string, GrantType> = {
      // Authlete's enum names, which the admin surface uses.
      authorization_code: "AUTHORIZATION_CODE",
      client_credentials: "CLIENT_CREDENTIALS",
      password: "PASSWORD",
      refresh_token: "REFRESH_TOKEN",
      implicit: "IMPLICIT",
      token_exchange: "TOKEN_EXCHANGE",
      device_code: "DEVICE_CODE",
      ciba: "CIBA",
      jwt_bearer: "JWT_BEARER",
      pre_authorized_code: "PRE_AUTHORIZED_CODE",
      // The canonical `grant_type` values, which is what a client actually sends.
      "urn:ietf:params:oauth:grant-type:jwt-bearer": "JWT_BEARER",
      "urn:ietf:params:oauth:grant-type:device_code": "DEVICE_CODE",
      "urn:ietf:params:oauth:grant-type:token-exchange": "TOKEN_EXCHANGE",
      "urn:openid:params:grant-type:ciba": "CIBA",
      "urn:ietf:params:oauth:grant-type:pre-authorized_code": "PRE_AUTHORIZED_CODE",
    };

    const key = raw?.toLowerCase().replace(/[^a-z0-9:._-]/g, "");
    const grantType = key ? GRANT_TYPE_MAP[key] : undefined;

    if (!grantType) {
      throw new AppError(
        raw
          ? `Unsupported grant_type: ${raw}`
          : "Missing required field: grant_type",
        400,
      );
    }

    return grantType;
  }

  async create(req: Request | Record<string, any>): Promise<TokenCreateResponse> {
    const log = req.logger || logger;

    // Handle both Express Request and plain object call patterns.
    // When called from token.controller.ts (JWT bearer), req is a plain object.
    const hasReqBody = req?.body && typeof req.body === "object";
    const body = hasReqBody ? (req.body as Record<string, unknown>) : (req as Record<string, unknown>);

    const rawGrantType = (body.grant_type || body.grantType || "") as string;
    const rawScope = (body.scope as string) || "";

    const reqBody: TokenCreateRequest = {
      grantType: this.normalizeGrantType(rawGrantType),
      clientId: Number(body.clientId),
      subject: body.subject as string | undefined,
    };

    // Scopes — from scope (singular, space-separated) or scopes (plural, array)
    if (rawScope) {
      reqBody.scopes = rawScope.split(/\s+/).filter(Boolean);
    } else if (body.scopes !== undefined) {
      reqBody.scopes = Array.isArray(body.scopes)
        ? (body.scopes as string[])
        : [String(body.scopes)];
    }

    if (body.accessTokenDuration !== undefined) reqBody.accessTokenDuration = Number(body.accessTokenDuration);
    if (body.refreshTokenDuration !== undefined) reqBody.refreshTokenDuration = Number(body.refreshTokenDuration);
    if (body.clientIdAliasUsed !== undefined) reqBody.clientIdAliasUsed = Boolean(body.clientIdAliasUsed);
    if (body.accessToken !== undefined) reqBody.accessToken = body.accessToken as string;
    if (body.refreshToken !== undefined) reqBody.refreshToken = body.refreshToken as string;
    if (body.accessTokenPersistent !== undefined) reqBody.accessTokenPersistent = Boolean(body.accessTokenPersistent);
    if (body.forExternalAttachment !== undefined) reqBody.forExternalAttachment = Boolean(body.forExternalAttachment);
    if (body.jwtAtClaims !== undefined) reqBody.jwtAtClaims = body.jwtAtClaims as string;
    if (body.acr !== undefined) reqBody.acr = body.acr as string;
    if (body.authTime !== undefined) reqBody.authTime = Number(body.authTime);
    if (body.clientEntityIdUsed !== undefined) reqBody.clientEntityIdUsed = Boolean(body.clientEntityIdUsed);
    if (body.clientIdentifier !== undefined) reqBody.clientIdentifier = body.clientIdentifier as string;
    if (body.sessionId !== undefined) reqBody.sessionId = body.sessionId as string;

    // Resources — accept array or single value
    if (body.resources !== undefined) {
      reqBody.resources = Array.isArray(body.resources)
        ? (body.resources as string[])
        : [String(body.resources)];
    }

    log.info("TokenCreateService: calling Authlete token management endpoint", {
      grantType: reqBody.grantType,
      clientId: reqBody.clientId,
      hasSubject: !!reqBody.subject,
    });

    const response = await this.authleteApi.token.management.create({
      serviceId,
      tokenCreateRequest: reqBody,
    });

    return response;
  }

  async update(req: Request): Promise<TokenUpdateResponse> {
    const log = req.logger || logger;
    const body = req.body as Record<string, unknown>;

    const reqBody: TokenUpdateRequest = {
      accessToken: body.accessToken as string,
    };

    // Scopes — from scope (singular, space-separated) or scopes (plural, array)
    const rawScope = (body.scope as string) || "";
    if (rawScope) {
      reqBody.scopes = rawScope.split(/\s+/).filter(Boolean);
    } else if (body.scopes !== undefined) {
      reqBody.scopes = Array.isArray(body.scopes)
        ? (body.scopes as string[])
        : [String(body.scopes)];
    }

    if (body.accessTokenExpiresAt !== undefined) reqBody.accessTokenExpiresAt = Number(body.accessTokenExpiresAt);
    if (body.accessTokenExpiresAtUpdatedOnScopeUpdate !== undefined) {
      reqBody.accessTokenExpiresAtUpdatedOnScopeUpdate = Boolean(body.accessTokenExpiresAtUpdatedOnScopeUpdate);
    }
    if (body.accessTokenHash !== undefined) reqBody.accessTokenHash = body.accessTokenHash as string;
    if (body.accessTokenValueUpdated !== undefined) reqBody.accessTokenValueUpdated = Boolean(body.accessTokenValueUpdated);
    if (body.accessTokenPersistent !== undefined) reqBody.accessTokenPersistent = Boolean(body.accessTokenPersistent);
    if (body.forExternalAttachment !== undefined) reqBody.forExternalAttachment = Boolean(body.forExternalAttachment);
    if (body.refreshTokenExpiresAt !== undefined) reqBody.refreshTokenExpiresAt = Number(body.refreshTokenExpiresAt);
    if (body.refreshTokenExpiresAtUpdatedOnScopeUpdate !== undefined) {
      reqBody.refreshTokenExpiresAtUpdatedOnScopeUpdate = Boolean(body.refreshTokenExpiresAtUpdatedOnScopeUpdate);
    }
    if (body.tokenId !== undefined) reqBody.tokenId = body.tokenId as string;

    log.info("TokenUpdateService: calling Authlete token management endpoint", {
      hasAccessToken: !!reqBody.accessToken,
    });

    const response = await this.authleteApi.token.management.update({
      serviceId,
      tokenUpdateRequest: reqBody,
    });

    return response;
  }

  async delete(accessTokenIdentifier: string): Promise<void> {
    const response = await this.authleteApi.token.management.delete({
      serviceId,
      accessTokenIdentifier,
    });

    return response;
  }

  async list(): Promise<TokenGetListResponse> {
    logger.info("TokenListService: calling Authlete token management endpoint");

    const response = await this.authleteApi.token.management.list({
      serviceId,
    });

    return response;
  }

  /**
   * `POST /idtoken/reissue`. Two callers with deliberately different sources:
   *
   *   - the admin route `POST /api/token/reissue` passes the Express `Request`, so the operator's
   *     body supplies every field;
   *   - `token.controller.ts`'s `ID_TOKEN_REISSUABLE` branch passes a plain params object built from
   *     Authlete's own token response, and **never** from `req.body` — a client that could set `sub`
   *     could name any subject in an ID token this OP signs.
   *
   * The union mirrors `create()` and `revoke()` above rather than inventing a second shape.
   */
  async reissueIdToken(
    req: Request | Record<string, any>
  ): Promise<IdtokenReissueResponse> {
    const params = (req.body ?? req) as Record<string, unknown>;
    const { accessToken, refreshToken, sub, claims, idtHeaderParams, idTokenAudType } =
      params as {
        accessToken?: string;
        refreshToken?: string;
        sub?: string;
        claims?: string;
        idtHeaderParams?: string;
        idTokenAudType?: string;
      };
    logger.info(
      "TokenReissueIdTokenService: calling Authlete token management endpoint",
      { hasAccessToken: !!accessToken, hasRefreshToken: !!refreshToken }
    );

    if (!accessToken || !refreshToken) {
      throw new AppError("Missing required parameters: accessToken and refreshToken", 400);
    }

    const response = await this.authleteApi.token.management.reissueIdToken({
      serviceId,
      idtokenReissueRequest: { accessToken, refreshToken, sub, claims, idtHeaderParams, idTokenAudType },
    });

    return response;
  }

  async revoke(req: Request | any): Promise<TokenRevokeResponse> {
    const { accessTokenIdentifier, refreshTokenIdentifier, clientIdentifier, subject } = req.body;
    logger.info(
      "TokenDeleteService: calling Authlete token management endpoint",
      { accessTokenIdentifier, hasRefreshTokenIdentifier: !!refreshTokenIdentifier }
    );

    const response = await this.authleteApi.token.management.revoke({
      serviceId,
      tokenRevokeRequest: { accessTokenIdentifier, refreshTokenIdentifier, clientIdentifier, subject },
    });

    return response;
  }

  /**
   * Dev-only local JWT. `clientId` is required rather than optional because RFC 9068 §2.2 makes
   * `client_id` a REQUIRED claim — see `utils/createLocalJWT.ts` for the full claim table (9068-W2).
   *
   * **`options` is forwarded, which it was not before.** `createLocalJWT` has accepted `acr` and `authTime`
   * since the RFC 9470 step-up work, and `openapi.routes.ts` advertised both as query parameters of
   * `GET /api/token/createLocalToken` — but this method dropped them on the floor, so the only caller that
   * could supply them could not. Two advertised parameters that did nothing, which is the same
   * *advertised-but-unusable* shape the audit records as a systemic theme. Found while adding `client_id`.
   */
  localSignedToken(
    iss: string,
    sub: string,
    aud: string[],
    clientId: string,
    options?: LocalJWTOptions
  ): {
    token: string;
    publicKey: string;
  } {
    const { token, publicKey } = createLocalJWT(iss, sub, aud, clientId, options);
    return { token, publicKey };
  }
}
