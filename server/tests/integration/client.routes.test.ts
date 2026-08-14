import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import { createApp } from "../../src/app"

/**
 * Route-level coverage for the sixteen client-management endpoints.
 *
 * WHY THIS MODULE FIRST
 * ---------------------
 * Highest blast radius in the backlog. `GET /api/client/get/:clientId` returns a confidential client's
 * **secret in plaintext**, `POST /api/client/secret/refresh/:clientIdentifier` rotates it, and
 * `DELETE /api/client/delete/:clientId` destroys a registration. Fourteen of the sixteen were carried in
 * `scripts/route-coverage-baseline.json`: `client.management.service.ts` has unit tests, so the *service*
 * was covered, and nothing drove a single route through its middleware chain.
 *
 * That distinction is not academic here. Every one of these sixteen handlers gates itself by calling
 * `requireBasicAuth("client_management")` as its **first statement**, rather than the router declaring the
 * middleware. Nothing structural enforces it: a seventeenth endpoint added to `client.routes.ts` with the
 * `checkAuth` line omitted would be wired, exported, reachable, and completely unauthenticated — and the
 * service unit tests would stay green, because they never see a request.
 *
 * `/api/jar/process` is what that looks like when it happens. It had a controller test, no auth, and
 * returned Authlete tickets to anonymous callers until 2026-08-13.
 *
 * So the table below is the point of the file: it enumerates every route in `client.routes.ts`, and the
 * auth assertions run over all of it. Adding a route without adding its row leaves the new route
 * unreferenced, which `check-route-coverage.mjs` fails on.
 */

const mockApi = vi.hoisted(() => {
  const fn = () => vi.fn()
  return {
    client: {
      list: fn(),
      get: fn(),
      create: fn(),
      update: fn(),
      delete: fn(),
      management: {
        updateLockFlag: fn(),
        refreshSecret: fn(),
        updateSecret: fn(),
        listAuthorizations: fn(),
        updateAuthorizations: fn(),
        deleteAuthorizations: fn(),
        getGrantedScopes: fn(),
        deleteGrantedScopes: fn(),
        getRequestableScopes: fn(),
        updateRequestableScopes: fn(),
        deleteRequestableScopes: fn(),
      },
    },
  }
})

vi.mock("../../src/services/authlete.service", () => ({
  authleteApi: mockApi,
  serviceId: "test-service",
}))

type Verb = "get" | "post" | "put" | "patch" | "delete"

interface RouteCase {
  verb: Verb
  path: string
  /** The SDK method this route must reach — and must NOT reach when unauthenticated. */
  call: () => ReturnType<typeof vi.fn>
  /** A body sufficient to get past the service's own required-field checks. */
  body?: Record<string, unknown>
  /** Status on the authenticated happy path. */
  ok: number
  /** What the mocked SDK method resolves to on that path. */
  resolves?: unknown
}

const m = () => mockApi.client.management

const ROUTES: RouteCase[] = [
  { verb: "get", path: "/api/client/list", call: () => mockApi.client.list, ok: 200, resolves: { clients: [] } },
  { verb: "get", path: "/api/client/get/c-1", call: () => mockApi.client.get, ok: 200, resolves: { clientId: 1 } },
  { verb: "post", path: "/api/client/create", call: () => mockApi.client.create, ok: 201, body: { client: { clientName: "n" } }, resolves: { clientId: 1 } },
  { verb: "patch", path: "/api/client/update/c-1", call: () => mockApi.client.update, ok: 200, body: { client: { clientName: "n" } }, resolves: { clientId: 1 } },
  { verb: "delete", path: "/api/client/delete/c-1", call: () => mockApi.client.delete, ok: 204 },
  { verb: "patch", path: "/api/client/flag/c-1", call: () => m().updateLockFlag, ok: 200, body: { clientLocked: true }, resolves: {} },
  { verb: "post", path: "/api/client/secret/refresh/c-1", call: () => m().refreshSecret, ok: 200, resolves: { newClientSecret: "s-2" } },
  { verb: "put", path: "/api/client/secret/update/c-1", call: () => m().updateSecret, ok: 200, body: { clientSecret: "s-3" }, resolves: { newClientSecret: "s-3" } },
  { verb: "get", path: "/api/client/auth/list/alice", call: () => m().listAuthorizations, ok: 200, resolves: { clients: [] } },
  { verb: "post", path: "/api/client/auth/update/c-1", call: () => m().updateAuthorizations, ok: 200, body: { subject: "alice", scopes: "openid" }, resolves: {} },
  { verb: "delete", path: "/api/client/auth/delete/c-1/alice", call: () => m().deleteAuthorizations, ok: 200, resolves: {} },
  { verb: "get", path: "/api/client/scopes/granted/c-1/alice", call: () => m().getGrantedScopes, ok: 200, resolves: {} },
  { verb: "delete", path: "/api/client/scopes/granted/c-1/alice", call: () => m().deleteGrantedScopes, ok: 200, resolves: {} },
  { verb: "get", path: "/api/client/scopes/requestable/c-1", call: () => m().getRequestableScopes, ok: 200, resolves: {} },
  { verb: "put", path: "/api/client/scopes/requestable/c-1", call: () => m().updateRequestableScopes, ok: 200, body: { requestableScopes: ["openid"] }, resolves: {} },
  { verb: "delete", path: "/api/client/scopes/requestable/c-1", call: () => m().deleteRequestableScopes, ok: 204 },
]

