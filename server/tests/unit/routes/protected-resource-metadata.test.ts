import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const mocks = vi.hoisted(() => ({ getConfiguration: vi.fn() }));

vi.mock("../../../src/services/discovery.service", () => ({
  DiscoveryService: function () {
    return { getConfiguration: mocks.getConfiguration };
  },
}));

vi.mock("../../../src/services/authlete.service", () => ({
  authleteApi: {},
  serviceId: "test-service",
}));

import { createApp } from "../../../src/app";

const DISCOVERY = {
  issuer: "https://as.example.com",
  userinfo_endpoint: "https://as.example.com/api/userinfo",
  scopes_supported: ["openid", "profile", "email"],
  dpop_signing_alg_values_supported: ["ES256"],
};

describe("GET /.well-known/oauth-protected-resource (RFC 9728)", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.getConfiguration.mockResolvedValue(DISCOVERY);
    app = createApp();
  });

  it("is served at the true root, not under /api", async () => {
    await request(app).get("/.well-known/oauth-protected-resource").expect(200);
  });

  it("returns JSON, not the SPA catch-all", async () => {
    // Regression: before this route existed the path returned 200 with text/html from the SPA
    // fallback, so a discovering client saw success and got a web page.
    const res = await request(app).get("/.well-known/oauth-protected-resource").expect(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("advertises the REQUIRED resource member and the authorization server", async () => {
    const res = await request(app).get("/.well-known/oauth-protected-resource").expect(200);
    expect(res.body.resource).toBe("https://as.example.com/api/userinfo");
    expect(res.body.authorization_servers).toEqual(["https://as.example.com"]);
    expect(res.body.bearer_methods_supported).toEqual(["header"]);
  });

  it("mirrors scopes and DPoP algorithms from the live discovery document", async () => {
    const res = await request(app).get("/.well-known/oauth-protected-resource").expect(200);
    expect(res.body.scopes_supported).toEqual(["openid", "profile", "email"]);
    expect(res.body.dpop_signing_alg_values_supported).toEqual(["ES256"]);
  });

  it("prefers an explicitly configured resource identifier", async () => {
    vi.stubEnv("PROTECTED_RESOURCE_IDENTIFIER", "https://api.example.com/orders");
    vi.resetModules();
    const { createApp: freshCreateApp } = await import("../../../src/app");
    const res = await request(freshCreateApp())
      .get("/.well-known/oauth-protected-resource")
      .expect(200);
    expect(res.body.resource).toBe("https://api.example.com/orders");
  });

  it("accepts a discovery document returned as a JSON string", async () => {
    mocks.getConfiguration.mockResolvedValue(JSON.stringify(DISCOVERY));
    const res = await request(app).get("/.well-known/oauth-protected-resource").expect(200);
    expect(res.body.resource).toBe("https://as.example.com/api/userinfo");
  });

  it("omits optional members the discovery document does not provide", async () => {
    mocks.getConfiguration.mockResolvedValue({ issuer: "https://as.example.com" });
    const res = await request(app).get("/.well-known/oauth-protected-resource").expect(200);
    expect(res.body.resource).toBe("https://as.example.com");
    expect(res.body).not.toHaveProperty("scopes_supported");
    expect(res.body).not.toHaveProperty("dpop_signing_alg_values_supported");
  });

  it("fails rather than emitting a document with no resource identifier", async () => {
    mocks.getConfiguration.mockResolvedValue({});
    const res = await request(app).get("/.well-known/oauth-protected-resource").expect(500);
    expect(res.body.error).toBe("server_error");
  });
});
