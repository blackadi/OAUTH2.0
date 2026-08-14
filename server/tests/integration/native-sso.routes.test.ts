import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import { createApp } from "../../src/app"

/**
 * Route-level coverage for `POST /api/nativesso` and `POST /api/nativesso/logout`.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `node scripts/check-route-coverage.mjs --triage` put both routes in group A — **no test anywhere for the
 * module**, not even a controller test. Nothing in a green suite said anything about either endpoint.
 *
 * Writing it surfaced the same defect shape that made `federation.service.ts` untestable until 2026-08-13:
 * `tests/helpers/mock-authlete.ts` claims to cover every SDK method and had **no `nativeSso` member at all**
 * (nor `service.get`). Both are added there in the same change.
 *
 * WHAT IS DELIBERATELY NOT ASSERTED
 * ---------------------------------
 * `nativeSsoSupported` is **`false`** on this service (`audit/02-findings/SERVICE-CONFIG-PROBE.md`,
 * `NATIVE-SSO-1.0.md` F-1), so **no part of this feature has ever run on this deployment** and Authlete's
 * live response to either call has never been observed. There is therefore no end-to-end happy path to
 * assert, and inventing one is exactly the mistake `docs/NATIVE-SSO-TUTORIAL.md` already made — four
 * transcripts sharing one fabricated `device_secret` (`03-curriculum-audit.md` 3c, deferred item 3).
 *
 * What *is* assertable is deployment-independent, and it is the part a controller test could not see anyway:
 * the two gates that run **before** any Authlete call, and this server's own action→status mapping.
 */

const mockApi = vi.hoisted(() => {
  const fn = () => vi.fn()
  return { nativeSso: { process: fn(), logout: fn() } }
})

vi.mock("../../src/services/authlete.service", () => ({
  authleteApi: mockApi,
  serviceId: "test-service",
}))

