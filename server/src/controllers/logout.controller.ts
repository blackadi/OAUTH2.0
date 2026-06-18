import { NextFunction, Request, Response } from "express";
import { rpInitiatedLogoutService } from "../services/logout.service";
import session from "express-session";
import logger from "../utils/logger";
import jwt from "jsonwebtoken";
import { JwksClient } from "../utils/jwksClient";
import { jwks } from "../config/authlete.config";

export async function rpInitiatedLogout(req: Request & { session: Partial<session.SessionData> }, res: Response): Promise<void> {
    const logoutService = new rpInitiatedLogoutService();
    await logoutService.rpInitiatedLogout(req, res);
}

export async function opBackchannelLogout(req: Request, res: Response, next: NextFunction): Promise<void> {
    const log = req.logger || logger;
    const logoutToken: string | undefined = req.body.logout_token;

    if (!logoutToken) {
        res.status(400).json({ error: "invalid_request", error_description: "Missing logout_token" });
        return;
    }

    try {
        const decoded = jwt.decode(logoutToken, { complete: true });
        if (!decoded || typeof decoded === "string" || !decoded.payload) {
            res.status(400).json({ error: "invalid_request", error_description: "Invalid logout token" });
            return;
        }

        const payload = decoded.payload as jwt.JwtPayload;
        const events = payload.events as Record<string, unknown> | undefined;

        if (!events?.["http://schemas.openid.net/event/backchannel-logout"]) {
            res.status(400).json({ error: "invalid_request", error_description: "Token is not a backchannel logout token" });
            return;
        }

        const kid = decoded.header.kid;
        if (kid && jwks.uri) {
            const client = new JwksClient(jwks.uri);
            const publicKey = await client.getPublicKey(kid);
            if (publicKey) {
                jwt.verify(logoutToken, publicKey, { algorithms: ["RS256", "ES256"] });
            }
        }

        const subject = payload.sub;
        if (subject && req.session && req.sessionStore) {
            log("Backchannel logout: destroying session for subject", { subject });
        }

        res.status(200).end();
    } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        log.error("Backchannel logout error", { message: error.message });
        res.status(400).json({ error: "invalid_request", error_description: "Invalid logout token" });
    }
}
