import {
  TokenCreateRequest,
  TokenCreateResponse,
} from "@authlete/typescript-sdk/models";
import { authleteApi, serviceId } from "./authlete.service";
import { Request } from "express";
import logger from "../utils/logger";
import {
  GrantType,
  IdtokenReissueResponse,
  Scope,
  TokenGetListResponse,
  TokenRevokeRequest,
  TokenRevokeResponse,
  TokenUpdateRequest,
  TokenUpdateResponse,
} from "@authlete/typescript-sdk/models";
import createLocalJWT from "../utils/createLocalJWT";

export class TokenManagementService {
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

  async create(req: Request | any): Promise<TokenCreateResponse> {
    let { ...body }: TokenCreateRequest = req.body;
    logger("TokenCreateService: calling Authlete token management endpoint", {
      body,
    });

    // Decode Basic auth if present
    const { authorization } = req.headers;
    if (authorization && authorization.startsWith("Basic ")) {
      const base64Credentials = authorization.slice("Basic ".length);
      const credentials = Buffer.from(base64Credentials, "base64").toString(
        "utf-8"
      );
      const [client_id, client_secret] = credentials.split(":");
      body.clientId = Number(client_id);
    }

    const rawGrantType = req.body.grant_type || req.body.grantType || "";

    // Remove scopes from body to avoid overriding the computed array
    const { scopes: _scopes, ...bodyWithoutScopes } = body;

    const reqBody: TokenCreateRequest = {
      ...bodyWithoutScopes,
      scopes:
        (typeof req.body.scope === "string" ? req.body.scope : "")
          .split(/\s+/)
          .filter(Boolean)
          .map((s: Scope) => s as unknown as Scope) ?? [],
      grantType: this.normalizeGrantType(rawGrantType) as GrantType,
    };

    logger(
      "TokenCreateService: calling Authlete token management endpoint",
      reqBody
    );
    const response = await authleteApi.token.management.create({
      serviceId,
      tokenCreateRequest: {
        ...reqBody,
      },
    });

    return response;
  }

  async update(req: Request): Promise<TokenUpdateResponse> {
    let { ...body }: TokenUpdateRequest = req.body;
    logger("TokenUpdateService: calling Authlete token management endpoint", {
      body,
    });
    const reqBody: TokenUpdateRequest = {
      ...body,
      scopes:
        (typeof req.body.scope === "string" ? req.body.scope : "")
          .split(/\s+/)
          .filter(Boolean)
          .map((s: Scope) => s as unknown as Scope) ?? [],
    } as TokenUpdateRequest;

    logger(
      "TokenUpdateService: calling Authlete token management endpoint",
      reqBody
    );

    const response = await authleteApi.token.management.update({
      serviceId,
      tokenUpdateRequest: reqBody,
    });

    return response;
  }

  async delete(accessTokenIdentifier: string): Promise<void> {
    const response = await authleteApi.token.management.delete({
      serviceId,
      accessTokenIdentifier,
    });

    return response;
  }

  async list(): Promise<TokenGetListResponse> {
    logger("TokenListService: calling Authlete token management endpoint");

    const response = await authleteApi.token.management.list({
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
      const err = new Error("Missing required parameters: accessToken and refreshToken");
      (err as any).status = 400;
      throw err;
    }

    const response = await authleteApi.token.management.reissueIdToken({
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

    const response = await authleteApi.token.management.revoke({
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
