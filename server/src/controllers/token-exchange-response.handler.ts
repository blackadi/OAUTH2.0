import { Request, NextFunction, Response } from "express";
import logger from "../utils/logger";
import {
  TokenCreateRequest,
  TokenResponse,
} from "@authlete/typescript-sdk/models";
import { TokenManagementService } from "../services/token.operations.service";

const tokenManagementService = new TokenManagementService();

export async function handleTokenExchange(
  req: Request,
  res: Response,
  result: TokenResponse,
  next: NextFunction
) {
  try {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-cache, no-store");

    const subjectToken = result.subjectToken;
    const clientId = result.clientId as number;
    const scopes = result.scopes;

    // Authlete validates the subject token server-side.
    // Use the resolved subject from Authlete, falling back to the raw subject token.
    const subject = result.subject || subjectToken;

    const tokenCreateRequest: TokenCreateRequest = {
      grantType: "TOKEN_EXCHANGE",
      clientId,
      scopes,
      subject,
    } as TokenCreateRequest;

    req.body = tokenCreateRequest;

    logger("handleTokenExchange: tokenCreateRequest", req.body);

    // Call Authlete to create token
    const tokenCreateResponse = await tokenManagementService.create(req);

    switch (tokenCreateResponse.action) {
      case "OK":
        return res
          .status(200)
          .type("application/json")
          .send({
            access_token: tokenCreateResponse.accessToken,
            token_type: tokenCreateResponse.tokenType || "Bearer",
            expires_in: tokenCreateResponse.expiresIn,
            scope: tokenCreateResponse.scopes?.join(" ") || "",
            client_id: tokenCreateResponse.clientId,
            subject: tokenCreateResponse.subject,
          });

      case "BAD_REQUEST":
        return res
          .status(400)
          .type("application/json")
          .send(tokenCreateResponse);

      case "FORBIDDEN":
        return res
          .status(403)
          .type("application/json")
          .send(tokenCreateResponse);

      case "INTERNAL_SERVER_ERROR":
        return res
          .status(500)
          .type("application/json")
          .send(tokenCreateResponse);

      default:
        logger.error("Unknown TOKEN_EXCHANGE action", tokenCreateResponse);
        return res
          .status(500)
          .type("application/json")
          .send(tokenCreateResponse);
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error("tokenCreateResponse Error", { message: error.message });
    return next(error);
  }
}

export default { handleTokenExchange };
