import { authleteApi, serviceId } from "./authlete.service";
import { Request } from "express";
import logger from "../utils/logger";
import { GMResponse } from "@authlete/typescript-sdk/models";

export class GrantManagementService {
  async query(req: Request, grantId: string): Promise<GMResponse> {
    const log = req.logger || logger;
    const accessToken = extractBearerToken(req);

    log("GrantManagement: query grant", { grantId });

    const response = await authleteApi.grantManagement.processRequest({
      serviceId,
      gMRequest: {
        accessToken,
        gmAction: "QUERY",
        grantId,
      },
    });

    return response;
  }

  async revoke(req: Request, grantId: string): Promise<GMResponse> {
    const log = req.logger || logger;
    const accessToken = extractBearerToken(req);

    log("GrantManagement: revoke grant", { grantId });

    const response = await authleteApi.grantManagement.processRequest({
      serviceId,
      gMRequest: {
        accessToken,
        gmAction: "REVOKE",
        grantId,
      },
    });

    return response;
  }
}

function extractBearerToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return undefined;
}
