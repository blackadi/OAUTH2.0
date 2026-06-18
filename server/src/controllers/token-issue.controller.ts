import { Request, Response, NextFunction } from "express";
import { TokenService } from "../services/token.service";
import logger from "../utils/logger";
import sendTokenIssueResponse from "./token-issue-response.handler";
import { TokenIssueRequest } from "@authlete/typescript-sdk/models";

const tokenService = new TokenService();

export const tokenIssueController = {
  // POST /api/token/issue
  handleIssue: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const issueRequest: TokenIssueRequest = req.body; // Expect Authlete TokenIssueRequest shape

      req.logger("Calling Authlete /api/token/issue", { body: issueRequest });

      const result = await tokenService.issue(issueRequest);

      return sendTokenIssueResponse(res, result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      req.logger?.error("Token Issue Error", { message: error.message });
      logger.error("Token Issue Error", { message: error.message });
      return next(error);
    }
  },
};
