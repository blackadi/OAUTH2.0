import { Authlete } from "@authlete/typescript-sdk";
import { AuthleteError } from "@authlete/typescript-sdk/models/errors";
import { authleteApi as defaultApi } from "./authlete.service";
import { server } from "../config/app.config";

export interface AuthleteHealthResponse {
  healthy: boolean;
  statusCode?: number;
  body?: string;
  error?: string;
  extended?: boolean;
}

export interface RedisHealthResponse {
  healthy: boolean;
  connected: boolean;
  configured: boolean;
  error?: string;
}

export interface OverallHealthResponse {
  status: string;
  uptime: number;
  timestamp: string;
  checks: {
    redis: RedisHealthResponse;
    authlete?: AuthleteHealthResponse;
  };
}

export class HealthService {
  constructor(private authleteApi: Authlete = defaultApi) {}

  async checkAuthlete(extended = false): Promise<AuthleteHealthResponse> {
    try {
      // Pass `extended` only when set, so the request URI stays identical to the
      // documented `GET /api/lifecycle/healthcheck` with no query string.
      const body = await this.authleteApi.lifecycle.getApiLifecycleHealthcheck(
        extended ? { extended: true } : undefined,
      );
      // The SDK resolves only on 200 (`M.text(200, …)`); anything else throws.
      return { healthy: true, statusCode: 200, body: body || undefined, extended };
    } catch (err) {
      // A non-2xx is a health *result*, not a transport failure — AuthleteError
      // carries the status and body, so report them rather than a bare message.
      if (err instanceof AuthleteError) {
        return {
          healthy: false,
          statusCode: err.statusCode,
          body: err.body || undefined,
          extended,
        };
      }
      // Network/timeout/abort: no HTTP response exists, so there is no status.
      return {
        healthy: false,
        error: err instanceof Error ? err.message : String(err),
        extended,
      };
    }
  }

  async checkRedis(): Promise<RedisHealthResponse> {
    if (!server.redisUrl) {
      return { healthy: true, connected: false, configured: false };
    }

    try {
      const { redisClient } = await import("../middleware/session.js");
      const connected = redisClient?.isOpen ?? false;
      return {
        healthy: connected || !server.redisUrl,
        connected,
        configured: true,
        ...(!connected && { error: "Redis client not connected" }),
      };
    } catch (err) {
      return {
        healthy: false,
        connected: false,
        configured: true,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async checkOverall(): Promise<OverallHealthResponse> {
    const [redis, authlete] = await Promise.all([
      this.checkRedis(),
      this.checkAuthlete(),
    ]);

    const allHealthy = redis.healthy && authlete.healthy;

    return {
      status: allHealthy ? "ok" : "degraded",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: { redis, authlete },
    };
  }
}
