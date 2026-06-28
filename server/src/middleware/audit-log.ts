import { Request, Response, NextFunction } from "express";
import { auditLogger } from "../utils/audit-logger";
import session from "express-session";

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const sess = req.session as session.SessionData | undefined;

    const entry: Record<string, unknown> = {
      type: "audit",
      timestamp: new Date().toISOString(),
      reqId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.headers["user-agent"] || "",
    };

    if (sess?.user) {
      entry.user = sess.user;
    }

    if (req.headers.authorization) {
      if (req.headers.authorization.startsWith("Basic ")) {
        const decoded = Buffer.from(req.headers.authorization.slice(6), "base64").toString("utf-8");
        const colonIdx = decoded.indexOf(":");
        if (colonIdx > 0) {
          entry.clientId = decoded.slice(0, colonIdx);
        }
      } else if (req.headers.authorization.startsWith("Bearer ")) {
        entry.authType = "bearer";
      }
    }

    auditLogger.info("", entry);
  });

  next();
}
