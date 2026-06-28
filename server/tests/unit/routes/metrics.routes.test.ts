import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

const mockGetMetrics = vi.fn().mockResolvedValue("# HELP http_requests_total\n# TYPE http_requests_total counter\n");
vi.mock("../../../src/services/metrics.service", () => ({
  getMetrics: mockGetMetrics,
  register: {},
  httpRequestDuration: {},
  httpRequestTotal: {},
}));

describe("metrics routes", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    const router = (await import("../../../src/routes/metrics.routes")).default;
    app = express();
    app.use(router);
  });

  it("GET /metrics returns prometheus text format", async () => {
    const res = await request(app).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.text).toContain("http_requests_total");
    expect(mockGetMetrics).toHaveBeenCalledOnce();
  });
});
