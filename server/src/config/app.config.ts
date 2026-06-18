import { configDotenv } from "dotenv";
configDotenv();

export const appConfig = {
  loginUrl: "/api/session/login",
  consentUrl: "/api/session/consent",
};

function required(name: string): string {
  const val = process.env[name];
  if (!val || val.trim() === "") {
    throw new Error(`${name} is required but not set. Check your .env file.`);
  }
  return val;
}

export const server = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || "development",
  morganFormat: process.env.MORGAN_FORMAT || "combined",
  sessionSecret: required("SESSION_SECRET"),
  logLevel:
    process.env.LOG_LEVEL ||
    (process.env.NODE_ENV !== "production" ? "debug" : "info"),
};
