import { Request } from "express";
import {
  AuthorizationFailRequestReason,
  AuthorizationFailResponse,
  AuthorizationIssueRequest,
  AuthorizationIssueResponse,
  AuthorizationResponse,
} from "@authlete/typescript-sdk/models";
import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";
import session from "express-session";
import logger from "../utils/logger";
import { AppError } from "../utils/app-error";

export class AuthorizationService {
  constructor(private authleteApi: Authlete = defaultApi) {}

  async process(req: Request): Promise<AuthorizationResponse> {
    // Convert Express request into a query string
    const reqBody =
      req.method === "GET" ? req.query : req.body;
    const log = req.logger || logger;
    log("Authorization request parameters", { params: reqBody });

    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(reqBody)) {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    }

    reqBody.parameters = params.toString();
    // Call Authlete /authorization API
    const response = await this.authleteApi.authorization.processRequest({
      serviceId: serviceId,
      authorizationRequest: reqBody,
    });

    return response;
  }

  async fail(
    ticket: string,
    reason: AuthorizationFailRequestReason
  ): Promise<AuthorizationFailResponse> {
    const response = await this.authleteApi.authorization.fail({
      serviceId,
      authorizationFailRequest: {
        ticket,
        reason,
      },
    });

    return response;
  }

  async issue(
    req: Request & { session: Partial<session.SessionData> }
  ): Promise<AuthorizationIssueResponse> {
    const ticket = req.session.authorization?.authorizationIssueRequest?.ticket;
    const subject = req.session.user;

    if (!ticket) {
      throw new AppError(
        "Missing ticket in session - authorization context lost",
        400
      );
    }

    if (!subject) {
      throw new AppError(
        "Missing user subject in session - user not authenticated",
        401
      );
    }

    if (req.session.authorization?.authorizationIssueRequest) {
      req.session.authorization.authorizationIssueRequest.subject = subject;
    }

    const log = req.logger || logger;
    const reqBody: AuthorizationIssueRequest = {
      ...req.session.authorization?.authorizationIssueRequest,
    } as AuthorizationIssueRequest;

    log("Issue authorization request parameters", { params: reqBody });

    const response = await this.authleteApi.authorization.issue({
      serviceId,
      authorizationIssueRequest: reqBody,
    });

    return response;
  }
}
