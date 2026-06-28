import { Response } from "express";
import { AuthorizationIssueResponse } from "@authlete/typescript-sdk/models";

export function sendAuthorizationIssueResponse(res: Response, result: AuthorizationIssueResponse) {
  switch (result.action) {
    case "BAD_REQUEST":
      return res.status(400).send(result.responseContent);

    case "INTERNAL_SERVER_ERROR":
      return res.status(500).send(result.responseContent);

    case "LOCATION":
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      return res.redirect(result.responseContent ?? "");

    case "FORM":
      res.setHeader("Content-Type", "text/html;charset=UTF-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      return res.status(200).send(result.responseContent);

    default:
      return res.status(500).send("Unknown authorization action");
  }
}

export default sendAuthorizationIssueResponse;
