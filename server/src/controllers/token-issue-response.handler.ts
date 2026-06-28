import { Response } from "express";
import { TokenIssueResponse } from "@authlete/typescript-sdk/models";
import logger from "../utils/logger";

export function sendTokenIssueResponse(res: Response, result: TokenIssueResponse) {
    const action = result.action;
    switch (action) {
        case "INTERNAL_SERVER_ERROR":
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(500).send(result.responseContent ?? result);

        case "OK":
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(200).send(result.responseContent ?? result);

        default:
          logger.error("Unknown token.issue action", { action: result.action });
          return res.status(500).send("Unknown token.issue action");
      }
}

export default sendTokenIssueResponse;
