import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import { createApp } from "../../src/app"

/**
 * Route-level coverage for the ten Verifiable Credential Issuance endpoints.
 *
 * VCI is the module with **three different auth postures in one router**, which is exactly the arrangement
 * a controller test cannot check and a reader cannot verify by eye:
 *
 *   discovery   GET  /api/vci/metadata|jwtissuer|jwks|well-known   public
 *               GET  /.well-known/openid-credential-issuer          public
 *   offers      POST /api/vci/offer/create|info                     admin Basic auth
 *   credential  POST /api/vci/credential/issue|batch                access token
 *               POST /api/vci/deferred/issue                        access token, validated via parse (§4)
 *
 * Every one of the ten was carried in `scripts/route-coverage-baseline.json`: `vci.service.ts` and
 * `vci.controller.ts` both have unit tests, and no test drove a route through its middleware.
 *
 * `verifiableCredentialsEnabled` is `false` on this service, so none of this is live-exploitable on this
 * deployment — the same standing as Native SSO. It is still the code the repo teaches.
 */

const mockApi = vi.hoisted(() => {
  const fn = () => vi.fn()
  return {
    verifiableCredentials: {
      getMetadata: fn(),
      getJwtIssuer: fn(),
      getJwks: fn(),
      createOffer: fn(),
      getOfferInfo: fn(),
      issue: fn(),
      batchIssue: fn(),
      deferredIssue: fn(),
      parse: fn(),
      batchParse: fn(),
      deferredParse: fn(),
    },
  }
})

vi.mock("../../src/services/authlete.service", () => ({
  authleteApi: mockApi,
  serviceId: "test-service",
}))

const vc = () => mockApi.verifiableCredentials

