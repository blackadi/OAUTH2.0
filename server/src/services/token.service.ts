import {
  TokenFailRequest,
  TokenFailResponse,
  TokenIssueRequest,
  TokenIssueResponse,
  TokenRequest,
  TokenResponse,
} from "@authlete/typescript-sdk/models";
import { authleteApi, serviceId } from "./authlete.service";
import { Request } from "express";
import logger from "../utils/logger";

export class TokenService {
  async process(req: Request): Promise<TokenResponse> {
    const log = req.logger || logger;

    // Only extract OAuth params from the body. Server-determined fields
    // (htm, htu, dpop, etc.) come from HTTP headers, never from the body.
    const { client_id: bodyClientId, client_secret: bodyClientSecret, ...remainingParams } = req.body as Record<string, unknown>;

    // Determine clientId/clientSecret — Basic auth takes priority,
    // then client_secret_post (body), then public client.
    let clientId = (req.body.clientId ?? bodyClientId) as string | undefined;
    let clientSecret = (req.body.clientSecret ?? bodyClientSecret) as string | undefined;

    const { authorization } = req.headers;
    if (authorization?.startsWith("Basic ")) {
      const credentials = Buffer.from(authorization.slice(6), "base64").toString("utf-8");
      [clientId, clientSecret] = credentials.split(":");
      log("TokenService: decoded Basic auth", { clientId });
    }

    log("TokenService: received body", { clientId });

    // Prefer raw request body captured by body-parser's verify hook.
    // This preserves exact encoding and parameter order for Authlete.
    let parameters: string | undefined = (req as any).rawBody;

    if (!parameters) {
      // Fallback: rebuild from all remaining params.
      // Exclude fields we already extracted separately.
      const excluded = new Set(["clientId", "clientSecret", "client_id", "client_secret"]);
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(remainingParams)) {
        if (value !== undefined && value !== null && !excluded.has(key)) {
          params.append(key, String(value));
        }
      }
      parameters = params.toString();
    }

    log("TokenService: URL-encoded parameters (length), body", {
      length: parameters.length,
      body: parameters,
    });

    // Build Authlete TokenRequest — only send what's needed
    const reqBody: TokenRequest = {
      parameters,
      clientId,
      clientSecret,
    };

    // DPoP support — fields come from HTTP headers, not the body
    const dpopHeader = req.headers["dpop"] as string | undefined;
    if (dpopHeader) {
      reqBody.dpop = dpopHeader;
      reqBody.htm = req.method;
      const protocol = req.protocol;
      const host = req.get("host") || "";
      reqBody.htu = `${protocol}://${host}${req.originalUrl}`;
    }

    // Client attestation headers (OAuth 2.0 Attestation-Based Client Authentication)
    const attJkt = req.headers["oauth-client-attestation"] as string | undefined;
    const attPop = req.headers["oauth-client-attestation-pop"] as string | undefined;
    if (attJkt) reqBody.oauthClientAttestation = attJkt;
    if (attPop) reqBody.oauthClientAttestationPop = attPop;

    log("TokenService: calling Authlete token endpoint", {
      clientId,
      hasDpop: !!dpopHeader,
      parametersLength: parameters.length,
    });

    const response = await authleteApi.token.process({
      serviceId,
      tokenRequest: reqBody,
    });

    return response;
  }

  async fail(req: TokenFailRequest): Promise<TokenFailResponse> {
    const response = await authleteApi.token.fail({
      serviceId,
      tokenFailRequest: req,
    });

    return response;
  }

  async issue(req: TokenIssueRequest): Promise<TokenIssueResponse> {
    const response = await authleteApi.token.issue({
      serviceId,
      tokenIssueRequest: req,
    });

    return response;
  }
}
