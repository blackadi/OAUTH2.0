import { Request } from "express";
import {
  UserinfoIssueRequest,
  UserinfoIssueResponse,
  UserinfoRequest,
  UserinfoResponse,
} from "@authlete/typescript-sdk/models";
import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";
import logger from "../utils/logger";

export class UserInfoService {
  constructor(private authleteApi: Authlete = defaultApi) {}

  async process(req: Request): Promise<UserinfoResponse> {
    const reqBody: UserinfoRequest =
      req.method === "GET" ? {} : req.body ?? {};

    if (req.headers["authorization"]) {
      const authHeader = req.headers["authorization"] || "";
      reqBody.token = authHeader.replace("Bearer ", "");
    }
    const log = req.logger || logger;
    log("Userinfo parameters", { reqBody });

    // Call Authlete /userinfo API
    const response = await this.authleteApi.userinfo.process({
      serviceId,
      userinfoRequest: reqBody,
    });

    return response;
  }

  // Accept an explicit UserinfoIssueRequest object instead of assuming req.body
  async issue(
    issueRequest: UserinfoIssueRequest
  ): Promise<UserinfoIssueResponse> {
    // Call Authlete /userinfo API to issue user info
    const response = await this.authleteApi.userinfo.issue({
      serviceId,
      userinfoIssueRequest: issueRequest,
    });

    return response;
  }
}
