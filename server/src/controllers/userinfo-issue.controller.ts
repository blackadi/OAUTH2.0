import { Request, Response, NextFunction } from "express";
import { UserInfoService } from "../services/userinfo.service";
import logger from "../utils/logger";
import senduserInfoIssueResponse from "./userinfo-issue-response.handler";

const userInfoService = new UserInfoService();

export const userinfoIssueController = {
  // POST /api/userinfo/issue
  handleIssue: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const issueRequest = req.body; // Expect Authlete UserinfoIssueRequest shape

      req.logger("Calling Authlete /userinfo/issue", { body: issueRequest });

      const result = await userInfoService.issue(issueRequest);

      return senduserInfoIssueResponse(res, result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      req.logger?.error("Error calling userinfo.issue", {
        message: error.message,
      });
      logger.error("Error calling userinfo.issue", { message: error.message });
      return next(error);
    }
  },
};
