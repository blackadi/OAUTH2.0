import { app } from "./app";
import logger from "./utils/logger";
import { server } from "./config/app.config";

const PORT = server.port;

const serverInstance = app.listen(PORT, () => {
  logger(`Authorization Server running on port ${PORT}`);
});

function gracefulShutdown(signal: string) {
  logger(`Received ${signal}. Shutting down gracefully...`);
  serverInstance.close(() => {
    logger("HTTP server closed.");
    process.exit(0);
  });
  setTimeout(() => {
    logger("Forced shutdown after timeout.");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
