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
    const { errorHandler } = await import("../../../src/middleware/errorHandler");
    app = express();
    app.use(router);
    // The real error handler, so the status a thrown SDK error produces is exercised end to end.
    app.use(errorHandler);
  });

  it("GET /fapi/config reports a hardened service from live values", async () => {
    mockServiceGet.mockResolvedValue({
      fapiModes: ["FAPI2_SECURITY"],
      dpopNonceRequired: true,
      clientIdMetadataDocumentSupported: true,
      supportedTokenAuthMethods: ["PRIVATE_KEY_JWT", "TLS_CLIENT_AUTH"],
      tlsClientCertificateBoundAccessTokens: true,
      parRequired: true,
      pkceRequired: true,
      refreshTokenKept: true, // kept ⇒ NOT rotated
      scopeRequired: true,
    });

    const res = await request(app).get("/fapi/config");
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("sp");
    expect(res.body.dpopEnabled).toBe(true);
    expect(res.body.supportedTokenAuthMethods).toEqual([
      "PRIVATE_KEY_JWT",
      "TLS_CLIENT_AUTH",
    ]);
    expect(res.body.certificateBoundAccessTokens).toBe(true);
    expect(res.body.parRequired).toBe(true);
    expect(res.body.pkceRequired).toBe(true);
    expect(res.body.refreshTokenRotation).toBe(false);
    expect(res.body.scopeRequired).toBe(true);
    expect(res.body.cimdSupported).toBe(true);
    expect(res.body.specs.securityProfile).toBe("FAPI 2.0 Security Profile");
    expect(res.body.specs.messageSigning).toBe(false);
    expect(mockServiceGet).toHaveBeenCalledOnce();
  });

  // FAPI2-W1. These six values were hardcoded, and every one was the opposite of this deployment's live
  // configuration — so the endpoint asserted a FAPI posture nobody had checked. This test uses the real
  // live values and would fail if any constant came back.
  it("GET /fapi/config reports an unhardened service without asserting otherwise", async () => {
    mockServiceGet.mockResolvedValue({
      fapiModes: [],
      dpopNonceRequired: false,
      supportedTokenAuthMethods: ["NONE", "CLIENT_SECRET_BASIC"],
      tlsClientCertificateBoundAccessTokens: false,
      parRequired: false,
      pkceRequired: false,
      refreshTokenKept: false, // not kept ⇒ rotation IS on
      scopeRequired: false,
    });

    const res = await request(app).get("/fapi/config");
    expect(res.status).toBe(200);
    expect(res.body.supportedTokenAuthMethods).toEqual([
      "NONE",
      "CLIENT_SECRET_BASIC",
    ]);
    expect(res.body.certificateBoundAccessTokens).toBe(false);
    expect(res.body.parRequired).toBe(false);
    expect(res.body.pkceRequired).toBe(false);
    expect(res.body.refreshTokenRotation).toBe(true);
    expect(res.body.scopeRequired).toBe(false);
    expect(res.body).not.toHaveProperty("requiredClientAuth");
    expect(res.body).not.toHaveProperty("senderConstrainedTokens");
  });

  it("GET /fapi/config defaults absent fields to false rather than inventing a control", async () => {
    mockServiceGet.mockResolvedValue({ fapiModes: ["FAPI2_SECURITY"] });

    const res = await request(app).get("/fapi/config");
    expect(res.status).toBe(200);
    expect(res.body.supportedTokenAuthMethods).toEqual([]);
    expect(res.body.certificateBoundAccessTokens).toBe(false);
    expect(res.body.parRequired).toBe(false);
    expect(res.body.pkceRequired).toBe(false);
    expect(res.body.scopeRequired).toBe(false);
    // refreshTokenKept absent must NOT be read as "rotation is on"
    expect(res.body.refreshTokenRotation).toBe(false);
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
    expect(res.body.cimdSupported).toBe(false);
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
      clientIdMetadataDocumentSupported: true,
    });

    const res = await request(app).get("/fapi/status");
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("sp");
    expect(res.body.dpopEnabled).toBe(true);
    expect(res.body.issuer).toBe("https://auth.example.com");
    expect(res.body.fapiModes).toContain("FAPI2_SECURITY");
    expect(res.body.dpopNonceRequired).toBe(true);
    expect(res.body.dpopNonceDuration).toBe(3600);
    expect(res.body.clientIdMetadataDocumentSupported).toBe(true);
    expect(mockServiceGet).toHaveBeenCalledOnce();
  });

  it("GET /fapi/status returns 500 on Authlete error", async () => {
    mockServiceGet.mockRejectedValue(new Error("Authlete API failure"));

    const res = await request(app).get("/fapi/status");
    expect(res.status).toBe(500);
  });

  // EH-W2. This is the case that produced the finding. The SDK's ResponseValidationError extends
  // AuthleteError, which sets `statusCode` from the HTTP response it was reading — and Authlete answers
  // 200 with a body SDK 1.0.0 cannot parse (`supportedTokenAuthMethods` contains `SPIFFE_JWT`). Both
  // endpoints used to serve that failure as HTTP 200 with an error body calling itself a Bad Request.
  describe("a 2xx-bearing SDK error is not served as success (EH-W1)", () => {
    class ResponseValidationErrorStub extends Error {
      statusCode = 200;
      constructor() {
        super("Response validation failed");
        this.name = "ResponseValidationError";
      }
    }

    for (const path of ["/fapi/config", "/fapi/status"]) {
      it(`GET ${path} answers 500, not 200`, async () => {
        mockServiceGet.mockRejectedValue(new ResponseValidationErrorStub());

        // Accept: application/json so the handler takes its JSON branch — this test app mounts the
        // router at the root, where the real app mounts it under /api.
        const res = await request(app).get(path).set("Accept", "application/json");
        expect(res.status).toBe(500);
        expect(res.body.error).toBe("Internal Server Error");
        expect(res.body.message).toBe("Response validation failed");
      });
    }
  });
});
