import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";

export class JarService {
  constructor(private authleteApi: Authlete = defaultApi) {}

  async process(request: string, clientId: string): Promise<any> {
    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("request", request);

    const response = await this.authleteApi.authorization.processRequest({
      serviceId,
      authorizationRequest: { parameters: params.toString() },
    });

    return response;
  }
}
