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

/**
 * Exported as the plain Winston logger — there is no callable wrapper any more.
 *
 * `CallableLogger` let a call site write `log("msg")` as a shorthand for `log.info("msg")`, and the
 * result was two idioms for one thing, split almost evenly across the codebase (83 calls one way, 88
 * the other). Winston already ships `.info` / `.warn` / `.error` / `.child`, so the shim was an
 * interface with one implementation wrapping an API that needed no wrapping.
 *
 * **One visible difference, in log output only.** The shim tagged its messages `debug` when
 * `LOG_LEVEL=debug` and `info` otherwise; they are now always tagged `info`. The same lines are
 * emitted either way — the logger's own level decides that — so this changes a label, not what is
 * recorded.
 */
export { baseLogger };
export default baseLogger;
