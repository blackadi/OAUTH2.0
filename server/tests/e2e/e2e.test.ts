import { describe, it, expect, beforeAll, afterAll } from "vitest"
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
  cmClientId: "",
  loginUrl: "",
  consentUrl: "",
}

// ── CSRF helpers ─────────────────────────────────────────────────────────────

function csrfPattern(): RegExp {
  return /name="_csrf" value="([^"]+)"/
}

async function getCsrfToken(agent: ReturnType<typeof supertest.agent>, url: string): Promise<string> {
  const res = await agent.get(url)
  const match = res.text.match(csrfPattern())
  if (!match) throw new Error(`CSRF token not found in GET ${url}`)
  return match[1]
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
let app: Express

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
      app = await createAppInstance()
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
      it("returns public JWKS as an array (may be empty if service has no keys)", async () => {
        const res = await request.get("/api/.well-known/jwks.json")
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("keys")
        expect(Array.isArray(res.body.keys)).toBe(true)
      })
    })

    // ── 3. Health ──────────────────────────────────────────────────────

    describe("Health", () => {
      it("returns server health status: ok", async () => {
        const res = await request.get("/api/health")
        expect(res.status).toBe(200)
        expect(res.body.status).toBe("ok")
      })

      it("returns combined health check", async () => {
        const res = await request.get("/api/health/all")
        expect(res.status).toBe(200)
        expect(res.body.status).toBe("ok")
        expect(res.body).toHaveProperty("checks")
        expect(res.body.checks).toHaveProperty("redis")
        expect(res.body.checks).toHaveProperty("authlete")
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

    // ── 5. Resource Owner Password Credentials (ROP) ────────────────────

    describeIf(hasConfidential)("Resource Owner Password Credentials (RFC 6749 §4.3)", () => {
      it("exchanges username+password for an access token", async () => {
        const res = await request
          .post("/api/token")
          .auth(process.env.CID!, process.env.SEC!)
          .type("form")
          .send("grant_type=password")
          .send("username=admin")
          .send("password=password")
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("access_token")
        expect(res.body.token_type).toBe("Bearer")
      })

      it("rejects invalid credentials with 400", async () => {
        const res = await request
          .post("/api/token")
          .auth(process.env.CID!, process.env.SEC!)
          .type("form")
          .send("grant_type=password")
          .send("username=admin")
          .send("password=wrongpassword")
        expect(res.status).toBe(400)
        expect(res.body).toHaveProperty("error")
      })
    })

    // ── Token endpoint errors ───────────────────────────────────────────

    describeIf(hasConfidential)("Token endpoint errors", () => {
      it("rejects invalid grant_type with 400", async () => {
        const res = await request
          .post("/api/token")
          .auth(process.env.CID!, process.env.SEC!)
          .type("form")
          .send("grant_type=bogus")
        expect(res.status).toBe(400)
        expect(res.body).toHaveProperty("error")
      })

      it("rejects wrong client secret with 401", async () => {
        const res = await request
          .post("/api/token")
          .auth(process.env.CID!, "wrong-secret")
          .type("form")
          .send("grant_type=client_credentials")
        expect([400, 401]).toContain(res.status)
        expect(res.body).toHaveProperty("error")
      })

      it("rejects missing grant_type with 400", async () => {
        const res = await request
          .post("/api/token")
          .auth(process.env.CID!, process.env.SEC!)
          .type("form")
          .send("")
        expect(res.status).toBe(400)
      })

      it("rejects missing client authentication with 401", async () => {
        const res = await request
          .post("/api/token")
          .type("form")
          .send("grant_type=client_credentials")
        expect([400, 401]).toContain(res.status)
        expect(res.body).toHaveProperty("error")
      })
    })

    // ── 6. Authorization Code ──────────────────────────────────────────

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
        expect(res.status).toBe(303)
        state.loginUrl = res.headers.location as string
      })

      it("logs in with admin:password", async () => {
        if (!state.loginUrl) return
        const csrf = await getCsrfToken(agent, state.loginUrl)
        const res = await agent
          .post("/api/session/login")
          .type("form")
          .send(`_csrf=${csrf}&username=admin&password=password&login=submit`)
          .redirects(0)
        expect(res.status).toBe(303)
        expect(res.headers.location).toContain("/api/session/consent")
        state.consentUrl = res.headers.location as string
      })

      it("approves consent and receives authorization code", async () => {
        if (!state.consentUrl) return
        const csrf = await getCsrfToken(agent, state.consentUrl)
        const res = await agent
          .post("/api/session/consent")
          .type("form")
          .send(`_csrf=${csrf}&decision=approve`)
          .redirects(0)
        expect(res.status).toBe(303)
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
        expect(res.body.token_type).toBe("Bearer")

        // Only store the token if id_token is present (indicates full OIDC support)
        if (res.body.id_token) {
          state.accessToken = res.body.access_token
          state.idToken = res.body.id_token
          state.refreshToken = res.body.refresh_token || ""
        }
      })

      it("ID Token has subject = admin (if id_token was issued)", async () => {
        if (!state.idToken) return
        const parts = state.idToken.split(".")
        expect(parts.length).toBe(3)
        const payload = JSON.parse(
          Buffer.from(parts[1], "base64url").toString("utf-8")
        )
        expect(payload.sub).toBe("admin")
      })

      it("denies consent and receives error redirect", async () => {
        const denyAgent = supertest.agent(app)
        const denyState = "deny_test_state"
        const redirectUri = process.env.REDIR || "http://localhost:3000"
        const authRes = await denyAgent
          .get("/api/authorization")
          .query({
            response_type: "code",
            client_id: process.env.CID,
            redirect_uri: redirectUri,
            scope: "openid profile",
            state: denyState,
            prompt: "consent",
          })
          .redirects(0)
        expect(authRes.status).toBe(303)
        const loginUrl = authRes.headers.location as string
        const csrf = await getCsrfToken(denyAgent, loginUrl)
        const loginRes = await denyAgent
          .post("/api/session/login")
          .type("form")
          .send(`_csrf=${csrf}&username=admin&password=password&login=submit`)
          .redirects(0)
        expect(loginRes.status).toBe(303)
        const consentUrl = loginRes.headers.location as string
        const consentCsrf = await getCsrfToken(denyAgent, consentUrl)
        const res = await denyAgent
          .post("/api/session/consent")
          .type("form")
          .send(`_csrf=${consentCsrf}&decision=deny`)
          .redirects(0)
        expect(res.status).toBe(303)
        const location = res.headers.location as string
        // `toContain("error=")` alone was the assertion here until 2026-09-01, and it is why this test
        // watched the deny path report `consent_required` for months without noticing. RFC 6749 §4.1.2.1
        // gives `access_denied` when the resource owner denies the request; `consent_required` says the
        // server could not *ask*, which is the prompt=none case, not this one.
        expect(location).toContain("error=access_denied")
        expect(location).toContain(`state=${denyState}`)
      })

      it("rejects missing client_id with 400", async () => {
        const res = await request
          .get("/api/authorization")
          .query({
            response_type: "code",
            redirect_uri: redirectUri,
          })
        expect(res.status).toBe(400)
      })

      it("rejects missing redirect_uri with 400", async () => {
        const res = await request
          .get("/api/authorization")
          .query({
            response_type: "code",
            client_id: process.env.CID,
          })
        expect(res.status).toBe(400)
      })
    })

    // ── 7. Userinfo ────────────────────────────────────────────────────

    describe("Userinfo (OIDC Core §5.3)", () => {
      it("rejects missing Authorization header", async () => {
        const res = await request.get("/api/userinfo")
        // Accept 400, 401, or 500 depending on Authlete's response
        expect([400, 401, 500]).toContain(res.status)
      })

      it("rejects invalid Bearer token", async () => {
        const res = await request
          .get("/api/userinfo")
          .set("Authorization", "Bearer not-a-real-token")
        expect([400, 401]).toContain(res.status)
      })
    })

    // ── 8. Refresh ─────────────────────────────────────────────────────

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

    // ── 9. Introspection ───────────────────────────────────────────────

    describe("Token Introspection (RFC 7662)", () => {
      it("standard introspection returns 200 (active may vary if token was consumed)", async () => {
        const token = resolveToken()
        if (!token) return
        const res = await request
          .post("/api/introspection/standard")
          .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
          .type("form")
          .send({ token })
        expect(res.status).toBe(200)
      })

      // T1-1 (2026-08-12) put admin Basic auth on both introspection endpoints, before any Authlete
      // call, because an unauthenticated introspection endpoint is a token-scanning oracle (RFC 7662
      // §2.1). Pin the gate itself, not only the happy path.
      it("refuses standard introspection without admin credentials", async () => {
        const token = resolveToken()
        if (!token) return
        const res = await request
          .post("/api/introspection/standard")
          .type("form")
          .send({ token })
        expect(res.status).toBe(401)
      })

      it("Authlete-specific introspection responds (may 401 if token unrecognized)", async () => {
        const token = resolveToken()
        if (!token) return
        const res = await request
          .post("/api/introspection")
          .type("form")
          .send({ token })
        expect([200, 401]).toContain(res.status)
      })
    })

    // ── 10. Revocation ──────────────────────────────────────────────────

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

      it("rejects missing token with 400", async () => {
        const res = await request
          .post("/api/revocation")
          .type("form")
          .send("")
        expect(res.status).toBe(400)
      })
    })

    // ── 11. PKCE ───────────────────────────────────────────────────────

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
        expect(authRes.status).toBe(303)
        const pkceLoginUrl = authRes.headers.location as string

        const loginCsrf = await getCsrfToken(pkceAgent, pkceLoginUrl)
        const loginRes = await pkceAgent
          .post("/api/session/login")
          .type("form")
          .send(`_csrf=${loginCsrf}&username=admin&password=password&login=submit`)
          .redirects(0)
        expect(loginRes.status).toBe(303)
        expect(loginRes.headers.location).toContain("/api/session/consent")
        const pkceConsentUrl = loginRes.headers.location as string

        const consentCsrf = await getCsrfToken(pkceAgent, pkceConsentUrl)
        const consentRes = await pkceAgent
          .post("/api/session/consent")
          .type("form")
          .send(`_csrf=${consentCsrf}&decision=approve`)
          .redirects(0)
        expect(consentRes.status).toBe(303)
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

    // ── 12. Claims Parameter (OIDC Core §5.5) ──────────────────────────

    describeIf(hasConfidential)("Claims parameter (OIDC Core §5.5)", () => {
      const redirectUri = process.env.REDIR || "http://localhost:3000"

      it("accepts claims parameter in authorization request", async () => {
        const claimsAgent = supertest.agent(await createAppInstance())
        const claimsJson = JSON.stringify({
          id_token: { auth_time: { essential: true } },
        })
        const res = await claimsAgent
          .get("/api/authorization")
          .query({
            response_type: "code",
            client_id: process.env.CID,
            redirect_uri: redirectUri,
            scope: "openid",
            state: "claims_test",
            claims: claimsJson,
          })
          .redirects(0)
        // Server forwards claims to Authlete and redirects to login
        expect(res.status).toBe(303)
        expect(res.headers.location).toContain("/login")
      })
    })

    // ── 13. JWT-Secured Authorization Request (OIDC Core §6) ────────────

    describeIf(hasManagement)("JWT-Secured Authorization Request (OIDC Core §6)", () => {
      const redirectUri = process.env.REDIR || "http://localhost:3000"
      let reqObjCid = ""

      afterAll(async () => {
        if (reqObjCid) {
          await request
            .delete(`/api/client/delete/${reqObjCid}`)
            .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
        }
      })

      it("accepts signed request object and redirects to login", async () => {
        const { generateKeyPair, exportJWK, SignJWT } = await import("jose")
        const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true })
        const kid = "req-obj-e2e-key"
        const jwk = { ...(await exportJWK(publicKey)), kid, use: "sig", alg: "ES256" }
        const jwksStr = JSON.stringify({ keys: [jwk] })

        // Create temporary client with requestSignAlg + JWKS
        const createRes = await request
          .post("/api/client/create")
          .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
          .send({
            client: {
              clientName: `Request-Object-E2E ${Date.now()}`,
              redirectUris: [redirectUri],
              grantTypes: ["AUTHORIZATION_CODE"],
              responseTypes: ["CODE"],
              tokenAuthMethod: "CLIENT_SECRET_BASIC",
              clientType: "CONFIDENTIAL",
              jwks: jwksStr,
              requestSignAlg: "ES256",
            },
          })
        expect(createRes.status).toBe(201)
        reqObjCid = String(createRes.body.clientId)

        // Sign the request object JWT with authorization request params.
        // `aud` MUST be the OP's issuer identifier (RFC 9101 §4, OIDC Core §6.1), not the
        // Authlete API URL — using the latter earns [A006359] "does not match the issuer
        // identifier of this service". Read it from discovery so it cannot drift.
        const discoveryRes = await request.get("/api/.well-known/openid-configuration")
        const issuer = discoveryRes.body.issuer as string
        const now = Math.floor(Date.now() / 1000)
        const requestJwt = await new SignJWT({
          iss: reqObjCid,
          aud: issuer,
          response_type: "code",
          client_id: reqObjCid,
          redirect_uri: redirectUri,
          scope: "openid profile",
          state: "req_obj_test",
          iat: now,
          // The service sets `nbfOptional: false`, which makes `nbf` REQUIRED and caps the
          // request object's lifespan at 60s (FAPI 1.0 Advanced §5.2.2). Without `nbf`, or
          // with exp-nbf > 60s, Authlete rejects the request with 400 before any redirect.
          nbf: now,
          exp: now + 60,
        })
          .setProtectedHeader({ alg: "ES256", kid })
          .sign(privateKey)

        // Pass signed JWT as `request` parameter.
        // Query params are required for server-side validation;
        // the JWT's params take precedence at Authlete.
        const reqAgent = supertest.agent(app)
        const authRes = await reqAgent
          .get("/api/authorization")
          .query({
            request: requestJwt,
            client_id: reqObjCid,
            response_type: "code",
            redirect_uri: redirectUri,
          })
          .redirects(0)
        // Authlete verifies the request object signature and redirects to login
        expect(authRes.status).toBe(303)
        expect(authRes.headers.location).toContain("/login")
      })
    })

    // ── 14. Resource Indicator (RFC 8707) ──────────────────────────────

    describeIf(hasConfidential)("Resource indicator (RFC 8707)", () => {
      const resourceUri = "https://api.example.com/resource"

      it("accepts resource parameter in authorization request", async () => {
        const resAgent = supertest.agent(app)
        const res = await resAgent
          .get("/api/authorization")
          .query({
            response_type: "code",
            client_id: process.env.CID,
            redirect_uri: process.env.REDIR || "http://localhost:3000",
            scope: "openid profile",
            state: "resource_test",
            resource: resourceUri,
          })
          .redirects(0)
        expect(res.status).toBe(303)
        expect(res.headers.location).toContain("/login")
      })

      it("issues token with resource indicator via client_credentials", async () => {
        const res = await request
          .post("/api/token")
          .auth(process.env.CID!, process.env.SEC!)
          .type("form")
          .send({
            grant_type: "client_credentials",
            resource: resourceUri,
          })
        // Authlete processes the resource indicator and issues a token
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("access_token")
        expect(res.body.token_type).toBe("Bearer")
      })
    })

    // ── 15. Token Management ───────────────────────────────────────────

    describeIf(hasManagement)("Token Management", () => {
      it("lists tokens", async () => {
        const res = await request
          .get("/api/token/list")
          .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("totalCount")
      })

      // These four additionally need a confidential client id: they send `clientId`, which
      // Authlete requires as a number. Guarding the whole block on hasManagement alone made
      // them fail rather than skip when CID was unset — `Number(undefined)` is NaN, which the
      // SDK's zod schema rejects before any HTTP call is made.
      describeIf(hasConfidential)("with a confidential client", () => {
        let createdToken = ""

        it("creates a token programmatically", async () => {
          const res = await request
            .post("/api/token/create")
            .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
            .type("form")
            .send(`grantType=CLIENT_CREDENTIALS&subject=test_user&clientId=${process.env.CID}`)
          expect(res.status).toBe(200)
          expect(res.body).toHaveProperty("accessToken")
          createdToken = res.body.accessToken
          expect(createdToken).toBeTruthy()
        })

        it("updates token scopes", async () => {
          expect(createdToken).toBeTruthy()
          const res = await request
            .patch("/api/token/update")
            .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
            .type("form")
            .send({ accessToken: createdToken, scopes: "openid" })
          expect(res.status).toBe(200)
        })

        it("revokes token via management API", async () => {
          expect(createdToken).toBeTruthy()
          const res = await request
            .post("/api/token/revoke")
            .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
            .type("form")
            .send({ accessTokenIdentifier: createdToken })
          expect(res.status).toBe(200)
        })

        it("deletes a token by identifier", async () => {
          const createRes = await request
            .post("/api/token/create")
            .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
            .type("form")
            .send(`grantType=CLIENT_CREDENTIALS&subject=delete_me&clientId=${process.env.CID}`)
          expect(createRes.status).toBe(200)
          const tokenToDelete = createRes.body.accessToken as string
          expect(tokenToDelete).toBeTruthy()

          const res = await request
            .delete(`/api/token/delete/${encodeURIComponent(tokenToDelete)}`)
            .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
          expect(res.status).toBe(204)
        })
      })

      it("reissues an ID token (requires refresh token from auth code flow)", async () => {
        if (!state.refreshToken || !state.accessToken) return
        const res = await request
          .post("/api/token/reissue")
          .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
          .send({
            accessToken: state.accessToken,
            refreshToken: state.refreshToken,
          })
        // Accept 200 (OK) or 400 (CALLER_ERROR — token pair may not support reissue)
        expect([200, 400]).toContain(res.status)
      })

      it("creates a locally-signed JWT (development only)", async () => {
        const res = await request
          .get("/api/token/createLocalToken")
          .query({
            sub: "test_user",
            aud: "http://localhost:3000",
          })
        // Accept 200 (development mode) or 404 (production mode)
        expect([200, 404]).toContain(res.status)
        if (res.status === 200) {
          expect(res.body).toHaveProperty("token")
          expect(res.body).toHaveProperty("publicKey")
          expect(typeof res.body.token).toBe("string")
          expect(typeof res.body.publicKey).toBe("string")
        }
      })

      it("rejects token management request with missing auth", async () => {
        const res = await request.get("/api/token/list")
        expect(res.status).toBe(401)
      })
    })

    // ── 16. RP-Initiated Logout ────────────────────────────────────────

    describe("RP-Initiated Logout (OIDC)", () => {
      it("returns 200 or 302 for valid logout request", async () => {
        const redirect = process.env.REDIR || "http://localhost:3000"
        const res = await request
          .get("/api/logout")
          .query({ post_logout_redirect_uri: redirect })
        expect([200, 302]).toContain(res.status)
      })
    })

    // ── 17. Grant Management ───────────────────────────────────────────

    describeIf(hasConfidential)("Grant Management (OAuth 2.0)", () => {
      let gmQueryToken = ""
      let gmRevokeToken = ""

      it("obtains a token with grant_management_query scope", async () => {
        const res = await request
          .post("/api/token")
          .auth(process.env.CID!, process.env.SEC!)
          .type("form")
          .send({
            grant_type: "client_credentials",
            scope: "grant_management_query",
          })
        // Accept 200 or 429 (Authlete rate limit)
        expect([200, 429]).toContain(res.status)
        if (res.status !== 200) return
        expect(res.body).toHaveProperty("access_token")
        gmQueryToken = res.body.access_token
      })

      it("obtains a token with grant_management_revoke scope", async () => {
        const res = await request
          .post("/api/token")
          .auth(process.env.CID!, process.env.SEC!)
          .type("form")
          .send({
            grant_type: "client_credentials",
            scope: "grant_management_revoke",
          })
        // Accept 200 or 429 (Authlete rate limit)
        expect([200, 429]).toContain(res.status)
        if (res.status !== 200) return
        expect(res.body).toHaveProperty("access_token")
        gmRevokeToken = res.body.access_token
      })

      it("rejects a client_credentials token, which has no grant binding (403)", async () => {
        if (!gmQueryToken) return
        const res = await request
          .get("/api/gm/non-existent-grant")
          .set("Authorization", `Bearer ${gmQueryToken}`)
        // requireGrantOwnership runs before Authlete's /gm API and requires the token's own
        // grant to equal :grantId. A client_credentials token has no grant, so this is 403 —
        // deliberately stricter than the Grant Management spec — and never reaches the
        // 404 not_found that Authlete would return for a missing grant.
        // NOTE: main has no ownership middleware and asserts 404 here. The branches converge
        // when require-grant-ownership.ts reaches main.
        expect(res.status).toBe(403)
      })

      it("rejects revoke with a client_credentials token (403)", async () => {
        if (!gmRevokeToken) return
        const res = await request
          .delete("/api/gm/non-existent-grant")
          .set("Authorization", `Bearer ${gmRevokeToken}`)
        // Same ownership check as the query case: no grant on the token, so no 204.
        expect(res.status).toBe(403)
      })

      it("rejects query with no Bearer token, RFC 6750 §3.1 shaped", async () => {
        const res = await request.get("/api/gm/some-grant")
        expect(res.status).toBe(401)
        // T1-10 (2026-08-13) made this a protected resource in the same sense UserInfo is. §3.1 wants
        // **no body and no error code** when the request carried no authentication information at all —
        // the challenge is the response. Asserting a JSON `error` here would be asserting a defect.
        expect(res.headers["www-authenticate"]).toBeTruthy()
        expect(res.headers["www-authenticate"]).toMatch(/DPoP|Bearer/)
        expect(res.body).toEqual({})
      })

      it("checks grant ownership before scope (revoke token used for query)", async () => {
        if (!gmRevokeToken) return
        const res = await request
          .get("/api/gm/some-grant")
          .set("Authorization", `Bearer ${gmRevokeToken}`)
        // Renamed from "rejects query with insufficient scope": requireGrantOwnership runs
        // first, so a client_credentials token is rejected 403 for having no grant before
        // scope is ever compared. Exercising the 401 insufficient-scope path needs a
        // grant-bound token from an authorization-code flow, which this block cannot obtain.
        expect(res.status).toBe(403)
      })

      it("rejects DELETE with no Bearer token", async () => {
        const res = await request.delete("/api/gm/some-grant")
        expect(res.status).toBe(401)
      })
    })

    // ── 18. Backchannel Logout ─────────────────────────────────────────

    const bclClientId = process.env.CID || process.env.PUB_CID || ""

    describeIf(!!bclClientId)("Backchannel Logout (OIDC Back-Channel Logout 1.0)", () => {
      it("issues a logout token (may fail if bcl not enabled on service)", async () => {
        const res = await request
          .post("/api/backchannel_logout/issue")
          .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
          .send({ clientIdentifier: bclClientId, subject: "admin" })
        // Accept 200 or 500 (500 means service doesn't support BCL)
        expect([200, 500]).toContain(res.status)
      })

      it("issues and delivers logout token to one client (may fail if bcl not enabled)", async () => {
        const res = await request
          .post("/api/backchannel_logout/deliver")
          .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
          .send({ clientIdentifier: bclClientId, subject: "admin" })
        expect([200, 502]).toContain(res.status)
      })

      it("issues and delivers logout tokens to all clients", async () => {
        const res = await request
          .post("/api/backchannel_logout/deliver-all")
          .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
          .send({ subject: "admin" })
        expect(res.status).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
      })

      it("receives a logout token (may fail if JWKS_URI not reachable)", async () => {
        const issueRes = await request
          .post("/api/backchannel_logout/issue")
          .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
          .send({ clientIdentifier: bclClientId, subject: "admin" })
        if (issueRes.status !== 200) return
        const logoutToken = issueRes.body.logoutToken as string | undefined
        if (!logoutToken) return

        const res = await request
          .post("/api/backchannel_logout")
          .type("form")
          .send({ logout_token: logoutToken })
        // 200 when the token verifies; 400 when it is rejected on its merits; **500 when the receiver
        // is not configured** — `JWKS_URI` is unset on this deployment, and T1-14/T1-15 (2026-08-13)
        // made an unconfigured expectation refuse rather than downgrade the check to "any issuer, any
        // key". That is the `jwt.verify` rule in AGENTS.md, and 500 here is the rule working.
        expect([200, 400, 500]).toContain(res.status)
        if (res.status === 500) {
          expect(res.body).toHaveProperty("error")
        }
      })

      it("rejects missing logout_token with 400", async () => {
        const res = await request
          .post("/api/backchannel_logout")
          .type("form")
          .send("")
        expect(res.status).toBe(400)
        expect(res.body).toHaveProperty("error", "invalid_request")
      })

      it("rejects missing clientIdentifier on issue with 400", async () => {
        const res = await request
          .post("/api/backchannel_logout/issue")
          .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
          .send({ subject: "admin" })
        expect(res.status).toBe(400)
      })
    })

    // ── 19. DCR ────────────────────────────────────────────────────────

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
              grant_types: ["authorization_code"],
              response_types: ["code"],
              token_endpoint_auth_method: "client_secret_basic",
            }),
          })
        // Accept 201 (success) or 400 (DCR not enabled on service)
        if (res.status === 400) return
        expect(res.status).toBe(201)
        // T1-11 (2026-08-14): the body is **RFC 7591 §3.2.1's registration response**, not Authlete's
        // envelope with it nested in a `responseContent` string. A conforming client reads `client_id`
        // at the top level; it used to have to unwrap a vendor field to reach it.
        expect(res.body).toHaveProperty("client_id")
        expect(res.body).not.toHaveProperty("action")
        expect(res.body).not.toHaveProperty("resultCode")
        state.dcrClientId = res.body.client_id
        state.dcrToken = res.body.registration_access_token
        expect(state.dcrClientId).toBeTruthy()
        expect(state.dcrToken).toBeTruthy()
      })

      it("retrieves the registered client", async () => {
        if (!state.dcrClientId) return
        const res = await request
          .post("/api/client/dcr/get")
          .send({ token: state.dcrToken, clientId: state.dcrClientId })
        expect(res.status).toBe(200)
        // T1-11 applies to all four /api/client/dcr/* endpoints, not just register: the body is the
        // RFC 7592 client-information response, with no vendor envelope around it.
        expect(res.body).toHaveProperty("client_id")
        expect(res.body).not.toHaveProperty("action")
      })

      it("updates the registered client", async () => {
        if (!state.dcrClientId) return
        const res = await request
          .post("/api/client/dcr/update")
          .send({
            // RFC 7592 §2.2: the update request carries the **full** client metadata document, and
            // `client_id` must be inside it. Sending only the field being changed earns
            // `[A214301] The 'client_id' field must be present in the registration update request` —
            // this test had never sent a conformant update, and nobody saw it because e2e is not in CI.
            // Same REPLACE semantics as CU-W1: omitted members are not merged, they are reset.
            json: JSON.stringify({
              client_id: state.dcrClientId,
              client_name: "Updated E2E App",
              redirect_uris: [redirectUri],
              grant_types: ["authorization_code"],
              response_types: ["code"],
              token_endpoint_auth_method: "client_secret_basic",
            }),
            token: state.dcrToken,
            clientId: state.dcrClientId,
          })
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("client_id")
        expect(res.body).not.toHaveProperty("action")
        expect(res.body.client_name).toBe("Updated E2E App")
      })

      it("deletes the registered client", async () => {
        if (!state.dcrClientId) return
        const res = await request
          .post("/api/client/dcr/delete")
          .send({ token: state.dcrToken, clientId: state.dcrClientId })
        expect(res.status).toBe(204)
      })
    })

    // ── 20. CIBA ───────────────────────────────────────────────────────

    describeIf(hasConfidential)("CIBA (Client-Initiated Backchannel Authentication)", () => {
      // ── Happy path: authenticate → issue → complete → token ──────

      let happyAuthReqId = ""
      let happyTicket = ""

      it("sends backchannel authentication request", async () => {
        const res = await request
          .post("/api/ciba/authentication")
          // CIBA-W3 (2026-08-13): `ciba.service.ts` now picks the client-auth channel from how the
          // caller presented the credentials, matching `par.service.ts`. CID is CLIENT_SECRET_BASIC, so
          // body credentials are correctly refused with 401 [A157357] instead of being silently
          // converted onto the Basic channel. Present them the way the client is registered.
          .auth(process.env.CID!, process.env.SEC!)
          .send({
            parameters: "login_hint=admin&scope=openid",
          })
        expect([200, 400]).toContain(res.status)
        if (res.status === 200) {
          expect(res.body).toHaveProperty("action", "USER_IDENTIFICATION")
          expect(res.body).toHaveProperty("ticket")
          happyTicket = res.body.ticket
        }
      })

      it("issues auth_req_id from ticket", async () => {
        if (!happyTicket) return
        const res = await request
          .post("/api/ciba/issue")
          .send({ ticket: happyTicket })
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("action", "OK")
        expect(res.body).toHaveProperty("authReqId")
        happyAuthReqId = res.body.authReqId
      })

      it("completes authentication (AUTHORIZED)", async () => {
        if (!happyTicket) return
        const res = await request
          .post("/api/ciba/complete")
          .send({ ticket: happyTicket, result: "AUTHORIZED", subject: "admin" })
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("action")
      })

      it("exchanges auth_req_id for access token", async () => {
        if (!happyAuthReqId) return
        const res = await request
          .post("/api/token")
          .auth(process.env.CID!, process.env.SEC!)
          .type("form")
          .send({
            grant_type: "urn:openid:params:grant-type:ciba",
            auth_req_id: happyAuthReqId,
          })
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("access_token")
        expect(res.body.token_type).toBe("Bearer")
      })

      // ── Denied path: authenticate → issue → fail → poll token ────

      let deniedTicket = ""
      let deniedAuthReqId = ""

      it("sends backchannel authentication for denied flow", async () => {
        const res = await request
          .post("/api/ciba/authentication")
          // CIBA-W3 (2026-08-13): `ciba.service.ts` now picks the client-auth channel from how the
          // caller presented the credentials, matching `par.service.ts`. CID is CLIENT_SECRET_BASIC, so
          // body credentials are correctly refused with 401 [A157357] instead of being silently
          // converted onto the Basic channel. Present them the way the client is registered.
          .auth(process.env.CID!, process.env.SEC!)
          .send({
            parameters: "login_hint=admin&scope=openid",
          })
        expect([200, 400]).toContain(res.status)
        if (res.status === 200) {
          expect(res.body).toHaveProperty("ticket")
          deniedTicket = res.body.ticket
        }
      })

      it("issues auth_req_id for denied flow", async () => {
        if (!deniedTicket) return
        const res = await request
          .post("/api/ciba/issue")
          .send({ ticket: deniedTicket })
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("action", "OK")
        expect(res.body).toHaveProperty("authReqId")
        deniedAuthReqId = res.body.authReqId
      })

      it("fails authentication (ACCESS_DENIED) on denied ticket", async () => {
        if (!deniedTicket) return
        const res = await request
          .post("/api/ciba/fail")
          .send({ ticket: deniedTicket, reason: "ACCESS_DENIED" })
        expect(res.status).toBe(403)
        expect(res.body).toHaveProperty("action", "FORBIDDEN")
      })

      it("polling token endpoint with denied auth_req_id returns error", async () => {
        if (!deniedAuthReqId) return
        const res = await request
          .post("/api/token")
          .auth(process.env.CID!, process.env.SEC!)
          .type("form")
          .send({
            grant_type: "urn:openid:params:grant-type:ciba",
            auth_req_id: deniedAuthReqId,
          })
        // Authlete returns 400 with access_denied for denied auth_req_id
        expect(res.status).toBe(400)
      })
    })

    // ── 21. JWT Bearer Grant ────────────────────────────────────────────

    describeIf(hasConfidential)("JWT Bearer Grant (RFC 7523)", () => {
      let jwtAssertion = ""

      beforeAll(async () => {
        const { generateKeyPair, exportJWK, SignJWT } = await import("jose")
        const crypto = await import("node:crypto")

        // Generate ES256 key pair and register public JWK with the client
        const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true })
        const kid = "e2e-test-key"
        const jwk = { ...(await exportJWK(publicKey)), kid, use: "sig", alg: "ES256" }
        const jwksStr = JSON.stringify({ keys: [jwk] })

        const BT = process.env.AUTHLETE_BEARER_TOKEN
        const baseUrl = process.env.AUTHLETE_BASE_URL
        const svcId = process.env.AUTHLETE_SERVICE_ID
        const cid = process.env.CID

        // Read full client, merge JWK, write back (API replaces, not merges)
        const getRes = await fetch(`${baseUrl}/api/${svcId}/client/get/${cid}`, {
          headers: { Authorization: `Bearer ${BT}` },
        })
        const client = await getRes.json()
        const keep = [
          "clientId", "clientIdAlias", "clientIdAliasEnabled", "clientType",
          "clientSecret", "clientName", "subjectType", "idTokenSignAlg",
          "tokenAuthMethod", "grantTypes", "redirectUris", "responseTypes",
          "applicationType", "scopes", "defaultMaxAge", "authTimeRequired",
          "extension", "tlsClientCertificateBoundAccessTokens",
          "bcUserCodeRequired", "dynamicallyRegistered", "parRequired",
          "requestObjectRequired", "frontChannelRequestObjectEncryptionRequired",
          "requestObjectEncryptionAlgMatchRequired",
          "requestObjectEncryptionEncMatchRequired",
          "singleAccessTokenPerSubject", "pkceRequired", "pkceS256Required",
          "rsRequestSigned", "dpopRequired", "locked", "responseModes",
          "mtlsEndpointAliasesUsed", "inScopeForTokenMigration",
          "trustChainExpiresAt", "trustChainUpdatedAt",
          "clientRegistrationTypes", "automaticallyRegistered",
          "explicitlyRegistered", "credentialResponseEncryptionRequired",
          "metadataDocumentExpiresAt", "metadataDocumentUpdatedAt",
          "discoveredByMetadataDocument", "clientSource",
          "backchannelLogoutSessionRequired",
        ]
        const payload: Record<string, unknown> = {}
        for (const key of keep) {
          if (client[key] !== undefined) payload[key] = client[key]
        }
        payload.jwks = jwksStr
        // remove clientId from body (it's in the URL path)
        delete payload.clientId

        const updateRes = await fetch(`${baseUrl}/api/${svcId}/client/update/${cid}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${BT}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!updateRes.ok) {
          const log = console.warn || console.log
          log(`JWK registration for JWT Bearer test failed: ${updateRes.status}`)
        }

        // Create signed JWT assertion
        const now = Math.floor(Date.now() / 1000)
        jwtAssertion = await new SignJWT({
          iss: cid,
          sub: "admin",
          aud: baseUrl,
          iat: now,
          exp: now + 300,
          jti: crypto.randomUUID(),
        })
          .setProtectedHeader({ alg: "ES256", kid })
          .sign(privateKey)
      })

      afterAll(async () => {
        // Clean up: restore client without the test JWK
        const BT = process.env.AUTHLETE_BEARER_TOKEN
        const baseUrl = process.env.AUTHLETE_BASE_URL
        const svcId = process.env.AUTHLETE_SERVICE_ID
        const cid = process.env.CID
        try {
          const getRes = await fetch(`${baseUrl}/api/${svcId}/client/get/${cid}`, {
            headers: { Authorization: `Bearer ${BT}` },
          })
          const client = await getRes.json()
          const keep = [
            "clientId", "clientIdAlias", "clientIdAliasEnabled", "clientType",
            "clientSecret", "clientName", "subjectType", "idTokenSignAlg",
            "tokenAuthMethod", "grantTypes", "redirectUris", "responseTypes",
            "applicationType", "scopes", "defaultMaxAge", "authTimeRequired",
            "extension", "tlsClientCertificateBoundAccessTokens",
            "bcUserCodeRequired", "dynamicallyRegistered", "parRequired",
            "requestObjectRequired", "frontChannelRequestObjectEncryptionRequired",
            "requestObjectEncryptionAlgMatchRequired",
            "requestObjectEncryptionEncMatchRequired",
            "singleAccessTokenPerSubject", "pkceRequired", "pkceS256Required",
            "rsRequestSigned", "dpopRequired", "locked", "responseModes",
            "mtlsEndpointAliasesUsed", "inScopeForTokenMigration",
            "trustChainExpiresAt", "trustChainUpdatedAt",
            "clientRegistrationTypes", "automaticallyRegistered",
            "explicitlyRegistered", "credentialResponseEncryptionRequired",
            "metadataDocumentExpiresAt", "metadataDocumentUpdatedAt",
            "discoveredByMetadataDocument", "clientSource",
            "backchannelLogoutSessionRequired",
          ]
          const payload: Record<string, unknown> = {}
          for (const key of keep) {
            if (client[key] !== undefined) payload[key] = client[key]
          }
          payload.jwks = ""
          delete payload.clientId
          await fetch(`${baseUrl}/api/${svcId}/client/update/${cid}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${BT}`, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        } catch {
          // cleanup failure is non-critical
        }
      })

      it("exchanges JWT assertion for an access token", async () => {
        if (!jwtAssertion) return
        const res = await request
          .post("/api/token")
          .type("form")
          .send({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: jwtAssertion,
            client_id: process.env.CID,
          })
        // Accept 200, 400, or 429 (400 if client not configured, 429 rate limit)
        expect([200, 400, 429]).toContain(res.status)
        if (res.status === 200) {
          expect(res.body).toHaveProperty("access_token")
          expect(res.body.token_type).toBe("Bearer")
        }
      })
    })

    // ── 22. Token Exchange ──────────────────────────────────────────────

    describeIf(hasConfidential)("Token Exchange (RFC 8693)", () => {
      it("exchanges an access token for a new access token", async () => {
        const subjectToken = state.ccAccessToken || resolveToken()
        if (!subjectToken) return
        const res = await request
          .post("/api/token")
          .auth(process.env.CID!, process.env.SEC!)
          .type("form")
          .send({
            grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
            subject_token: subjectToken,
            subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
            scope: "openid",
          })
        // Accept 200, 400, or 429 (400 if token exchange not permitted, 429 rate limit)
        expect([200, 400, 429]).toContain(res.status)
        if (res.status === 200) {
          expect(res.body).toHaveProperty("access_token")
          expect(res.body.token_type).toBe("Bearer")
          expect(res.body).toHaveProperty("subject")
        }
      })
    })

    // ── 23. Device Flow ─────────────────────────────────────────────────

    describeIf(hasConfidential)("Device Flow (RFC 8628)", () => {
      let deviceCode = ""
      let userCode = ""

      it("authorizes device and returns device_code and user_code", async () => {
        const res = await request
          .post("/api/device/authorization")
          .send({
            parameters: `client_id=${process.env.CID}&scope=openid`,
            clientId: process.env.CID,
            clientSecret: process.env.SEC,
          })
        expect([200, 400]).toContain(res.status)
        if (res.status === 200) {
          // T1-11 (2026-08-14): exactly RFC 8628 §3.2's snake_case body, not Authlete's envelope with
          // camelCase names beside an `action`. Probe-confirmed as 8628-W6.
          expect(res.body).toHaveProperty("device_code")
          expect(res.body).toHaveProperty("user_code")
          expect(res.body).toHaveProperty("verification_uri")
          expect(res.body).toHaveProperty("expires_in")
          expect(res.body).not.toHaveProperty("action")
          deviceCode = res.body.device_code
          userCode = res.body.user_code
        }
      })

      it("verifies user_code (returns VALID)", async () => {
        if (!userCode) return
        const res = await request
          .post("/api/device/verification")
          .send({ userCode })
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("action", "VALID")
        expect(res.body).toHaveProperty("clientName")
        expect(res.body).toHaveProperty("scopes")
      })

      // This pair drives approval through the **unauthenticated** `POST /api/device/complete`, which has
      // been development-only since 2026-08-10 — outside development the gate answers 404 and the device
      // code is never authorized, so the exchange below has nothing to redeem. Vitest sets
      // NODE_ENV=test, so both are skipped rather than asserted against a gate that is doing its job;
      // the gate itself is pinned by "complete is development-only and 404s outside development" above.
      //
      // The production-safe path is `POST /device/consent`, which authenticates the user first. Driving
      // it needs a browser leg (login + CSRF) — see Module 02's device-flow lab, and
      // `tests/unit/routes/device.routes.test.ts`, which covers the route with its middleware chain.
      const itInDevelopment = process.env.NODE_ENV === "development" ? it : it.skip

      itInDevelopment("completes device flow with AUTHORIZED result", async () => {
        if (!userCode) return
        const res = await request
          .post("/api/device/complete")
          .send({ userCode, result: "AUTHORIZED", subject: "admin" })
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("action", "SUCCESS")
      })

      itInDevelopment("exchanges device_code for access token", async () => {
        if (!deviceCode) return
        const res = await request
          .post("/api/token")
          .auth(process.env.CID!, process.env.SEC!)
          .type("form")
          .send({
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            device_code: deviceCode,
          })
        // Accept 200 or 429 (Authlete rate limit)
        expect([200, 429]).toContain(res.status)
        if (res.status === 200) {
          expect(res.body).toHaveProperty("access_token")
          expect(res.body.token_type).toBe("Bearer")
        }
      })

      // ── Error cases ─────────────────────────────────────────────────

      it("rejects device authorization with missing parameters", async () => {
        const res = await request
          .post("/api/device/authorization")
          .send({})
        expect(res.status).toBe(400)
        expect(res.body).toHaveProperty("error", "invalid_request")
      })

      it("verification returns 404 for non-existent user_code", async () => {
        const res = await request
          .post("/api/device/verification")
          .send({ userCode: "NONEXISTENT" })
        expect(res.status).toBe(404)
        expect(res.body).toHaveProperty("action", "NOT_EXIST")
      })

      // `POST /api/device/complete` approves a pending device authorization **as any subject the caller
      // names**, with no authentication of that subject — a token-minting oracle for anyone who can read
      // a user code off a screen (RFC 8628 §5.5). Since 2026-08-10 it is development-only and answers a
      // flat 404 anywhere else, deliberately not 401/403, so a deployed instance does not reveal that
      // the endpoint exists. Vitest sets NODE_ENV=test, so these assert the gate, which is the more
      // valuable property. The authenticated path, `POST /device/consent`, works in every environment.
      it("complete is development-only and 404s outside development", async () => {
        const res = await request
          .post("/api/device/complete")
          .send({ userCode: "NONEXISTENT", result: "AUTHORIZED", subject: "admin" })
        expect(res.status).toBe(404)
        expect(res.body).toEqual({ error: "not_found" })
      })

      it("complete with ACCESS_DENIED is also behind the development-only gate", async () => {
        // Create a fresh device authorization to deny
        const authRes = await request
          .post("/api/device/authorization")
          .send({
            parameters: `client_id=${process.env.CID}&scope=openid`,
            clientId: process.env.CID,
            clientSecret: process.env.SEC,
          })
        expect([200, 400]).toContain(authRes.status)
        if (authRes.status !== 200) return

        const res = await request
          .post("/api/device/complete")
          .send({
            userCode: authRes.body.user_code,
            result: "ACCESS_DENIED",
            subject: "admin",
          })
        // In development this records the denial and answers SUCCESS — `ACCESS_DENIED` is a request
        // `result`, not a response action, and the device learns of it as `access_denied` on its next
        // token poll. Outside development the gate answers 404 first, which is what runs here.
        expect([200, 404]).toContain(res.status)
        if (res.status === 200) {
          expect(res.body).toHaveProperty("action", "SUCCESS")
        } else {
          expect(res.body).toEqual({ error: "not_found" })
        }
      })

      it("token exchange rejects invalid device_code", async () => {
        const res = await request
          .post("/api/token")
          .auth(process.env.CID!, process.env.SEC!)
          .type("form")
          .send({
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            device_code: "INVALID_DEVICE_CODE",
          })
        // Authlete returns 400 for invalid device codes (or 429 rate limit)
        expect([400, 429]).toContain(res.status)
      })

      // ── Browser flow ────────────────────────────────────────────────

      let browserDeviceCode = ""
      let browserUserCode = ""

      it("creates a device code for browser flow", async () => {
        const res = await request
          .post("/api/device/authorization")
          .send({
            parameters: `client_id=${process.env.CID}&scope=openid`,
            clientId: process.env.CID,
            clientSecret: process.env.SEC,
          })
        expect([200, 400]).toContain(res.status)
        if (res.status !== 200) return
        browserDeviceCode = res.body.deviceCode
        browserUserCode = res.body.userCode
      })

      it("serves device verification form with CSRF token", async () => {
        const res = await agent.get("/device")
        expect(res.status).toBe(200)
        expect(res.text).toMatch(/Device Verification/)
        expect(res.text).toMatch(csrfPattern())
      })

      it("submits user_code via form and shows consent page", async () => {
        if (!browserUserCode) return
        const csrf = await getCsrfToken(agent, "/device")
        const res = await agent
          .post("/device")
          .type("form")
          .send(`_csrf=${csrf}&user_code=${browserUserCode}`)
        expect(res.status).toBe(200)
        expect(res.text).toMatch(/is requesting access/)
        // Case-insensitive: partials/scope-list.ejs title-cases the scope name for display
        // ("openid" -> "Openid") and its description text never repeats the raw name, so a
        // case-sensitive /openid/ can never match the rendered consent page.
        expect(res.text).toMatch(/openid/i)
      })

      it("authenticates user and authorizes device via consent form", async () => {
        if (!browserUserCode) return
        const csrf = await getCsrfToken(agent, "/device")
        const res = await agent
          .post("/device/consent")
          .type("form")
          .send(`_csrf=${csrf}&user_code=${browserUserCode}&username=admin&password=password&result=AUTHORIZED`)
        expect(res.status).toBe(200)
        expect(res.text).toMatch(/Authorization successful/)
      })

      it("exchanges browser-authorized device_code for access token", async () => {
        if (!browserDeviceCode) return
        const res = await request
          .post("/api/token")
          .auth(process.env.CID!, process.env.SEC!)
          .type("form")
          .send({
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            device_code: browserDeviceCode,
          })
        // Accept 200 or 429 (Authlete rate limit)
        expect([200, 429]).toContain(res.status)
        if (res.status === 200) {
          expect(res.body).toHaveProperty("access_token")
        }
      })
    })

    // ── 24. Client Management ─────────────────────────────────────────

    describeIf(hasManagement)("Client Management (CRUD + Secret Ops)", () => {
      const cmName = `CM E2E ${Date.now()}`
      const cmRedirectUri = process.env.REDIR || "http://localhost:3000"

      it("lists existing clients", async () => {
        const res = await request
          .get("/api/client/list")
          .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("clients")
        expect(Array.isArray(res.body.clients)).toBe(true)
      })

      it("creates a new client", async () => {
        const res = await request
          .post("/api/client/create")
          .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
          .send({
            client: {
              clientName: cmName,
              redirectUris: [cmRedirectUri],
              grantTypes: ["AUTHORIZATION_CODE", "REFRESH_TOKEN"],
              responseTypes: ["CODE"],
              tokenAuthMethod: "CLIENT_SECRET_BASIC",
              clientType: "CONFIDENTIAL",
            },
          })
        expect(res.status).toBe(201)
        expect(res.body).toHaveProperty("clientId")
        state.cmClientId = String(res.body.clientId)
      })

      it("retrieves the created client", async () => {
        if (!state.cmClientId) return
        const res = await request
          .get(`/api/client/get/${state.cmClientId}`)
          .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("clientId", Number(state.cmClientId))
      })

      it("updates the client name", async () => {
        if (!state.cmClientId) return
        const res = await request
          .patch(`/api/client/update/${state.cmClientId}`)
          .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
          .send({ client: { clientName: `${cmName} (updated)` } })
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("clientId")
      })

      it("refreshes the client secret", async () => {
        if (!state.cmClientId) return
        const res = await request
          .post(`/api/client/secret/refresh/${state.cmClientId}`)
          .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("newClientSecret")
      })

      it("updates the client secret to a known value", async () => {
        if (!state.cmClientId) return
        const res = await request
          .put(`/api/client/secret/update/${state.cmClientId}`)
          .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
          .send({ clientSecret: "e2e-test-new-secret-123" })
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty("newClientSecret", "e2e-test-new-secret-123")
      })

      it("deletes the client", async () => {
        if (!state.cmClientId) return
        const res = await request
          .delete(`/api/client/delete/${state.cmClientId}`)
          .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
        expect(res.status).toBe(204)
      })
    })

    // ── 25. Client Authentication Methods ────────────────────────────────

    describeIf(hasManagement)("Client Authentication Methods", () => {
      // ── client_secret_post ──
      describe("client_secret_post (RFC 6749 §2.3.1)", () => {
        let cspId = ""
        let cspSecret = ""

        it("creates a CLIENT_SECRET_POST client", async () => {
          const res = await request
            .post("/api/client/create")
            .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
            .send({
              client: {
                clientName: `CSP E2E ${Date.now()}`,
                redirectUris: [process.env.REDIR || "http://localhost:3000"],
                grantTypes: ["CLIENT_CREDENTIALS"],
                tokenAuthMethod: "CLIENT_SECRET_POST",
                clientType: "CONFIDENTIAL",
              },
            })
          expect(res.status).toBe(201)
          expect(res.body).toHaveProperty("clientId")
          expect(res.body).toHaveProperty("clientSecret")
          cspId = String(res.body.clientId)
          cspSecret = res.body.clientSecret
        })

        it("exchanges credentials via body auth (client_secret_post)", async () => {
          if (!cspId) return
          const res = await request
            .post("/api/token")
            .type("form")
            .send({
              grant_type: "client_credentials",
              client_id: cspId,
              client_secret: cspSecret,
            })
          expect([200, 429]).toContain(res.status)
          if (res.status === 200) {
            expect(res.body).toHaveProperty("access_token")
            expect(res.body.token_type).toBe("Bearer")
          }
        })

        it("deletes the CLIENT_SECRET_POST client", async () => {
          if (!cspId) return
          await request
            .delete(`/api/client/delete/${cspId}`)
            .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
        })
      })

      // ── private_key_jwt ──
      describe("private_key_jwt (RFC 7523 §2.1)", () => {
        let pkjId = ""
        let jwtAssertion = ""

        beforeAll(async () => {
          const { generateKeyPair, exportJWK, SignJWT } = await import("jose")
          const crypto = await import("node:crypto")

          const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true })
          const kid = "pkj-e2e-key"
          const jwk = { ...(await exportJWK(publicKey)), kid, use: "sig", alg: "ES256" }

          // Create client with PRIVATE_KEY_JWT auth method + JWKS
          const res = await request
            .post("/api/client/create")
            .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
            .send({
              client: {
                clientName: `PKJ E2E ${Date.now()}`,
                redirectUris: [process.env.REDIR || "http://localhost:3000"],
                grantTypes: ["CLIENT_CREDENTIALS"],
                tokenAuthMethod: "PRIVATE_KEY_JWT",
                tokenAuthSignAlg: "ES256",
                clientType: "CONFIDENTIAL",
                jwks: JSON.stringify({ keys: [jwk] }),
              },
            })
          if (res.status !== 201) return
          pkjId = String(res.body.clientId)

          // Sign client assertion JWT — aud = Authlete token endpoint
          const baseUrl = process.env.AUTHLETE_BASE_URL!
          const svcId = process.env.AUTHLETE_SERVICE_ID!
          const now = Math.floor(Date.now() / 1000)
          jwtAssertion = await new SignJWT({
            iss: pkjId,
            sub: pkjId,
            aud: `${baseUrl}/api/${svcId}/token`,
            iat: now,
            exp: now + 300,
            jti: crypto.randomUUID(),
          })
            .setProtectedHeader({ alg: "ES256", kid })
            .sign(privateKey)
        })

        afterAll(async () => {
          if (!pkjId) return
          try {
            await request
              .delete(`/api/client/delete/${pkjId}`)
              .auth(process.env.MGMT_CLIENT_ID!, process.env.MGMT_CLIENT_SECRET!)
          } catch { /* cleanup failure non-critical */ }
        })

        it("exchanges credentials via private_key_jwt client auth", async () => {
          if (!jwtAssertion) return
          const res = await request
            .post("/api/token")
            .type("form")
            .send({
              grant_type: "client_credentials",
              client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
              client_assertion: jwtAssertion,
            })
          // Accept 200, 400, or 429 (200=success, 400=aud mismatch, 429=rate limit)
          expect([200, 400, 429]).toContain(res.status)
          if (res.status === 200) {
            expect(res.body).toHaveProperty("access_token")
            expect(res.body.token_type).toBe("Bearer")
          }
        })
      })

      // ── none (public client) ──
      // The public client (tokenAuthMethod: "NONE") is already tested by the
      // PKCE E2E test above — that test uses PUB_CID with no client_secret.
      // Here we verify that client_credentials is rejected for public clients.
      describeIf(hasPublic)("none (public client, RFC 6749 §2.3.1)", () => {
        it("rejects client_credentials for public client (no auth)", async () => {
          const res = await request
            .post("/api/token")
            .type("form")
            .send({
              grant_type: "client_credentials",
              client_id: process.env.PUB_CID,
            })
          // Public clients can't authenticate for client_credentials
          expect(res.status).toBe(400)
          expect(res.body).toHaveProperty("error")
        })
      })
    })

    // ── 26. PAR ────────────────────────────────────────────────────────

    describeIf(hasConfidential)("PAR — Pushed Authorization Requests (RFC 9126)", () => {
      const redirectUri = process.env.REDIR || "http://localhost:3000"

      // CID is a client_secret_basic client, so credentials go in the Authorization header —
      // same as the token-endpoint tests. Authlete rejects a client_secret_basic client whose
      // credentials arrive inside `parameters` with 401 [A157357].
      it("pushes an authorization request", async () => {
        const res = await request
          .post("/api/par")
          .auth(process.env.CID!, process.env.SEC!)
          .send({
            parameters: `response_type=code&client_id=${process.env.CID}&redirect_uri=${redirectUri}&scope=openid%20profile&state=par_test`,
          })
        // Accept 201 or 429 (Authlete rate limit)
        expect([201, 429]).toContain(res.status)
        if (res.status === 201) {
          // T1-11 (2026-08-14): exactly RFC 9126 §2.2's body — `{"expires_in":…,"request_uri":"urn:…"}` —
          // not the envelope with a camelCase `requestUri` beside an `action` and a `resultCode`.
          expect(res.body).toHaveProperty("request_uri")
          expect(res.body).toHaveProperty("expires_in")
          expect(res.body).not.toHaveProperty("action")
          expect(String(res.body.request_uri)).toMatch(/^urn:/)
        }
      })

      it("rejects empty parameters with 400", async () => {
        const res = await request.post("/api/par").send({})
        // Accept 400 or 429 (Authlete rate limit)
        expect([400, 429]).toContain(res.status)
      })

      it("full PAR flow: push → authorize → login → consent → code → token", async () => {
        const pushRes = await request
          .post("/api/par")
          .auth(process.env.CID!, process.env.SEC!)
          .send({
            parameters: `response_type=code&client_id=${process.env.CID}&redirect_uri=${redirectUri}&scope=openid%20profile%20email&state=par_full_flow`,
          })
        // Accept 201 or 429 (Authlete rate limit)
        expect([201, 429]).toContain(pushRes.status)
        if (pushRes.status !== 201) return
        expect(pushRes.body).toHaveProperty("request_uri")   // RFC 9126 §2.2, not the vendor envelope
        const requestUri = pushRes.body.request_uri as string
        expect(requestUri).toBeTruthy()

        const parAgent = supertest.agent(app)
        const authRes = await parAgent
          .get("/api/authorization")
          .query({
            client_id: process.env.CID,
            request_uri: requestUri,
          })
          .redirects(0)
        expect(authRes.status).toBe(303)
        const loginUrl = authRes.headers.location as string

        const csrf = await getCsrfToken(parAgent, loginUrl)
        const loginRes = await parAgent
          .post("/api/session/login")
          .type("form")
          .send(`_csrf=${csrf}&username=admin&password=password&login=submit`)
          .redirects(0)
        expect(loginRes.status).toBe(303)
        const consentUrl = loginRes.headers.location as string
        expect(consentUrl).toContain("/api/session/consent")

        const consentCsrf = await getCsrfToken(parAgent, consentUrl)
        const consentRes = await parAgent
          .post("/api/session/consent")
          .type("form")
          .send(`_csrf=${consentCsrf}&decision=approve`)
          .redirects(0)
        expect(consentRes.status).toBe(303)
        const location = consentRes.headers.location as string
        expect(location).toContain("code=")
        const code = new URL(location).searchParams.get("code") || ""
        expect(code).toBeTruthy()

        const tokenRes = await request
          .post("/api/token")
          .auth(process.env.CID!, process.env.SEC!)
          .type("form")
          .send({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
          })
        expect(tokenRes.status).toBe(200)
        expect(tokenRes.body).toHaveProperty("access_token")
        expect(tokenRes.body.token_type).toBe("Bearer")
      })
    })

    // ── Prometheus Metrics ──────────────────────────────────────────

    describe("Prometheus Metrics", () => {
      it("exposes metrics at /api/metrics", async () => {
        const res = await request.get("/api/metrics")
        expect(res.status).toBe(200)
        expect(res.headers["content-type"]).toContain("text/plain")
        expect(res.text).toContain("http_requests_total")
      })

      it("exposes metrics at /metrics", async () => {
        const res = await request.get("/metrics")
        expect(res.status).toBe(200)
        expect(res.text).toContain("http_request_duration_seconds")
      })
    })

  })
}