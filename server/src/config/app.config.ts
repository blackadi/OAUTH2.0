import { configDotenv } from "dotenv";
configDotenv();

import { required } from "../utils/env";

export const appConfig = {
  loginUrl: "/api/session/login",
  consentUrl: "/api/session/consent",
};

export const server = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || "development",
  morganFormat: process.env.MORGAN_FORMAT || "combined",
  sessionSecret: required("SESSION_SECRET"),
  logLevel:
    process.env.LOG_LEVEL ||
    (process.env.NODE_ENV !== "production" ? "debug" : "info"),
};
