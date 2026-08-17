import { createHash, randomBytes } from "node:crypto";
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

    if (!accessToken) {
      logger.error("handleNativeSso: missing accessToken in token response");
      return res.status(500).json({
        error: "server_error",
        error_description: "Missing accessToken for Native SSO",
      });
    }

    // **The authorization server mints the device secret; Authlete does not always supply one.**
    //
    // This block used to require `result.deviceSecret` and answer 500 without it — so Phase 1 was a
    // guaranteed 500 the moment `nativeSsoSupported` was enabled, from code that compiles and reads
    // correctly (`NATIVE-SSO-1.0.md` F-4, found 2026-08-17 by enabling the flag and walking the chain).
    //
    // Authlete's `action: NATIVE_SSO` response to an *authorization-code* exchange carries **no**
    // `deviceSecret`: there is no prior secret to carry forward. SDK 1.0.0's own model says so — the AS
    // "may choose to issue a new device secret; in that case, it is free to generate a new device secret
    // and specify the new value." On the *Phase 2* token exchange Authlete **does** return one, and it
    // must be forwarded unchanged rather than replaced, or the second app's secret would not match the
    // `ds_hash` already bound to the session.
    const deviceSecret = result.deviceSecret || randomBytes(32).toString("base64url");

    // Native SSO 1.0 binds the ID token to the secret through `ds_hash`. The specification leaves the
    // computation to the AS ("compute the hash value of the device secret based on its own logic"), so
    // this is a choice, not a derivation — base64url(SHA-256) matches the `at_hash`/`c_hash` family and
    // was confirmed end to end on 2026-08-17: Authlete echoed exactly this value as `ds_hash`.
    const deviceSecretHash = createHash("sha256").update(deviceSecret).digest("base64url");

    // Build the Native SSO request from the token response
    req.body = {
      accessToken,
      deviceSecret,
      deviceSecretHash,
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