describe("Integration: VCI routes", () => {
  let app: ReturnType<typeof createApp>

  const ADMIN_BASIC = `Basic ${Buffer.from("test-admin:test-secret").toString("base64")}`
  const okDoc = { action: "OK", responseContent: JSON.stringify({ credential_issuer: "https://issuer.example" }) }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv("MGMT_CLIENT_ID", "test-admin")
    vi.stubEnv("MGMT_CLIENT_SECRET", "test-secret")
    app = createApp()
  })

  // -----------------------------------------------------------------------------------------------------
  // 1. Discovery — public by design. A 401 here would be the defect.
  // -----------------------------------------------------------------------------------------------------
  describe("discovery endpoints are public", () => {
    const DISCOVERY = [
      { path: "/api/vci/metadata", call: () => vc().getMetadata },
      { path: "/api/vci/well-known", call: () => vc().getMetadata },
      { path: "/api/vci/jwtissuer", call: () => vc().getJwtIssuer },
      { path: "/api/vci/jwks", call: () => vc().getJwks },
      { path: "/.well-known/openid-credential-issuer", call: () => vc().getMetadata },
    ] as const

    it.each(DISCOVERY)("GET $path answers without credentials", async (route) => {
      route.call().mockResolvedValue(okDoc)

      const res = await request(app).get(route.path).expect(200)

      expect(res.body.credential_issuer).toBe("https://issuer.example")
      expect(route.call()).toHaveBeenCalled()
    })

    it.each(DISCOVERY)("GET $path maps NOT_FOUND to 404, not to an empty 200", async (route) => {
      route.call().mockResolvedValue({ action: "NOT_FOUND" })

      await request(app).get(route.path).expect(404)
    })

    // `/api/vci/well-known` and `/api/vci/metadata` share one handler on purpose (a convenience alias for
    // the dev UI). Asserted so that "they are the same" stays a fact rather than a comment.
    it("serves /api/vci/well-known and /api/vci/metadata from the same source", async () => {
      vc().getMetadata.mockResolvedValue(okDoc)

      const a = await request(app).get("/api/vci/metadata").expect(200)
      const b = await request(app).get("/api/vci/well-known").expect(200)

      expect(a.body).toEqual(b.body)
    })
  })

  // -----------------------------------------------------------------------------------------------------
  // 2. Offers — admin Basic auth, gated inside the handler before any Authlete call.
  // -----------------------------------------------------------------------------------------------------
  describe("offer endpoints require admin Basic auth", () => {
    const OFFERS = [
      { path: "/api/vci/offer/create", call: () => vc().createOffer, body: { credentialConfiguration: "x" } },
      { path: "/api/vci/offer/info", call: () => vc().getOfferInfo, body: { identifier: "o-1" } },
    ] as const

    it.each(OFFERS)("POST $path refuses an anonymous caller and never reaches Authlete", async (route) => {
      const res = await request(app).post(route.path).send(route.body).expect(401)

      expect(res.body.error).toBe("invalid_client")
      expect(res.headers["www-authenticate"]).toBe('Basic realm="vci"')
      expect(route.call()).not.toHaveBeenCalled()
    })

    it.each(OFFERS)("POST $path refuses wrong credentials and never reaches Authlete", async (route) => {
      const wrong = `Basic ${Buffer.from("test-admin:wrong").toString("base64")}`

      await request(app).post(route.path).set("Authorization", wrong).send(route.body).expect(401)

      expect(route.call()).not.toHaveBeenCalled()
    })

    it.each(OFFERS)("POST $path fails closed when management credentials are unset", async (route) => {
      vi.stubEnv("MGMT_CLIENT_ID", "")
      vi.stubEnv("MGMT_CLIENT_SECRET", "")
      app = createApp()

      await request(app).post(route.path).set("Authorization", ADMIN_BASIC).send(route.body).expect(401)

      expect(route.call()).not.toHaveBeenCalled()
    })

    // An access token is NOT admin credentials. Offer creation is this deployment's own administrative
    // surface, so presenting a bearer token where Basic is required must still be refused.
    it("does not accept a bearer token in place of admin credentials", async () => {
      await request(app)
        .post("/api/vci/offer/create")
        .set("Authorization", "Bearer at-1")
        .send({ credentialConfiguration: "x" })
        .expect(401)

      expect(vc().createOffer).not.toHaveBeenCalled()
    })

    it("maps offer actions to their statuses once authenticated", async () => {
      vc().createOffer.mockResolvedValue({ action: "CREATED", info: { identifier: "o-1" } })
      await request(app)
        .post("/api/vci/offer/create")
        .set("Authorization", ADMIN_BASIC)
        .send({ credentialConfigurationIds: ["IdentityCredential"] })
        .expect(201)

      vc().getOfferInfo.mockResolvedValue({ action: "NOT_FOUND" })
      await request(app).post("/api/vci/offer/info").set("Authorization", ADMIN_BASIC).send({ identifier: "nope" }).expect(404)
    })

    // The required-field check runs after auth, so an authenticated caller omitting it gets 400 rather
    // than the 401 an anonymous one gets. Both orderings are asserted so neither can silently swap.
    it("rejects an authenticated offer with no credentialConfigurationIds, without calling Authlete", async () => {
      const res = await request(app)
        .post("/api/vci/offer/create")
        .set("Authorization", ADMIN_BASIC)
        .send({})
        .expect(400)

      expect(res.body.error).toBe("invalid_request")
      expect(vc().createOffer).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------------------------------------
  // 3. Credential endpoints — token presentation through the shared extractor.
  // -----------------------------------------------------------------------------------------------------
  describe("credential endpoints require an access token", () => {
    const WITH_TOKEN = [
      { path: "/api/vci/credential/issue", call: () => vc().issue, body: { order: { credentialPayload: "{}" } } },
      { path: "/api/vci/credential/batch", call: () => vc().batchIssue, body: { orders: [{ requestIdentifier: "c-1" }] } },
    ] as const

    it.each(WITH_TOKEN)("POST $path refuses a request with no token, and never reaches Authlete", async (route) => {
      const res = await request(app).post(route.path).send(route.body).expect(401)

      expect(res.body.error).toBe("invalid_token")
      expect(route.call()).not.toHaveBeenCalled()
    })

    it.each(WITH_TOKEN)("POST $path accepts the token from the Authorization header", async (route) => {
      route.call().mockResolvedValue({ action: "OK" })

      await request(app).post(route.path).set("Authorization", "Bearer at-1").send(route.body).expect(200)

      expect(route.call()).toHaveBeenCalledWith(
        expect.objectContaining({ serviceId: "test-service" }),
      )
    })

    // RFC 9110 §11.1 makes the auth-scheme case-insensitive, and RFC 9449 §7.1 makes `DPoP` the only
    // conformant scheme for a bound token. Both arrive here through `extractAccessToken`, and both were
    // refused by this endpoint's hand-rolled `startsWith("Bearer ")` before 2026-08-13.
    it.each(["Bearer at-1", "bearer at-1", "DPoP at-1", "dpop at-1"])(
      "accepts the %s presentation",
      async (header) => {
        vc().issue.mockResolvedValue({ action: "OK" })

        await request(app)
          .post("/api/vci/credential/issue")
          .set("Authorization", header)
          .send({ order: {} })
          .expect(200)
      },
    )

    it("rejects an unrecognised auth scheme as no token at all", async () => {
      await request(app)
        .post("/api/vci/credential/issue")
        .set("Authorization", "Basic YWJjOmRlZg==")
        .send({ order: {} })
        .expect(401)

      expect(vc().issue).not.toHaveBeenCalled()
    })

    it("still honours the JSON accessToken body fallback", async () => {
      vc().issue.mockResolvedValue({ action: "OK" })

      await request(app).post("/api/vci/credential/issue").send({ accessToken: "at-body", order: {} }).expect(200)

      expect(vc().issue).toHaveBeenCalledWith({
        serviceId: "test-service",
        vciSingleIssueRequest: { accessToken: "at-body", order: {} },
      })
    })

    it("maps ACCEPTED to 202 and UNAUTHORIZED to 401", async () => {
      vc().issue.mockResolvedValue({ action: "ACCEPTED" })
      await request(app).post("/api/vci/credential/issue").set("Authorization", "Bearer at-1").send({ order: {} }).expect(202)

      vc().issue.mockResolvedValue({ action: "UNAUTHORIZED" })
      await request(app).post("/api/vci/credential/issue").set("Authorization", "Bearer at-1").send({ order: {} }).expect(401)
    })

    it("rejects a batch with neither orders nor credential_requests, without calling Authlete", async () => {
      const res = await request(app)
        .post("/api/vci/credential/batch")
        .set("Authorization", "Bearer at-1")
        .send({})
        .expect(400)

      expect(res.body.error).toBe("invalid_request")
      expect(vc().batchIssue).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------------------------------------
  // 4. POST /api/vci/deferred/issue — the two-call flow, fixed 2026-08-13.
  //
  // This endpoint used to authenticate nobody: it collected no access token, and the Authlete API it called
  // (`VciDeferredIssueRequest`) has no `accessToken` field, so nothing on the path could validate one. A
  // caller holding a `transactionId` — a handle, not a credential — reached issuance. Its two siblings on
  // this router both answered 401 without a token; that asymmetry was the bug, and a controller test could
  // not see it because it never drives the route.
  //
  // It now calls `/vci/deferred/parse` first, which is the only Authlete API on this path that takes a
  // token. The four assertions that decide whether the fix works rather than merely exists are marked
  // below. UNVERIFIED, and it cannot be otherwise here: `verifiableCredentialsEnabled` is `false`, so on
  // this deployment `parse` answers FORBIDDEN before it would ever return an `info.identifier`.
  // -----------------------------------------------------------------------------------------------------
  describe("POST /api/vci/deferred/issue", () => {
    const parsedOk = { action: "OK", info: { identifier: "req-from-parse" } }

    // (1) The token is collected.
    it("refuses a request with no token, and reaches neither Authlete API", async () => {
      const res = await request(app)
        .post("/api/vci/deferred/issue")
        .send({ order: { transactionId: "tx-1" } })
        .expect(401)

      expect(res.body.error).toBe("invalid_token")
      expect(vc().deferredParse).not.toHaveBeenCalled()
      expect(vc().deferredIssue).not.toHaveBeenCalled()
    })

    // (2) The token is validated — by Authlete, at parse, which is the only place it can be.
    it("stops at parse when Authlete rejects the token, and never issues", async () => {
      vc().deferredParse.mockResolvedValue({ action: "UNAUTHORIZED", responseContent: "{}" })

      await request(app)
        .post("/api/vci/deferred/issue")
        .set("Authorization", "Bearer bad-token")
        .send({ order: { transactionId: "tx-1" } })
        .expect(401)

      expect(vc().deferredParse).toHaveBeenCalledTimes(1)
      expect(vc().deferredIssue).not.toHaveBeenCalled()
    })

    // T1-11. Authlete's `responseContent` on this action is a WWW-Authenticate CHALLENGE STRING, not JSON —
    // verified live: `Bearer error="invalid_token", error_description="[A375304] …"`. RFC 6750 §3 puts that in
    // the header, which is what userinfo.controller.ts already does with the identical shape. Sending it as a
    // JSON body would have been the naive reading of "return responseContent as the body".
    it("relays the parse failure as a WWW-Authenticate challenge, not as a JSON body", async () => {
      vc().deferredParse.mockResolvedValue({
        action: "UNAUTHORIZED",
        resultMessage: "[A375304] The access token does not exist.",
        responseContent: 'Bearer error="invalid_token", error_description="[A375304] The access token does not exist."',
      })

      const res = await request(app)
        .post("/api/vci/deferred/issue")
        .set("Authorization", "Bearer bad-token")
        .send({ order: { transactionId: "tx-1" } })
        .expect(401)

      expect(res.headers["www-authenticate"]).toContain('error="invalid_token"')
      expect(res.headers["www-authenticate"]).toContain("A375304")
      expect(res.body.error).toBe("invalid_token")
      // The specific Authlete condition survives — it is this repo's pedagogical value — but the vendor
      // control-flow fields do not.
      expect(res.body.error_description).toContain("A375304")
      expect(res.body).not.toHaveProperty("action")
      expect(res.body).not.toHaveProperty("resultCode")
    })

    it("returns the OID4VCI credential response as the body on success", async () => {
      vc().deferredParse.mockResolvedValue(parsedOk)
      vc().deferredIssue.mockResolvedValue({
        action: "OK",
        responseContent: JSON.stringify({ credential: "eyJ…" }),
      })

      const res = await request(app)
        .post("/api/vci/deferred/issue")
        .set("Authorization", "Bearer at-1")
        .send({ order: { transactionId: "tx-1" } })
        .expect(200)

      expect(res.body.credential).toBe("eyJ…")
      expect(res.body).not.toHaveProperty("action")
    })

    it("forwards the token to parse as the §9.1 request content", async () => {
      vc().deferredParse.mockResolvedValue(parsedOk)
      vc().deferredIssue.mockResolvedValue({ action: "OK", responseContent: "{}" })

      await request(app)
        .post("/api/vci/deferred/issue")
        .set("Authorization", "Bearer at-1")
        .send({ order: { transactionId: "tx-1" } })
        .expect(200)

      expect(vc().deferredParse).toHaveBeenCalledWith({
        serviceId: "test-service",
        vciDeferredParseRequest: {
          accessToken: "at-1",
          requestContent: JSON.stringify({ transaction_id: "tx-1" }),
        },
      })
    })

    // (3) Issuance is bound to the request Authlete validated, not to what the caller typed.
    it("takes requestIdentifier from parse, never from the body", async () => {
      vc().deferredParse.mockResolvedValue(parsedOk)
      vc().deferredIssue.mockResolvedValue({ action: "OK", responseContent: "{}" })

      await request(app)
        .post("/api/vci/deferred/issue")
        .set("Authorization", "Bearer at-1")
        .send({ order: { transactionId: "tx-1", requestIdentifier: "someone-elses-request" } })
        .expect(200)

      expect(vc().deferredIssue).toHaveBeenCalledWith({
        serviceId: "test-service",
        vciDeferredIssueRequest: { order: { requestIdentifier: "req-from-parse" } },
      })
      const [args] = vc().deferredIssue.mock.calls[0]
      expect(JSON.stringify(args)).not.toContain("someone-elses-request")
    })

    // (4) The bypass shape is closed.
    it("refuses a requestIdentifier with no transactionId", async () => {
      const res = await request(app)
        .post("/api/vci/deferred/issue")
        .set("Authorization", "Bearer at-1")
        .send({ order: { requestIdentifier: "def123" } })
        .expect(400)

      expect(res.body.error).toBe("invalid_request")
      expect(vc().deferredParse).not.toHaveBeenCalled()
      expect(vc().deferredIssue).not.toHaveBeenCalled()
    })

    it("rejects an empty order", async () => {
      await request(app)
        .post("/api/vci/deferred/issue")
        .set("Authorization", "Bearer at-1")
        .send({ order: {} })
        .expect(400)

      expect(vc().deferredParse).not.toHaveBeenCalled()
    })

    it("accepts the JSON accessToken body fallback, as its siblings do", async () => {
      vc().deferredParse.mockResolvedValue(parsedOk)
      vc().deferredIssue.mockResolvedValue({ action: "OK", responseContent: "{}" })

      await request(app)
        .post("/api/vci/deferred/issue")
        .send({ accessToken: "at-body", order: { transactionId: "tx-1" } })
        .expect(200)

      expect(vc().deferredParse).toHaveBeenCalledWith(
        expect.objectContaining({
          vciDeferredParseRequest: expect.objectContaining({ accessToken: "at-body" }),
        }),
      )
    })

    it("maps a parse BAD_REQUEST to 400 and a FORBIDDEN to 403, without issuing", async () => {
      for (const [action, status] of [["BAD_REQUEST", 400], ["FORBIDDEN", 403]] as const) {
        vi.clearAllMocks()
        vc().deferredParse.mockResolvedValue({ action })

        await request(app)
          .post("/api/vci/deferred/issue")
          .set("Authorization", "Bearer at-1")
          .send({ order: { transactionId: "tx-1" } })
          .expect(status)

        expect(vc().deferredIssue).not.toHaveBeenCalled()
      }
    })

    it("still maps the issue action once parse has passed", async () => {
      vc().deferredParse.mockResolvedValue(parsedOk)
      vc().deferredIssue.mockResolvedValue({ action: "FORBIDDEN" })

      await request(app)
        .post("/api/vci/deferred/issue")
        .set("Authorization", "Bearer at-1")
        .send({ order: { transactionId: "tx-1" } })
        .expect(403)
    })

    // All three credential endpoints now share one posture. Asserting it as a set is the point: the defect
    // was that one of the three disagreed, and a per-endpoint test would not have noticed.
    it("agrees with its two siblings on the no-token answer", async () => {
      const paths = [
        "/api/vci/credential/issue",
        "/api/vci/credential/batch",
        "/api/vci/deferred/issue",
      ]

      for (const path of paths) {
        const res = await request(app).post(path).send({ order: { transactionId: "tx-1" } })
        expect(res.status, path).toBe(401)
        expect(res.body.error, path).toBe("invalid_token")
      }
    })
  })
})
