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
    service: { getConfiguration: fn(), getJwks: fn() },
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
    it("redirects to login on INTERACTION", async () => {
      mockApi.authorization.processRequest.mockResolvedValue({ action: "INTERACTION", ticket: "t-1", client: { clientId: 123 }, scopes: [], idTokenClaims: undefined, authorizationDetails: undefined, resultMessage: "" })
      await request(app).get("/api/authorization?response_type=code&client_id=123&redirect_uri=http://localhost:3000/callback&scope=openid").expect(302)
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
    it("returns userinfo for valid token", async () => {
      mockApi.userinfo.process.mockResolvedValue({ action: "OK", responseContent: JSON.stringify({ sub: "user-1" }) })
      const res = await request(app).post("/api/userinfo").set("Authorization", "Bearer at-1").expect(200)
      expect(res.body.sub).toBe("user-1")
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
      const res = await request(app).post("/api/client/dcr/register").send({ json: '{"client_name":"test"}' }).expect(201)
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
    it("returns 200", async () => {
      mockApi.grantManagement.processRequest.mockResolvedValue({ action: "OK", responseContent: JSON.stringify({ grantId: "g-1" }) })
      const res = await request(app).get("/api/gm/g-1").set("Authorization", "Bearer tok-1").expect(200)
      expect(res.body.grantId).toBe("g-1")
    })
  })

  describe("DELETE /api/gm/:grantId", () => {
    it("returns 204", async () => {
      mockApi.grantManagement.processRequest.mockResolvedValue({ action: "OK" })
      await request(app).delete("/api/gm/g-1").set("Authorization", "Bearer tok-1").expect(204)
    })
  })

  describe("GET /api/client/list", () => {
    it("returns client list", async () => {
      mockApi.client.list.mockResolvedValue({ clients: [{ clientId: "c-1" }], totalCount: 1 })
      const res = await request(app).get("/api/client/list").expect(200)
      expect(res.body.clients).toHaveLength(1)
    })
  })

  describe("POST /api/client/create", () => {
    it("creates a client", async () => {
      mockApi.client.create.mockResolvedValue({ action: "OK", clientId: "c-new" } as any)
      const res = await request(app).post("/api/client/create")
        .send({ client: { clientName: "test", grantTypes: ["AUTHORIZATION_CODE"] } }).expect(201)
      expect(res.body.clientId).toBe("c-new")
    })
  })

  describe("POST /api/token/create", () => {
    it("creates a token", async () => {
      mockApi.token.management.create.mockResolvedValue({ action: "OK", accessToken: "at-1" })
      const res = await request(app).post("/api/token/create")
        .send({ grantType: "AUTHORIZATION_CODE", clientId: "123", subject: "user-1" }).expect(200)
      expect(res.body.accessToken).toBe("at-1")
    })
  })

  describe("GET /api/token/list", () => {
    it("lists tokens", async () => {
      mockApi.token.management.list.mockResolvedValue({ tokens: [{ accessToken: "at-1" }] })
      const res = await request(app).get("/api/token/list").expect(200)
      expect(res.body.tokens).toHaveLength(1)
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
