export interface HealthResponse {
  status: string;
  uptime: number;
  timestamp: string;
}

export interface AuthleteHealthResponse {
  healthy: boolean;
  statusCode?: number;
  body?: string;
  error?: string;
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
