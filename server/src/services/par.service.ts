import { PushedAuthorizationRequest } from "@authlete/typescript-sdk/models";
import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";
import { Request } from "express";
import logger from "../utils/logger";
import { AppError } from "../utils/app-error";
import { parseBasicAuth } from "../utils/basic-auth";
import { dpopHttpTarget } from "../utils/dpop";
import { appendToParams } from "../utils/params";

export class ParService {
  constructor(private authleteApi: Authlete = defaultApi) {}

  async process(req: Request): Promise<any> {
    const log = req.logger || logger;
    const { parameters, clientId, clientSecret } = req.body as {
      parameters?: string;
      clientId?: string;
      clientSecret?: string;
    };

    if (!parameters) {
      throw new AppError("Missing required body field: parameters", 400);
    }

    const requestBody: PushedAuthorizationRequest = {
      parameters,
    };

    // Client authentication. Authlete matches the channel the credentials arrive on against
    // the client's registered auth method, so the caller picks the channel and this service
    // must not reinterpret it (verified 2026-08-05 against client 1523514379):
    //
    //   Authorization: Basic     -> top-level clientId/clientSecret   client_secret_basic
    //   body clientId+Secret     -> merged into `parameters`          client_secret_post
    //   body clientId only       -> client_id in `parameters`         none (public client)
    //
    // Putting a client_secret_basic client's credentials in `parameters` earns
    // `401 [A157357] The client identifier is not found at the expected location`, and the
    // mirror-image error exists for client_secret_post — hence no guessing.
    const basic = parseBasicAuth(req.headers.authorization);

    if (basic) {
      // Server-determined, straight from HTTP context — never from the body.
      requestBody.clientId = basic.clientId;
      requestBody.clientSecret = basic.clientSecret;
    } else if (clientId && clientSecret) {
      requestBody.parameters = appendToParams(parameters, [
        { key: "client_id", value: clientId },
        { key: "client_secret", value: clientSecret },
      ]);
    } else if (clientId) {
      requestBody.parameters = appendToParams(parameters, [
        { key: "client_id", value: clientId },
      ]);
    }

    // DPoP support — fields come from HTTP headers, not the body.
    // `htu` excludes the query and fragment (RFC 9449 §4.2); `dpopHttpTarget()` is the single
    // source for that derivation. `PushedAuthorizationRequest` has no `targetUri` member.
    const dpopHeader = req.headers["dpop"] as string | undefined;
    if (dpopHeader) {
      requestBody.dpop = dpopHeader;
      requestBody.htm = req.method;
      requestBody.htu = dpopHttpTarget(req).htu;
    }

    log.info("ParService: calling Authlete pushed authorization endpoint", {
      hasDpop: !!dpopHeader,
      clientAuth: basic ? "basic" : clientSecret ? "post" : clientId ? "none" : "absent",
    });

    const response = await this.authleteApi.pushedAuthorization.create({
      serviceId,
      pushedAuthorizationRequest: requestBody,
    });

    return response;
  }

}
