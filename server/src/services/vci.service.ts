import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";
import { Request } from "express";
import logger from "../utils/logger";
import { AppError } from "../utils/app-error";

export class VciService {
  constructor(private authleteApi: Authlete = defaultApi) {}

  async getMetadata(pretty: boolean = false): Promise<any> {
    const response = await this.authleteApi.verifiableCredentials.getMetadata({
      serviceId,
      vciMetadataRequest: { pretty },
    });

    return response;
  }

  async getJwtIssuer(pretty: boolean = false): Promise<any> {
    const response = await this.authleteApi.verifiableCredentials.getJwtIssuer({
      serviceId,
      vciJwtissuerRequest: { pretty },
    });

    return response;
  }

  async getJwks(pretty: boolean = false): Promise<any> {
    const response = await this.authleteApi.verifiableCredentials.getJwks({
      serviceId,
      vciJwksRequest: { pretty },
    });

    return response;
  }

  async createOffer(req: Request): Promise<any> {
    const log = req.logger || logger;
    const {
      authorizationCodeGrantIncluded,
      issuerStateIncluded,
      preAuthorizedCodeGrantIncluded,
      subject,
      duration,
      context,
      properties,
      jwtAtClaims,
      authTime,
      acr,
      credentialConfigurationIds,
      txCode,
      txCodeInputMode,
      txCodeDescription,
    } = req.body as {
      authorizationCodeGrantIncluded?: boolean;
      issuerStateIncluded?: boolean;
      preAuthorizedCodeGrantIncluded?: boolean;
      subject?: string;
      duration?: number;
      context?: string;
      properties?: any[];
      jwtAtClaims?: string;
      authTime?: number;
      acr?: string;
      credentialConfigurationIds?: string[];
      txCode?: string;
      txCodeInputMode?: string;
      txCodeDescription?: string;
    };

    if (!credentialConfigurationIds || credentialConfigurationIds.length === 0) {
      throw new AppError("Missing required body field: credentialConfigurationIds", 400);
    }

    log("VciService: calling Authlete VCI offer create API");

    const response = await this.authleteApi.verifiableCredentials.createOffer({
      serviceId,
      vciOfferCreateRequest: {
        authorizationCodeGrantIncluded,
        issuerStateIncluded,
        preAuthorizedCodeGrantIncluded,
        subject,
        duration,
        context,
        properties,
        jwtAtClaims,
        authTime,
        acr,
        credentialConfigurationIds,
        txCode,
        txCodeInputMode,
        txCodeDescription,
      },
    });

    return response;
  }

  async getOfferInfo(identifier: string): Promise<any> {
    if (!identifier) {
      throw new AppError("Missing required body field: identifier", 400);
    }

    const response = await this.authleteApi.verifiableCredentials.getOfferInfo({
      serviceId,
      vciOfferInfoRequest: { identifier },
    });

    return response;
  }

  async issueSingle(accessToken: string, order?: any): Promise<any> {
    const response = await this.authleteApi.verifiableCredentials.issue({
      serviceId,
      vciSingleIssueRequest: { accessToken, order },
    });

    return response;
  }

  async batchIssue(accessToken: string, orders?: any[]): Promise<any> {
    const response = await this.authleteApi.verifiableCredentials.batchIssue({
      serviceId,
      vciBatchIssueRequest: { accessToken, orders },
    });

    return response;
  }

  async issueDeferred(order?: any): Promise<any> {
    const response = await this.authleteApi.verifiableCredentials.deferredIssue({
      serviceId,
      vciDeferredIssueRequest: { order },
    });

    return response;
  }
}
