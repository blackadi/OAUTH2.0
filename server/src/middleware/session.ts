import dotenv from "dotenv";
import { server } from "../config/app.config";

const session = require("express-session");

dotenv.config();

const defaultCookie: any = {
  httpOnly: true,
  sameSite: "lax",
  secure: server.nodeEnv === "production",
  maxAge: 1000 * 60 * 30, // 30 minutes
};
const defaultOptions: any = {
  secret: server.sessionSecret,
  resave: false,
  saveUninitialized: false, // Change to true so sessions are saved even if empty
  cookie: defaultCookie,
};

export const sessionMiddleware = (opts?: any) => {
  const merged: any = {
    ...defaultOptions,
    ...(opts || {}),
    cookie: {
      ...(defaultCookie || {}),
      ...((opts && opts.cookie) || {}),
    },
  };

  return session(merged);
};
