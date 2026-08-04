import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import request from "supertest"
import { createApp } from "../../src/app"

const mockApi = vi.hoisted(() => {
  const fn = () => vi.fn()
  return {
    authorization: { processRequest: fn(), fail: fn(), issue: fn() },
    token: {
      process: fn(), issue: fn(), fail: fn(),
      management: { create: fn(), update: fn(), delete: fn(), list: fn(), revoke: fn(), reissueIdToken: fn() },
    },
    userinfo: { process: fn(), issue: fn() },
    introspection: { process: fn(), standardProcess: fn() },
    revocation: { process: fn() },
    service: { getConfiguration: fn(), getJwks: fn(), get: fn() },
    jwkSetEndpoint: { serviceJwksGetApi: fn() },
    dynamicClientRegistration: { register: fn(), get: fn(), update: fn(), delete: fn() },
    ciba: { processAuthentication: fn(), issue: fn(), fail: fn(), complete: fn() },
    pushedAuthorization: { create: fn() },
    grantManagement: { processRequest: fn() },
    client: {
      list: fn(), get: fn(), create: fn(), update: fn(), delete: fn(),
      management: {
        updateLockFlag: fn(), refreshSecret: fn(), updateSecret: fn(),
        listAuthorizations: fn(), updateAuthorizations: fn(), deleteAuthorizations: fn(),
        getGrantedScopes: fn(), deleteGrantedScopes: fn(),
        getRequestableScopes: fn(), updateRequestableScopes: fn(), deleteRequestableScopes: fn(),
      },
    },
    joseObject: { joseVerifyApi: fn() },
  }
})

vi.mock("../../src/services/authlete.service", () => ({
  authleteApi: mockApi,
  serviceId: "test-service",
}))

