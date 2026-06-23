import { NextFunction, Request, Response } from "express";
import { rpInitiatedLogoutService } from "../services/logout.service";
import session from "express-session";
import logger from "../utils/logger";
import jwt from "jsonwebtoken";
import { JwksClient } from "../utils/jwksClient";
import { jwks } from "../config/authlete.config";

export async function rpInitiatedLogout(req: Request & { session: Partial<session.SessionData> }, res: Response, next: NextFunction): Promise<void> {
    try {
        const logoutService = new rpInitiatedLogoutService();
        await logoutService.rpInitiatedLogout(req, res);
    } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const log = req.logger || logger;
        log.error("RP-Initiated Logout error", { message: error.message });
        next(error);
    }
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

        if (!jwks.uri) {
            throw new Error("JWKS_URI must be configured to verify backchannel logout tokens");
        }

        const client = new JwksClient(jwks.uri);
        const kid = decoded.header.kid;

        if (kid) {
            const publicKey = await client.getPublicKey(kid);
            if (!publicKey) {
                throw new Error(`No JWK found with kid '${kid}' in JWKS`);
            }
            jwt.verify(logoutToken, publicKey, { algorithms: ["RS256", "ES256"] });
        } else {
            const keys = await client.getAllPublicKeys();
            let verified = false;
            for (const key of keys) {
                try {
                    jwt.verify(logoutToken, key, { algorithms: ["RS256", "ES256"] });
                    verified = true;
                    break;
                } catch { continue; }
            }
            if (!verified) {
                throw new Error("Logout token signature could not be verified with any JWKS key");
            }
        }

        const subject = payload.sub;
        if (subject) {
            log("Backchannel logout: destroying session for subject", { subject });
            if (req.session) {
                req.session.destroy((err) => {
                    if (err) log.error("Failed to destroy session on backchannel logout", { err });
                });
            }
        }

        res.status(200).end();
    } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        log.error("Backchannel logout error", { message: error.message });
        res.status(400).json({ error: "invalid_request", error_description: "Invalid logout token" });
    }
}
