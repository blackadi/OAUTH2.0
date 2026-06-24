import { NextFunction, Request, Response } from "express";
import {
  AuthorizationFailRequestReason,
  AuthorizationFailResponse,
  AuthorizationIssueRequest,
  AuthorizationIssueResponse,
  AuthorizationRequest,
  AuthorizationResponse,
} from "@authlete/typescript-sdk/models";
import { Authlete } from "@authlete/typescript-sdk";
import { authleteApi as defaultApi, serviceId } from "./authlete.service";
import session from "express-session";
import logger from "../utils/logger";

export class AuthorizationService {
  constructor(private authleteApi: Authlete = defaultApi) {}

  async process(req: Request): Promise<AuthorizationResponse> {
    // Convert Express request into a query string
    const { context, ...reqBody }: AuthorizationRequest =
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
    try {
      let ticket = req.session.authorization?.authorizationIssueRequest?.ticket;
      let subject = req.session.user;

      // Throw custom errors that the error handler will catch
      if (!ticket) {
        const err = new Error(
          "Missing ticket in session - authorization context lost"
        );
        (err as any).status = 400; // Bad Request
        throw err;
      }

      if (!subject) {
        const err = new Error(
          "Missing user subject in session - user not authenticated"
        );
        (err as any).status = 401; // Unauthorized
        throw err;
      } else if (req.session.authorization?.authorizationIssueRequest) {
        req.session.authorization.authorizationIssueRequest.subject = subject;
      }

      const log = req.logger || logger;
      log("Issue authorization request parameters", {
        reqBody: req.session.authorization?.authorizationIssueRequest,
      });

      const reqBody: AuthorizationIssueRequest = {
        ...req.session.authorization?.authorizationIssueRequest,
      } as AuthorizationIssueRequest;

      logger("Issue authorization request parameters", { params: reqBody });

      const response = await this.authleteApi.authorization.issue({
        serviceId,
        authorizationIssueRequest: reqBody,
      });

      return response;
    } catch (error) {
      // Let the error bubble up to be caught by route handler
      throw error;
    }
  }
}
