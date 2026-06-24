import { Request, Response } from "express";
import session from "express-session";
import jwt from "jsonwebtoken";
import logger from "../utils/logger";
import { BackchannelLogoutService } from "./backchannel-logout.service";

export class rpInitiatedLogoutService {
  constructor(private backchannelLogoutService: BackchannelLogoutService = new BackchannelLogoutService()) {}

  async rpInitiatedLogout(
    req: Request & { session: Partial<session.SessionData> },
    res: Response
  ) {
    const log = req.logger || logger;

    const { id_token_hint, post_logout_redirect_uri, state, client_id, backchannel } =
      req.query as Record<string, string | undefined>;

    // 1. Identify the user — from local session or id_token_hint
    let subject: string | undefined = req.session.user;

    if (!subject && id_token_hint) {
      try {
        const decoded = jwt.decode(id_token_hint, { complete: true }) as jwt.JwtPayload | null;
        if (decoded?.payload?.sub) {
          subject = decoded.payload.sub as string;
          log("Logout: identified subject from id_token_hint", { subject });
        }
      } catch {
        log("Logout: failed to decode id_token_hint");
      }
    }

    log("RP-Initiated Logout", {
      subject,
      hasPostLogoutRedirectUri: !!post_logout_redirect_uri,
      clientId: client_id,
      backchannel: !!backchannel,
    });

    // 2. If backchannel=true, fire deliver-all BEFORE session destruction
    //    so we can log the subject while it's still available
    let backchannelResults: unknown = null;
    if (backchannel === "true" && subject) {
      try {
        backchannelResults = await this.backchannelLogoutService.issueAndDeliverToAll(subject);
        log("Backchannel logout deliver-all completed", { subject });
      } catch (err) {
        log.error("Backchannel logout deliver-all failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 3. Destroy the local session and clear cookie
    req.session.destroy((err) => {
      if (err) log.error("Failed to destroy session", { err });
    });
    res.clearCookie("connect.sid", { path: "/" });

    // 4. Validate post_logout_redirect_uri against allowed URIs
    const allowedRedirectUri = process.env.LOGOUT_REDIRECT_URI || "http://localhost:3000";

    if (post_logout_redirect_uri) {
      const allowedOrigins = new Set(
        (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim())
      );
      const isAllowed =
        post_logout_redirect_uri === allowedRedirectUri ||
        (process.env.NODE_ENV !== "production" && post_logout_redirect_uri.startsWith("http://localhost:")) ||
        [...allowedOrigins].some((origin) => post_logout_redirect_uri?.startsWith(origin));

      if (isAllowed) {
        const separator = post_logout_redirect_uri.includes("?") ? "&" : "?";
        const redirectUrl = state
          ? `${post_logout_redirect_uri}${separator}state=${encodeURIComponent(state)}`
          : post_logout_redirect_uri;

        log("Logout: redirecting to post_logout_redirect_uri", { redirectUrl });
        return res.redirect(redirectUrl);
      }

      log("Logout: post_logout_redirect_uri not allowed, rendering page", {
        post_logout_redirect_uri,
      });
    }

    // 5. No valid redirect — render logout confirmation
    return res.render("logout", {
      client_id: client_id || process.env.LOGOUT_CLIENT_ID || "",
      post_logout_redirect_uri: allowedRedirectUri,
      subject: subject || "",
      backchannelResults: backchannelResults ? JSON.stringify(backchannelResults, null, 2) : null,
    });
  }
}