describe("Integration: native SSO routes", () => {
  let app: ReturnType<typeof createApp>

  const ADMIN_BASIC = `Basic ${Buffer.from("test-admin:test-secret").toString("base64")}`

  const processBody = { accessToken: "at-1", deviceSecret: "ds-1" }
  const logoutBody = { sessionId: "sid-1" }

  const ROUTES = [
    { path: "/api/nativesso", body: processBody, call: () => mockApi.nativeSso.process },
    { path: "/api/nativesso/logout", body: logoutBody, call: () => mockApi.nativeSso.logout },
  ] as const

  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv("MGMT_CLIENT_ID", "test-admin")
    vi.stubEnv("MGMT_CLIENT_SECRET", "test-secret")
    app = createApp()
  })

  // ---------------------------------------------------------------------------------------------------
  // 1. Auth posture. First, because it is the defect class this repo shipped: `/api/jar/process` had a
  //    controller test and no auth middleware, and handed Authlete tickets to anonymous callers. Both
  //    routes here call `requireBasicAuth("nativesso")` from *inside* the handler rather than as route
  //    middleware, which is a wiring arrangement only a route-level test observes.
  // ---------------------------------------------------------------------------------------------------
  describe("auth posture", () => {
    it.each(ROUTES)("$path refuses an anonymous caller and never reaches Authlete", async (route) => {
      const res = await request(app).post(route.path).send(route.body).expect(401)

      expect(res.body.error).toBe("invalid_client")
      expect(res.headers["www-authenticate"]).toBe('Basic realm="nativesso"')
      expect(route.call()).not.toHaveBeenCalled()
    })

    it.each(ROUTES)("$path refuses wrong credentials and never reaches Authlete", async (route) => {
      const wrong = `Basic ${Buffer.from("test-admin:not-the-secret").toString("base64")}`

      await request(app).post(route.path).set("Authorization", wrong).send(route.body).expect(401)

      expect(route.call()).not.toHaveBeenCalled()
    })

    // `requireBasicAuth` fails closed: an unset MGMT_CLIENT_ID/SECRET rejects every request rather than
    // allowing them, which is how it behaved before the fix. Asserted here because native SSO is one of
    // the realms that middleware's own warning names.
    it.each(ROUTES)("$path fails closed when management credentials are unset", async (route) => {
      vi.stubEnv("MGMT_CLIENT_ID", "")
      vi.stubEnv("MGMT_CLIENT_SECRET", "")
      app = createApp()

      await request(app).post(route.path).set("Authorization", ADMIN_BASIC).send(route.body).expect(401)

      expect(route.call()).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------------------------------
  // 2. Validation posture — also before any Authlete call, so also deployment-independent.
  // ---------------------------------------------------------------------------------------------------
  describe("validation posture", () => {
    it.each([
      { missing: "accessToken", body: { deviceSecret: "ds-1" } },
      { missing: "deviceSecret", body: { accessToken: "at-1" } },
    ])("POST /api/nativesso rejects a body missing $missing", async ({ missing, body }) => {
      const res = await request(app)
        .post("/api/nativesso")
        .set("Authorization", ADMIN_BASIC)
        .send(body)
        .expect(400)

      expect(res.body.error).toBe("invalid_request")
      expect(res.body.error_description).toContain(missing)
      expect(mockApi.nativeSso.process).not.toHaveBeenCalled()
    })

    it("POST /api/nativesso/logout rejects a body missing sessionId", async () => {
      const res = await request(app)
        .post("/api/nativesso/logout")
        .set("Authorization", ADMIN_BASIC)
        .send({})
        .expect(400)

      expect(res.body.error).toBe("invalid_request")
      expect(res.body.error_description).toContain("sessionId")
      expect(mockApi.nativeSso.logout).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------------------------------
  // 3. Action→status mapping. This is *this server's* code, not the feature: it says what the controller
  //    does with an answer, not that the answer can arrive. With `nativeSsoSupported: false` Authlete
  //    refuses these calls, and the shape of that refusal is unobserved — hence the error actions are
  //    asserted and the `OK` row is labelled for what it is.
  // ---------------------------------------------------------------------------------------------------
  describe("action → status mapping", () => {
    it.each([
      { action: "CALLER_ERROR", status: 400 },
      { action: "INTERNAL_SERVER_ERROR", status: 500 },
      { action: "SOMETHING_THE_SDK_ADDS_LATER", status: 500 },
    ])("POST /api/nativesso maps $action to $status", async ({ action, status }) => {
      mockApi.nativeSso.process.mockResolvedValue({ action })

      await request(app)
        .post("/api/nativesso")
        .set("Authorization", ADMIN_BASIC)
        .send(processBody)
        .expect(status)

      expect(mockApi.nativeSso.process).toHaveBeenCalled()
    })

    it.each([
      { action: "CALLER_ERROR", status: 400 },
      { action: "SERVER_ERROR", status: 500 },
      { action: "SOMETHING_THE_SDK_ADDS_LATER", status: 500 },
    ])("POST /api/nativesso/logout maps $action to $status", async ({ action, status }) => {
      mockApi.nativeSso.logout.mockResolvedValue({ action })

      await request(app)
        .post("/api/nativesso/logout")
        .set("Authorization", ADMIN_BASIC)
        .send(logoutBody)
        .expect(status)

      expect(mockApi.nativeSso.logout).toHaveBeenCalled()
    })

    // MAPPING ONLY — NOT A WORKING FEATURE. Authlete cannot return `OK` here while `nativeSsoSupported`
    // is `false`, so this asserts that the controller would map it to 200, and nothing more. Do not read
    // a green tick on this line as evidence that Native SSO works on this deployment; it does not, and
    // `README.md` records that.
    it("maps OK to 200 — mapping only; the service flag makes it unreachable live", async () => {
      mockApi.nativeSso.process.mockResolvedValue({ action: "OK", responseContent: "{}" })

      await request(app)
        .post("/api/nativesso")
        .set("Authorization", ADMIN_BASIC)
        .send(processBody)
        .expect(200)
    })
  })

  // ---------------------------------------------------------------------------------------------------
  // 4. The server-side fields are server-derived. `sessionId` is the caller's to choose (F-2 records that
  //    and why it is not an authorization gap behind admin auth), but `serviceId` must not be.
  // ---------------------------------------------------------------------------------------------------
  it("takes serviceId from configuration, never from the request body", async () => {
    mockApi.nativeSso.logout.mockResolvedValue({ action: "OK" })

    await request(app)
      .post("/api/nativesso/logout")
      .set("Authorization", ADMIN_BASIC)
      .send({ sessionId: "sid-1", serviceId: "attacker-service" })
      .expect(200)

    expect(mockApi.nativeSso.logout).toHaveBeenCalledWith({
      serviceId: "test-service",
      nativeSsoLogoutRequest: { sessionId: "sid-1" },
    })
  })
})
