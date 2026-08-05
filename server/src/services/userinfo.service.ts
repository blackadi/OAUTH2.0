import { Request } from "express";
import {
  UserinfoIssueRequest,
  UserinfoIssueResponse,
  UserinfoRequest,
  UserinfoResponse,
} from "@authlete/typescript-sdk/models";
import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";
import logger from "../utils/logger";
import {
  dpopHttpTarget,
  extractAccessToken,
  TokenPresentationError,
} from "../utils/dpop";

export class UserInfoService {
  constructor(private authleteApi: Authlete = defaultApi) {}

  /**
   * UserInfo endpoint request processing — OpenID Connect Core §5.3, RFC 6750 §2, RFC 9449 §7.
   *
   * @throws TokenPresentationError for presentations rejected locally, before any Authlete call.
   */
  async process(req: Request): Promise<UserinfoResponse> {
    const presented = extractAccessToken(req);

    if (!presented) {
      // RFC 6750 §3.1: no authentication information, so no error code — just the challenge.
      throw new TokenPresentationError(401, null, null);
    }

    const dpopHeader = req.headers["dpop"] as string | undefined;

    // RFC 9449 §7.1: for a DPoP-bound token the resource server must "check that a DPoP proof was
    // also received in the DPoP header field". The DPoP scheme without a proof can never satisfy
    // that, so reject it here rather than spending a round trip to be told the same thing.
    if (presented.scheme === "dpop" && !dpopHeader) {
      throw new TokenPresentationError(
        401,
        "invalid_dpop_proof",
        "The DPoP authentication scheme was used but no DPoP proof was provided in the DPoP header field.",
        ["dpop"],
      );
    }

    // RFC 9449 §7.2 requires that a protected resource "MUST reject a DPoP-bound access token
    // received as a bearer token". Bearer + a proof is an ambiguous presentation: honouring the proof
    // would make the Bearer scheme a working route for bound tokens, which is exactly the downgrade
    // §7.2 forbids, and silently dropping the proof would report "no DPoP header provided" to a client
    // that plainly sent one. Refuse it and say why.
    if (presented.scheme === "bearer" && dpopHeader) {
      throw new TokenPresentationError(
        400,
        "invalid_request",
        "A DPoP proof was provided with the Bearer authentication scheme. RFC 9449 Section 7.1 requires the DPoP scheme when presenting a DPoP proof.",
      );
    }

    // Only fields the client is allowed to influence. Server-determined fields (dpop, htm, htu,
    // targetUri, clientCertificate) come from HTTP context, never from the body — the same rule
    // introspection.service.ts follows. Spreading req.body here let a client supply its own `dpop`
    // and `htu`, so a proof captured at another endpoint could be replayed at this one with a
    // matching htu, defeating the RFC 9449 §4.3 binding check.
    const reqBody: UserinfoRequest = { token: presented.token };

    if (presented.scheme === "dpop" && dpopHeader) {
      const { htu, targetUri } = dpopHttpTarget(req);
      reqBody.dpop = dpopHeader;
      reqBody.htm = req.method;
      reqBody.htu = htu;
      reqBody.targetUri = targetUri;
    }

    const log = req.logger || logger;
    log("Userinfo parameters", { scheme: presented.scheme, hasDpop: !!dpopHeader });

    // Call Authlete /userinfo API
    const response = await this.authleteApi.userinfo.process({
      serviceId,
      userinfoRequest: reqBody,
    });

    return response;
  }

  // Accept an explicit UserinfoIssueRequest object instead of assuming req.body
  async issue(
    issueRequest: UserinfoIssueRequest
  ): Promise<UserinfoIssueResponse> {
    // Call Authlete /userinfo API to issue user info
    const response = await this.authleteApi.userinfo.issue({
      serviceId,
      userinfoIssueRequest: issueRequest,
    });

    return response;
  }
}
