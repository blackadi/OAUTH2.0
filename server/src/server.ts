import { app } from "./app";
import logger from "./utils/logger";
import { server } from "./config/app.config";
import { closeRedis } from "./middleware/session";

const PORT = server.port;

const serverInstance = app.listen(PORT, () => {
  logger(`Authorization Server running on port ${PORT}`);
});

async function gracefulShutdown(signal: string) {
  logger(`Received ${signal}. Shutting down gracefully...`);

  await closeRedis();
  logger("Redis client closed.");

  serverInstance.close(() => {
    logger("HTTP server closed.");
    process.exit(0);
  });
  setTimeout(() => {
    logger("Forced shutdown after timeout.");
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
