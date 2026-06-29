import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";
import { Request } from "express";
import logger from "../utils/logger";
import { AppError } from "../utils/app-error";

export class HskService {
  constructor(private authleteApi: Authlete = defaultApi) {}

  async create(req: Request): Promise<any> {
    const log = req.logger || logger;
    const { kty, use, kid, hsmName, alg } = req.body as {
      kty?: string;
      use?: string;
      kid?: string;
      hsmName?: string;
      alg?: string;
    };

    if (!kty) {
      throw new AppError("Missing required body field: kty", 400);
    }
    if (!hsmName) {
      throw new AppError("Missing required body field: hsmName", 400);
    }

    log("HskService: calling Authlete hardware security key create API");

    const response = await this.authleteApi.hardwareSecurityKeys.create({
      serviceId,
      hskCreateRequest: { kty, use, kid, hsmName, alg },
    });

    return response;
  }

  async get(handle: string): Promise<any> {
    if (!handle) {
      throw new AppError("Missing required parameter: handle", 400);
    }

    const response = await this.authleteApi.hardwareSecurityKeys.get({
      serviceId,
      handle,
    });

    return response;
  }

  async delete(handle: string): Promise<any> {
    if (!handle) {
      throw new AppError("Missing required parameter: handle", 400);
    }

    const response = await this.authleteApi.hardwareSecurityKeys.delete({
      serviceId,
      handle,
    });

    return response;
  }

  async list(): Promise<any> {
    const response = await this.authleteApi.hardwareSecurityKeys.list({
      serviceId,
    });

    return response;
  }
}
