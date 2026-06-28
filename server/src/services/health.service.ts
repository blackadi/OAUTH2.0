import { authleteConfig as defaultConfig } from "../config/authlete.config";
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
  constructor(private config: { baseUrl: string; AccessToken?: string } = defaultConfig) {}

  async checkAuthlete(extended = false): Promise<AuthleteHealthResponse> {
    const url = `${this.config.baseUrl}/api/lifecycle/healthcheck${extended ? "?extended=true" : ""}`;

    try {
      const headers: Record<string, string> = {};
      if (this.config.AccessToken) {
        headers["Authorization"] = `Bearer ${this.config.AccessToken}`;
      }
      const res = await fetch(url, { headers });
      const body = await res.text().catch(() => "");
      return {
        healthy: res.ok,
        statusCode: res.status,
        body: body || undefined,
        extended,
      };
    } catch (err) {
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