describe("Integration: client management routes", () => {
  let app: ReturnType<typeof createApp>

  const ADMIN_BASIC = `Basic ${Buffer.from("test-admin:test-secret").toString("base64")}`

  const send = (route: RouteCase, auth?: string) => {
    const r = request(app)[route.verb](route.path)
    if (auth) r.set("Authorization", auth)
    return route.body ? r.send(route.body) : r.send()
  }

  const everySdkCall = () => [
    mockApi.client.list, mockApi.client.get, mockApi.client.create,
    mockApi.client.update, mockApi.client.delete,
    ...Object.values(mockApi.client.management),
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv("MGMT_CLIENT_ID", "test-admin")
    vi.stubEnv("MGMT_CLIENT_SECRET", "test-secret")
    app = createApp()
  })

  // -----------------------------------------------------------------------------------------------------
  // 1. Auth posture, over the whole surface. First and broadest, because it is the defect class.
  // -----------------------------------------------------------------------------------------------------
  describe("auth posture", () => {
    it.each(ROUTES)("$verb $path refuses an anonymous caller, and reaches no Authlete API", async (route) => {
      const res = await send(route)

      expect(res.status).toBe(401)
      expect(res.body.error).toBe("invalid_client")
      expect(res.headers["www-authenticate"]).toBe('Basic realm="client_management"')
      for (const call of everySdkCall()) expect(call).not.toHaveBeenCalled()
    })

    it.each(ROUTES)("$verb $path refuses wrong credentials, and reaches no Authlete API", async (route) => {
      const res = await send(route, `Basic ${Buffer.from("test-admin:wrong").toString("base64")}`)

      expect(res.status).toBe(401)
      for (const call of everySdkCall()) expect(call).not.toHaveBeenCalled()
    })

    // Fails closed. Before the fix, an unset MGMT_CLIENT_ID/SECRET made `requireBasicAuth` return true,
    // so a deployment that forgot one variable served every route in this table — including the one that
    // returns a confidential client's secret — to anyone.
    it.each(ROUTES)("$verb $path fails closed when management credentials are unset", async (route) => {
      vi.stubEnv("MGMT_CLIENT_ID", "")
      vi.stubEnv("MGMT_CLIENT_SECRET", "")
      app = createApp()

      const res = await send(route, ADMIN_BASIC)

      expect(res.status).toBe(401)
      for (const call of everySdkCall()) expect(call).not.toHaveBeenCalled()
    })

    // The 401 body must not distinguish "wrong password" from "admin auth is not configured" — telling an
    // anonymous caller which one it is, is free reconnaissance. `requireBasicAuth` makes them identical on
    // purpose; that is only observable from outside the process.
    it("gives the same answer whether credentials are wrong or unconfigured", async () => {
      const wrong = await send(ROUTES[1], `Basic ${Buffer.from("test-admin:wrong").toString("base64")}`)

      vi.stubEnv("MGMT_CLIENT_ID", "")
      vi.stubEnv("MGMT_CLIENT_SECRET", "")
      app = createApp()
      const unconfigured = await send(ROUTES[1], ADMIN_BASIC)

      expect(unconfigured.status).toBe(wrong.status)
      expect(unconfigured.body.error).toBe(wrong.body.error)
    })
  })

  // -----------------------------------------------------------------------------------------------------
  // 2. With credentials, each route reaches its own Authlete API and maps to its own status. This is the
  //    half that proves the table above describes real wiring rather than sixteen identical 401s.
  // -----------------------------------------------------------------------------------------------------
  describe("authenticated routing", () => {
    it.each(ROUTES)("$verb $path reaches its Authlete API and answers $ok", async (route) => {
      route.call().mockResolvedValue(route.resolves ?? undefined)

      const res = await send(route, ADMIN_BASIC)

      expect(res.status).toBe(route.ok)
      expect(route.call()).toHaveBeenCalledTimes(1)
    })

    it("routes GET and DELETE on the same granted-scopes path to different Authlete APIs", async () => {
      m().getGrantedScopes.mockResolvedValue({ latestGrantedScopes: ["openid"] })
      m().deleteGrantedScopes.mockResolvedValue({})

      await request(app).get("/api/client/scopes/granted/c-1/alice").set("Authorization", ADMIN_BASIC).expect(200)
      await request(app).delete("/api/client/scopes/granted/c-1/alice").set("Authorization", ADMIN_BASIC).expect(200)

      expect(m().getGrantedScopes).toHaveBeenCalledTimes(1)
      expect(m().deleteGrantedScopes).toHaveBeenCalledTimes(1)
    })

    // Three verbs share `/client/scopes/requestable/:clientId`, and a router that collapsed any two of them
    // would be invisible to a controller test.
    it("routes GET, PUT and DELETE on the requestable-scopes path to three different Authlete APIs", async () => {
      m().getRequestableScopes.mockResolvedValue({})
      m().updateRequestableScopes.mockResolvedValue({})
      m().deleteRequestableScopes.mockResolvedValue(undefined)

      await request(app).get("/api/client/scopes/requestable/c-1").set("Authorization", ADMIN_BASIC).expect(200)
      await request(app).put("/api/client/scopes/requestable/c-1").set("Authorization", ADMIN_BASIC).send({ requestableScopes: ["openid"] }).expect(200)
      await request(app).delete("/api/client/scopes/requestable/c-1").set("Authorization", ADMIN_BASIC).expect(204)

      expect(m().getRequestableScopes).toHaveBeenCalledTimes(1)
      expect(m().updateRequestableScopes).toHaveBeenCalledTimes(1)
      expect(m().deleteRequestableScopes).toHaveBeenCalledTimes(1)
    })
  })

  // -----------------------------------------------------------------------------------------------------
  // 3. Path parameters reach Authlete as the caller wrote them, and `serviceId` never does. Same rule as
  //    `introspection.service.ts` and `userinfo.service.ts`: server-determined fields come from
  //    configuration, not from the request.
  // -----------------------------------------------------------------------------------------------------
  describe("parameter handling", () => {
    it("passes the path's clientId through, and takes serviceId from configuration", async () => {
      mockApi.client.get.mockResolvedValue({ clientId: 4277838306 })

      await request(app).get("/api/client/get/4277838306").set("Authorization", ADMIN_BASIC).expect(200)

      expect(mockApi.client.get).toHaveBeenCalledWith({ serviceId: "test-service", clientId: "4277838306" })
    })

    it("does not let the body override serviceId", async () => {
      mockApi.client.management.refreshSecret.mockResolvedValue({ newClientSecret: "s-2" })

      await request(app)
        .post("/api/client/secret/refresh/c-1")
        .set("Authorization", ADMIN_BASIC)
        .send({ serviceId: "attacker-service" })
        .expect(200)

      expect(m().refreshSecret).toHaveBeenCalledWith({ serviceId: "test-service", clientIdentifier: "c-1" })
    })

    it("carries both path parameters on the two-parameter routes", async () => {
      m().deleteAuthorizations.mockResolvedValue({})

      await request(app).delete("/api/client/auth/delete/c-9/bob").set("Authorization", ADMIN_BASIC).expect(200)

      expect(m().deleteAuthorizations).toHaveBeenCalledWith({
        serviceId: "test-service",
        clientId: "c-9",
        subject: "bob",
      })
    })

    it("splits a space- or comma-separated scopes string into an array", async () => {
      m().updateAuthorizations.mockResolvedValue({})

      await request(app)
        .post("/api/client/auth/update/c-1")
        .set("Authorization", ADMIN_BASIC)
        .send({ subject: "alice", scopes: "openid profile,email" })
        .expect(200)

      expect(m().updateAuthorizations).toHaveBeenCalledWith({
        serviceId: "test-service",
        clientId: "c-1",
        clientAuthorizationUpdateRequest: { subject: "alice", scopes: ["openid", "profile", "email"] },
      })
    })
  })

  // -----------------------------------------------------------------------------------------------------
  // 4. Required-field checks run after auth and before Authlete.
  // -----------------------------------------------------------------------------------------------------
  describe("required fields", () => {
    it("rejects a create with no client payload, without calling Authlete", async () => {
      const res = await request(app).post("/api/client/create").set("Authorization", ADMIN_BASIC).send({})

      expect(res.status).toBe(400)
      expect(mockApi.client.create).not.toHaveBeenCalled()
    })

    it("rejects a secret update with no clientSecret, without calling Authlete", async () => {
      const res = await request(app)
        .put("/api/client/secret/update/c-1")
        .set("Authorization", ADMIN_BASIC)
        .send({})

      expect(res.status).toBe(400)
      expect(m().updateSecret).not.toHaveBeenCalled()
    })

    it("rejects an authorization update with no subject, without calling Authlete", async () => {
      const res = await request(app)
        .post("/api/client/auth/update/c-1")
        .set("Authorization", ADMIN_BASIC)
        .send({ scopes: "openid" })

      expect(res.status).toBe(400)
      expect(m().updateAuthorizations).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------------------------------------
  // 5. An Authlete failure is a 5xx, not a 200 with an error body. This is the shape `errorHandler.ts`
  //    got wrong across all 57 call sites until 2026-08-11: `AuthleteError` carries the status of the
  //    response it was *reading*, and a 200 body that fails Zod validation made the failure invisible.
  // -----------------------------------------------------------------------------------------------------
  it("surfaces an Authlete failure as 5xx rather than a 200 carrying an error", async () => {
    mockApi.client.list.mockRejectedValue(new Error("Authlete unreachable"))

    const res = await request(app).get("/api/client/list").set("Authorization", ADMIN_BASIC)

    expect(res.status).toBeGreaterThanOrEqual(500)
  })
})
