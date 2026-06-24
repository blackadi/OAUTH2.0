import session, { SessionOptions, CookieOptions } from "express-session";
import { server } from "../config/app.config";

const defaultCookie: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: server.nodeEnv === "production",
  maxAge: 1000 * 60 * 30, // 30 minutes
};
const defaultOptions: SessionOptions = {
  secret: server.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: defaultCookie,
};

export const sessionMiddleware = (opts?: Partial<SessionOptions>) => {
  const merged: SessionOptions = {
    ...defaultOptions,
    ...opts,
    cookie: {
      ...defaultCookie,
      ...(opts?.cookie || {}),
    },
  };

  return session(merged);
};
