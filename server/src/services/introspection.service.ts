import { Request } from "express";
import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";
import logger from "../utils/logger";
import { dpopHttpTarget } from "../utils/dpop";
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
    // `targetUri` is deliberately NOT read from the body. It is the URI a DPoP proof is validated
    // against, so a caller able to set it could replay a proof minted for another endpoint here —
    // the same defect already closed at UserInfo. It is derived from HTTP context below instead.
    if (body.requestBodyContained !== undefined) {
      reqBody.requestBodyContained = Boolean(body.requestBodyContained);
    }

    // DPoP support — fields come from HTTP headers, not the body.
    // `htu` excludes the query and fragment (RFC 9449 §4.2) and `targetUri` carries the full request
    // URI; `dpopHttpTarget()` is the single source for both. `IntrospectionRequest` has `targetUri`.
    const dpopHeader = req.headers["dpop"] as string | undefined;
    if (dpopHeader) {
      const { htu, targetUri } = dpopHttpTarget(req);
      reqBody.dpop = dpopHeader;
      reqBody.htm = req.method;
      reqBody.htu = htu;
      reqBody.targetUri = targetUri;
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

    // The `Authorization` header is deliberately NOT read here.
    //
    // Until 2026-08-12 this method decoded `Authorization: Basic` and appended the result to `parameters` as
    // `client_id`/`client_secret`. Two things changed that. The endpoint now requires **admin** Basic auth
    // (RFC 7662 §2.1, `introspection-standard.controller.ts`), so that header carries this deployment's
    // management credentials — forwarding them to Authlete as a client identity would send our admin secret
    // to the vendor labelled as somebody's client secret. And the decoder was hand-rolled with
    // `credentials.split(":")`, which `AGENTS.md` forbids: it truncated any secret containing a colon and
    // ignored the lowercase `basic` scheme that RFC 9110 §11.1 makes valid.
    //
    // Deleting it fixes both. A caller that needs to present *client* credentials still can — they belong in
    // the request body, where `rawBody` carries them verbatim and the fallback rebuild above passes through
    // every key not on the Authlete-specific exclusion list. One header, one meaning.
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

    /**
     * The JWT branch's signing algorithm — **the only place it can be set.**
     *
     * These three fields were already named in the `excluded` set above, so they were recognised as
     * Authlete-specific, stripped out of `parameters`, and then **dropped on the floor**: never added
     * to the request. The endpoint therefore had no way to say how the response should be signed, and
     * Authlete's default is `RS256`.
     *
     * That combination is a live 500, not a theoretical gap. This service's JWK Set holds one EC
     * P-256 key, so asking for a JWT introspection response answers
     * `[A405201] The key to sign the JWS with the algorithm ('RS256') is not available.` — measured.
     * And RS256 would be **non-compliant even if a key existed**: FAPI 2.0 §5.4.1 permits PS256, ES256
     * and EdDSA only.
     *
     * There is nowhere else to fix it. The SDK's `Client` model has no introspection signing property
     * at all, and `Service` carries only `introspectionSignatureKeyId` — a key, not an algorithm.
     * Pinning that key ID was tried and changed nothing; Authlete still asked for RS256.
     *
     * **ES256 is the default rather than Authlete's**, so the out-of-box behaviour is both working and
     * FAPI 2.0-conformant. It is tied to this service's EC key: pointed at an RSA-keyed service, a
     * caller should pass `introspectionSignAlg: "PS256"` explicitly. The override stays available
     * because this is a debugging server and demonstrating a refused algorithm is a legitimate use —
     * the endpoint is already behind admin Basic auth, so the caller is privileged either way.
     */
    reqBody.introspectionSignAlg =
      body.introspectionSignAlg !== undefined ? (body.introspectionSignAlg as string) : "ES256";
    if (body.introspectionEncryptionAlg !== undefined) {
      reqBody.introspectionEncryptionAlg = body.introspectionEncryptionAlg as string;
    }
    if (body.introspectionEncryptionEnc !== undefined) {
      reqBody.introspectionEncryptionEnc = body.introspectionEncryptionEnc as string;
    }

    const response = await this.authleteApi.introspection.standardProcess({
      serviceId,
      standardIntrospectionRequest: reqBody,
    });

    return response;
  }
}
