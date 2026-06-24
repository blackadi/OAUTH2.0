import { createLogger, format, transports, Logger } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import { server } from "../config/app.config";

const isDev = server.nodeEnv !== "production";

const consoleTransport = new transports.Console({
  format: isDev
    ? format.combine(format.colorize(), format.simple())
    : format.combine(format.timestamp(), format.json()),
});

const fileTransport = new DailyRotateFile({
  filename: "logs/app-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  maxFiles: "14d",
  level: server.logLevel,
  zippedArchive: true,
});

const errorFileTransport = new DailyRotateFile({
  filename: "logs/error-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  maxFiles: "30d",
  level: "error",
  zippedArchive: true,
});

const baseLogger = createLogger({
  level: server.logLevel,
  format: format.combine(
    format.timestamp(),
    format.printf(({ level, message, timestamp, reqId }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${reqId || ""} ${message}`;
    })
  ),
  transports: [consoleTransport, fileTransport, errorFileTransport],
  exitOnError: false,
});

export interface CallableLogger {
  (msg: string, meta?: Record<string, unknown>): void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  child: (opts: { reqId?: string }) => CallableLogger;
}

export function createCallableLogger(winstonLogger: Logger): CallableLogger {
  const dynamicLevel = server.logLevel === "debug" ? "debug" : "info";
  const fn = (winstonLogger as any)[dynamicLevel].bind(winstonLogger) as CallableLogger;
  fn.error = winstonLogger.error.bind(winstonLogger);
  fn.warn = winstonLogger.warn.bind(winstonLogger);
  fn.child = (opts: { reqId?: string }) => createCallableLogger(winstonLogger.child(opts));
  return fn;
}

const defaultLogger = createCallableLogger(baseLogger);

export { baseLogger };
export default defaultLogger;
