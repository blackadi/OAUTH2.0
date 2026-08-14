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

  // FAPI1-W2. `fapiModes` is a six-member closed enum spanning both FAPI generations, and this mapper
  // used to recognise only the FAPI 2.0 half — so a service configured for FAPI 1.0 Baseline or
  // Advanced was reported as having FAPI switched **off**. One case per member, plus the two cases the
  // enum does not cover: nothing set, and something set that we do not know.
  describe("computeFapiMode is total over Authlete's fapiModes (FAPI1-W2)", () => {
    const cases: Array<[string[], string, string]> = [
      [["FAPI2_SECURITY"], "sp", "FAPI 2.0 Security Profile"],
      [["FAPI2_MESSAGE_SIGNING_AUTH_REQ"], "ms", "FAPI 2.0 Message Signing"],
      [["FAPI2_MESSAGE_SIGNING_AUTH_RES"], "ms", "FAPI 2.0 Message Signing"],
      [["FAPI2_MESSAGE_SIGNING_INTROSPECTION_RES"], "ms", "FAPI 2.0 Message Signing"],
      [["FAPI1_BASELINE"], "fapi1-baseline", "FAPI 1.0 Part 1: Baseline"],
      [["FAPI1_ADVANCED"], "fapi1-advanced", "FAPI 1.0 Part 2: Advanced"],
    ];

    for (const [fapiModes, expected, title] of cases) {
      it(`${fapiModes[0]} → ${expected}`, async () => {
        mockServiceGet.mockResolvedValue({ fapiModes });

        const res = await request(app).get("/fapi/config");
        expect(res.status).toBe(200);
        expect(res.body.mode).toBe(expected);
        expect(res.body.specs.securityProfile).toBe(title);
      });
    }

    // Advanced is Baseline plus further requirements, so reporting the weaker of the two under-reports
    // the service. Same reason message signing outranks the security profile.
    it("reports the stronger mode when the service sets several", async () => {
      mockServiceGet.mockResolvedValue({
        fapiModes: ["FAPI1_BASELINE", "FAPI1_ADVANCED"],
      });

      const res = await request(app).get("/fapi/config");
      expect(res.body.mode).toBe("fapi1-advanced");
    });

    // The half of the item that is not about FAPI 1.0. A mode set but unrecognised is a *different*
    // fact from no mode at all, and collapsing it to "disabled" asserts a posture nobody checked — the
    // hardcoded-literal defect FAPI2-W1 removed, one layer down. A seventh Authlete member lands here.
    it("an unrecognised mode is reported as unknown, not as off", async () => {
      mockServiceGet.mockResolvedValue({ fapiModes: ["FAPI3_SOMETHING_NEW"] });

      const res = await request(app).get("/fapi/config");
      expect(res.status).toBe(200);
      expect(res.body.mode).toBe("unknown");
      expect(res.body.mode).not.toBe("disabled");
    });

    it("no mode at all is the only thing reported as disabled", async () => {
      mockServiceGet.mockResolvedValue({ fapiModes: [] });

      const res = await request(app).get("/fapi/config");
      expect(res.body.mode).toBe("disabled");
      expect(res.body.specs.securityProfile).toBe("None");
    });

    it("an absent fapiModes is disabled, not unknown", async () => {
      mockServiceGet.mockResolvedValue({});

      const res = await request(app).get("/fapi/config");
      expect(res.body.mode).toBe("disabled");
    });

    // /fapi/status shares the mapper, so it inherits the fix rather than needing its own.
    it("GET /fapi/status reports a FAPI 1.0 mode too", async () => {
      mockServiceGet.mockResolvedValue({ fapiModes: ["FAPI1_ADVANCED"] });

      const res = await request(app).get("/fapi/status");
      expect(res.status).toBe(200);
      expect(res.body.mode).toBe("fapi1-advanced");
    });
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

    // FAPI2-W4: the controls the endpoint used to be silent about. `pkceS256Required` is separate from
    // `pkceRequired` and both matter — §5.3.2.1 wants PKCE *with* S256, and a deployment can require PKCE
    // while still permitting `plain`.
    expect(res.body).toHaveProperty("pkceS256Required");
    expect(res.body).toHaveProperty("tlsClientCertificateBoundAccessTokens");
    expect(res.body).toHaveProperty("supportedTokenAuthMethods");

    // And the one it CANNOT report: no `Service` property carries the signing algorithms — they are
    // derived from the JWK Set and appear only in the discovery document. Asserted as absent so nobody
    // "fixes" it by inventing a field, which is what the compiler already refused once.
    expect(res.body).not.toHaveProperty("supportedSignatureAlgorithms");

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
