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
    const { clientId, clientSecret } = req.body as {
      clientId?: string;
      clientSecret?: string;
    };

    // Two wire formats reach this endpoint, and `rawBody` is what tells them apart.
    //
    // RFC 9126 §2.1 defines the request as `application/x-www-form-urlencoded` with the
    // authorization parameters at the top level — which is what a conformant client, and the OpenID
    // Foundation conformance suite, sends. The SPA and the labs instead send JSON carrying one
    // pre-encoded `parameters` string, because a browser cannot do client authentication and the
    // debugger wants to show the exact string being pushed.
    //
    // `app.ts`'s `express.urlencoded` verify hook populates `rawBody` **only** for
    // `application/x-www-form-urlencoded`, so the content type is the discriminator and the JSON path
    // is untouched by construction. Same idiom as `token.service.ts`, `introspection.service.ts` and
    // `revocation.service.ts` — this endpoint was the only one of the four that lacked it, which is
    // why a conformance run could not get past its first OAuth request (9126-W1, closed 2026-09-01).
    const rawBody: string | undefined = (req as any).rawBody;
    const parameters = rawBody || (req.body as { parameters?: string }).parameters;

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
    } else if (rawBody) {
      // Nothing to merge. A form-encoded body already carries its own `client_id`, and whichever of
      // `client_secret` / `client_assertion` the client authenticates with, verbatim in `parameters`.
      // Appending would duplicate the parameter — and RFC 6749 §2.3.1's single-method rule is enforced
      // ahead of this call in `par.controller.ts`, so the merging branches below must not run here.
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

    // `wireFormat` distinguishes the two shapes above; without it a conformant request logs
    // `clientAuth: "absent"` — its credentials are inside `parameters`, which is never logged.
    // Length only, never the value: `parameters` carries client_secret, client_assertion and the
    // PKCE verifier (RFC 9700 §4.2.4). See tests/unit/services/credential-logging.test.ts.
    log.info("ParService: calling Authlete pushed authorization endpoint", {
      hasDpop: !!dpopHeader,
      wireFormat: rawBody ? "form" : "json",
      parametersLength: parameters.length,
      clientAuth: basic ? "basic" : clientSecret ? "post" : clientId ? "none" : "absent",
    });

    const response = await this.authleteApi.pushedAuthorization.create({
      serviceId,
      pushedAuthorizationRequest: requestBody,
    });

    return response;
  }

}
