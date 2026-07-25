import {
  TokenCreateResponse,
  TokenResponse,
} from "@authlete/typescript-sdk/models";
import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId as defaultServiceId } from "./authlete.service";
import { TokenManagementService } from "./token.operations.service";
import jwt from "jsonwebtoken";

export type JwtBearerResult =
  | { ok: true; response: TokenCreateResponse; accessToken: string; tokenType: string; expiresIn: number; scope: string }
  | { ok: false; status: 400 | 500; body: TokenCreateResponse | { error: string; error_description: string } };

export class JwtVerificationService {
  constructor(
    private authleteApi: Authlete = defaultApi,
    private svcId: string = defaultServiceId,
    private tokenManagementService: TokenManagementService = new TokenManagementService()
  ) {}

  async processJwtBearer(result: TokenResponse): Promise<JwtBearerResult> {
    const assertion = result.assertion;
    if (!assertion) {
      return {
        ok: false,
        status: 400,
        body: { error: "invalid_grant", error_description: "Missing assertion" },
      };
    }

    if (result.clientId === undefined && !result.clientIdAlias) {
      return {
        ok: false,
        status: 400,
        body: { error: "invalid_request", error_description: "This authorization server requires that the client be identifiable." },
      };
    }

    const clientIdentifier = result.clientIdAlias ?? String(result.clientId);

    const verifyResp = await this.authleteApi.joseObject.joseVerifyApi({
      serviceId: this.svcId,
      joseVerifyRequest: {
        jose: assertion,
        clientIdentifier,
        signedByClient: true,
        mandatoryClaims: ["iss", "sub", "aud"],
      },
    });

    if (!verifyResp.valid || !verifyResp.signatureValid) {
      return {
        ok: false,
        status: 400,
        body: { error: "invalid_grant", error_description: "Invalid assertion" },
      };
    }

    const decoded = jwt.decode(assertion, { complete: true });
    if (!decoded || typeof decoded === "string" || !decoded.payload) {
      return {
        ok: false,
        status: 400,
        body: { error: "invalid_grant", error_description: "The assertion failed to be parsed as a JWT." },
      };
    }

    const decodedPayload = decoded.payload as jwt.JwtPayload;
    const subject = decodedPayload.sub;
    const issuer = decodedPayload.iss;
    const audience = decodedPayload.aud;

    if (!subject) {
      return {
        ok: false,
        status: 400,
        body: { error: "invalid_grant", error_description: "The value of the 'sub' claim failed to be extracted from the payload of the assertion." },
      };
    }

    const createRequest = {
      grantType: "JWT_BEARER",
      subject,
      clientId: result.clientId,
      issuer,
      audience: Array.isArray(audience) ? audience : [audience],
      scopes: result.scopes,
    };

    const createResp = await this.tokenManagementService.create(createRequest);

    switch (createResp.action) {
      case "OK":
        return {
          ok: true,
          response: createResp,
          accessToken: createResp.accessToken ?? "",
          tokenType: createResp.tokenType || "Bearer",
          expiresIn: createResp.expiresIn ?? 0,
          scope: createResp.scopes?.join(" ") || "",
        };
      case "BAD_REQUEST":
        return { ok: false, status: 400, body: createResp };
      default:
        return { ok: false, status: 500, body: createResp };
    }
  }
}
