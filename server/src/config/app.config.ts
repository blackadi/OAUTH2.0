import { configDotenv } from "dotenv";
configDotenv();

import { required } from "../utils/env";

export const appConfig = {
  loginUrl: "/api/session/login",
  consentUrl: "/api/session/consent",
};

/**
 * RFC 9728 Protected Resource Metadata. `resource` is the only REQUIRED member of the document; leave
 * PROTECTED_RESOURCE_IDENTIFIER unset and the endpoint falls back to this deployment's UserInfo endpoint,
 * which is the resource this server actually protects.
 */
export const protectedResource = {
  resource: process.env.PROTECTED_RESOURCE_IDENTIFIER || "",
  documentation: process.env.PROTECTED_RESOURCE_DOCUMENTATION || "",
};

/**
 * **`nodeEnv` defaults to `"production"`, and the default is a security control.**
 *
 * It used to default to `"development"`, which inverted every gate that reads it. Verified on the live
 * deployment 2026-08-13: `NODE_ENV` was unset there, so `server.nodeEnv` resolved to `"development"` and
 *
 *   - `middleware/development-only.ts` did **not** fire, leaving `POST /api/device/complete` — which records
 *     approval of a pending device authorization **as any subject the caller names**, with no authentication
 *     of that subject — reachable on the public internet (RFC 8628 §5.5);
 *   - `GET /api/token/createLocalToken` answered `401` instead of `404`, confirming the same;
 *   - `middleware/errorHandler.ts` emitted **stack traces** in API responses;
 *   - `app.ts` omitted the HSTS header.
 *
 * The code was right and the deployment disabled it, because absence meant *least* restrictive. So the
 * finding is not "someone forgot an environment variable" — it is that **a missing value chose the
 * permissive branch**. That is the same fail-open shape as `require-basic-auth.ts` returning *allow* when
 * `MGMT_CLIENT_ID` was unset, which this repo has already fixed once.
 *
 * The rule, and it is worth stating because the next such flag will look equally harmless: **an absent
 * configuration value must select the safest behaviour.** A developer who wants the permissive branch says
 * so — `npm run dev` sets `NODE_ENV=development` explicitly, and `server.ts` logs a warning whenever the
 * resolved environment is `development`, so an unintended one is visible in the first lines of the log
 * rather than discovered from outside months later.
 *
 * `logLevel` reads the same variable and is deliberately left keyed on `!== "production"`: it is not a
 * security control, and an unset `NODE_ENV` now resolves to `production` there too, which is the quieter
 * and therefore safer default for a rotating file transport.
 */
export const server = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || "production",
  morganFormat: process.env.MORGAN_FORMAT || "combined",
  sessionSecret: required("SESSION_SECRET"),
  logLevel:
    process.env.LOG_LEVEL ||
    ((process.env.NODE_ENV || "production") !== "production" ? "debug" : "info"),
  redisUrl: process.env.REDIS_URL || "",
};
