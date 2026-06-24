import { Request } from "express";
import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";
import logger from "../utils/logger";

export class DiscoveryService {
  constructor(private authleteApi: Authlete = defaultApi) {}

  async getConfiguration(req: Request) {
    const log = req.logger || logger;
    log("Discovery parameters", { serviceId });

    const response = await this.authleteApi.service.getConfiguration({
      serviceId,
      pretty: true,
    });

    return response;
  }
}
