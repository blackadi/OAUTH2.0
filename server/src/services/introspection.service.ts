import { Request } from "express";
import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";
import logger from "../utils/logger";
import {
  IntrospectionRequest,
  IntrospectionResponse,
  StandardIntrospectionRequest,
  StandardIntrospectionResponse,
} from "@authlete/typescript-sdk/models";

export class IntrospectionService {
  constructor(private authleteApi: Authlete = defaultApi) {}

  async process(req: Request): Promise<IntrospectionResponse> {
    const log = req.logger || logger;
    const body = req.body as Record<string, unknown>;

    // Only extract fields the resource server is allowed to send.
    // Server-determined fields (htm, htu, dpop, clientCertificate, etc.)
    // come from HTTP context, never from the body.
    const reqBody: IntrospectionRequest = {
      token: body.token as string,
    };

    // Optional OAuth fields from body
    if (body.scopes !== undefined) {
      reqBody.scopes = Array.isArray(body.scopes)
        ? body.scopes
        : String(body.scopes).split(" ").filter(Boolean);
    }
    if (body.subject !== undefined) reqBody.subject = body.subject as string;
    if (body.resources !== undefined) {
      reqBody.resources = Array.isArray(body.resources)
        ? body.resources
        : [String(body.resources)];
    }
    if (body.acrValues !== undefined) {
      reqBody.acrValues = Array.isArray(body.acrValues)
        ? body.acrValues
        : [String(body.acrValues)];
    }
    if (body.maxAge !== undefined) reqBody.maxAge = Number(body.maxAge);
    if (body.requiredComponents !== undefined) {
      reqBody.requiredComponents = Array.isArray(body.requiredComponents)
        ? body.requiredComponents
        : [String(body.requiredComponents)];
    }
    if (body.uri !== undefined) reqBody.uri = body.uri as string;
    if (body.message !== undefined) reqBody.message = body.message as string;
    if (body.targetUri !== undefined) reqBody.targetUri = body.targetUri as string;
    if (body.requestBodyContained !== undefined) {
      reqBody.requestBodyContained = Boolean(body.requestBodyContained);
    }

    // DPoP support — fields come from HTTP headers, not the body
    const dpopHeader = req.headers["dpop"] as string | undefined;
    if (dpopHeader) {
      reqBody.dpop = dpopHeader;
      reqBody.htm = req.method;
      const protocol = req.protocol;
      const host = req.get("host") || "";
      reqBody.htu = `${protocol}://${host}${req.originalUrl}`;
    }

    log("Introspection parameters", { token: "[redacted]", hasDpop: !!dpopHeader });

    const response = await this.authleteApi.introspection.process({
      serviceId,
      introspectionRequest: reqBody,
    });
    log("Introspection response received", { action: response.action });
    return response;
  }

  async standardProcess(req: Request): Promise<StandardIntrospectionResponse> {
    const log = req.logger || logger;
    const body = req.body as Record<string, unknown>;

    // Use raw request body captured by body-parser's verify hook.
    // This preserves exact encoding and parameter order for RFC 7662.
    let parameters: string | undefined = (req as any).rawBody;

    if (!parameters) {
      // Fallback: rebuild from parsed body, excluding Authlete-specific fields
      const excluded = new Set([
        "withHiddenProperties", "rsUri", "httpAcceptHeader",
        "introspectionSignAlg", "introspectionEncryptionAlg",
        "introspectionEncryptionEnc", "sharedKeyForSign",
        "sharedKeyForEncryption", "publicKeyForEncryption",
      ]);
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined && value !== null && !excluded.has(key)) {
          params.append(key, String(value));
        }
      }
      parameters = params.toString();
    }

    if (!parameters) {
      throw new Error("Introspection standard request body is empty");
    }

    // Append client_id and client_secret from Basic auth
    const { authorization } = req.headers;
    if (authorization?.startsWith("Basic ")) {
      const credentials = Buffer.from(authorization.slice(6), "base64").toString("utf-8");
      const [clientId, clientSecret] = credentials.split(":");
      log("StandardIntrospectionService: decoded Basic auth", { clientId });
      const suffix = `&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;
      parameters += suffix;
    }

    log("StandardIntrospectionService: URL-encoded parameters length", {
      length: parameters.length,
    });

    const reqBody: StandardIntrospectionRequest = {
      parameters,
    };

    // httpAcceptHeader from actual request header, not from body
    const acceptHeader = req.headers["accept"] as string | undefined;
    if (acceptHeader) {
      reqBody.httpAcceptHeader = acceptHeader;
    }

    // Allow resource server to identify itself
    if (body.rsUri !== undefined) reqBody.rsUri = body.rsUri as string;
    if (body.withHiddenProperties !== undefined) {
      reqBody.withHiddenProperties = Boolean(body.withHiddenProperties);
    }

    const response = await this.authleteApi.introspection.standardProcess({
      serviceId,
      standardIntrospectionRequest: reqBody,
    });

    return response;
  }
}
