import { createLogger, format, transports } from "winston";
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

const logger = createLogger({
  level: server.logLevel,
  format: format.combine(
    format.timestamp(),
    format.printf(({ level, message, timestamp, reqId }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${reqId} ${message}`;
    })
  ),
  transports: [consoleTransport, fileTransport, errorFileTransport],
  exitOnError: false,
});

// 1. Create the primary dynamic function alias
// This function determines whether to use .info() or .debug() dynamically.
const primaryLogFunction = (logger as any)[server.logLevel].bind(logger);

// 2. Attach the .error method explicitly to the primary function object
// This allows you to call logger.error() reliably regardless of the dynamic level.
primaryLogFunction.error = logger.error.bind(logger);

// Export the customized function
export default primaryLogFunction;
