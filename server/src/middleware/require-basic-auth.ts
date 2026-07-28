import { Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import logger from "../utils/logger";

/**
 * Basic authentication for the administrative endpoints (client management, token management, HSK, DCR
 * registration, VCI offers, backchannel logout, federation registration, native SSO).
 *
 * This FAILS CLOSED. If MGMT_CLIENT_ID / MGMT_CLIENT_SECRET are not configured, every guarded request is
 * rejected. It previously returned `true` (allow) in that case, which meant an unset environment variable
 * silently disabled authentication across every admin route — including one that returns a confidential
 * client's secret in plaintext.
 */

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Compare against itself so the work done is roughly independent of where the mismatch is.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function managementCredentialsConfigured(): boolean {
  return Boolean(process.env.MGMT_CLIENT_ID && process.env.MGMT_CLIENT_SECRET);
}

/**
 * Emit a one-off startup warning when the admin credentials are absent. Called from `server.ts` rather
 * than at module scope so it fires once per process and never during tests.
 */
export function warnIfManagementCredentialsMissing(): void {
  if (managementCredentialsConfigured()) return;
  logger.warn(
    "SECURITY: MGMT_CLIENT_ID / MGMT_CLIENT_SECRET are not set. Every administrative endpoint " +
      "(client management, token management, HSK, DCR registration, VCI offers, backchannel logout, " +
      "federation registration, native SSO) will reject all requests with 401. Set both to enable them."
  );
}

export function requireBasicAuth(realm: string) {
  return (req: Request, res: Response): boolean => {
    const log = req.logger || logger;
    const mgmtClientId = process.env.MGMT_CLIENT_ID;
    const mgmtClientSecret = process.env.MGMT_CLIENT_SECRET;

    const deny = (description: string): boolean => {
      res.setHeader("WWW-Authenticate", `Basic realm="${realm}"`);
      res.status(401).json({ error: "invalid_client", error_description: description });
      return false;
    };

    // Deliberately indistinguishable from "no credentials supplied" — telling an anonymous caller that
    // admin auth is misconfigured is free reconnaissance. The operator sees it in the log instead.
    if (!mgmtClientId || !mgmtClientSecret) {
      log.error("Management credentials are not configured; denying administrative request", {
        realm,
        method: req.method,
        path: req.originalUrl,
      });
      return deny("Client authentication required");
    }

    const { authorization } = req.headers;
    if (!authorization?.startsWith("Basic ")) {
      return deny("Client authentication required");
    }

    const credentials = Buffer.from(authorization.slice(6), "base64").toString("utf-8");
    const separator = credentials.indexOf(":");
    if (separator === -1) {
      return deny("Client authentication required");
    }
    // Split on the FIRST colon only: a secret may legitimately contain colons.
    const id = credentials.slice(0, separator);
    const secret = credentials.slice(separator + 1);

    const idMatches = safeEqual(id, mgmtClientId);
    const secretMatches = safeEqual(secret, mgmtClientSecret);
    if (!idMatches || !secretMatches) {
      log.error("Basic auth failed", { clientId: id, realm });
      return deny("Invalid client credentials");
    }

    return true;
  };
}
