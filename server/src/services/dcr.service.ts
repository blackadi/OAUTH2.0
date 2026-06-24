import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";
import { Request } from "express";
import logger from "../utils/logger";

export class DcrService {
  constructor(private authleteApi: Authlete = defaultApi) {}

  async register(req: Request): Promise<any> {
    const log = req.logger || logger;
    const { json } = req.body as { json?: string };

    if (!json) {
      const err = new Error("Missing required body field: json");
      (err as any).status = 400;
      throw err;
    }

    log("DcrRegisterService: calling Authlete DCR register endpoint");

    const response = await this.authleteApi.dynamicClientRegistration.register({
      serviceId,
      requestBody: { json },
    });

    return response;
  }

  async get(req: Request): Promise<any> {
    const log = req.logger || logger;
    const { token, clientId } = req.body as { token?: string; clientId?: string };

    if (!token) {
      const err = new Error("Missing required body field: token");
      (err as any).status = 400;
      throw err;
    }

    if (!clientId) {
      const err = new Error("Missing required body field: clientId");
      (err as any).status = 400;
      throw err;
    }

    log("DcrGetService: calling Authlete DCR get endpoint", { clientId });

    const response = await this.authleteApi.dynamicClientRegistration.get({
      serviceId,
      requestBody: { token, clientId },
    });

    return response;
  }

  async update(req: Request): Promise<any> {
    const log = req.logger || logger;
    const { json, token, clientId } = req.body as { json?: string; token?: string; clientId?: string };

    if (!json) {
      const err = new Error("Missing required body field: json");
      (err as any).status = 400;
      throw err;
    }

    if (!token) {
      const err = new Error("Missing required body field: token");
      (err as any).status = 400;
      throw err;
    }

    if (!clientId) {
      const err = new Error("Missing required body field: clientId");
      (err as any).status = 400;
      throw err;
    }

    log("DcrUpdateService: calling Authlete DCR update endpoint", { clientId });

    const response = await this.authleteApi.dynamicClientRegistration.update({
      serviceId,
      requestBody: { json, token, clientId },
    });

    return response;
  }

  async delete(req: Request): Promise<any> {
    const log = req.logger || logger;
    const { token, clientId } = req.body as { token?: string; clientId?: string };

    if (!token) {
      const err = new Error("Missing required body field: token");
      (err as any).status = 400;
      throw err;
    }

    if (!clientId) {
      const err = new Error("Missing required body field: clientId");
      (err as any).status = 400;
      throw err;
    }

    log("DcrDeleteService: calling Authlete DCR delete endpoint", { clientId });

    const response = await this.authleteApi.dynamicClientRegistration.delete({
      serviceId,
      requestBody: { token, clientId },
    });

    return response;
  }
}
