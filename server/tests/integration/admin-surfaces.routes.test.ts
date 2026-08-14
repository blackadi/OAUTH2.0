import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"

/**
 * Route-level coverage for the last sixteen routes in `scripts/route-coverage-baseline.json`, across seven
 * modules: token management (5), HSK (4), federation (3), JAR (1), device consent (1), health (1) and the
 * developer route index (1).
 *
 * They are one file because they share one question — **is the gate on the route, or only in the
 * documentation?** Eleven of the sixteen are administrative, and every one of them gates itself from inside
 * its handler rather than from the router, so `token.routes.ts`, `hsk.routes.ts` and `jar.routes.ts` each
 * read as if they carry no authentication at all. `/api/jar/process` is what happens when that reading is
 * accurate: it was unauthenticated until 2026-08-13 and returned Authlete's whole authorization response,
 * `ticket` included, to anonymous callers.
 *
 * The remaining five are public on purpose, and are asserted as public so that "no auth" stays a decision
 * rather than becoming an accident.
 */

const mocks = vi.hoisted(() => ({ nodeEnv: "test" }))

vi.mock("../../src/config/app.config", () => ({
  server: {
    get nodeEnv() {
      return mocks.nodeEnv
    },
    port: 3000,
    sessionSecret: "test-secret",
    morganFormat: "dev",
  },
  session: { secret: "test-secret" },
  logging: { level: "error", morganFormat: "dev" },
  redis: { url: undefined },
  protectedResource: { resource: undefined, documentation: undefined },
}))

const mockApi = vi.hoisted(() => {
  const fn = () => vi.fn()
  return {
    token: {
      process: fn(),
      issue: fn(),
      fail: fn(),
      management: { create: fn(), update: fn(), delete: fn(), list: fn(), revoke: fn(), reissueIdToken: fn() },
    },
    hardwareSecurityKeys: { create: fn(), get: fn(), delete: fn(), list: fn() },
    federation: { configuration: fn(), registration: fn() },
    authorization: { processRequest: fn(), fail: fn(), issue: fn() },
    lifecycle: { getApiLifecycleHealthcheck: fn() },
    deviceFlow: { authorization: fn(), verification: fn(), complete: fn() },
  }
})

vi.mock("../../src/services/authlete.service", () => ({
  authleteApi: mockApi,
  serviceId: "test-service",
}))

import { createApp } from "../../src/app"

type Verb = "get" | "post" | "put" | "patch" | "delete"

