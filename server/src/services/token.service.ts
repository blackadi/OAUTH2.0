import {
  TokenFailRequest,
  TokenFailResponse,
  TokenIssueRequest,
  TokenIssueResponse,
  TokenRequest,
  TokenResponse,
} from "@authlete/typescript-sdk/models";
import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";
import { Request } from "express";
import logger from "../utils/logger";
import { parseProperties } from "../utils/properties";
import { parseBasicAuth } from "../utils/basic-auth";
import { dpopHttpTarget } from "../utils/dpop";

export class TokenService {
  constructor(private authleteApi: Authlete = defaultApi) {}

  async process(req: Request): Promise<TokenResponse> {
    const log = req.logger || logger;

    // Only extract OAuth params from the body. Server-determined fields
    // (htm, htu, dpop, etc.) come from HTTP headers, never from the body.
    const { client_id: bodyClientId, client_secret: bodyClientSecret, properties: bodyProperties, ...remainingParams } = req.body as Record<string, unknown>;

    // Determine clientId/clientSecret — Basic auth takes priority,
    // then client_secret_post (body), then public client.
    let clientId = (req.body.clientId ?? bodyClientId) as string | undefined;
    let clientSecret = (req.body.clientSecret ?? bodyClientSecret) as string | undefined;

    const basic = parseBasicAuth(req.headers.authorization);
    if (basic) {
      clientId = basic.clientId;
      clientSecret = basic.clientSecret;
      log.info("TokenService: decoded Basic auth", { clientId });
    }

    log.info("TokenService: received body", { clientId });

    // Prefer raw request body captured by the `express.urlencoded` verify hook in `app.ts`.
    // This preserves exact encoding and parameter order for Authlete.
    let parameters: string | undefined = (req as any).rawBody;

    if (!parameters) {
      // Fallback: rebuild from all remaining params.
      // Exclude fields we already extracted separately.
      const excluded = new Set(["clientId", "clientSecret", "client_id", "client_secret", "properties"]);
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(remainingParams)) {
        if (value !== undefined && value !== null && !excluded.has(key)) {
          params.append(key, String(value));
        }
      }
      parameters = params.toString();
    }

    // Length only. Logging `parameters` writes the raw request body — client_secret, password, code,
    // code_verifier, refresh_token, assertion, subject_token, actor_token — to logs/app-*.log at info
    // level (RFC 9700 §4.2.4). Never log the value; see tests/unit/services/credential-logging.test.ts.
    log.info("TokenService: URL-encoded parameters length", { length: parameters.length });

    // Build Authlete TokenRequest — only send what's needed
    const reqBody: TokenRequest = {
      parameters,
      clientId,
      clientSecret,
    };

    // Authlete wants an array of {key, value, hidden}, never a JSON string.
    const properties = parseProperties(bodyProperties);
    if (properties) {
      reqBody.properties = properties;
    }

    // DPoP support — fields come from HTTP headers, not the body.
    // `htu` excludes the query and fragment (RFC 9449 §4.2); `dpopHttpTarget()` is the single
    // source for that derivation. `TokenRequest` has no `targetUri` member, so only `htu` is sent.
    const dpopHeader = req.headers["dpop"] as string | undefined;
    if (dpopHeader) {
      reqBody.dpop = dpopHeader;
      reqBody.htm = req.method;
      reqBody.htu = dpopHttpTarget(req).htu;
    }

    // Client attestation headers (OAuth 2.0 Attestation-Based Client Authentication)
    const attJkt = req.headers["oauth-client-attestation"] as string | undefined;
    const attPop = req.headers["oauth-client-attestation-pop"] as string | undefined;
    if (attJkt) reqBody.oauthClientAttestation = attJkt;
    if (attPop) reqBody.oauthClientAttestationPop = attPop;

    log.info("TokenService: calling Authlete token endpoint", {
      clientId,
      hasDpop: !!dpopHeader,
      parametersLength: parameters.length,
    });

    const response = await this.authleteApi.token.process({
      serviceId,
      tokenRequest: reqBody,
    });

    return response;
  }

  async fail(req: TokenFailRequest): Promise<TokenFailResponse> {
    const response = await this.authleteApi.token.fail({
      serviceId,
      tokenFailRequest: req,
    });

    return response;
  }

  async issue(req: TokenIssueRequest): Promise<TokenIssueResponse> {
    const response = await this.authleteApi.token.issue({
      serviceId,
      tokenIssueRequest: req,
    });

    return response;
  }
}
