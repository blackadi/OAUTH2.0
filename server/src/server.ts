import { app } from "./app";
import logger from "./utils/logger";
import { server } from "./config/app.config";
import { closeRedis } from "./middleware/session";
import { warnIfManagementCredentialsMissing } from "./middleware/require-basic-auth";
import { warnIfDevelopmentEnvironment } from "./middleware/development-only";

const PORT = server.port;

warnIfManagementCredentialsMissing();
warnIfDevelopmentEnvironment();

const serverInstance = app.listen(PORT, () => {
  logger.info(`Authorization Server running on port ${PORT}`);
});

async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);

  await closeRedis();
  logger.info("Redis client closed.");

  serverInstance.close(() => {
    logger.info("HTTP server closed.");
    process.exit(0);
  });
  setTimeout(() => {
    logger.info("Forced shutdown after timeout.");
    process.exit(1);
  }, 10000).unref();
}

process.on("unhandledRejection", (reason: unknown) => {
  logger.error("Unhandled Rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
  process.exit(1);
});

process.on("uncaughtException", (error: Error) => {
  logger.error("Uncaught Exception", {
    message: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
