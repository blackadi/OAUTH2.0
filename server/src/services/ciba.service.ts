import {
  BackchannelAuthenticationCompleteRequestResult,
  BackchannelAuthenticationFailRequestReason,
} from "@authlete/typescript-sdk/models";
import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";
import { Request } from "express";
import logger from "../utils/logger";
import { AppError } from "../utils/app-error";
import { parseBasicAuth } from "../utils/basic-auth";
import { appendToParams } from "../utils/params";

export class CibaService {
  constructor(private authleteApi: Authlete = defaultApi) {}

  async process(req: Request): Promise<any> {
    const log = req.logger || logger;
    const { parameters, clientId, clientSecret } = req.body as {
      parameters?: string;
      clientId?: string;
      clientSecret?: string;
    };

    if (!parameters) {
      throw new AppError("Missing required body field: parameters", 400);
    }

    const requestBody: {
      parameters: string;
      clientId?: string;
      clientSecret?: string;
    } = { parameters };

    // Client authentication, identical to `par.service.ts` and for the same reason: Authlete matches the
    // channel credentials arrive on against the client's registered auth method, so the caller picks the
    // channel and this service must not reinterpret it.
    //
    //   Authorization: Basic     -> top-level clientId/clientSecret   client_secret_basic
    //   body clientId+Secret     -> merged into `parameters`          client_secret_post
    //   body clientId only       -> client_id in `parameters`         none (public client)
    //
    // Until 2026-08-13 this method read the body only and never looked at the `Authorization` header, so a
    // `CLIENT_SECRET_BASIC` client could not authenticate at all — which is the very configuration
    // `AGENTS.md` recommends for CIBA, citing Authlete's own guide. The guide and the code disagreed.
    //
    // Note 6749-W1's dual-channel refusal is deliberately NOT applied here: this endpoint takes a JSON
    // body, so credentials never ride in a `rawBody` that reaches Authlete unmodified, and the ambiguous
    // shape that refusal exists for cannot arise.
    const basic = parseBasicAuth(req.headers.authorization);

    if (basic) {
      // Server-determined, straight from HTTP context — never from the body.
      requestBody.clientId = basic.clientId;
      requestBody.clientSecret = basic.clientSecret;
    } else if (clientId && clientSecret) {
      requestBody.parameters = appendToParams(parameters, [
        { key: "client_id", value: clientId },
        { key: "client_secret", value: clientSecret },
      ]);
    } else if (clientId) {
      requestBody.parameters = appendToParams(parameters, [
        { key: "client_id", value: clientId },
      ]);
    }

    log.info("CibaService: calling Authlete backchannel authentication endpoint", {
      clientAuth: basic ? "basic" : clientSecret ? "post" : clientId ? "none" : "absent",
    });

    const response = await this.authleteApi.ciba.processAuthentication({
      serviceId,
      backchannelAuthenticationRequest: requestBody,
    });

    return response;
  }

  async issue(ticket: string): Promise<any> {
    const response = await this.authleteApi.ciba.issue({
      serviceId,
      backchannelAuthenticationIssueRequest: { ticket },
    });

    return response;
  }

  async fail(ticket: string, reason: string): Promise<any> {
    const response = await this.authleteApi.ciba.fail({
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
    const response = await this.authleteApi.ciba.complete({
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
