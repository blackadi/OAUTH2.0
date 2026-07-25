import { Request, Response } from "express";
import logger from "../utils/logger";

export function requireBasicAuth(realm: string) {
  return (req: Request, res: Response): boolean => {
    const mgmtClientId = process.env.MGMT_CLIENT_ID;
    const mgmtClientSecret = process.env.MGMT_CLIENT_SECRET;
    if (!mgmtClientId || !mgmtClientSecret) return true;

    const { authorization } = req.headers;
    if (!authorization?.startsWith("Basic ")) {
      res.setHeader("WWW-Authenticate", `Basic realm="${realm}"`);
      res.status(401).json({ error: "invalid_client", error_description: "Client authentication required" });
      return false;
    }
    const credentials = Buffer.from(authorization.slice(6), "base64").toString("utf-8");
    const [id, secret] = credentials.split(":");
    if (id !== mgmtClientId || secret !== mgmtClientSecret) {
      const log = req.logger || logger;
      log.error("Basic auth failed", { clientId: id });
      res.setHeader("WWW-Authenticate", `Basic realm="${realm}"`);
      res.status(401).json({ error: "invalid_client", error_description: "Invalid client credentials" });
      return false;
    }
    return true;
  };
}