describe("Integration: the remaining admin and public surfaces", () => {
  let app: ReturnType<typeof createApp>

  const ADMIN_BASIC = `Basic ${Buffer.from("test-admin:test-secret").toString("base64")}`
  const WRONG_BASIC = `Basic ${Buffer.from("test-admin:wrong").toString("base64")}`

  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv("MGMT_CLIENT_ID", "test-admin")
    vi.stubEnv("MGMT_CLIENT_SECRET", "test-secret")
    mocks.nodeEnv = "test"
    app = createApp()
  })

  const send = (verb: Verb, path: string, auth?: string, body?: unknown) => {
    const r = request(app)[verb](path)
    if (auth) r.set("Authorization", auth)
    return body ? r.send(body) : r.send()
  }

  // -----------------------------------------------------------------------------------------------------
  // 1. Token management — /api/token/* except the OAuth token endpoint itself.
  //
  // Note what is NOT in this table: `POST /api/token`, the RFC 6749 §3.2 token endpoint, which is
  // authenticated as an OAuth *client* and must never require this deployment's admin credentials. It lives
  // in the same router and is covered in `routes.test.ts`. Mixing the two postures up in either direction
  // is the interesting failure, so the last case here asserts they stay apart.
  // -----------------------------------------------------------------------------------------------------
  describe("token management requires admin Basic auth", () => {
    const TOKEN_ADMIN = [
      { verb: "post" as Verb, path: "/api/token/create", call: () => mockApi.token.management.create, body: { grantType: "CLIENT_CREDENTIALS", subject: "s" } },
      { verb: "get" as Verb, path: "/api/token/list", call: () => mockApi.token.management.list },
      { verb: "delete" as Verb, path: "/api/token/delete/at-1", call: () => mockApi.token.management.delete },
      { verb: "patch" as Verb, path: "/api/token/update", call: () => mockApi.token.management.update, body: { accessToken: "at-1" } },
      { verb: "post" as Verb, path: "/api/token/revoke", call: () => mockApi.token.management.revoke, body: { accessTokenIdentifier: "at-1" } },
      { verb: "post" as Verb, path: "/api/token/reissue", call: () => mockApi.token.management.reissueIdToken, body: { accessToken: "at-1" } },
    ]

    it.each(TOKEN_ADMIN)("$verb $path refuses an anonymous caller and never reaches Authlete", async (r) => {
      const res = await send(r.verb, r.path, undefined, r.body)

      expect(res.status).toBe(401)
      expect(res.body.error).toBe("invalid_client")
      expect(res.headers["www-authenticate"]).toBe('Basic realm="token_management"')
      expect(r.call()).not.toHaveBeenCalled()
    })

    it.each(TOKEN_ADMIN)("$verb $path refuses wrong credentials and never reaches Authlete", async (r) => {
      const res = await send(r.verb, r.path, WRONG_BASIC, r.body)

      expect(res.status).toBe(401)
      expect(r.call()).not.toHaveBeenCalled()
    })

    it.each(TOKEN_ADMIN)("$verb $path fails closed when management credentials are unset", async (r) => {
      vi.stubEnv("MGMT_CLIENT_ID", "")
      vi.stubEnv("MGMT_CLIENT_SECRET", "")
      app = createApp()

      const res = await send(r.verb, r.path, ADMIN_BASIC, r.body)

      expect(res.status).toBe(401)
      expect(r.call()).not.toHaveBeenCalled()
    })

    it("routes /api/token/list to the token-management list API once authenticated", async () => {
      mockApi.token.management.list.mockResolvedValue({ accessTokens: [] })

      await send("get", "/api/token/list", ADMIN_BASIC).expect(200)

      expect(mockApi.token.management.list).toHaveBeenCalledTimes(1)
    })

    // The OAuth token endpoint shares this router and must NOT be behind admin auth. A client presenting
    // its own credentials has to reach Authlete; requiring MGMT_CLIENT_ID here would break every client.
    it("does not put admin auth on POST /api/token, the OAuth token endpoint", async () => {
      mockApi.token.process.mockResolvedValue({
        action: "OK",
        responseContent: JSON.stringify({ access_token: "at-1" }),
      })

      await request(app)
        .post("/api/token")
        .set("Authorization", `Basic ${Buffer.from("some-client:some-secret").toString("base64")}`)
        .send("grant_type=client_credentials")
        .expect(200)

      expect(mockApi.token.process).toHaveBeenCalledTimes(1)
    })
  })

  // -----------------------------------------------------------------------------------------------------
  // 2. GET /api/token/createLocalToken — admin auth AND a development-only gate, in that order.
  //
  // The ordering is deliberate and is the whole point of the endpoint's wiring: outside development it
  // answers a flat 404 *before* the auth check, so production does not reveal that the endpoint exists.
  // A controller test can see the branch; only a route test sees that both gates are actually reached.
  // -----------------------------------------------------------------------------------------------------
  describe("GET /api/token/createLocalToken", () => {
    it.each(["test", "production"])("answers a flat 404 when nodeEnv is %s", async (env) => {
      mocks.nodeEnv = env
      app = createApp()

      const res = await send("get", "/api/token/createLocalToken?iss=i&sub=s&aud=a", ADMIN_BASIC)

      expect(res.status).toBe(404)
      expect(res.body.error).toBe("not_found")
    })

    it("gives an anonymous caller in production the same 404, not a 401", async () => {
      mocks.nodeEnv = "production"
      app = createApp()

      const res = await send("get", "/api/token/createLocalToken?iss=i&sub=s&aud=a")

      expect(res.status).toBe(404)
      expect(res.headers["www-authenticate"]).toBeUndefined()
    })

    // In development the endpoint exists, and there it still requires admin credentials. It was the only
    // admin route with no auth check at all before this gate was added.
    it("requires admin credentials in development", async () => {
      mocks.nodeEnv = "development"
      app = createApp()

      const res = await send("get", "/api/token/createLocalToken?iss=i&sub=s&aud=a")

      expect(res.status).toBe(401)
      expect(res.headers["www-authenticate"]).toBe('Basic realm="token_management"')
    })

    it("rejects a request missing iss/sub/aud once authenticated in development", async () => {
      mocks.nodeEnv = "development"
      app = createApp()

      const res = await send("get", "/api/token/createLocalToken?iss=i", ADMIN_BASIC)

      expect(res.status).toBe(400)
      expect(res.body.error).toBe("invalid_request")
    })

    // 9068-W2. `client_id` joined the required set because RFC 9068 §2.2 marks it REQUIRED, and this
    // endpoint's token is the repo's only obtainable specimen of that section. Asserted at the route so the
    // 400 is known to arrive *after* both gates rather than instead of them.
    it("rejects a request with iss/sub/aud but no client_id", async () => {
      mocks.nodeEnv = "development"
      app = createApp()

      const res = await send("get", "/api/token/createLocalToken?iss=i&sub=s&aud=a", ADMIN_BASIC)

      expect(res.status).toBe(400)
      expect(res.body.error).toBe("invalid_request")
      expect(res.body.error_description).toContain("client_id")
    })

    // The 200 path is NOT asserted here, deliberately. Signing needs `JWT_PRIVATE_KEY_PEM`, which the test
    // environment does not set, so a success case would pass or fail depending on whose `.env` ran it —
    // the same environment-dependence that made the `NODE_ENV` default test mock `dotenv`. The token's
    // shape is asserted against a real key in `tests/unit/utils/createLocalJWT.test.ts`, and the
    // controller's parameter forwarding in `tests/unit/controllers/token.management.controller.test.ts`.
  })

  // -----------------------------------------------------------------------------------------------------
  // 3. HSK — four routes, admin auth, and a create/get/delete/list action map per endpoint.
  // -----------------------------------------------------------------------------------------------------
  describe("HSK requires admin Basic auth", () => {
    const HSK = [
      { verb: "post" as Verb, path: "/api/hsk/create", call: () => mockApi.hardwareSecurityKeys.create, body: { kty: "EC", hsmName: "google" }, ok: 201 },
      { verb: "get" as Verb, path: "/api/hsk/get/h-1", call: () => mockApi.hardwareSecurityKeys.get, ok: 200 },
      { verb: "delete" as Verb, path: "/api/hsk/delete/h-1", call: () => mockApi.hardwareSecurityKeys.delete, ok: 204 },
      { verb: "get" as Verb, path: "/api/hsk/list", call: () => mockApi.hardwareSecurityKeys.list, ok: 200 },
    ]

    it.each(HSK)("$verb $path refuses an anonymous caller and never reaches Authlete", async (r) => {
      const res = await send(r.verb, r.path, undefined, r.body)

      expect(res.status).toBe(401)
      expect(res.headers["www-authenticate"]).toBe('Basic realm="hsk"')
      expect(r.call()).not.toHaveBeenCalled()
    })

    it.each(HSK)("$verb $path refuses wrong credentials and never reaches Authlete", async (r) => {
      const res = await send(r.verb, r.path, WRONG_BASIC, r.body)

      expect(res.status).toBe(401)
      expect(r.call()).not.toHaveBeenCalled()
    })

    it.each(HSK)("$verb $path fails closed when management credentials are unset", async (r) => {
      vi.stubEnv("MGMT_CLIENT_ID", "")
      vi.stubEnv("MGMT_CLIENT_SECRET", "")
      app = createApp()

      const res = await send(r.verb, r.path, ADMIN_BASIC, r.body)

      expect(res.status).toBe(401)
      expect(r.call()).not.toHaveBeenCalled()
    })

    it.each(HSK)("$verb $path maps SUCCESS to $ok once authenticated", async (r) => {
      r.call().mockResolvedValue({ action: "SUCCESS", hsk: { handle: "h-1" }, hsks: [] })

      const res = await send(r.verb, r.path, ADMIN_BASIC, r.body)

      expect(res.status).toBe(r.ok)
      expect(r.call()).toHaveBeenCalledTimes(1)
    })

    it("carries the :handle path parameter through to Authlete", async () => {
      mockApi.hardwareSecurityKeys.get.mockResolvedValue({ action: "SUCCESS", hsk: { handle: "abc-123" } })

      await send("get", "/api/hsk/get/abc-123", ADMIN_BASIC).expect(200)

      expect(mockApi.hardwareSecurityKeys.get).toHaveBeenCalledWith(
        expect.objectContaining({ serviceId: "test-service", handle: "abc-123" }),
      )
    })

    it("maps NOT_FOUND to 404 rather than a 200 with an empty body", async () => {
      mockApi.hardwareSecurityKeys.get.mockResolvedValue({ action: "NOT_FOUND" })

      await send("get", "/api/hsk/get/missing", ADMIN_BASIC).expect(404)
    })
  })

  // -----------------------------------------------------------------------------------------------------
  // 4. Federation — three routes, and the two postures are NOT the same. Entity configuration is public
  //    (a federation entity statement is meant to be fetchable); registration is administrative.
  // -----------------------------------------------------------------------------------------------------
  describe("federation", () => {
    it("serves the entity configuration publicly, as an entity statement", async () => {
      mockApi.federation.configuration.mockResolvedValue({ action: "OK", responseContent: "eyJhbGciOiJSUzI1NiJ9.e30.sig" })

      const res = await send("get", "/api/federation/configuration").expect(200)

      expect(res.headers["content-type"]).toContain("application/entity-statement+jwt")
      expect(res.text).toBe("eyJhbGciOiJSUzI1NiJ9.e30.sig")
    })

    it("serves the same document at the root well-known path", async () => {
      mockApi.federation.configuration.mockResolvedValue({ action: "OK", responseContent: "eyJhbGciOiJSUzI1NiJ9.e30.sig" })

      const res = await send("get", "/.well-known/openid-federation").expect(200)

      expect(res.headers["content-type"]).toContain("application/entity-statement+jwt")
    })

    // The federation JWK Set is not configured on this service, so Authlete answers `[A316201]` and this
    // endpoint cannot produce a statement (FED-W1/FED-W2). A 500 naming our own missing configuration is
    // the honest answer; a 400 would blame the caller for a fault that is entirely ours, which is what it
    // did before T1-16.
    it("answers 500, not 400, when the entity statement cannot be produced", async () => {
      mockApi.federation.configuration.mockResolvedValue({ action: "INTERNAL_SERVER_ERROR", responseContent: "[A316201]" })

      const res = await send("get", "/api/federation/configuration").expect(500)

      expect(res.body.error).toBe("federation_error")
    })

    it("requires admin Basic auth on registration, and never reaches Authlete without it", async () => {
      const res = await send("post", "/api/federation/registration", undefined, { entityConfiguration: "x" })

      expect(res.status).toBe(401)
      expect(res.headers["www-authenticate"]).toBe('Basic realm="federation"')
      expect(mockApi.federation.registration).not.toHaveBeenCalled()
    })

    it("fails closed on registration when management credentials are unset", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "")
      vi.stubEnv("MGMT_CLIENT_SECRET", "")
      app = createApp()

      await send("post", "/api/federation/registration", ADMIN_BASIC, { entityConfiguration: "x" }).expect(401)

      expect(mockApi.federation.registration).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------------------------------------
  // 5. JAR — the regression that motivated the whole route-coverage exercise.
  // -----------------------------------------------------------------------------------------------------
  describe("POST /api/jar/process", () => {
    const authzResponse = {
      action: "INTERACTION",
      resultCode: "A004001",
      resultMessage: "ok",
      scopes: [{ name: "openid" }],
      responseContent: "<form/>",
      // The three that must never leave the process.
      ticket: "SECRET-TICKET-VALUE",
      service: { serviceName: "internal", apiKey: "SECRET-API-KEY" },
      client: { clientId: 1, clientSecret: "SECRET-CLIENT-SECRET" },
    }

    it("refuses an anonymous caller, before the Authlete call", async () => {
      const res = await send("post", "/api/jar/process", undefined, { request: "jwt", clientId: "c-1" })

      expect(res.status).toBe(401)
      expect(res.headers["www-authenticate"]).toBe('Basic realm="jar"')
      expect(mockApi.authorization.processRequest).not.toHaveBeenCalled()
    })

    it("refuses wrong credentials, before the Authlete call", async () => {
      const res = await send("post", "/api/jar/process", WRONG_BASIC, { request: "jwt", clientId: "c-1" })

      expect(res.status).toBe(401)
      expect(mockApi.authorization.processRequest).not.toHaveBeenCalled()
    })

    it("fails closed when management credentials are unset", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "")
      vi.stubEnv("MGMT_CLIENT_SECRET", "")
      app = createApp()

      await send("post", "/api/jar/process", ADMIN_BASIC, { request: "jwt", clientId: "c-1" }).expect(401)

      expect(mockApi.authorization.processRequest).not.toHaveBeenCalled()
    })

    // The allowlist. Asserted by naming the forbidden fields rather than the permitted ones, because the
    // risk is a field the SDK adds later — and asserted on the raw response text so a nested occurrence
    // cannot slip through an object-shaped check.
    it("returns the allowlisted fields and none of the ticket, service or client", async () => {
      mockApi.authorization.processRequest.mockResolvedValue(authzResponse)

      const res = await send("post", "/api/jar/process", ADMIN_BASIC, { request: "jwt", clientId: "c-1" }).expect(200)

      expect(Object.keys(res.body).sort()).toEqual(
        ["action", "responseContent", "resultCode", "resultMessage", "scopes"].sort(),
      )
      expect(res.text).not.toContain("SECRET-TICKET-VALUE")
      expect(res.text).not.toContain("SECRET-API-KEY")
      expect(res.text).not.toContain("SECRET-CLIENT-SECRET")
      expect(res.body.ticket).toBeUndefined()
      expect(res.body.service).toBeUndefined()
      expect(res.body.client).toBeUndefined()
    })

    it("keeps resultMessage and scopes, which are the endpoint's whole purpose", async () => {
      mockApi.authorization.processRequest.mockResolvedValue({
        action: "BAD_REQUEST",
        resultCode: "A005328",
        resultMessage: "[A005328] The signature of the request object is invalid.",
        ticket: "SECRET-TICKET-VALUE",
      })

      const res = await send("post", "/api/jar/process", ADMIN_BASIC, { request: "bad", clientId: "c-1" }).expect(400)

      expect(res.body.resultMessage).toContain("A005328")
      expect(res.text).not.toContain("SECRET-TICKET-VALUE")
    })

    it("maps the action to a status instead of always answering 200", async () => {
      mockApi.authorization.processRequest.mockResolvedValue({ action: "INTERNAL_SERVER_ERROR" })

      await send("post", "/api/jar/process", ADMIN_BASIC, { request: "jwt", clientId: "c-1" }).expect(500)
    })

    it.each([
      { missing: "request", body: { clientId: "c-1" } },
      { missing: "clientId", body: { request: "jwt" } },
    ])("rejects an authenticated request missing $missing, without calling Authlete", async ({ body }) => {
      const res = await send("post", "/api/jar/process", ADMIN_BASIC, body)

      expect(res.status).toBe(400)
      expect(mockApi.authorization.processRequest).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------------------------------------
  // 6. POST /device/consent — the authenticated device-flow path, available in every environment. It is
  //    CSRF-protected because it is a browser form POST, which is the opposite arrangement from
  //    /api/backchannel_logout and worth pinning as such.
  // -----------------------------------------------------------------------------------------------------
  describe("POST /device/consent", () => {
    it("rejects a POST with no CSRF token, and never reaches Authlete", async () => {
      const res = await request(app)
        .post("/device/consent")
        .send({ userCode: "ABCD-EFGH", username: "admin", password: "password" })

      expect(res.status).toBe(403)
      expect(mockApi.deviceFlow.complete).not.toHaveBeenCalled()
    })

    it("is available outside development, unlike /api/device/complete", async () => {
      mocks.nodeEnv = "production"
      app = createApp()

      const consent = await request(app).post("/device/consent").send({ userCode: "ABCD-EFGH" })
      const complete = await request(app).post("/api/device/complete").send({ userCode: "ABCD-EFGH", result: "AUTHORIZED", subject: "admin" })

      expect(consent.status).toBe(403) // reached the CSRF gate — the route exists
      expect(complete.status).toBe(404) // gated out of existence
    })
  })

  // -----------------------------------------------------------------------------------------------------
  // 7. The two public surfaces — asserted public on purpose.
  // -----------------------------------------------------------------------------------------------------
  describe("public surfaces", () => {
    it("GET /api/health/all aggregates redis and authlete without credentials", async () => {
      mockApi.lifecycle.getApiLifecycleHealthcheck.mockResolvedValue("OK")

      const res = await send("get", "/api/health/all").expect(200)

      expect(res.body.status).toBe("ok")
      expect(res.body.checks).toHaveProperty("redis")
      expect(res.body.checks).toHaveProperty("authlete")
    })

    // An aggregate that answers 200 when a dependency is down is worse than no aggregate — a load
    // balancer or uptime probe reading it would never fire.
    it("degrades to 503 when Authlete is unreachable", async () => {
      mockApi.lifecycle.getApiLifecycleHealthcheck.mockRejectedValue(new Error("unreachable"))

      const res = await send("get", "/api/health/all").expect(503)

      expect(res.body.status).toBe("degraded")
      expect(res.body.checks.authlete.healthy).toBe(false)
    })

    it("GET /api/routes.json lists the routes without credentials", async () => {
      const res = await send("get", "/api/routes.json").expect(200)

      expect(res.body.base).toMatch(/^https?:\/\//)
      expect(Array.isArray(res.body.routes)).toBe(true)
      expect(res.body.routes.length).toBeGreaterThan(50)
    })

    // The index carries example request bodies, and it is served to anyone. Those examples must stay
    // placeholders — a real secret pasted into one would be published by this endpoint.
    it("does not leak the deployment's management credentials in its examples", async () => {
      const res = await send("get", "/api/routes.json").expect(200)

      const body = JSON.stringify(res.body)
      expect(body).not.toContain("test-secret")
      expect(body).not.toContain("test-admin")
    })
  })
})
