import { Response } from "express";
import { AuthorizationFailResponse } from "@authlete/typescript-sdk/models";

export function sendAuthorizationFailResponse(res: Response, result: AuthorizationFailResponse) {
  switch (result.action) {
    case "INTERNAL_SERVER_ERROR":
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      return res.status(500).send(result.responseContent);

    case "BAD_REQUEST":
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      return res.status(400).send(result.responseContent);

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

export default sendAuthorizationFailResponse;
