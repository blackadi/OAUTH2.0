import { Request } from "express";
import {
  RevocationResponse,
  RevocationRequest,
} from "@authlete/typescript-sdk/models";
import { authleteApi, serviceId } from "./authlete.service";
import logger from "../utils/logger";

export class RevocationService {
  async process(req: Request): Promise<RevocationResponse> {
    let {
      clientCertificate,
      clientCertificatePath,
      clientId,
      clientSecret,
      oauthClientAttestation,
      oauthClientAttestationPop,
      ...otherBody
    }: RevocationRequest = req.body;
    const log = req.logger || logger;
    log("Revocation parameters", { otherBody });

    let parameters: string | undefined = (req as any).rawBody;

    if (!parameters) {
      // Fallback: rebuild parameters from parsed body (may reorder/encode
      // slightly differently than the original entity).
      const params = new URLSearchParams();
      if (otherBody && typeof otherBody === "object") {
        for (const [key, value] of Object.entries(otherBody)) {
          if (value !== undefined && value !== null) {
            params.append(key, String(value));
          }
        }
      }

      parameters = params.toString();
    }

    log("RevocationService: URL-encoded parameters (length), body", {
      length: parameters.length,
      body: parameters,
    });

    // Build Authlete TokenRequest
    const reqBody: RevocationRequest = {
      parameters,
      clientCertificate,
      clientCertificatePath,
      clientId,
      clientSecret,
      oauthClientAttestation,
      oauthClientAttestationPop,
    } as RevocationRequest;

    log("RevocationService: calling Authlete revocation endpoint", {
      clientId,
      parametersLength: parameters.length,
      parameters,
    });

    // Decode Basic auth if present
    const { authorization } = req.headers;
    if (authorization && authorization.startsWith("Basic ")) {
      const base64Credentials = authorization.slice("Basic ".length);
      const credentials = Buffer.from(base64Credentials, "base64").toString(
        "utf-8"
      );
      [clientId, clientSecret] = credentials.split(":");
      reqBody.clientId = clientId;
      reqBody.clientSecret = clientSecret;
      log("RevocationService: decoded Basic auth", { clientId });
    }

    // Call Authlete /revocation API
    const response = await authleteApi.revocation.process({
      serviceId,
      revocationRequest: reqBody,
    });

    return response;
  }
}
