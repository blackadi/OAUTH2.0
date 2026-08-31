import { NextFunction, Request, Response } from "express";
import { rpInitiatedLogoutService } from "../services/logout.service";
import session from "express-session";
import logger from "../utils/logger";
import jwt from "jsonwebtoken";
import { JwksClient } from "../utils/jwksClient";
import { backchannelLogout, jwks } from "../config/authlete.config";
import { destroySessionsForSubject } from "../utils/session-store";

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

/**
 * `GET /api/logout` — render the confirmation page and nothing else.
 *
 * RP-Initiated Logout §2 requires the OP to ask before ending the session; `rpInitiatedLogout` above is the
 * POST that acts on the answer. See `services/logout.service.ts` → `showConfirmation` for why the question is
 * asked unconditionally.
 */
export async function showLogoutConfirmation(req: Request & { session: Partial<session.SessionData> }, res: Response, next: NextFunction): Promise<void> {
    try {
        const logoutService = new rpInitiatedLogoutService();
        await logoutService.showConfirmation(req, res);
    } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const log = req.logger || logger;
        log.error("RP-Initiated Logout confirmation error", { message: error.message });
        next(error);
    }
}

/**
 * How far out of date an `iat` may be. §2.6 step 4 requires `iat` to be validated but names no window, and
 * §2.4 makes a logout token single-purpose and immediate. Five minutes tolerates ordinary clock skew while
 * refusing a token captured and replayed later.
 */
const MAX_LOGOUT_TOKEN_AGE_SECONDS = 300;

/** A validation failure attributable to the *sender*. §2.8 answers these with 400. */
class LogoutTokenError extends Error {}

/**
 * `POST /api/backchannel_logout` — this deployment acting as an **RP**, receiving a logout token from another
 * OP (OpenID Connect Back-Channel Logout §2.6).
 *
 * Two things were wrong here until 2026-08-13, and the second mattered more.
 *
 * **Only five of §2.6's eleven steps were performed.** `jwt.verify` was called with `{ algorithms }` and
 * nothing else, so `iss`, `aud` and `iat` went unchecked, `sub`/`sid` presence was merely *skipped* when
 * absent, and a forbidden `nonce` was ignored. Any OP whose key sat in the configured JWKS could log out any
 * subject, and a token addressed to somebody else was accepted.
 *
 * **And it destroyed the wrong session.** `req.session.destroy()` ends the session of the *caller* — another
 * OP's server, posting server-to-server, which has no browser session. It therefore destroyed nothing,
 * answered 200, and the sending OP believed the user had been logged out. Sessions are now looked up by
 * subject in the session store; see `utils/session-store.ts`.
 */
export async function opBackchannelLogout(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const log = req.logger || logger;
    // §2.8 SHOULD — a logout response must not be cached.
    res.setHeader("Cache-Control", "no-store");

    const logoutToken: string | undefined = req.body.logout_token;

    if (!logoutToken) {
        res.status(400).json({ error: "invalid_request", error_description: "Missing logout_token" });
        return;
    }

    // Server misconfiguration is a 500, not a 400. Answering 400 tells the sending OP its token is malformed
    // when the fault is entirely ours — and these three checks run before any parsing so the distinction
    // cannot be blurred by a later failure.
    if (!jwks.uri || !backchannelLogout.issuer || !backchannelLogout.audience) {
        log.error("Back-channel logout is not configured; refusing to verify", {
            hasJwksUri: Boolean(jwks.uri),
            hasIssuer: Boolean(backchannelLogout.issuer),
            hasAudience: Boolean(backchannelLogout.audience),
        });
        res.status(500).json({ error: "server_error" });
        return;
    }

    try {
        const decoded = jwt.decode(logoutToken, { complete: true });
        if (!decoded || typeof decoded === "string" || !decoded.payload) {
            throw new LogoutTokenError("not a decodable JWT");
        }

        const events = (decoded.payload as jwt.JwtPayload).events as Record<string, unknown> | undefined;
        // §2.6 step 6.
        if (!events?.["http://schemas.openid.net/event/backchannel-logout"]) {
            throw new LogoutTokenError("missing the backchannel-logout event claim");
        }

        const client = new JwksClient(jwks.uri);
        const kid = decoded.header.kid;

        // §2.6 steps 2–4: signature, `alg` (the allowlist excludes `none` by construction), `iss` and `aud`.
        // `exp` comes from jsonwebtoken's defaults. Passing `issuer`/`audience` here is the whole point —
        // see the `jwt.verify` hygiene rule in AGENTS.md.
        const options: jwt.VerifyOptions = {
            algorithms: ["RS256", "ES256"],
            issuer: backchannelLogout.issuer,
            audience: backchannelLogout.audience,
        };

        let payload: jwt.JwtPayload;
        if (kid) {
            const publicKey = await client.getPublicKey(kid);
            if (!publicKey) {
                throw new LogoutTokenError(`no JWK with kid '${kid}' in the configured JWKS`);
            }
            payload = jwt.verify(logoutToken, publicKey, options) as jwt.JwtPayload;
        } else {
            const keys = await client.getAllPublicKeys();
            let verified: jwt.JwtPayload | undefined;
            for (const key of keys) {
                try {
                    verified = jwt.verify(logoutToken, key, options) as jwt.JwtPayload;
                    break;
                } catch { continue; }
            }
            if (!verified) {
                throw new LogoutTokenError("signature could not be verified with any JWKS key");
            }
            payload = verified;
        }

        // §2.6 step 4 — `iat` must be validated. jsonwebtoken checks `exp` but never bounds `iat`.
        const iat = payload.iat;
        if (typeof iat !== "number" || Math.abs(Math.floor(Date.now() / 1000) - iat) > MAX_LOGOUT_TOKEN_AGE_SECONDS) {
            throw new LogoutTokenError("iat is missing or outside the accepted window");
        }

        // §2.6 step 5 — `sub`, `sid`, or both. Absence used to fall through to a silent no-op.
        const subject = typeof payload.sub === "string" ? payload.sub : undefined;
        const sid = typeof payload.sid === "string" ? payload.sid : undefined;
        if (!subject && !sid) {
            throw new LogoutTokenError("neither sub nor sid is present");
        }

        // §2.6 step 7 — "a nonce Claim MUST NOT be present".
        if (payload.nonce !== undefined) {
            throw new LogoutTokenError("a nonce claim is present, which §2.4 forbids");
        }

        // §2.6 step 8 — clear state for the End-User. This deployment issues no `sid` of its own (Session
        // Management is declined), so a token carrying only `sid` identifies nobody here; that is a gap in
        // what we can act on, not a reason to reject a conformant token.
        if (subject) {
            const destroyed = await destroySessionsForSubject(req.sessionStore, subject, log);
            log.info("Back-channel logout: terminated sessions for subject", { subject, destroyed });
        } else {
            log.error("Back-channel logout: token carries only `sid`, which this OP does not issue", { sid });
        }

        res.status(200).end();
    } catch (err) {
        // A bad token is the sender's fault (400). Anything else is ours (500) — the distinction the old
        // single catch-all erased.
        const error = err instanceof Error ? err : new Error(String(err));
        const senderFault = err instanceof LogoutTokenError || error.name === "JsonWebTokenError" ||
            error.name === "TokenExpiredError" || error.name === "NotBeforeError";
        log.error("Back-channel logout rejected", { message: error.message, senderFault });
        if (senderFault) {
            res.status(400).json({ error: "invalid_request", error_description: "Invalid logout token" });
        } else {
            res.status(500).json({ error: "server_error" });
        }
    }
}
