import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";
import { Request } from "express";
import logger from "../utils/logger";
import { AppError } from "../utils/app-error";

export class FederationService {
  constructor(private authleteApi: Authlete = defaultApi) {}

  async configuration(req: Request): Promise<any> {
    const log = req.logger || logger;
    log.info("FederationService.configuration: calling Authlete federation configuration API");

    // `requestBody` is optional in the SDK type and mandatory in practice. Omitting it makes the SDK send
    // no `Content-Type`, and Authlete answers `400 [A258201] … Content-Type header is not specified.` The
    // SDK then throws, so the caller received a **400** for a fault that was entirely ours (FED-W5).
    //
    // Passing `{}` is the whole fix, and it changes the failure rather than removing it — verified live:
    // the call now reaches Authlete's real answer, `INTERNAL_SERVER_ERROR` /
    // `[A316201] Because a JWK Set for federation has not been set up, this service cannot generate entity
    // configuration.`, which the controller maps to 500. That is the honest status, and the message names
    // the missing configuration instead of blaming the request.
    const response = await this.authleteApi.federation.configuration({
      serviceId,
      requestBody: {},
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

    log.info("FederationService.registration: calling Authlete federation registration API");

    const response = await this.authleteApi.federation.registration({
      serviceId,
      federationRegistrationRequest: { entityConfiguration, trustChain },
    });

    return response;
  }
}
