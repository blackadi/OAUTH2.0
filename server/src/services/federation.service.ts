import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";
import { Request } from "express";
import logger from "../utils/logger";
import { AppError } from "../utils/app-error";

export class FederationService {
  constructor(private authleteApi: Authlete = defaultApi) {}

  async configuration(req: Request): Promise<any> {
    const log = req.logger || logger;
    log("FederationService.configuration: calling Authlete federation configuration API");

    const response = await this.authleteApi.federation.configuration({
      serviceId,
    });

    return response;
  }

  async registration(req: Request): Promise<any> {
    const log = req.logger || logger;
    const { entityConfiguration, trustChain } = req.body as {
      entityConfiguration?: string;
      trustChain?: string;
    };

    if (!entityConfiguration && !trustChain) {
      throw new AppError("Missing required body field: entityConfiguration or trustChain", 400);
    }

    log("FederationService.registration: calling Authlete federation registration API");

    const response = await this.authleteApi.federation.registration({
      serviceId,
      federationRegistrationRequest: { entityConfiguration, trustChain },
    });

    return response;
  }
}
