import express from "express";
import path from "path";
import cors from "cors";
import { sessionMiddleware } from "./middleware/session";
import { requestId } from "./middleware/request-id";
import morgan from "morgan";
import logger, { baseLogger } from "./utils/logger";

import authorizationRoutes from "./routes/authorization.routes";
import tokenRoutes from "./routes/token.routes";
import userinfoRoutes from "./routes/userinfo.routes";
import introspectionRoutes from "./routes/introspection.routes";
import revocationRoutes from "./routes/revocation.routes";
import sessionRoutes from "./routes/session.routes";
import jwksRoutes from "./routes/jwks.routes";
import discoveryRoutes, { rootRouter as discoveryRootRouter } from "./routes/discovery.routes";
import logoutRoutes from "./routes/logout.routes";
import clientRoutes from "./routes/client.routes";
import grantManagementRoutes from "./routes/grant-management.routes";
import backchannelLogoutRoutes from "./routes/backchannel-logout.routes";
import dcrRoutes from "./routes/dcr.routes";
import cibaRoutes from "./routes/ciba.routes";
import parRoutes from "./routes/par.routes";
import federationRoutes, { rootRouter as federationRootRouter } from "./routes/federation.routes";
import deviceRoutes from "./routes/device.routes";
import hskRoutes from "./routes/hsk.routes";
import vciRoutes, { wellKnownRouter as vciWellKnownRouter } from "./routes/vci.routes";
import healthRoutes from "./routes/health.routes";
import metricsRoutes from "./routes/metrics.routes";
import openapiRoutes from "./routes/openapi.routes";
import fapiRoutes from "./routes/fapi.routes";
import oauthAsMetadataRoutes from "./routes/oauth-as-metadata.routes";
import protectedResourceMetadataRoutes from "./routes/protected-resource-metadata.routes";
import jarRoutes from "./routes/jar.routes";
import nativeSsoRoutes from "./routes/native-sso.routes";
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
      /**
       * Every custom request header this server actually reads. `DPoP` was missing, and the
       * consequence was total: the SPA is a DPoP debugger, the server accepts DPoP proofs at PAR,
       * token and userinfo — and the browser could never send one. The preflight answered
       * `Access-Control-Allow-Headers: Content-Type,Authorization` to a request asking for
       * `content-type,dpop`, so Firefox refused to send the POST at all.
       *
       * It surfaces as *"NetworkError when attempting to fetch resource"* with **no response and no
       * server log**, because the request never leaves the browser. curl is not subject to CORS, so
       * every curl-based check in this repo — and the whole `fapi2-conformance.mjs` suite, which is
       * a Node script — passed against an endpoint no browser could reach. A green gate said nothing
       * about the one caller that matters.
       *
       * Keep this list in step with `req.headers[...]` reads in the services.
       */
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "DPoP",
        "OAuth-Client-Attestation",
        "OAuth-Client-Attestation-PoP",
      ],
      /**
       * The mirror-image bug, and it silently disabled a fix that is already in the tree.
       *
       * A cross-origin response exposes only the CORS-safelisted headers unless it names more, so
       * `DPoP-Nonce` and `WWW-Authenticate` were unreadable from the SPA. RFC 9449 §8 drives the
       * nonce dance off exactly that header — the server answers `use_dpop_nonce` and hands back
       * `DPoP-Nonce`, the client re-signs the proof with it. `services/dpop-fetch.ts` implements
       * that retry correctly (DR-20), and `response.headers.get('dpop-nonce')` returned `null`
       * regardless, because the browser stripped it before the client ever saw it.
       *
       * `X-Request-Id` is exposed as well: `request-id.ts` sets it on every response, and correlating
       * a browser call to a server log is the whole point of a debugging tool.
       */
      exposedHeaders: ["DPoP-Nonce", "WWW-Authenticate", "X-Request-Id"],
      maxAge: 86400,
    })
  );
  // request id middleware (adds `req.id`, echoes `X-Request-Id`).
  // An inbound `X-Request-Id` is honoured only if it is a real UUID — see `middleware/request-id.ts`.
  app.use(requestId());

  // attach a per-request logger (req.logger)
  app.use((req, _res, next) => {
    // create a child logger with request id
    req.logger = baseLogger.child({ reqId: req.id });
    next();
  });

  // HTTP access logging with morgan, streaming into Winston
  app.use(
    morgan(server.morganFormat, {
      stream: { write: (msg: string) => logger.info(msg.trim()) },
    })
  );

  // Prometheus metrics collection
  app.use(metricsMiddleware);

  // Structured audit logging
  app.use(auditMiddleware);
  // Capture the raw request body for application/x-www-form-urlencoded
  //
  // `express.urlencoded` / `express.json` rather than the `body-parser` package: Express 5 bundles
  // body-parser and re-exports these two functions from it, `verify` hook included, so the direct
  // dependency was a second copy of code already installed.
  app.use(
    express.urlencoded({
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
  app.use(express.json());
  app.set("trust proxy", 1); // Trust first proxy (e.g. Render, Heroku, nginx)
  // No `cookie-parser`: nothing here reads `req.cookies` or `req.signedCookies`, and `express-session`
  // has parsed its own cookie since 1.5. It was middleware on every request for an unused property.
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
  // .well-known/openid-configuration at root, where the issuer identifier says it lives
  // (OIDC Discovery §4, FAPI 2.0 §5.3.2.1). See the note in discovery.routes.ts for why this is a
  // separate router rather than a second mount of the one above.
  app.use("/", discoveryRootRouter);
  app.use(routerURL, logoutRoutes);
  app.use(routerURL, clientRoutes);
  app.use(routerURL, grantManagementRoutes);
  app.use(routerURL, backchannelLogoutRoutes);
  app.use(routerURL, dcrRoutes);
  app.use(routerURL, cibaRoutes);
  app.use(routerURL, parRoutes);
  app.use(routerURL, federationRoutes);
  app.use("/", vciWellKnownRouter); // .well-known/openid-credential-issuer at root
  app.use("/", federationRootRouter); // .well-known/openid-federation at root
  app.use("/", deviceRoutes); // Device flow (both /api/device/* and /device paths)
  app.use(routerURL, vciRoutes);
  app.use(routerURL, hskRoutes);
  app.use(routerURL, healthRoutes);
  app.use("/", metricsRoutes); // /metrics (standard Prometheus convention)
  app.use(routerURL, metricsRoutes); // /api/metrics (consistency)
  app.use(routerURL, fapiRoutes);
  app.use("/", oauthAsMetadataRoutes); // .well-known/oauth-authorization-server at root (MCP/RFC 8414)
  app.use("/", protectedResourceMetadataRoutes); // .well-known/oauth-protected-resource at root (RFC 9728)
  app.use(routerURL, jarRoutes);
  app.use(routerURL, nativeSsoRoutes);
  app.use(routerURL, openapiRoutes); // /api/openapi.json
  /**
   * An unmatched `/api` path is a 404, not the dashboard.
   *
   * Found 2026-08-21 while probing the client's new transport layer: `GET /api/does-not-exist`
   * answered **200** with `Content-Type: text/html` and 9,837 bytes of `index.html`, because the SPA
   * catch-all below sits in front of the whole namespace. A client wired to a wrong or retired path saw
   * success and a parse failure somewhere downstream, rather than the 404 that names the problem.
   *
   * This is the failure `AGENTS.md` already records for RFC 9728's path-suffixed well-known URL — *"a
   * discovering client sees success and parses a web page"* — which was closed there with a second
   * route. The general case was never closed. It matters most for a *debugging* server, whose whole
   * job is telling people what their request did.
   *
   * Mounted after every `/api` router and before the catch-all, so it terminates only paths nothing
   * else claimed. The well-known documents are unaffected: they are mounted at true root, not under
   * `/api`, and never reach this handler.
   */
  app.use(routerURL, (req, res) => {
    res.status(404).json({
      error: "not_found",
      error_description: `No API route matches ${req.method} ${req.baseUrl}${req.path}`,
    });
  });

  app.use("/", DefaultRoutes); // For rendering the index page at root /*

  // Error Handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();

export default app;
