import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";
import { Request } from "express";
import logger from "../utils/logger";
import { GMRequest, GMResponse } from "@authlete/typescript-sdk/models";
import { dpopHttpTarget, extractAccessToken } from "../utils/dpop";

export class GrantManagementService {
  constructor(private authleteApi: Authlete = defaultApi) {}

  async query(req: Request, grantId: string): Promise<GMResponse> {
    return this.process(req, grantId, "QUERY");
  }

  async revoke(req: Request, grantId: string): Promise<GMResponse> {
    return this.process(req, grantId, "REVOKE");
  }

  /**
   * `requireGrantOwnership` has already validated the presentation and the ownership by the time this
   * runs, so the token is re-read here rather than re-checked.
   *
   * **The DPoP proof must be forwarded.** Authlete validates the `cnf.jkt` binding independently at
   * this API: verified live 2026-08-12, a bound token sent without a proof returns `[A281305] The
   * access token is bound to a public key but the grant management request includes no DPoP header.`
   * Passing the ownership check and then omitting the proof would simply move the 401 one call later.
   * Re-using the proof the client sent is correct and accepted — it describes this same request, and
   * Authlete does not reject it as a replay of the one `/auth/introspection` already saw.
   */
  private async process(
    req: Request,
    grantId: string,
    gmAction: "QUERY" | "REVOKE",
  ): Promise<GMResponse> {
    const log = req.logger || logger;
    const presented = extractAccessToken(req);
    const dpopHeader = req.headers["dpop"] as string | undefined;

    const gMRequest: GMRequest = {
      accessToken: presented?.token,
      gmAction,
      grantId,
    };

    if (presented?.scheme === "dpop" && dpopHeader) {
      gMRequest.dpop = dpopHeader;
      gMRequest.htm = req.method;
      gMRequest.htu = dpopHttpTarget(req).htu;
    }

    log.info(`GrantManagement: ${gmAction.toLowerCase()} grant`, {
      grantId,
      scheme: presented?.scheme,
    });

    return this.authleteApi.grantManagement.processRequest({ serviceId, gMRequest });
  }
}
