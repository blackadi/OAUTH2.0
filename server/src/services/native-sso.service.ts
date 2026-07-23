import {
  NativeSsoRequest,
  NativeSsoResponse,
  NativeSsoLogoutRequest,
  NativeSsoLogoutResponse,
} from "@authlete/typescript-sdk/models";
import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";
import { Request } from "express";
import logger from "../utils/logger";
import { AppError } from "../utils/app-error";

export class NativeSsoService {
  constructor(private authleteApi: Authlete = defaultApi) {}

  async process(
    req: Request
  ): Promise<NativeSsoResponse> {
    const log = req.logger || logger;
    const { accessToken, deviceSecret, refreshToken, sub, claims, idtHeaderParams, idTokenAudType, deviceSecretHash } =
      req.body as Partial<NativeSsoRequest>;

    if (!accessToken) {
      throw new AppError("Missing required field: accessToken", 400);
    }

    if (!deviceSecret) {
      throw new AppError("Missing required field: deviceSecret", 400);
    }

    log("NativeSsoService: calling Authlete /nativesso endpoint");

    const nativeSsoRequest: NativeSsoRequest = {
      accessToken,
      deviceSecret,
      ...(refreshToken && { refreshToken }),
      ...(sub && { sub }),
      ...(claims && { claims }),
      ...(idtHeaderParams && { idtHeaderParams }),
      ...(idTokenAudType && { idTokenAudType }),
      ...(deviceSecretHash && { deviceSecretHash }),
    };

    const response = await this.authleteApi.nativeSso.process({
      serviceId,
      nativeSsoRequest,
    });

    return response;
  }

  async logout(
    req: Request
  ): Promise<NativeSsoLogoutResponse> {
    const log = req.logger || logger;
    const { sessionId } = req.body as NativeSsoLogoutRequest;

    if (!sessionId) {
      throw new AppError("Missing required field: sessionId", 400);
    }

    log("NativeSsoService: calling Authlete /nativesso/logout endpoint");

    const response = await this.authleteApi.nativeSso.logout({
      serviceId,
      nativeSsoLogoutRequest: { sessionId },
    });

    return response;
  }
}
