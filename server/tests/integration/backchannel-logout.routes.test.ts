import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import request from "supertest"

/**
 * Route-level coverage for the four back-channel logout endpoints, which fall into **two opposite auth
 * postures** on purpose. That contrast is the reason this file exists and the reason a controller test
 * cannot stand in for it:
 *
 *   POST /api/backchannel_logout/issue        admin Basic auth — we ask Authlete to mint a logout token
 *   POST /api/backchannel_logout/deliver      admin Basic auth
 *   POST /api/backchannel_logout/deliver-all  admin Basic auth
 *   POST /api/backchannel_logout              DELIBERATELY OPEN — another OP posts here; the token's
 *                                             signature is the authentication, and there is no session
 *                                             to protect with a CSRF token
 *
 * The receiver is the endpoint `check-route-coverage.mjs` was written because of: it validated five of
 * §2.6's eleven required steps and destroyed the *caller's* session, terminating nobody's, while answering
 * 200. `tests/unit/controllers/backchannel-logout-receiver.test.ts` now covers those eleven steps against
 * the handler. What it cannot see is the wiring — and the wiring was, until this file, referenced in the
 * test suite **only inside two comments**. Stripping comments from `check-route-coverage.mjs`'s matcher is
 * what revealed that; before the fix, a prose citation was banking the coverage.
 *
 * The two postures are asserted against each other rather than separately: putting admin auth on the
 * receiver would silently break every conformant OP, and dropping it from the three admin endpoints would
 * let anyone log every user out.
 */

const cfg = vi.hoisted(() => ({
  authleteConfig: { baseUrl: "https://authlete.test", serviceId: "test-service", AccessToken: "test-token" },
  jwt: { privateKey: "", publicKey: "", issuer: "" },
  jwks: { uri: "" },
  backchannelLogout: { issuer: "", audience: "" },
}))
vi.mock("../../src/config/authlete.config", () => cfg)

const mockDestroy = vi.hoisted(() => vi.fn())
vi.mock("../../src/utils/session-store", () => ({ destroySessionsForSubject: mockDestroy }))

import { createApp } from "../../src/app"

