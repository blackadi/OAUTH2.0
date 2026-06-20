import { Request } from "express";
import {
  RevocationResponse,
  RevocationRequest,
} from "@authlete/typescript-sdk/models";
import { authleteApi, serviceId } from "./authlete.service";
import logger from "../utils/logger";

export class RevocationService {
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
      log("RevocationService: decoded Basic auth", { clientId });
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

    log("RevocationService: URL-encoded parameters", {
      length: parameters.length,
      body: parameters,
    });

    const reqBody: RevocationRequest = {
      parameters,
      clientId,
      clientSecret,
      oauthClientAttestation,
      oauthClientAttestationPop,
    };

    log("RevocationService: calling Authlete revocation endpoint", {
      clientId,
      parametersLength: parameters.length,
    });

    const response = await authleteApi.revocation.process({
      serviceId,
      revocationRequest: reqBody,
    });

    return response;
  }
}
