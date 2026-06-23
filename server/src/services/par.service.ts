import { PushedAuthorizationRequest } from "@authlete/typescript-sdk/models";
import { authleteApi, serviceId } from "./authlete.service";
import { Request } from "express";
import logger from "../utils/logger";

export class ParService {
  async process(req: Request): Promise<any> {
    const log = req.logger || logger;
    const { parameters, clientId, clientSecret } = req.body as {
      parameters?: string;
      clientId?: string;
      clientSecret?: string;
    };

    if (!parameters) {
      const err = new Error("Missing required body field: parameters");
      (err as any).status = 400;
      throw err;
    }

    log("ParService: calling Authlete pushed authorization endpoint");

    const requestBody: PushedAuthorizationRequest = {
      parameters,
      clientId,
      clientSecret,
    };

    const response = await authleteApi.pushedAuthorization.create({
      serviceId,
      pushedAuthorizationRequest: requestBody,
    });

    return response;
  }
}
