import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

declare module "express-session" {
  interface SessionData {
    csrfToken?: string;
  }
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET") {
    if (!req.session.csrfToken) {
      req.session.csrfToken = generateToken();
    }
  } else if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const token = req.body?._csrf;
    if (!token || token !== req.session.csrfToken) {
      const log = req.logger;
      if (log) log("CSRF validation failed", { method: req.method, path: req.path });
      return res.status(403).json({ error: "invalid_request", message: "CSRF token mismatch" });
    }
    req.session.csrfToken = generateToken();
  }

  res.locals.csrfToken = req.session.csrfToken;
  next();
}
