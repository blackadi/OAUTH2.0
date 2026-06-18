import { Response } from "express";
import { TokenFailResponse } from "@authlete/typescript-sdk/models";
import logger from "../utils/logger";

export function sendTokenFailResponse(res: Response, result: TokenFailResponse) {
    const action = result.action;
    switch (action) {
        case "INTERNAL_SERVER_ERROR":
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(500).send(result.responseContent ?? result);

        case "BAD_REQUEST":
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          return res.status(400).send(result.responseContent ?? result);

        default:
          // req.logger?.error("Unknown token.fail action", { action: result.action });
          logger.error("Unknown token.fail action", { action: result.action });
          return res.status(500).send("Unknown token.fail action");
      }
}

export default sendTokenFailResponse;
