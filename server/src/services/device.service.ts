import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";
import { Request } from "express";
import logger from "../utils/logger";
import { AppError } from "../utils/app-error";

export class DeviceService {
  constructor(private authleteApi: Authlete = defaultApi) {}

  async authorization(req: Request): Promise<any> {
    const log = req.logger || logger;
    const { parameters, clientId, clientSecret } = req.body as {
      parameters?: string;
      clientId?: string;
      clientSecret?: string;
    };

    if (!parameters) {
      throw new AppError("Missing required body field: parameters", 400);
    }

    log("DeviceService: calling Authlete device authorization endpoint");

    const response = await this.authleteApi.deviceFlow.authorization({
      serviceId,
      deviceAuthorizationRequest: {
        parameters,
        clientId,
        clientSecret,
      },
    });

    return response;
  }

  async verification(userCode: string): Promise<any> {
    const response = await this.authleteApi.deviceFlow.verification({
      serviceId,
      deviceVerificationRequest: { userCode },
    });

    return response;
  }

  async complete(
    userCode: string,
    result: string,
    subject: string,
    extra?: {
      sub?: string;
      authTime?: number;
      acr?: string;
      claims?: string;
    }
  ): Promise<any> {
    const response = await this.authleteApi.deviceFlow.complete({
      serviceId,
      deviceCompleteRequest: {
        userCode,
        result: result as any,
        subject,
        ...extra,
      },
    });

    return response;
  }
}
