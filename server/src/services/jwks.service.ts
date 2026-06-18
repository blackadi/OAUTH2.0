import { ServiceJwksGetResponse } from "@authlete/typescript-sdk/models";
import { authleteApi, serviceId } from "./authlete.service";

export class JwksService {
  async serviceJwksGetApi(): Promise<ServiceJwksGetResponse | undefined> {
    const response = await authleteApi.jwkSetEndpoint.serviceJwksGetApi({
      serviceId: serviceId,
      pretty: true,
    });

    return response;
  }
}
