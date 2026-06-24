import { authleteConfig as defaultConfig } from "../config/authlete.config";

export interface AuthleteHealthResponse {
  healthy: boolean;
  statusCode?: number;
  body?: string;
  error?: string;
  extended?: boolean;
}

export class HealthService {
  constructor(private config: { baseUrl: string } = defaultConfig) {}

  async checkAuthlete(extended = false): Promise<AuthleteHealthResponse> {
    const url = `${this.config.baseUrl}/api/lifecycle/healthcheck${extended ? "?extended=true" : ""}`;

    try {
      const res = await fetch(url);
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
}
