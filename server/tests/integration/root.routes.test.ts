import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import { createApp } from "../../src/app"

/**
 * Route-level coverage for the two routes mounted at the **true root**, both of which
 * `check-route-coverage.mjs --triage` reported in group A — no test anywhere:
 *
 *   GET /.well-known/oauth-authorization-server   (RFC 8414 AS metadata, required by MCP)
 *   GET /{*path}                                  (the catch-all that renders the index page)
 *
 * The catch-all is the interesting one. It is registered **last** in `app.ts` and matches every remaining
 * GET, so it decides what an unmatched path answers across the whole deployment — and it renders
 * caller-controlled query parameters into HTML. Neither fact is visible from a controller test.
 */

const mockApi = vi.hoisted(() => {
  const fn = () => vi.fn()
  return { service: { getConfiguration: fn() } }
})

vi.mock("../../src/services/authlete.service", () => ({
  authleteApi: mockApi,
  serviceId: "test-service",
}))

describe("Integration: root-mounted routes", () => {
  let app: ReturnType<typeof createApp>

  beforeEach(() => {
    vi.clearAllMocks()
    app = createApp()
  })

  // -----------------------------------------------------------------------------------------------------
  // GET /.well-known/oauth-authorization-server
  // -----------------------------------------------------------------------------------------------------
  describe("GET /.well-known/oauth-authorization-server", () => {
    const doc = { issuer: "https://as.example.com", token_endpoint: "https://as.example.com/api/token" }

    // Auth posture first, as everywhere in this backlog — but here the correct posture is *open*. RFC 8414
    // §3 makes the metadata document a public one, so a 401 would be the defect. Asserted rather than
    // assumed, because "no auth" and "auth that never got wired" look identical from the outside.
    it("is public — no credentials, and it answers", async () => {
      mockApi.service.getConfiguration.mockResolvedValue(doc)

      const res = await request(app).get("/.well-known/oauth-authorization-server").expect(200)

      expect(res.body.issuer).toBe("https://as.example.com")
    })

    // AGENTS.md: this path "serves the same content as `openid-configuration`". Both controllers are the
    // same function, so the claim is structural — but it is the reason MCP clients can discover this
    // deployment at all, and it is one line away from drifting.
    it("serves the same document as /api/.well-known/openid-configuration", async () => {
      mockApi.service.getConfiguration.mockResolvedValue(doc)

      const rfc8414 = await request(app).get("/.well-known/oauth-authorization-server").expect(200)
      const oidc = await request(app).get("/api/.well-known/openid-configuration").expect(200)

      expect(rfc8414.body).toEqual(oidc.body)
    })

    it("does not shadow the root path — /.well-known/oauth-authorization-server is not the catch-all", async () => {
      mockApi.service.getConfiguration.mockResolvedValue(doc)

      await request(app).get("/.well-known/oauth-authorization-server").expect(200)

      expect(mockApi.service.getConfiguration).toHaveBeenCalledWith({
        serviceId: "test-service",
        pretty: true,
      })
    })

    it("surfaces an Authlete failure as 500, not as an empty document", async () => {
      mockApi.service.getConfiguration.mockRejectedValue(new Error("Authlete unreachable"))

      await request(app).get("/.well-known/oauth-authorization-server").expect(500)
    })
  })

  // -----------------------------------------------------------------------------------------------------
  // GET /{*path} — the catch-all
  // -----------------------------------------------------------------------------------------------------
  describe("GET /{*path} — the catch-all index page", () => {
    it("renders the landing page at /", async () => {
      const res = await request(app).get("/").expect(200)

      expect(res.headers["content-type"]).toMatch(/text\/html/)
      expect(res.text).toContain("Authlete OAuth 2.0")
    })

    it("renders the authorization-response page when a code is present", async () => {
      const res = await request(app)
        .get("/?code=ac-1&state=st-1&iss=https://as.example.com")
        .expect(200)

      expect(res.text).toContain("Authorization Code Received")
      expect(res.text).toContain("ac-1")
      expect(res.text).toContain("st-1")
    })

    // The redirect target of an authorization response is caller-controlled, so `code`, `state` and `iss`
    // are attacker-controllable strings rendered into HTML. `index.ejs` uses `<%= %>`, which escapes; this
    // pins that, because switching one of those three to `<%- %>` is a stored-XSS-shaped change that
    // nothing else in the suite would notice.
    it("escapes the query parameters it renders", async () => {
      const payload = '<script>alert(1)</script>'

      const res = await request(app).get(`/?code=${encodeURIComponent(payload)}`).expect(200)

      expect(res.text).not.toContain(payload)
      expect(res.text).toContain("&lt;script&gt;")
    })

    // The catch-all is mounted at `/` after every API router, so an unmatched path outside `/api`
    // answers 200 with the SPA — which is correct for a single-page app, whose client-side routes must
    // survive a reload.
    //
    // **Module 04's lab depends on exactly this**, and pins it here as a result: the exercise probes
    // `/.well-known/totally-made-up` to teach that a 200 proves nothing about whether an endpoint
    // exists, and that the content type is what tells you. Changing the root behaviour would silently
    // break that lab, and nothing in the build would say so.
    it("answers 200 HTML for an unmatched path outside /api — Module 04's lab depends on this", async () => {
      const res = await request(app).get("/no-such-page").expect(200)
      expect(res.headers["content-type"]).toMatch(/text\/html/)
    })

    // Under `/api` it is a 404 with JSON, since 2026-08-22. It used to fall through to the catch-all
    // too: `GET /api/does-not-exist` answered 200 with 9,837 bytes of `index.html`, so a client wired to
    // a wrong or retired path saw success and a parse failure somewhere downstream instead of the 404
    // that names the problem. That is the same failure AGENTS.md records for RFC 9728's path-suffixed
    // well-known URL, which was closed there with a second route while the general case was left open.
    it("answers 404 JSON for an unmatched path under /api", async () => {
      const res = await request(app).get("/api/no-such-endpoint").expect(404)

      expect(res.headers["content-type"]).toMatch(/application\/json/)
      expect(res.body.error).toBe("not_found")
      expect(res.body.error_description).toContain("/api/no-such-endpoint")
    })

    // The well-known documents are mounted at true root rather than under `/api`, so the terminator
    // above must not shadow them. RFC 9728's is served at two URLs, one of which carries a path.
    it("does not shadow the root-mounted well-known documents", async () => {
      // This suite mocks Authlete as unreachable, so the document itself cannot be built and the route
      // answers 500. That is the point: reaching its own error handler proves the route was *reached*,
      // which is what the `/api` terminator must not prevent. A 404 `not_found` here would mean the
      // terminator had swallowed a root-mounted path.
      const res = await request(app).get("/.well-known/oauth-protected-resource")

      // Only the reachability claim is asserted. The content type of the *failure* is the error
      // handler's business and differs from the document's, so checking it here would be testing
      // something else.
      expect(res.status).not.toBe(404)
      expect(res.body?.error).not.toBe("not_found")
    })

    // It is GET-only, so a POST to an unmatched path is not swallowed by it.
    it("does not catch non-GET methods", async () => {
      const res = await request(app).post("/no-such-page").send({})

      expect(res.status).not.toBe(200)
    })
  })
})
