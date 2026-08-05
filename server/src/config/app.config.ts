import { configDotenv } from "dotenv";
configDotenv();

import { required } from "../utils/env";

export const appConfig = {
  loginUrl: "/api/session/login",
  consentUrl: "/api/session/consent",
};

/**
 * RFC 9728 Protected Resource Metadata. `resource` is the only REQUIRED member of the document; leave
 * PROTECTED_RESOURCE_IDENTIFIER unset and the endpoint falls back to this deployment's UserInfo endpoint,
 * which is the resource this server actually protects.
 */
export const protectedResource = {
  resource: process.env.PROTECTED_RESOURCE_IDENTIFIER || "",
  documentation: process.env.PROTECTED_RESOURCE_DOCUMENTATION || "",
};

export const server = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || "development",
  morganFormat: process.env.MORGAN_FORMAT || "combined",
  sessionSecret: required("SESSION_SECRET"),
  logLevel:
    process.env.LOG_LEVEL ||
    (process.env.NODE_ENV !== "production" ? "debug" : "info"),
  redisUrl: process.env.REDIS_URL || "",
};