describe("Integration: back-channel logout routes", () => {
  let app: ReturnType<typeof createApp>
  let fetchMock: ReturnType<typeof vi.fn>

  const ADMIN_BASIC = `Basic ${Buffer.from("test-admin:test-secret").toString("base64")}`

  const ADMIN_ROUTES = [
    { path: "/api/backchannel_logout/issue", body: { clientIdentifier: "c-1" } },
    { path: "/api/backchannel_logout/deliver", body: { clientIdentifier: "c-1" } },
    { path: "/api/backchannel_logout/deliver-all", body: { subject: "alice" } },
  ] as const

  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv("MGMT_CLIENT_ID", "test-admin")
    vi.stubEnv("MGMT_CLIENT_SECRET", "test-secret")

    cfg.jwks.uri = ""
    cfg.backchannelLogout.issuer = ""
    cfg.backchannelLogout.audience = ""

    // These three endpoints reach Authlete with a raw `fetch` — the SDK exposes no backchannel logout
    // token API. Stubbing it is also how "Authlete was never called" becomes assertable.
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    app = createApp()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // -----------------------------------------------------------------------------------------------------
  // 1. The three admin endpoints
  // -----------------------------------------------------------------------------------------------------
  describe("the three admin endpoints", () => {
    it.each(ADMIN_ROUTES)("$path refuses an anonymous caller and never reaches Authlete", async (route) => {
      const res = await request(app).post(route.path).send(route.body).expect(401)

      expect(res.body.error).toBe("invalid_client")
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it.each(ADMIN_ROUTES)("$path refuses wrong credentials and never reaches Authlete", async (route) => {
      const wrong = `Basic ${Buffer.from("test-admin:wrong").toString("base64")}`

      await request(app).post(route.path).set("Authorization", wrong).send(route.body).expect(401)

      expect(fetchMock).not.toHaveBeenCalled()
    })

    it.each(ADMIN_ROUTES)("$path fails closed when management credentials are unset", async (route) => {
      vi.stubEnv("MGMT_CLIENT_ID", "")
      vi.stubEnv("MGMT_CLIENT_SECRET", "")
      app = createApp()

      await request(app).post(route.path).set("Authorization", ADMIN_BASIC).send(route.body).expect(401)

      expect(fetchMock).not.toHaveBeenCalled()
    })

    it("rejects /issue with no clientIdentifier before calling Authlete", async () => {
      const res = await request(app)
        .post("/api/backchannel_logout/issue")
        .set("Authorization", ADMIN_BASIC)
        .send({})
        .expect(400)

      expect(res.body.error).toBe("invalid_request")
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it("rejects /deliver-all with neither subject nor sessionId before calling Authlete", async () => {
      const res = await request(app)
        .post("/api/backchannel_logout/deliver-all")
        .set("Authorization", ADMIN_BASIC)
        .send({})
        .expect(400)

      expect(res.body.error).toBe("invalid_request")
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it("reaches Authlete once authenticated, and maps OK to 200", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ action: "OK", logoutToken: "lt-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )

      const res = await request(app)
        .post("/api/backchannel_logout/issue")
        .set("Authorization", ADMIN_BASIC)
        .send({ clientIdentifier: "c-1", subject: "alice" })
        .expect(200)

      expect(res.body.logoutToken).toBe("lt-1")
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url] = fetchMock.mock.calls[0]
      expect(url).toBe("https://authlete.test/api/test-service/backchannel/logout/token")
    })

    it("maps CALLER_ERROR to 400", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ action: "CALLER_ERROR", resultMessage: "no such client" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )

      await request(app)
        .post("/api/backchannel_logout/issue")
        .set("Authorization", ADMIN_BASIC)
        .send({ clientIdentifier: "nope" })
        .expect(400)
    })
  })

  // -----------------------------------------------------------------------------------------------------
  // 2. The receiver — the opposite posture, and the one with the history
  // -----------------------------------------------------------------------------------------------------
  describe("POST /api/backchannel_logout — the receiver", () => {
    // The point of this assertion is what it rules OUT. A sending OP presents no admin credentials and no
    // CSRF token; if either gate were wired onto this route the endpoint would answer 401/403 to every
    // conformant OP, and nothing else in the suite drives the route to notice.
    it("requires neither admin credentials nor a CSRF token to reach the handler", async () => {
      const res = await request(app).post("/api/backchannel_logout").send({})

      expect(res.status).not.toBe(401)
      expect(res.status).not.toBe(403)
      expect(res.status).not.toBe(404)
    })

    it("rejects a request with no logout_token, and destroys no sessions", async () => {
      const res = await request(app).post("/api/backchannel_logout").send({}).expect(400)

      expect(res.body.error).toBe("invalid_request")
      expect(mockDestroy).not.toHaveBeenCalled()
    })

    // AGENTS.md's `jwt.verify` rule, second clause: when the expected issuer or audience is not configured
    // the correct behaviour is to REFUSE, not to omit the option — omitting it silently downgrades the
    // check to "any issuer, any audience" and looks identical in the code and in the logs. A 500 here also
    // keeps the blame honest: the sending OP's token is fine, our configuration is not.
    it("answers 500 — not 400 — when issuer/audience are unconfigured, and destroys no sessions", async () => {
      const res = await request(app)
        .post("/api/backchannel_logout")
        .send({ logout_token: "eyJhbGciOiJFUzI1NiJ9.e30.sig" })
        .expect(500)

      expect(res.body.error).toBe("server_error")
      expect(mockDestroy).not.toHaveBeenCalled()
    })

    it("still refuses when only some of the three settings are present", async () => {
      cfg.jwks.uri = "https://other-op.example.com/jwks"
      cfg.backchannelLogout.issuer = "https://other-op.example.com"
      // audience deliberately left empty

      await request(app)
        .post("/api/backchannel_logout")
        .send({ logout_token: "eyJhbGciOiJFUzI1NiJ9.e30.sig" })
        .expect(500)

      expect(mockDestroy).not.toHaveBeenCalled()
    })

    it("rejects an undecodable token once configured, and destroys no sessions", async () => {
      cfg.jwks.uri = "https://other-op.example.com/jwks"
      cfg.backchannelLogout.issuer = "https://other-op.example.com"
      cfg.backchannelLogout.audience = "our-client-id"

      const res = await request(app)
        .post("/api/backchannel_logout")
        .send({ logout_token: "not-a-jwt" })
        .expect(400)

      expect(res.body.error).toBe("invalid_request")
      expect(mockDestroy).not.toHaveBeenCalled()
    })

    // §2.8 SHOULD. Set before any parsing, so it holds on the error paths too — which are the ones a
    // caching intermediary is most likely to see.
    it("sets Cache-Control: no-store on every answer", async () => {
      const res = await request(app).post("/api/backchannel_logout").send({}).expect(400)

      expect(res.headers["cache-control"]).toBe("no-store")
    })
  })
})
