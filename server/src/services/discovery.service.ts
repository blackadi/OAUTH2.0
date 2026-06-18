import { Request } from "express";
import { authleteApi, serviceId } from "./authlete.service";
import logger from "../utils/logger";

export class DiscoveryService {
  async getConfiguration(req: Request) {
    const log = req.logger || logger;
    log("Discovery parameters", { serviceId });

    const response = await authleteApi.service.getConfiguration({
      serviceId,
      pretty: true,
    });

    return response;
  }
}
