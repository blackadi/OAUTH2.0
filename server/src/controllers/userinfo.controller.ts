import { Request, Response, NextFunction } from "express";
import { UserInfoService } from "../services/userinfo.service";
import logger from "../utils/logger";
import {
  UserinfoIssueRequest,
  UserinfoResponse,
} from "@authlete/typescript-sdk/models";
import { senduserInfoIssueResponse } from "./userinfo-issue-response.handler";

const userInfoService = new UserInfoService();

export const userinfoController = {
  handleUserInfo: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await userInfoService.process(req);

      switch (result.action) {
        case "BAD_REQUEST":
          // RFC 6750: client did not present an access token
          res.setHeader("WWW-Authenticate", result.responseContent ?? "");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(400).send(result.responseContent ?? "Bad Request");

        case "UNAUTHORIZED":
          // RFC 6750: invalid/expired token
          res.setHeader("WWW-Authenticate", result.responseContent ?? "");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(401).send(result.responseContent ?? "Unauthorized");

        case "INTERNAL_SERVER_ERROR":
          // Authlete indicates a server-side error
          res.setHeader("WWW-Authenticate", result.responseContent ?? "");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res
            .status(500)
            .send(result.responseContent ?? "Internal Server Error");

        case "FORBIDDEN":
          // Token does not include `openid` scope
          res.setHeader("WWW-Authenticate", result.responseContent ?? "");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(403).send(result.responseContent ?? "Forbidden");

        case "OK":
          if (result.responseContent) {
            res.setHeader("Content-Type", "application/json");
            return res.status(200).send(result.responseContent);
          }

          const subject = result.subject;
          const claimNames: string[] = result.claims || [];

          if (!subject) {
            const log1 = req.logger || logger;
            log1.error("Userinfo OK but no subject returned by Authlete", { result });
            res.setHeader(
              "WWW-Authenticate",
              'Bearer error="server_error", error_description="No subject returned"'
            );
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("Pragma", "no-cache");
            return res.status(500).send("Missing subject in userinfo response");
          }

          const claims: Record<string, unknown> = { sub: subject };
          for (const name of claimNames) {
            switch (name) {
              case "name":
              case "given_name":
              case "family_name":
              case "nickname":
              case "preferred_username":
                claims[name] = subject;
                break;
              case "email":
                claims[name] = `${subject}@example.com`;
                break;
              case "email_verified":
                claims[name] = true;
                break;
              case "zoneinfo":
                claims[name] = "UTC";
                break;
              case "locale":
                claims[name] = "en-US";
                break;
              case "updated_at":
                claims[name] = Math.floor(Date.now() / 1000);
                break;
              default:
                break;
            }
          }

          logger("Prepared userinfo claims", { subject, claims });

          const token =
            (req.headers["authorization"] as string)?.replace(
              /^Bearer\s+/i,
              ""
            ) || "";
          const issueRequest: UserinfoIssueRequest = {
            token,
            sub: subject,
            claims: JSON.stringify(claims),
          };

          try {
            const issueResponse = await userInfoService.issue(issueRequest);
            return senduserInfoIssueResponse(res, issueResponse);
          } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            const log2 = req.logger || logger;
            log2.error("Failed to issue userinfo", { message: err.message });
            res.setHeader(
              "WWW-Authenticate",
              'Bearer error="server_error", error_description="Failed to extract information about the subject from the database."'
            );
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("Pragma", "no-cache");
            return res.status(500).send({
              error: "server_error",
              error_description:
                "Failed to extract information about the subject from the database.",
            });
          }

        default:
          const log3 = req.logger || logger;
          log3.error("Unknown userinfo action", { action: result.action });
          return res.status(500).send("Unknown userinfo action");
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const log = req.logger || logger;
      log.error("UserInfo Response Error", { message: error.message });
      return next(error);
    }
  },
};