describe("Integration: all API routes", () => {
  let app: ReturnType<typeof createApp>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv("MGMT_CLIENT_ID", "test-admin")
    vi.stubEnv("MGMT_CLIENT_SECRET", "test-secret")
    app = createApp()
  })

  describe("GET /api/.well-known/openid-configuration", () => {
    it("returns 200 with issuer", async () => {
      mockApi.service.getConfiguration.mockResolvedValue({ issuer: "https://example.com" })
      const res = await request(app).get("/api/.well-known/openid-configuration").expect(200)
      expect(res.body.issuer).toBe("https://example.com")
    })
  })

  describe("GET /api/authorization", () => {
    const interaction = {
      action: "INTERACTION", ticket: "t-1", client: { clientId: 123 }, scopes: [],
      idTokenClaims: undefined, authorizationDetails: undefined, resultMessage: "",
    }

    it("redirects to login on INTERACTION", async () => {
      mockApi.authorization.processRequest.mockResolvedValue(interaction)
      await request(app).get("/api/authorization?response_type=code&client_id=123&redirect_uri=http://localhost:3000/callback&scope=openid").expect(302)
    })

    // RFC 9101 §5: only `client_id` accompanies a Request Object on the URL — `response_type`,
    // `redirect_uri` and the rest live inside the signed JWT. Local pre-validation used to demand
    // them anyway and answered 400 before Authlete was called at all.
    it("forwards the canonical JAR shape instead of rejecting it", async () => {
      mockApi.authorization.processRequest.mockResolvedValue(interaction)
      const jwt = "eyJhbGciOiJFUzI1NiJ9.eyJpc3MiOiIxMjMifQ.sig"

      await request(app)
        .get(`/api/authorization?client_id=123&request=${encodeURIComponent(jwt)}`)
        .expect(302)

      const sent = mockApi.authorization.processRequest.mock.calls[0][0].authorizationRequest
      expect(sent.parameters).toContain("client_id=123")
      expect(sent.parameters).toContain("request=")
      expect(decodeURIComponent(sent.parameters)).toContain(jwt)
    })

    it("forwards a request with no redirect_uri (RFC 6749 §3.1.2.3)", async () => {
      mockApi.authorization.processRequest.mockResolvedValue(interaction)
      await request(app).get("/api/authorization?response_type=code&client_id=123&scope=openid").expect(302)
      expect(mockApi.authorization.processRequest).toHaveBeenCalled()
    })

    it("still rejects locally when client_id is absent, without calling Authlete", async () => {
      const res = await request(app)
        .get("/api/authorization?response_type=code&redirect_uri=http://localhost:3000/callback")
        .expect(400)

      expect(res.body.error).toBe("invalid_request")
      expect(res.body.error_description).toContain("client_id")
      expect(mockApi.authorization.processRequest).not.toHaveBeenCalled()
    })
  })

  describe("POST /api/token", () => {
    it("returns 200 with access token", async () => {
      mockApi.token.process.mockResolvedValue({ action: "OK", responseContent: JSON.stringify({ access_token: "at-1", token_type: "Bearer", expires_in: 3600 }) })
      const res = await request(app).post("/api/token")
        .set("Authorization", `Basic ${Buffer.from("c-1:s-1").toString("base64")}`)
        .send("grant_type=authorization_code&code=code-1").expect(200)
      expect(res.body.access_token).toBe("at-1")
    })
  })

  describe("POST /api/userinfo", () => {
    const okResponse = { action: "OK", responseContent: JSON.stringify({ sub: "user-1" }) }

    it("returns userinfo for valid token", async () => {
      mockApi.userinfo.process.mockResolvedValue(okResponse)
      const res = await request(app).post("/api/userinfo").set("Authorization", "Bearer at-1").expect(200)
      expect(res.body.sub).toBe("user-1")
    })

    // RFC 9449 §7.1 makes `DPoP` the only conformant scheme for a DPoP-bound access token. The
    // endpoint previously stripped the literal "Bearer " prefix only, so this arrived at Authlete as
    // the string "DPoP <token>" and came back as [A088302] "The access token does not exist."
    it("accepts the DPoP scheme and forwards the proof", async () => {
      mockApi.userinfo.process.mockResolvedValue(okResponse)
      const res = await request(app)
        .post("/api/userinfo")
        .set("Authorization", "DPoP at-1")
        .set("DPoP", "proof-jwt")
        .expect(200)

      expect(res.body.sub).toBe("user-1")
      expect(mockApi.userinfo.process).toHaveBeenCalledWith(
        expect.objectContaining({
          userinfoRequest: expect.objectContaining({ token: "at-1", dpop: "proof-jwt", htm: "POST" }),
        })
      )
    })

    it("rejects the DPoP scheme with no proof and never calls Authlete", async () => {
      const res = await request(app).post("/api/userinfo").set("Authorization", "DPoP at-1").expect(401)

      expect(res.body.error).toBe("invalid_dpop_proof")
      expect(res.headers["www-authenticate"]).toMatch(/^DPoP error="invalid_dpop_proof"/)
      expect(mockApi.userinfo.process).not.toHaveBeenCalled()
    })

    it("rejects the Bearer scheme carrying a DPoP proof — RFC 9449 §7.2", async () => {
      const res = await request(app)
        .post("/api/userinfo")
        .set("Authorization", "Bearer at-1")
        .set("DPoP", "proof-jwt")
        .expect(400)

      expect(res.body.error).toBe("invalid_request")
      expect(mockApi.userinfo.process).not.toHaveBeenCalled()
    })

    it("challenges with both schemes and no error code when no credentials are sent", async () => {
      // RFC 6750 §3 requires WWW-Authenticate on a 401; §3.1 forbids an error code when the request
      // carried no authentication information at all.
      const res = await request(app).post("/api/userinfo").expect(401)

      expect(res.headers["www-authenticate"]).toBe("Bearer, DPoP")
      expect(res.body).toEqual({})
      expect(mockApi.userinfo.process).not.toHaveBeenCalled()
    })

    it("does not forward client-supplied dpop/htu from the request body", async () => {
      mockApi.userinfo.process.mockResolvedValue(okResponse)
      await request(app)
        .post("/api/userinfo")
        .set("Authorization", "DPoP at-1")
        .set("DPoP", "real-proof")
        .type("form")
        .send("dpop=smuggled&htu=https%3A%2F%2Fas.example.com%2Fapi%2Fpar&htm=POST")
        .expect(200)

      const sent = mockApi.userinfo.process.mock.calls[0][0].userinfoRequest
      expect(sent.dpop).toBe("real-proof")
      expect(sent.htu).toMatch(/\/api\/userinfo$/)
    })

    it("still forwards Authlete's own challenge verbatim on UNAUTHORIZED", async () => {
      const challenge =
        'DPoP error="invalid_token",error_description="[A089311] Expected a DPoP header but none was provided.",algs="ES256"'
      mockApi.userinfo.process.mockResolvedValue({ action: "UNAUTHORIZED", responseContent: challenge })
      const res = await request(app).post("/api/userinfo").set("Authorization", "Bearer at-1").expect(401)

      expect(res.headers["www-authenticate"]).toBe(challenge)
    })
  })

  describe("POST /api/introspection", () => {
    it("returns result with action OK", async () => {
      mockApi.introspection.process.mockResolvedValue({ action: "OK", active: true })
      const res = await request(app).post("/api/introspection").send({ token: "at-1" }).expect(200)
      expect(res.body.action).toBe("OK")
    })
  })

  describe("POST /api/revocation", () => {
    it("returns 200 for valid revocation", async () => {
      mockApi.revocation.process.mockResolvedValue({ action: "OK" })
      await request(app).post("/api/revocation")
        .set("Authorization", `Basic ${Buffer.from("c-1:s-1").toString("base64")}`)
        .send("token=at-1").expect(200)
    })
  })

  describe("GET /api/.well-known/jwks.json", () => {
    it("returns JWKS keys", async () => {
      mockApi.jwkSetEndpoint.serviceJwksGetApi.mockResolvedValue({ keys: [{ kty: "RSA", kid: "k-1" }] })
      const res = await request(app).get("/api/.well-known/jwks.json").expect(200)
      expect(res.body.keys).toHaveLength(1)
    })
  })

  describe("POST /api/ciba/authentication", () => {
    it("returns USER_IDENTIFICATION", async () => {
      mockApi.ciba.processAuthentication.mockResolvedValue({ action: "USER_IDENTIFICATION", ticket: "t-1" })
      const res = await request(app).post("/api/ciba/authentication")
        .send({ parameters: "login_hint=user-1&scope=openid", clientId: "c-1", clientSecret: "s-1" }).expect(200)
      expect(res.body.action).toBe("USER_IDENTIFICATION")
    })
  })

  describe("POST /api/ciba/issue", () => {
    it("returns authReqId", async () => {
      mockApi.ciba.issue.mockResolvedValue({ action: "OK", authReqId: "ari-1", expiresIn: 120 })
      const res = await request(app).post("/api/ciba/issue").send({ ticket: "t-1" }).expect(200)
      expect(res.body.authReqId).toBe("ari-1")
    })
  })

  describe("POST /api/ciba/fail", () => {
    it("returns 403 for ACCESS_DENIED", async () => {
      mockApi.ciba.fail.mockResolvedValue({ action: "FORBIDDEN" })
      await request(app).post("/api/ciba/fail").send({ ticket: "t-1", reason: "ACCESS_DENIED" }).expect(403)
    })
  })

  describe("POST /api/ciba/complete", () => {
    it("returns 200", async () => {
      mockApi.ciba.complete.mockResolvedValue({ action: "NOTIFICATION" })
      await request(app).post("/api/ciba/complete")
        .send({ ticket: "t-1", result: "AUTHORIZED", subject: "user-1" }).expect(200)
    })
  })

  describe("POST /api/par", () => {
    it("returns 201 with request_uri", async () => {
      mockApi.pushedAuthorization.create.mockResolvedValue({
        action: "CREATED",
        requestUri: "urn:ietf:params:oauth:request_uri:abc",
        responseContent: JSON.stringify({ expires_in: 90, request_uri: "urn:ietf:params:oauth:request_uri:abc" }),
      })
      const res = await request(app).post("/api/par")
        .send({ parameters: "response_type=code&client_id=c-1", clientId: "c-1", clientSecret: "s-1" }).expect(201)
      expect(res.body.requestUri).toBe("urn:ietf:params:oauth:request_uri:abc")
    })
  })

  describe("POST /api/client/dcr/register", () => {
    it("returns 201 with action CREATED", async () => {
      mockApi.dynamicClientRegistration.register.mockResolvedValue({ action: "CREATED", responseContent: JSON.stringify({ client_id: "dcr-1" }) })
      const res = await request(app).post("/api/client/dcr/register").auth("test-admin", "test-secret").send({ json: '{"client_name":"test"}' }).expect(201)
      expect(res.body.action).toBe("CREATED")
    })
  })

  describe("POST /api/client/dcr/get", () => {
    it("returns 200 with action OK", async () => {
      mockApi.dynamicClientRegistration.get.mockResolvedValue({ action: "OK", responseContent: JSON.stringify({ client_id: "dcr-1" }) })
      const res = await request(app).post("/api/client/dcr/get").send({ token: "rt", clientId: "dcr-1" }).expect(200)
      expect(res.body.action).toBe("OK")
    })
  })

  describe("POST /api/client/dcr/delete", () => {
    it("returns 204", async () => {
      mockApi.dynamicClientRegistration.delete.mockResolvedValue({ action: "DELETED" })
      await request(app).post("/api/client/dcr/delete").send({ token: "rt", clientId: "dcr-1" }).expect(204)
    })
  })

  describe("POST /api/client/dcr/update", () => {
    it("returns 200", async () => {
      mockApi.dynamicClientRegistration.update.mockResolvedValue({ action: "UPDATED", responseContent: JSON.stringify({ client_id: "dcr-1" }) })
      await request(app).post("/api/client/dcr/update").send({ json: "{}", token: "rt", clientId: "dcr-1" }).expect(200)
    })
  })

  describe("GET /api/gm/:grantId", () => {
    it("returns 200 when the token is bound to that grant", async () => {
      mockApi.introspection.process.mockResolvedValue({ action: "OK", grantId: "g-1", subject: "alice" })
      mockApi.grantManagement.processRequest.mockResolvedValue({ action: "OK", responseContent: JSON.stringify({ grantId: "g-1" }) })
      const res = await request(app).get("/api/gm/g-1").set("Authorization", "Bearer tok-1").expect(200)
      expect(res.body.grantId).toBe("g-1")
    })

    it("returns 403 for another user's grant, without reaching Authlete", async () => {
      // The cross-user BOLA, verified live before this fix: bob's token read alice's grant.
      mockApi.introspection.process.mockResolvedValue({ action: "OK", grantId: "g-bob", subject: "bob" })
      const res = await request(app).get("/api/gm/g-alice").set("Authorization", "Bearer bob-tok").expect(403)
      expect(res.body.error).toBe("access_denied")
      expect(mockApi.grantManagement.processRequest).not.toHaveBeenCalled()
    })

    it("returns 403 for a token with no grant binding (client credentials)", async () => {
      mockApi.introspection.process.mockResolvedValue({ action: "OK" })
      await request(app).get("/api/gm/g-1").set("Authorization", "Bearer cc-tok").expect(403)
      expect(mockApi.grantManagement.processRequest).not.toHaveBeenCalled()
    })

    it("returns 401 with no bearer token, without introspecting", async () => {
      const res = await request(app).get("/api/gm/g-1").expect(401)
      expect(res.body.error).toBe("invalid_token")
      expect(mockApi.introspection.process).not.toHaveBeenCalled()
    })

    it("returns 403 when the token lacks the query scope", async () => {
      mockApi.introspection.process.mockResolvedValue({ action: "FORBIDDEN", responseContent: 'Bearer error="insufficient_scope"' })
      await request(app).get("/api/gm/g-1").set("Authorization", "Bearer weak-tok").expect(403)
      expect(mockApi.grantManagement.processRequest).not.toHaveBeenCalled()
    })
  })

  describe("DELETE /api/gm/:grantId", () => {
    it("returns 204 when the token is bound to that grant", async () => {
      mockApi.introspection.process.mockResolvedValue({ action: "OK", grantId: "g-1", subject: "alice" })
      mockApi.grantManagement.processRequest.mockResolvedValue({ action: "OK" })
      await request(app).delete("/api/gm/g-1").set("Authorization", "Bearer tok-1").expect(204)
    })

    it("returns 403 when deleting another user's grant, without reaching Authlete", async () => {
      // The destructive half: before the fix this returned 204 and destroyed the other user's grant.
      mockApi.introspection.process.mockResolvedValue({ action: "OK", grantId: "g-bob", subject: "bob" })
      await request(app).delete("/api/gm/g-alice").set("Authorization", "Bearer bob-tok").expect(403)
      expect(mockApi.grantManagement.processRequest).not.toHaveBeenCalled()
    })
  })

  describe("administrative auth fails closed", () => {
    it("rejects an unauthenticated management request", async () => {
      const res = await request(app).get("/api/client/list").expect(401)
      expect(res.body.error).toBe("invalid_client")
      expect(mockApi.client.list).not.toHaveBeenCalled()
    })

    it("rejects management requests when MGMT credentials are unset", async () => {
      // Regression for the fail-open defect: an unset env var must not disable authentication.
      vi.stubEnv("MGMT_CLIENT_ID", "")
      vi.stubEnv("MGMT_CLIENT_SECRET", "")
      const unconfigured = createApp()
      await request(unconfigured).get("/api/client/list").expect(401)
      expect(mockApi.client.list).not.toHaveBeenCalled()
    })
  })

  describe("GET /api/client/list", () => {
    it("returns client list", async () => {
      mockApi.client.list.mockResolvedValue({ clients: [{ clientId: "c-1" }], totalCount: 1 })
      const res = await request(app).get("/api/client/list").auth("test-admin", "test-secret").expect(200)
      expect(res.body.clients).toHaveLength(1)
    })
  })

  describe("POST /api/client/create", () => {
    it("creates a client", async () => {
      mockApi.client.create.mockResolvedValue({ action: "OK", clientId: "c-new" } as any)
      const res = await request(app).post("/api/client/create").auth("test-admin", "test-secret")
        .send({ client: { clientName: "test", grantTypes: ["AUTHORIZATION_CODE"] } }).expect(201)
      expect(res.body.clientId).toBe("c-new")
    })
  })

  describe("POST /api/token/create", () => {
    it("creates a token", async () => {
      mockApi.token.management.create.mockResolvedValue({ action: "OK", accessToken: "at-1" })
      const res = await request(app).post("/api/token/create").auth("test-admin", "test-secret")
        .send({ grantType: "AUTHORIZATION_CODE", clientId: "123", subject: "user-1" }).expect(200)
      expect(res.body.accessToken).toBe("at-1")
    })
  })

  describe("GET /api/token/list", () => {
    it("lists tokens", async () => {
      mockApi.token.management.list.mockResolvedValue({ tokens: [{ accessToken: "at-1" }] })
      const res = await request(app).get("/api/token/list").auth("test-admin", "test-secret").expect(200)
      expect(res.body.tokens).toHaveLength(1)
    })
  })

  describe("GET /api/fapi/config", () => {
    it("returns FAPI config from live Authlete data", async () => {
      mockApi.service.get.mockResolvedValue({
        fapiModes: ["FAPI2_SECURITY"],
        dpopNonceRequired: true,
        clientIdMetadataDocumentSupported: true,
      })
      const res = await request(app).get("/api/fapi/config").expect(200)
      expect(res.body.mode).toBe("sp")
      expect(res.body.dpopEnabled).toBe(true)
      expect(res.body.requiredClientAuth).toBe("PRIVATE_KEY_JWT")
      expect(res.body.parRequired).toBe(true)
      expect(res.body.pkceRequired).toBe(true)
      expect(res.body.scopeRequired).toBe(true)
      expect(res.body.cimdSupported).toBe(true)
    })
  })

  describe("GET /api/fapi/status", () => {
    it("returns live Authlete service config", async () => {
      mockApi.service.get.mockResolvedValue({
        issuer: "https://auth.example.com",
        fapiModes: ["FAPI2_SECURITY"],
        dpopNonceRequired: true,
        dpopNonceDuration: 3600,
        scopeRequired: true,
        refreshTokenKept: false,
        refreshTokenIdempotent: false,
        pkceRequired: true,
        parRequired: true,
        clientIdMetadataDocumentSupported: false,
      })
      const res = await request(app).get("/api/fapi/status").expect(200)
      expect(res.body.mode).toBe("sp")
      expect(res.body.dpopEnabled).toBe(true)
      expect(res.body.dpopNonceRequired).toBe(true)
      expect(res.body.fapiModes).toContain("FAPI2_SECURITY")
      expect(res.body.issuer).toBe("https://auth.example.com")
      expect(res.body.clientIdMetadataDocumentSupported).toBe(false)
    })

    it("returns 500 when Authlete call fails", async () => {
      mockApi.service.get.mockRejectedValue(new Error("Authlete error"))
      await request(app).get("/api/fapi/status").expect(500)
    })
  })

  describe("DPoP header forwarding", () => {
    it("forwards DPoP header on PAR and returns DPoP-Nonce", async () => {
      mockApi.pushedAuthorization.create.mockResolvedValue({
        action: "CREATED",
        requestUri: "urn:ietf:params:oauth:request_uri:dpop-test",
        responseContent: JSON.stringify({ expires_in: 90, request_uri: "urn:ietf:params:oauth:request_uri:dpop-test" }),
        dpopNonce: "par-nonce-1",
      })
      const res = await request(app).post("/api/par")
        .set("dpop", "dpop-proof-jwt")
        .send({ parameters: "response_type=code&client_id=c-1", clientId: "c-1", clientSecret: "s-1" })
        .expect(201)
      expect(res.body.requestUri).toBe("urn:ietf:params:oauth:request_uri:dpop-test")
      // Verify the mock was called with DPoP fields forwarded
      expect(mockApi.pushedAuthorization.create).toHaveBeenCalledWith(
        expect.objectContaining({
          pushedAuthorizationRequest: expect.objectContaining({
            dpop: "dpop-proof-jwt",
          }),
        })
      )
    })

    it("returns DPoP-Nonce header from token endpoint", async () => {
      mockApi.token.process.mockResolvedValue({
        action: "OK",
        responseContent: JSON.stringify({ access_token: "at-dpop-1", token_type: "DPoP", expires_in: 3600 }),
        dpopNonce: "token-nonce-1",
      } as any)
      const res = await request(app).post("/api/token")
        .set("dpop", "dpop-proof-jwt")
        .set("Authorization", `Basic ${Buffer.from("c-1:s-1").toString("base64")}`)
        .send("grant_type=client_credentials&scope=openid")
        .expect(200)
      expect(res.body.access_token).toBe("at-dpop-1")
      expect(res.headers["dpop-nonce"]).toBe("token-nonce-1")
    })

    it("returns DPoP-Nonce header from introspection endpoint", async () => {
      mockApi.introspection.process.mockResolvedValue({
        action: "OK",
        active: true,
        dpopNonce: "introspect-nonce-1",
      } as any)
      const res = await request(app).post("/api/introspection")
        .set("dpop", "dpop-proof-jwt")
        .send({ token: "at-dpop-1" })
        .expect(200)
      expect(res.body.active).toBe(true)
      expect(res.headers["dpop-nonce"]).toBe("introspect-nonce-1")
    })

    it("returns DPoP-Nonce header from userinfo endpoint", async () => {
      mockApi.userinfo.process.mockResolvedValue({
        action: "OK",
        subject: "user-1",
        claims: ["name", "email"],
        dpopNonce: "userinfo-nonce-1",
      } as any)
      mockApi.userinfo.issue.mockResolvedValue({
        action: "JSON",
        responseContent: JSON.stringify({ sub: "user-1", name: "user-1", email: "user-1@example.com" }),
      } as any)
      // The DPoP scheme, not Bearer: RFC 9449 §7.1 requires it for a DPoP-bound token, and §7.2
      // makes Bearer-plus-proof a rejected presentation.
      const res = await request(app).post("/api/userinfo")
        .set("dpop", "dpop-proof-jwt")
        .set("Authorization", "DPoP at-dpop-1")
        .expect(200)
      expect(res.headers["dpop-nonce"]).toBe("userinfo-nonce-1")
    })

    it("does not set DPoP-Nonce when Authlete returns none", async () => {
      mockApi.token.process.mockResolvedValue({
        action: "OK",
        responseContent: JSON.stringify({ access_token: "at-no-nonce", token_type: "Bearer", expires_in: 3600 }),
      } as any)
      const res = await request(app).post("/api/token")
        .set("Authorization", `Basic ${Buffer.from("c-1:s-1").toString("base64")}`)
        .send("grant_type=client_credentials&scope=openid")
        .expect(200)
      expect(res.headers["dpop-nonce"]).toBeUndefined()
    })
  })

  describe("GET /api/health/authlete", () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it("returns healthy", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve("OK") })
      vi.stubGlobal("fetch", mockFetch)
      const res = await request(app).get("/api/health/authlete").expect(200)
      expect(res.body.healthy).toBe(true)
    })
  })
})
