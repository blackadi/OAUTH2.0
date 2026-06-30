import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

const mockServiceGet = vi.fn();

vi.mock("../../../src/services/authlete.service", () => ({
  authleteApi: {
    service: {
      get: mockServiceGet,
    },
  },
  serviceId: "test-service-id",
}));

describe("FAPI routes", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    const router = (await import("../../../src/routes/fapi.routes")).default;
    app = express();
    app.use(router);
  });

  it("GET /fapi/config returns sp mode for FAPI2_SECURITY", async () => {
    mockServiceGet.mockResolvedValue({
      fapiModes: ["FAPI2_SECURITY"],
      dpopNonceRequired: true,
    });

    const res = await request(app).get("/fapi/config");
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("sp");
    expect(res.body.dpopEnabled).toBe(true);
    expect(res.body.requiredClientAuth).toBe("PRIVATE_KEY_JWT");
    expect(res.body.senderConstrainedTokens).toBe("DPoP");
    expect(res.body.parRequired).toBe(true);
    expect(res.body.pkceRequired).toBe(true);
    expect(res.body.refreshTokenRotation).toBe(false);
    expect(res.body.scopeRequired).toBe(true);
    expect(res.body.specs.securityProfile).toBe("FAPI 2.0 Security Profile");
    expect(res.body.specs.messageSigning).toBe(false);
    expect(mockServiceGet).toHaveBeenCalledOnce();
  });

  it("GET /fapi/config returns ms mode when message signing enabled", async () => {
    mockServiceGet.mockResolvedValue({
      fapiModes: ["FAPI2_SECURITY", "FAPI2_MESSAGE_SIGNING_AUTH_REQ"],
      dpopNonceRequired: true,
    });

    const res = await request(app).get("/fapi/config");
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("ms");
    expect(res.body.specs.messageSigning).toBe(true);
  });

  it("GET /fapi/config returns disabled when no fapiModes", async () => {
    mockServiceGet.mockResolvedValue({
      fapiModes: [],
      dpopNonceRequired: false,
    });

    const res = await request(app).get("/fapi/config");
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("disabled");
    expect(res.body.dpopEnabled).toBe(false);
    expect(res.body.senderConstrainedTokens).toBe("none");
  });

  it("GET /fapi/status returns live Authlete config", async () => {
    mockServiceGet.mockResolvedValue({
      issuer: "https://auth.example.com",
      fapiModes: ["FAPI2_SECURITY"],
      dpopNonceRequired: true,
      dpopNonceDuration: 3600,
      scopeRequired: true,
      refreshTokenKept: false,
      refreshTokenIdempotent: false,
      pkceRequired: true,
      parRequired: true,
    });

    const res = await request(app).get("/fapi/status");
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("sp");
    expect(res.body.dpopEnabled).toBe(true);
    expect(res.body.issuer).toBe("https://auth.example.com");
    expect(res.body.fapiModes).toContain("FAPI2_SECURITY");
    expect(res.body.dpopNonceRequired).toBe(true);
    expect(res.body.dpopNonceDuration).toBe(3600);
    expect(mockServiceGet).toHaveBeenCalledOnce();
  });

  it("GET /fapi/status returns 500 on Authlete error", async () => {
    mockServiceGet.mockRejectedValue(new Error("Authlete API failure"));

    const res = await request(app).get("/fapi/status");
    expect(res.status).toBe(500);
  });
});
