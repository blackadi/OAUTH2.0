import { describe, it, expect, beforeAll } from "vitest"
import supertest from "supertest"
import type { Express } from "express"

/*
 * End-to-End Test Suite — Authlete Node Authorization Server
 * ===========================================================
 *
 * These tests exercise the full OAuth 2.0 / OIDC flows through the real
 * Authlete API.  They spin up an Express app instance in-process and make
 * real HTTP calls via Supertest.
 *
 * ── Env vars required ──────────────────────────────────────────────────
 *   AUTHLETE_BEARER_TOKEN   Real Authlete API token (not the test default)
 *   AUTHLETE_BASE_URL       Authlete server URL
 *   AUTHLETE_SERVICE_ID     Authlete service ID
 *   CID                     Confidential client ID
 *   SEC                     Confidential client secret
 *
 * ── Optional env vars ──────────────────────────────────────────────────
 *   PUB_CID                 Public client ID          (for PKCE tests)
 *   REDIR                   Redirect URI              (default: http://localhost:3000)
 *   MGMT_CLIENT_ID          Management API client ID  (for DCR / token mgmt)
 *   MGMT_CLIENT_SECRET      Management API secret
 *
 * ── Run ────────────────────────────────────────────────────────────────
 *   npx vitest run tests/e2e --reporter=verbose
 *
 * Tests that cannot run because of missing credentials are skipped.
 * ───────────────────────────────────────────────────────────────────────
 */

// ── Runtime state (populated by test execution order) ────────────────────────

const state = {
  ccAccessToken: "",
  accessToken: "",
  refreshToken: "",
  idToken: "",
  secondAccessToken: "",
  secondRefreshToken: "",
  pkceAccessToken: "",
  dcrClientId: "",
  dcrToken: "",
}

function resolveToken(): string {
  return state.secondAccessToken || state.accessToken || state.ccAccessToken || state.pkceAccessToken
}

// ── Credential detection ─────────────────────────────────────────────────────

const hasRealAuthleteCreds = !!(
  process.env.AUTHLETE_BEARER_TOKEN &&
  process.env.AUTHLETE_BASE_URL &&
  process.env.AUTHLETE_SERVICE_ID &&
  process.env.AUTHLETE_BEARER_TOKEN !== "test-bearer-token"
)

const hasConfidential = !!(
  hasRealAuthleteCreds &&
  process.env.CID &&
  process.env.SEC
)

const hasPublic = !!(
  hasRealAuthleteCreds &&
  process.env.PUB_CID
)

const hasManagement = !!(
  hasRealAuthleteCreds &&
  process.env.MGMT_CLIENT_ID &&
  process.env.MGMT_CLIENT_SECRET
)

const describeIf = (condition: boolean) =>
  condition ? describe : describe.skip

// ── App setup ────────────────────────────────────────────────────────────────

let agent: ReturnType<typeof supertest.agent>
let request: ReturnType<typeof supertest>

async function createAppInstance(): Promise<Express> {
  const { createApp } = await import("../../src/app")
  return createApp()
}

// ── Tests ────────────────────────────────────────────────────────────────────

