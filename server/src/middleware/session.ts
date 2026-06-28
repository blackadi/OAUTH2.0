import session, { SessionOptions, CookieOptions } from "express-session";
import { server } from "../config/app.config";
import logger from "../utils/logger";
import type { RedisClientType } from "redis";

const defaultCookie: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: server.nodeEnv === "production",
  maxAge: 1000 * 60 * 30, // 30 minutes
};

let store: session.Store | undefined;

export let redisClient: RedisClientType | null = null;

async function initStore(): Promise<void> {
  if (!server.redisUrl) return;

  try {
    const redis = await import("redis");
    const { RedisStore } = await import("connect-redis");
    const client = redis.createClient({ url: server.redisUrl });
    client.on("error", (err: Error) => logger.error("Redis connection error", { message: err.message }));
    client.connect().catch((err: Error) => logger.error("Redis connect failed", { message: err.message }));
    logger("Session store: Redis");
    redisClient = client;
    store = new RedisStore({ client });
  } catch {
    logger.warn("Redis modules not available, falling back to MemoryStore");
  }
}

initStore();

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger("Redis client closed");
    } catch (err) {
      logger.error("Error closing Redis", { message: err instanceof Error ? err.message : String(err) });
    }
  }
}

export const sessionMiddleware = (opts?: Partial<SessionOptions>) => {
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
