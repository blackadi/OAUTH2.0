import session, { SessionOptions, CookieOptions } from "express-session";
import { server } from "../config/app.config";
import logger from "../utils/logger";

const defaultCookie: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: server.nodeEnv === "production",
  maxAge: 1000 * 60 * 30, // 30 minutes
};

export const sessionMiddleware = (opts?: Partial<SessionOptions>) => {
  const store = createStore();
  const defaultOptions: SessionOptions = {
    secret: server.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: defaultCookie,
    store,
  };

  const merged: SessionOptions = {
    ...defaultOptions,
    ...opts,
    cookie: {
      ...defaultCookie,
      ...(opts?.cookie || {}),
    },
  };

  return session(merged);
};

function createStore() {
  if (!server.redisUrl) return undefined;

  try {
    const redis = require("redis");
    const { RedisStore } = require("connect-redis");
    const client = redis.createClient({ url: server.redisUrl });
    client.on("error", (err: Error) => logger.error("Redis connection error", { message: err.message }));
    client.connect().catch((err: Error) => logger.error("Redis connect failed", { message: err.message }));
    logger("Session store: Redis");
    return new RedisStore({ client });
  } catch {
    logger.warn("Redis modules not available, falling back to MemoryStore");
    return undefined;
  }
}
