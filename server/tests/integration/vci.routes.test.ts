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
 *               POST /api/vci/deferred/issue                        *** nothing — see below ***
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
  // 4. DEFECT RECORD — POST /api/vci/deferred/issue authenticates nobody.
  //
  // This is NOT a deliberate defect and it is NOT in AGENTS.md's "Deliberate defects" table. It is recorded
  // here because a route-level test is what makes it visible, and because a silent fix should have to walk
  // past this comment.
  //
  // The evidence, in the order it was established:
  //
  //   1. `handleIssueDeferred` (controllers/vci.controller.ts) never calls `extractBearerToken`. Its two
  //      siblings on this router both do, and both answer 401 without a token. It checks only that the
  //      body carries `order.transactionId` or `order.requestIdentifier`.
  //   2. `VciService.issueDeferred(order)` calls `verifiableCredentials.deferredIssue({ serviceId, order })`
  //      — and SDK 1.0.0's `VciDeferredIssueRequest` is `{ order?: CredentialIssuanceOrder }`. There is no
  //      `accessToken` field, so Authlete cannot validate one either. The token is not dropped in transit;
  //      it is never collected.
  //   3. Authlete splits this flow in two. `VciDeferredParseRequest` DOES carry `accessToken` — its own
  //      doc comment reads "The access token that came along with the deferred credential request" — and
  //      `/vci/deferred/parse` is where the token is checked. This server never calls it: `deferredParse`,
  //      `parse` and `batchParse` appear in no source file.
  //   4. AGENTS.md describes this endpoint's auth category as "access token via Authorization: Bearer
  //      header or body", which is the control that is missing.
  //
  // So a caller holding only a `transactionId` — a handle, not a credential — reaches issuance. UNVERIFIED:
  // OID4VCI 1.0 (Final, 16 September 2025) §9's exact normative sentence on authenticating the Deferred
  // Credential Request was not quoted verbatim from the primary source, so no MUST is cited here. The
  // finding does not rest on it: the two sibling endpoints, the unused parse API and AGENTS.md's own claim
  // are each independent of the spec text.
  //
  // Not live-exploitable on this deployment — `verifiableCredentialsEnabled` is `false`.
  //
  // TO FIX: require a token in the handler as the siblings do, and route the request through
  // `verifiableCredentials.deferredParse` so Authlete validates it. That changes access control, so it is
  // a plan-mode change under CLAUDE.md. When it lands, this block should assert 401 and the record below
  // should be deleted rather than amended.
  // -----------------------------------------------------------------------------------------------------
  describe("POST /api/vci/deferred/issue — records a missing access-token check", () => {
    it("issues from a transactionId alone, with no token presented anywhere", async () => {
      vc().deferredIssue.mockResolvedValue({ action: "OK", responseContent: "{}" })

      await request(app)
        .post("/api/vci/deferred/issue")
        .send({ order: { transactionId: "tx-1" } })
        .expect(200)

      expect(vc().deferredIssue).toHaveBeenCalledWith({
        serviceId: "test-service",
        vciDeferredIssueRequest: { order: { transactionId: "tx-1" } },
      })
    })

    it("ignores an Authorization header entirely — it is never forwarded to Authlete", async () => {
      vc().deferredIssue.mockResolvedValue({ action: "OK", responseContent: "{}" })

      await request(app)
        .post("/api/vci/deferred/issue")
        .set("Authorization", "Bearer at-1")
        .send({ order: { transactionId: "tx-1" } })
        .expect(200)

      const [args] = vc().deferredIssue.mock.calls[0]
      expect(JSON.stringify(args)).not.toContain("at-1")
    })

    it("never reaches the parse API that would validate a token", async () => {
      vc().deferredIssue.mockResolvedValue({ action: "OK", responseContent: "{}" })

      await request(app).post("/api/vci/deferred/issue").send({ order: { transactionId: "tx-1" } }).expect(200)

      expect(vc().deferredParse).not.toHaveBeenCalled()
    })

    // The only check it does make. Kept so the endpoint is not wholly unasserted.
    it("rejects a body with neither transactionId nor requestIdentifier", async () => {
      const res = await request(app).post("/api/vci/deferred/issue").send({ order: {} }).expect(400)

      expect(res.body.error).toBe("invalid_request")
      expect(vc().deferredIssue).not.toHaveBeenCalled()
    })
  })
})
