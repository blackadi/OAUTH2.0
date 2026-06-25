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

    log("ParService: calling Authlete pushed authorization endpoint");

    const requestBody: PushedAuthorizationRequest = {
      parameters,
      clientId,
      clientSecret,
    };

    const response = await this.authleteApi.pushedAuthorization.create({
      serviceId,
      pushedAuthorizationRequest: requestBody,
    });

    return response;
  }
}
