import { Request, Response } from "express";
import session from "express-session";
import { createPkcePair, randomString } from "../utils/crypto";
import logger from "../utils/logger";

export class rpInitiatedLogoutService {
  async rpInitiatedLogout(
    req: Request & { session: Partial<session.SessionData> },
    res: Response
  ) {
    const log = req.logger || logger;

    // Clear session data (destroy session if present)
    try {
      req.session.destroy((err: any) => {
        if (err) log.error("Failed to destroy session", { err });
      });
    } catch (e) {
      // Some session implementations may throw if already destroyed
      log.error("Error destroying session", { err: e });
    }

    // Clear the session cookie
    try {
      for (const cookieName in req.cookies) {
        if (Object.hasOwnProperty.call(req.cookies, cookieName)) {
          log("Clearing cookie", { cookieName });
          res.clearCookie(cookieName, { path: "/api" });
        }
      }
    } catch (e) {
      // ignore
    }

    // Render a logout confirmation page instead of redirecting to the same /api/logout route
    // which would cause a redirect loop. The route handler for GET /api/logout should render
    // the same `logout` view when necessary; here we render the view directly.
    const { codeVerifier, codeChallenge } = await createPkcePair();

    return res.render("logout", {
      state: randomString(32),
      nonce: randomString(32),
      code_challenge: codeChallenge,
      code_verifier: codeVerifier,
      code_challenge_method: "S256",
      client_id: process.env.LOGOUT_CLIENT_ID || "YOUR_CLIENT_ID_HERE",
      redirect_uri: process.env.LOGOUT_REDIRECT_URI || "http://localhost:3000",
      scope: "openid email profile",
    });
  }
}
