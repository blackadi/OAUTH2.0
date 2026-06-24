import { ServiceJwksGetResponse } from "@authlete/typescript-sdk/models";
import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";

export class JwksService {
  constructor(private authleteApi: Authlete = defaultApi) {}

  async serviceJwksGetApi(): Promise<ServiceJwksGetResponse | undefined> {
    const response = await this.authleteApi.jwkSetEndpoint.serviceJwksGetApi({
      serviceId: serviceId,
      pretty: true,
    });

    return response;
  }
}
