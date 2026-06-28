import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRegister = {
  metrics: vi.fn().mockResolvedValue("# HELP http_requests_total\n"),
};

vi.mock("prom-client", () => {
  function Registry() {
    return mockRegister;
  }
  function Histogram() { return {}; }
  function Counter() { return {}; }
  return {
    Registry,
    Histogram,
    Counter,
    collectDefaultMetrics: vi.fn(),
    default: { Registry, Histogram, Counter, collectDefaultMetrics: vi.fn() },
  };
});

describe("metrics.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports getMetrics that returns registry metrics", async () => {
    const { getMetrics } = await import("../../../src/services/metrics.service");
    const result = await getMetrics();
    expect(result).toContain("http_requests_total");
    expect(mockRegister.metrics).toHaveBeenCalledOnce();
  });

  it("exports register, httpRequestDuration, httpRequestTotal", async () => {
    const mod = await import("../../../src/services/metrics.service");
    expect(mod.register).toBeDefined();
    expect(mod.httpRequestDuration).toBeDefined();
    expect(mod.httpRequestTotal).toBeDefined();
  });
});
