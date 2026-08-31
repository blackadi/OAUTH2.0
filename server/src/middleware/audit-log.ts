import { Request, Response, NextFunction } from "express";
import { auditLogger } from "../utils/audit-logger";
import { parseBasicAuth } from "../utils/basic-auth";
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

    // `parseBasicAuth` rather than a local decode. The local copy got the split right — first colon, so a
    // secret containing one stayed intact — but matched the scheme with a case-*sensitive* `startsWith`,
    // and RFC 9110 §11.1 makes auth-scheme case-insensitive. `authorization: basic …` was therefore logged
    // with no client id. One decoder for the whole server is also the rule `AGENTS.md` states, after this
    // repo accumulated two of them.
    const basic = parseBasicAuth(req.headers.authorization);
    if (basic) {
      entry.clientId = basic.clientId;
    } else if (/^bearer /i.test(req.headers.authorization ?? "")) {
      entry.authType = "bearer";
    }

    auditLogger.info("", entry);
  });

  next();
}
