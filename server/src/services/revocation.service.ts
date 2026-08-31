import { Request } from "express";
import {
  RevocationResponse,
  RevocationRequest,
} from "@authlete/typescript-sdk/models";
import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";
import logger from "../utils/logger";

export class RevocationService {
  constructor(private authleteApi: Authlete = defaultApi) {}

  async process(req: Request): Promise<RevocationResponse> {
    const log = req.logger || logger;
    const body = req.body as Record<string, unknown>;

    // clientId/clientSecret from body as fallback for client_secret_post
    let clientId = body.clientId as string | undefined;
    let clientSecret = body.clientSecret as string | undefined;

    // Decode Basic auth — takes priority over body
    const { authorization } = req.headers;
    if (authorization?.startsWith("Basic ")) {
      const credentials = Buffer.from(
        authorization.slice(6),
        "base64",
      ).toString("utf-8");
      [clientId, clientSecret] = credentials.split(":");
      log.info("RevocationService: decoded Basic auth", { clientId });
    }

    // Client attestation from HTTP headers, not from body
    const oauthClientAttestation = req.headers["oauth-client-attestation"] as string | undefined;
    const oauthClientAttestationPop = req.headers["oauth-client-attestation-pop"] as string | undefined;

    // Capture raw body, or reconstruct from parsed fields
    let parameters: string | undefined = (req as any).rawBody;

    if (!parameters) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(body)) {
        if (
          value !== undefined &&
          value !== null &&
          ![
            "clientCertificate",
            "clientCertificatePath",
            "clientId",
            "clientSecret",
            "oauthClientAttestation",
            "oauthClientAttestationPop",
          ].includes(key)
        ) {
          params.append(key, String(value));
        }
      }
      parameters = params.toString();
    }

    if (!parameters) {
      throw new Error("Revocation request body is empty");
    }

    // Length only. Logging `parameters` writes the raw request body — the token being revoked, plus
    // client_secret on the client_secret_post channel — to logs/app-*.log at info level (RFC 9700
    // §4.2.4). Never log the value; see tests/unit/services/credential-logging.test.ts.
    log.info("RevocationService: URL-encoded parameters length", { length: parameters.length });

    const reqBody: RevocationRequest = {
      parameters,
      clientId,
      clientSecret,
      oauthClientAttestation,
      oauthClientAttestationPop,
    };

    log.info("RevocationService: calling Authlete revocation endpoint", {
      clientId,
      parametersLength: parameters.length,
    });

    const response = await this.authleteApi.revocation.process({
      serviceId,
      revocationRequest: reqBody,
    });

    return response;
  }
}