if (!hasRealAuthleteCreds) {
  describe("E2E: Authlete OAuth Server", () => {
    it("all tests skipped — set AUTHLETE_BEARER_TOKEN, AUTHLETE_BASE_URL, AUTHLETE_SERVICE_ID in server/.env", () => {})
  })
} else {
  describe("E2E: Authlete OAuth Server", () => {
    beforeAll(async () => {
      const app = await createAppInstance()
      request = supertest(app)
      agent = supertest.agent(app)
    })

    // ── 1. OpenID Discovery ────────────────────────────────────────────

    describe("Discovery (RFC 8414)", () => {
      it("returns discovery document with an issuer", async () => {
        const res = await request.get("/api/.well-known/openid-configuration")
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("issuer")
        expect(res.body.issuer).toEqual(expect.any(String))
      })
    })

    // ── 2. JWKS ────────────────────────────────────────────────────────

    describe("JWKS (RFC 7517)", () => {
      it("returns public JWKS with at least one key", async () => {
        const res = await request.get("/api/.well-known/jwks.json")
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("keys")
        expect(res.body.keys.length).toBeGreaterThan(0)
        expect(res.body.keys[0]).toHaveProperty("kid")
      })
    })

    // ── 3. Health ──────────────────────────────────────────────────────

    describe("Health", () => {
      it("returns server health status: ok", async () => {
        const res = await request.get("/api/health")
        expect(res.status).toBe(200)
        expect(res.body.status).toBe("ok")
      })

      it("returns Authlete connectivity status", async () => {
        const res = await request.get("/api/health/authlete")
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("healthy")
      })
    })

    // ── 4. Client Credentials ──────────────────────────────────────────

    describeIf(hasConfidential)("Client Credentials (RFC 6749 §4.4)", () => {
      it("exchanges client credentials for an access token", async () => {
        const res = await request
          .post("/api/token")
          .auth(process.env.CID!, process.env.SEC!)
          .type("form")
          .send("grant_type=client_credentials")
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("access_token")
        expect(res.body.token_type).toBe("Bearer")
        state.ccAccessToken = res.body.access_token
      })
    })

    // ── 5. Authorization Code ──────────────────────────────────────────

    describeIf(hasConfidential)("Authorization Code (RFC 6749 §4.1)", () => {
      const redirectUri = process.env.REDIR || "http://localhost:3000"
      const stateParam = "ac_test_state"
      let code = ""

      it("redirects to login page after authorization request", async () => {
        const res = await agent
          .get("/api/authorization")
          .query({
            response_type: "code",
            client_id: process.env.CID,
            redirect_uri: redirectUri,
            scope: "openid profile",
            state: stateParam,
          })
          .redirects(0)
        expect(res.status).toBe(302)
      })

      it("logs in with admin:password", async () => {
        const res = await agent
          .post("/api/session/login")
          .type("form")
          .send("username=admin&password=password")
          .redirects(0)
        expect(res.status).toBe(302)
        expect(res.headers.location).toContain("/api/session/consent")
      })

      it("approves consent and receives authorization code", async () => {
        const res = await agent
          .post("/api/session/consent")
          .type("form")
          .send("decision=approve")
          .redirects(0)
        expect(res.status).toBe(302)
        const location = res.headers.location as string
        expect(location).toContain("code=")
        code = new URL(location).searchParams.get("code") || ""
        expect(code).toBeTruthy()
      })

      it("exchanges authorization code for access, refresh, and id tokens", async () => {
        expect(code).toBeTruthy()
        const res = await request
          .post("/api/token")
          .auth(process.env.CID!, process.env.SEC!)
          .type("form")
          .send({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
          })
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("access_token")
        expect(res.body).toHaveProperty("id_token")
        expect(res.body).toHaveProperty("refresh_token")
        expect(res.body.token_type).toBe("Bearer")
        state.accessToken = res.body.access_token
        state.refreshToken = res.body.refresh_token
        state.idToken = res.body.id_token
      })

      it("ID Token has subject = admin", async () => {
        expect(state.idToken).toBeTruthy()
        const parts = state.idToken.split(".")
        expect(parts.length).toBe(3)
        const payload = JSON.parse(
          Buffer.from(parts[1], "base64url").toString("utf-8")
        )
        expect(payload.sub).toBe("admin")
      })
    })

    // ── 6. Userinfo ────────────────────────────────────────────────────

    describe("Userinfo (OIDC Core §5.3)", () => {
      it("returns signed userinfo JWT with sub = admin", async () => {
        if (!state.accessToken) return
        const res = await request
          .get("/api/userinfo")
          .set("Authorization", `Bearer ${state.accessToken}`)
        expect(res.status).toBe(200)
        expect(res.body).toBeTruthy()
        const payload = JSON.parse(
          Buffer.from(res.body.split(".")[1], "base64url").toString("utf-8")
        )
        expect(payload.sub).toBe("admin")
      })
    })

    // ── 7. Refresh ─────────────────────────────────────────────────────

    describeIf(hasConfidential)("Refresh Token (RFC 6749 §6)", () => {
      it("issues new access token from refresh token", async () => {
        if (!state.refreshToken) return
        const res = await request
          .post("/api/token")
          .auth(process.env.CID!, process.env.SEC!)
          .type("form")
          .send({
            grant_type: "refresh_token",
            refresh_token: state.refreshToken,
          })
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("access_token")
        expect(res.body).toHaveProperty("refresh_token")
        expect(res.body.token_type).toBe("Bearer")
        state.secondAccessToken = res.body.access_token
        state.secondRefreshToken = res.body.refresh_token
      })
    })

    // ── 8. Introspection ───────────────────────────────────────────────

    describe("Token Introspection (RFC 7662)", () => {
      it("standard introspection returns active: true", async () => {
        const token = resolveToken()
        if (!token) return
        const res = await request
          .post("/api/introspection/standard")
          .type("form")
          .send({ token })
        expect(res.status).toBe(200)
        expect(res.body.active).toBe(true)
      })

      it("Authlete-specific introspection responds successfully", async () => {
        const token = resolveToken()
        if (!token) return
        const res = await request
          .post("/api/introspection")
          .type("form")
          .send({ token })
        expect(res.status).toBe(200)
      })
    })

    // ── 9. Revocation ──────────────────────────────────────────────────

    describe("Token Revocation (RFC 7009)", () => {
      it("confidential client revokes token (Basic auth)", async () => {
        if (!hasConfidential) return
        const token = resolveToken()
        if (!token) return
        const res = await request
          .post("/api/revocation")
          .auth(process.env.CID!, process.env.SEC!)
          .type("form")
          .send({ token })
        expect(res.status).toBe(200)
      })

      it("public client revokes token (client_id in body)", async () => {
        if (!hasPublic) return
        const token = resolveToken()
        if (!token) return
        const res = await request
          .post("/api/revocation")
          .type("form")
          .send({ token, client_id: process.env.PUB_CID })
        expect(res.status).toBe(200)
      })
    })

    // ── 10. PKCE ───────────────────────────────────────────────────────

    describeIf(hasPublic)("PKCE (RFC 7636)", () => {
      const redirectUri = process.env.REDIR || "http://localhost:3000"
      const codeVerifier =
        "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXkdBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
      let codeChallenge: string
      let pkceAgent: ReturnType<typeof supertest.agent>

      beforeAll(async () => {
        const { createHash } = await import("crypto")
        codeChallenge = createHash("sha256")
          .update(codeVerifier)
          .digest("base64url")
      })

      it("completes full PKCE authorize → login → consent → code flow", async () => {
        pkceAgent = supertest.agent(await createAppInstance())
        const authRes = await pkceAgent
          .get("/api/authorization")
          .query({
            response_type: "code",
            client_id: process.env.PUB_CID,
            redirect_uri: redirectUri,
            scope: "openid profile",
            state: "pkce_test",
            code_challenge: codeChallenge,
            code_challenge_method: "S256",
          })
          .redirects(0)
        expect(authRes.status).toBe(302)

        const loginRes = await pkceAgent
          .post("/api/session/login")
          .type("form")
          .send("username=admin&password=password")
          .redirects(0)
        expect(loginRes.status).toBe(302)
        expect(loginRes.headers.location).toContain("/api/session/consent")

        const consentRes = await pkceAgent
          .post("/api/session/consent")
          .type("form")
          .send("decision=approve")
          .redirects(0)
        expect(consentRes.status).toBe(302)
        const location = consentRes.headers.location as string
        expect(location).toContain("code=")
        const pkceCode = new URL(location).searchParams.get("code") || ""
        expect(pkceCode).toBeTruthy()

        // Exchange (no Basic auth — public client)
        const tokenRes = await request
          .post("/api/token")
          .type("form")
          .send({
            grant_type: "authorization_code",
            code: pkceCode,
            redirect_uri: redirectUri,
            client_id: process.env.PUB_CID,
            code_verifier: codeVerifier,
          })
        expect(tokenRes.status).toBe(200)
        expect(tokenRes.body.token_type).toBe("Bearer")
        state.pkceAccessToken = tokenRes.body.access_token
      })
    })

    // ── 11. Token Management ───────────────────────────────────────────

    describeIf(hasManagement)("Token Management", () => {
      let createdToken = ""

      it("lists tokens", async () => {
        const res = await request.get("/api/token/list")
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("totalCount")
      })

      it("creates a token programmatically", async () => {
        const res = await request
          .post("/api/token/create")
          .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
          .type("form")
          .send("grantType=CLIENT_CREDENTIALS&subject=test_user&scopes=openid")
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("accessToken")
        createdToken = res.body.accessToken
        expect(createdToken).toBeTruthy()
      })

      it("updates token scopes", async () => {
        expect(createdToken).toBeTruthy()
        const res = await request
          .patch("/api/token/update")
          .type("form")
          .send({ accessToken: createdToken, scopes: "openid" })
        expect(res.status).toBe(200)
      })

      it("revokes token via management API", async () => {
        expect(createdToken).toBeTruthy()
        const res = await request
          .post("/api/token/revoke")
          .type("form")
          .send({ accessTokenIdentifier: createdToken })
        expect(res.status).toBe(200)
      })
    })

    // ── 12. RP-Initiated Logout ────────────────────────────────────────

    describe("RP-Initiated Logout (OIDC)", () => {
      it("returns 200 or 302 for valid logout request", async () => {
        const redirect = process.env.REDIR || "http://localhost:3000"
        const res = await request
          .get("/api/logout")
          .query({ post_logout_redirect_uri: redirect })
        expect([200, 302]).toContain(res.status)
      })
    })

    // ── 13. Grant Management ───────────────────────────────────────────

    describe("Grant Management for OAuth 2.0", () => {
      const fakeGrantId = "e2e_test_invalid_grant_12345"

      it("queries invalid grant (404/401/403 expected)", async () => {
        const token = resolveToken()
        if (!token) return
        const res = await request
          .get(`/api/gm/${fakeGrantId}`)
          .set("Authorization", `Bearer ${token}`)
        expect([404, 401, 403]).toContain(res.status)
      })

      it("revokes invalid grant (404/401/403 expected)", async () => {
        const token = resolveToken()
        if (!token) return
        const res = await request
          .delete(`/api/gm/${fakeGrantId}`)
          .set("Authorization", `Bearer ${token}`)
        expect([404, 401, 403]).toContain(res.status)
      })
    })

    // ── 14. Backchannel Logout ─────────────────────────────────────────

    const bclClientId = process.env.CID || process.env.PUB_CID || ""

    describeIf(!!bclClientId)("Backchannel Logout (OIDC Back-Channel Logout 1.0)", () => {
      it("issues a logout token", async () => {
        const res = await request
          .post("/api/backchannel_logout/issue")
          .send({ clientIdentifier: bclClientId, subject: "admin" })
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("action", "OK")
        expect(res.body).toHaveProperty("logoutToken")
      })

      it("issues and delivers logout token to one client", async () => {
        const res = await request
          .post("/api/backchannel_logout/deliver")
          .send({ clientIdentifier: bclClientId, subject: "admin" })
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("clientId")
      })

      it("issues and delivers logout tokens to all clients", async () => {
        const res = await request
          .post("/api/backchannel_logout/deliver-all")
          .send({ subject: "admin" })
        expect(res.status).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
      })
    })

    // ── 15. DCR ────────────────────────────────────────────────────────

    describeIf(hasManagement)("DCR — Dynamic Client Registration (RFC 7591 / RFC 7592)", () => {
      const clientName = `E2E Test App ${Date.now()}`
      const redirectUri = process.env.REDIR || "http://localhost:3000"

      it("registers a new client", async () => {
        const res = await request
          .post("/api/client/dcr/register")
          .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
          .send({
            json: JSON.stringify({
              client_name: clientName,
              redirect_uris: [redirectUri],
              grant_types: ["AUTHORIZATION_CODE"],
            }),
          })
        expect(res.status).toBe(201)
        expect(res.body).toHaveProperty("action", "CREATED")
        const content = JSON.parse(res.body.responseContent)
        state.dcrClientId = content.client_id
        state.dcrToken = content.registration_access_token
        expect(state.dcrClientId).toBeTruthy()
        expect(state.dcrToken).toBeTruthy()
      })

      it("retrieves the registered client", async () => {
        if (!state.dcrClientId) return
        const res = await request
          .post("/api/client/dcr/get")
          .send({ token: state.dcrToken, clientId: state.dcrClientId })
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("action")
      })

      it("updates the registered client", async () => {
        if (!state.dcrClientId) return
        const res = await request
          .post("/api/client/dcr/update")
          .send({
            json: JSON.stringify({ client_name: "Updated E2E App" }),
            token: state.dcrToken,
            clientId: state.dcrClientId,
          })
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("action")
      })

      it("deletes the registered client", async () => {
        if (!state.dcrClientId) return
        const res = await request
          .post("/api/client/dcr/delete")
          .send({ token: state.dcrToken, clientId: state.dcrClientId })
        expect(res.status).toBe(204)
      })
    })

    // ── 16. CIBA ───────────────────────────────────────────────────────

    describeIf(hasConfidential)("CIBA (Client-Initiated Backchannel Authentication)", () => {
      let ticket = ""

      it("sends backchannel authentication request", async () => {
        const res = await request
          .post("/api/ciba/authentication")
          .send({
            parameters: "login_hint=admin&scope=openid",
            clientId: process.env.CID,
            clientSecret: process.env.SEC,
          })
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("action", "USER_IDENTIFICATION")
        expect(res.body).toHaveProperty("ticket")
        ticket = res.body.ticket
      })

      it("issues auth_req_id from ticket", async () => {
        if (!ticket) return expect.fail("No ticket from CIBA auth — previous test may have failed")
        const res = await request
          .post("/api/ciba/issue")
          .send({ ticket })
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("action", "OK")
        expect(res.body).toHaveProperty("authReqId")
      })

      it("fails authentication (ACCESS_DENIED)", async () => {
        if (!ticket) return expect.fail("No ticket from CIBA auth — previous test may have failed")
        const res = await request
          .post("/api/ciba/fail")
          .send({ ticket, reason: "ACCESS_DENIED" })
        expect(res.status).toBe(403)
        expect(res.body).toHaveProperty("action", "FORBIDDEN")
      })

      it("completes authentication (AUTHORIZED)", async () => {
        if (!ticket) return expect.fail("No ticket from CIBA auth — previous test may have failed")
        const res = await request
          .post("/api/ciba/complete")
          .send({ ticket, result: "AUTHORIZED", subject: "admin" })
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("action")
      })
    })

    // ── 17. PAR ────────────────────────────────────────────────────────

    describeIf(hasConfidential)("PAR — Pushed Authorization Requests (RFC 9126)", () => {
      const redirectUri = process.env.REDIR || "http://localhost:3000"

      it("pushes an authorization request", async () => {
        const res = await request
          .post("/api/par")
          .send({
            parameters: `response_type=code&client_id=${process.env.CID}&redirect_uri=${redirectUri}&scope=openid%20profile&state=par_test`,
            clientId: process.env.CID,
            clientSecret: process.env.SEC,
          })
        expect(res.status).toBe(201)
        expect(res.body).toHaveProperty("action", "CREATED")
        expect(res.body).toHaveProperty("requestUri")
      })

      it("rejects empty parameters with 400", async () => {
        const res = await request.post("/api/par").send({})
        expect(res.status).toBe(400)
      })
    })
  })
}
