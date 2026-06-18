import { Response } from "express";
import { UserinfoIssueResponse } from "@authlete/typescript-sdk/models";
import logger from "../utils/logger";

export function senduserInfoIssueResponse(res: Response, result: UserinfoIssueResponse) {
    const action = result.action;

  switch (action) {
    case "BAD_REQUEST":
          res.setHeader("WWW-Authenticate", result.responseContent ?? "");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(400).send(result.responseContent ?? "Bad Request");

        case "UNAUTHORIZED":
          res.setHeader("WWW-Authenticate", result.responseContent ?? "");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(401).send(result.responseContent ?? "Unauthorized");

        case "INTERNAL_SERVER_ERROR":
          res.setHeader("WWW-Authenticate", result.responseContent ?? "");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(500).send(result.responseContent ?? "Internal Server Error");

        case "FORBIDDEN":
          res.setHeader("WWW-Authenticate", result.responseContent ?? "");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(403).send(result.responseContent ?? "Forbidden");

        case "JSON":
          // responseContent is JSON text
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Content-Type", "application/json;charset=UTF-8");
          return res.status(200).send(result.responseContent);

        case "JWT":
          // responseContent is a JWT string
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Content-Type", "application/jwt");
          return res.status(200).send(result.responseContent);

        default:
          logger.error("Unknown action from Authlete /userinfo/issue", { action });
          return res.status(500).send("Unknown action from userinfo issue");
  }
}

export default senduserInfoIssueResponse;
