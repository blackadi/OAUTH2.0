import { PushedAuthorizationRequest } from "@authlete/typescript-sdk/models";
import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";
import { Request } from "express";
import logger from "../utils/logger";
import { AppError } from "../utils/app-error";

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

    if (clientId && clientSecret) {
      requestBody.parameters = this.appendToParams(parameters, [
        { key: "client_id", value: clientId },
        { key: "client_secret", value: clientSecret },
      ]);
    } else if (clientId) {
      requestBody.parameters = this.appendToParams(parameters, [
        { key: "client_id", value: clientId },
      ]);
    }

    // DPoP support — fields come from HTTP headers, not the body
    const dpopHeader = req.headers["dpop"] as string | undefined;
    if (dpopHeader) {
      requestBody.dpop = dpopHeader;
      requestBody.htm = req.method;
      const protocol = req.protocol;
      const host = req.get("host") || "";
      requestBody.htu = `${protocol}://${host}${req.originalUrl}`;
    }

    log("ParService: calling Authlete pushed authorization endpoint", { hasDpop: !!dpopHeader });

    const response = await this.authleteApi.pushedAuthorization.create({
      serviceId,
      pushedAuthorizationRequest: requestBody,
    });

    return response;
  }

  private appendToParams(
    params: string,
    fields: Array<{ key: string; value: string }>
  ): string {
    const searchParams = new URLSearchParams(params);
    for (const { key, value } of fields) {
      searchParams.set(key, value);
    }
    return searchParams.toString();
  }
}
