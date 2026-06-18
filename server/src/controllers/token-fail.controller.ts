import { Request, Response, NextFunction } from "express";
import { TokenService } from "../services/token.service";
import logger from "../utils/logger";
import sendTokenFailResponse from "./token-fail-response.handler";
import { TokenFailRequest } from "@authlete/typescript-sdk/models";

const tokenService = new TokenService();

export const tokenFailController = {
  // POST /api/token/fail
  handleFail: async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Expect body to contain { ticket: string } (Authlete TokenFailRequest shape may include other fields,
      // but TokenService.fail currently accepts a ticket string)
      const failRequest: TokenFailRequest = req.body;

      if (!failRequest.ticket) {
        req.logger?.warn("token/fail called without ticket");
        return res.status(400).json({
          error: "invalid_request",
          error_description: "ticket is required",
        });
      }

      req.logger("Calling Authlete /api/token/fail", { failRequest });

      const result = await tokenService.fail(failRequest);

      return sendTokenFailResponse(res, result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      req.logger?.error("Token Fail Error", { message: error.message });
      logger.error("Token Fail Error", { message: error.message });
      return next(error);
    }
  },
};
