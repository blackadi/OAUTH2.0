import express from "express";
import path from "path";
import cors from "cors";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import { sessionMiddleware } from "./middleware/session";
import requestId from "express-request-id";
import morgan from "morgan";
import logger, { createCallableLogger, baseLogger } from "./utils/logger";

import authorizationRoutes from "./routes/authorization.routes";
import tokenRoutes from "./routes/token.routes";
import userinfoRoutes from "./routes/userinfo.routes";
import introspectionRoutes from "./routes/introspection.routes";
import revocationRoutes from "./routes/revocation.routes";
import sessionRoutes from "./routes/session.routes";
import jwksRoutes from "./routes/jwks.routes";
import discoveryRoutes from "./routes/discovery.routes";
import logoutRoutes from "./routes/logout.routes";
import clientRoutes from "./routes/client.routes";
import grantManagementRoutes from "./routes/grant-management.routes";
import backchannelLogoutRoutes from "./routes/backchannel-logout.routes";
import dcrRoutes from "./routes/dcr.routes";
import cibaRoutes from "./routes/ciba.routes";
import parRoutes from "./routes/par.routes";
import deviceRoutes from "./routes/device.routes";
import healthRoutes from "./routes/health.routes";
import metricsRoutes from "./routes/metrics.routes";
import openapiRoutes from "./routes/openapi.routes";
import routesList from "./routes/routes-list.routes";
import DefaultRoutes from "./routes/default.routes";

import { server } from "./config/app.config";
import { errorHandler } from "./middleware/errorHandler";
import { requestTimeout } from "./middleware/request-timeout";
import { metricsMiddleware } from "./middleware/metrics";
import { auditMiddleware } from "./middleware/audit-log";

export function createApp() {
  const app = express();

  // Serve static files from the 'public' directory
  const publicDir = path.join(__dirname, server.nodeEnv === "production" ? "public" : "../public");
  app.use(express.static(publicDir));

  // Set EJS as the view engine
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-no-referrer");
    res.setHeader(
      "Permissions-Policy",
      "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
    );
    if (server.nodeEnv === "production") {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains; preload"
      );
    }
    next();
  });

  // CORS — restrict to configured origins or localhost for dev
  const allowedOrigins =
    process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()) || [
      "http://localhost:3000",
      "http://localhost:3001",
    ];
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 86400,
    })
  );
  // request id middleware (adds `req.id`)
  app.use(requestId());

  // attach a per-request logger (req.logger)
  app.use((req, _res, next) => {
    // create a child logger with request id
    req.logger = createCallableLogger(baseLogger.child({ reqId: req.id }));
    next();
  });

  // HTTP access logging with morgan, streaming into Winston
  app.use(
    morgan(server.morganFormat, {
      stream: { write: (msg: string) => logger(msg.trim()) },
    })
  );

  // Prometheus metrics collection
  app.use(metricsMiddleware);

  // Structured audit logging
  app.use(auditMiddleware);
  // Capture the raw request body for application/x-www-form-urlencoded
  app.use(
    bodyParser.urlencoded({
      extended: true,
      verify: (req: any, _res, buf: Buffer, encoding: string) => {
        const ct = (req.headers && req.headers["content-type"]) || "";
        if (
          typeof ct === "string" &&
          ct.indexOf("application/x-www-form-urlencoded") !== -1
        ) {
          req.rawBody = buf.toString((encoding as BufferEncoding) || "utf8");
        }
      },
    })
  );
  app.use(bodyParser.json());
  app.set("trust proxy", 1); // Trust first proxy (e.g. Render, Heroku, nginx)
  app.use(cookieParser());
  app.use(
    sessionMiddleware({
      secret: server.sessionSecret,
      resave: false,
      saveUninitialized: false,
    })
  );

  // Routes
  const routerURL = "/api";

  // Request timeout for API routes (30s)
  app.use(routerURL, requestTimeout(30000));
  app.use(routerURL, routesList);
  app.use(routerURL, authorizationRoutes);
  app.use(routerURL, tokenRoutes);
  app.use(routerURL, userinfoRoutes);
  app.use(routerURL, introspectionRoutes);
  app.use(routerURL, revocationRoutes);
  app.use(routerURL, sessionRoutes);
  app.use(routerURL, jwksRoutes);
  app.use(routerURL, discoveryRoutes);
  app.use(routerURL, logoutRoutes);
  app.use(routerURL, clientRoutes);
  app.use(routerURL, grantManagementRoutes);
  app.use(routerURL, backchannelLogoutRoutes);
  app.use(routerURL, dcrRoutes);
  app.use(routerURL, cibaRoutes);
  app.use(routerURL, parRoutes);
  app.use("/", deviceRoutes); // Device flow (both /api/device/* and /device paths)
  app.use(routerURL, healthRoutes);
  app.use("/", metricsRoutes); // /metrics (standard Prometheus convention)
  app.use(routerURL, metricsRoutes); // /api/metrics (consistency)
  app.use(routerURL, healthRoutes);
  app.use(routerURL, openapiRoutes); // /api/openapi.json
  app.use("/", DefaultRoutes); // For rendering the index page at root /*

  // Error Handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();

export default app;
