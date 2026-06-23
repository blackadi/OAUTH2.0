import {
  BackchannelAuthenticationCompleteRequestResult,
  BackchannelAuthenticationFailRequestReason,
} from "@authlete/typescript-sdk/models";
import { authleteApi, serviceId } from "./authlete.service";
import { Request } from "express";
import logger from "../utils/logger";

export class CibaService {
  async process(req: Request): Promise<any> {
    const log = req.logger || logger;
    const { parameters, clientId, clientSecret } = req.body as {
      parameters?: string;
      clientId?: string;
      clientSecret?: string;
    };

    if (!parameters) {
      const err = new Error("Missing required body field: parameters");
      (err as any).status = 400;
      throw err;
    }

    log("CibaService: calling Authlete backchannel authentication endpoint");

    const response = await authleteApi.ciba.processAuthentication({
      serviceId,
      backchannelAuthenticationRequest: {
        parameters,
        clientId,
        clientSecret,
      },
    });

    return response;
  }

  async issue(ticket: string): Promise<any> {
    const response = await authleteApi.ciba.issue({
      serviceId,
      backchannelAuthenticationIssueRequest: { ticket },
    });

    return response;
  }

  async fail(ticket: string, reason: string): Promise<any> {
    const response = await authleteApi.ciba.fail({
      serviceId,
      backchannelAuthenticationFailRequest: { ticket, reason: reason as BackchannelAuthenticationFailRequestReason },
    });

    return response;
  }

  async complete(
    ticket: string,
    result: string,
    subject: string,
    extra?: {
      sub?: string;
      authTime?: number;
      acr?: string;
      claims?: string;
    }
  ): Promise<any> {
    const response = await authleteApi.ciba.complete({
      serviceId,
      backchannelAuthenticationCompleteRequest: {
        ticket,
        result: result as BackchannelAuthenticationCompleteRequestResult,
        subject,
        ...extra,
      },
    });

    return response;
  }
}
