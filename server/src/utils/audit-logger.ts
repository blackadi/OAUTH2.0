import { createLogger, format, transports } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import { server } from "../config/app.config";

const isDev = server.nodeEnv !== "production";

const auditFileTransport = new DailyRotateFile({
  filename: "logs/audit-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  maxFiles: "90d",
  zippedArchive: true,
  format: format.combine(format.timestamp(), format.json()),
});

const auditConsoleTransport = new transports.Console({
  format: isDev ? format.combine(format.colorize(), format.simple()) : format.combine(format.timestamp(), format.json()),
});

export const auditLogger = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [auditFileTransport, auditConsoleTransport],
  exitOnError: false,
});
