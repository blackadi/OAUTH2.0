import { NextFunction, Request, Response } from "express";
import { AuthorizationService } from "../services/authorization.service";
import { sendAuthorizationIssueResponse } from "./authorization-response.handler";
import logger from "../utils/logger";

const authorizationService = new AuthorizationService();

export const authorizationIssueResponseController = {
  handleAuthorizationIssueResponse: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authorizationService.issue(req);
      
      return sendAuthorizationIssueResponse(res, result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("Authorization Response Error", { message: error.message });
      return next(error);
    }
  },
};
