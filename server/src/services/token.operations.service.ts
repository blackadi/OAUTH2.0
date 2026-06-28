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
import createLocalJWT from "../utils/createLocalJWT";

export class TokenManagementService {
  constructor(private authleteApi: Authlete = defaultApi) {}

  private normalizeGrantType(raw: string): string {
    const GRANT_TYPE_MAP: Record<string, string> = {
      authorization_code: "AUTHORIZATION_CODE",
      client_credentials: "CLIENT_CREDENTIALS",
      password: "PASSWORD",
      refresh_token: "REFRESH_TOKEN",
      implicit: "IMPLICIT",
      token_exchange: "TOKEN_EXCHANGE",
      device_code: "DEVICE_CODE",
      "urn:ietf:params:oauth:grant-type:jwt-bearer": "JWT_BEARER",
      "urn:ietf:params:oauth:grant-type:pre-authorized_code": "PRE_AUTHORIZED_CODE",
    };
    const key = raw?.toLowerCase().replace(/[^a-z0-9:._-]/g, "");
    return GRANT_TYPE_MAP[key] || "AUTHORIZATION_CODE";
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
      grantType: this.normalizeGrantType(rawGrantType) as GrantType,
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

    log("TokenCreateService: calling Authlete token management endpoint", {
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

    log("TokenUpdateService: calling Authlete token management endpoint", {
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
    logger("TokenListService: calling Authlete token management endpoint");

    const response = await this.authleteApi.token.management.list({
      serviceId,
    });

    return response;
  }

  async reissueIdToken(req: Request): Promise<IdtokenReissueResponse> {
    const { accessToken, refreshToken, sub, claims, idtHeaderParams, idTokenAudType } = req.body;
    logger(
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
    logger(
      "TokenDeleteService: calling Authlete token management endpoint",
      { accessTokenIdentifier, hasRefreshTokenIdentifier: !!refreshTokenIdentifier }
    );

    const response = await this.authleteApi.token.management.revoke({
      serviceId,
      tokenRevokeRequest: { accessTokenIdentifier, refreshTokenIdentifier, clientIdentifier, subject },
    });

    return response;
  }

  localSignedToken(
    iss: string,
    sub: string,
    aud: string[]
  ): {
    token: string;
    publicKey: string;
  } {
    const { token, publicKey } = createLocalJWT(iss, sub, aud);
    return { token, publicKey };
  }
}
