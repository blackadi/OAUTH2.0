import { Request, NextFunction, Response } from "express";
import logger from "../utils/logger";
import { TokenResponse } from "@authlete/typescript-sdk/models";
import { NativeSsoService } from "../services/native-sso.service";

const nativeSsoService = new NativeSsoService();

export async function handleNativeSso(
  req: Request,
  res: Response,
  result: TokenResponse,
  next: NextFunction
) {
  try {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");

    const accessToken = result.jwtAccessToken || result.accessToken;
    const deviceSecret = result.deviceSecret;

    if (!accessToken || !deviceSecret) {
      logger.error("handleNativeSso: missing accessToken or deviceSecret in token response");
      return res.status(500).json({
        error: "server_error",
        error_description: "Missing accessToken or deviceSecret for Native SSO",
      });
    }

    // Build the Native SSO request from the token response
    req.body = {
      accessToken,
      deviceSecret,
      ...(result.refreshToken && { refreshToken: result.refreshToken }),
      ...(result.sessionId && { sub: result.subject }),
    };

    logger("handleNativeSso: calling nativeSsoService.process", { accessToken: accessToken.substring(0, 20) + "..." });

    const nativeSsoResponse = await nativeSsoService.process(req);

    switch (nativeSsoResponse.action) {
      case "OK":
        return res.status(200).send(nativeSsoResponse.responseContent);

      case "CALLER_ERROR":
        return res.status(400).json({
          error: "invalid_request",
          error_description: nativeSsoResponse.resultMessage || "Native SSO caller error",
        });

      case "INTERNAL_SERVER_ERROR":
        return res.status(500).json({
          error: "server_error",
          error_description: nativeSsoResponse.resultMessage || "Internal server error",
        });

      default:
        logger.error("handleNativeSso: unknown action", { action: nativeSsoResponse.action });
        return res.status(500).json({
          error: "server_error",
          error_description: "Unknown Native SSO action",
        });
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error("handleNativeSso Error", { message: error.message });
    return next(error);
  }
}

export default { handleNativeSso };
