import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { generateKeyPairSync } from "node:crypto"
import jwt from "jsonwebtoken"
import { BackchannelLogoutService } from "../../../src/services/backchannel-logout.service"
import {
  isAllowedPostLogoutRedirectUri,
  registeredPostLogoutRedirectUris,
  rpInitiatedLogoutService,
} from "../../../src/services/logout.service"

describe("rpInitiatedLogoutService", () => {
  let service: rpInitiatedLogoutService
  let mockBclService: BackchannelLogoutService

  beforeEach(() => {
    mockBclService = new BackchannelLogoutService({
      baseUrl: "https://authlete.example.com",
      serviceId: "svc-1",
      AccessToken: "tok-1",
    })
    vi.spyOn(mockBclService, "issueAndDeliverToAll").mockResolvedValue([])
    service = new rpInitiatedLogoutService(mockBclService)

    // RPL-W1: the redirect decision now reads the identified client's registered set and nothing else, so
    // every test that expects a 302 has to name a client and register the target.
    process.env.POST_LOGOUT_REDIRECT_URIS = JSON.stringify({
      "client-abc": [
        "http://localhost:3000/callback",
        "http://localhost:3000/bye",
        "http://localhost:3000/from-body",
        "http://localhost:3000/from-query",
      ],
    })
  })

  afterEach(() => {
    delete process.env.POST_LOGOUT_REDIRECT_URIS
  })

  it("destroys session and clears cookie on logout", async () => {
    const req = {
      session: {
        user: "admin",
        destroy: vi.fn((cb) => cb(null)),
      },
      query: {},
    } as any
    const res = {
      clearCookie: vi.fn(),
      render: vi.fn(),
    } as any

    await service.rpInitiatedLogout(req, res)

    expect(req.session.destroy).toHaveBeenCalled()
    expect(res.clearCookie).toHaveBeenCalledWith("connect.sid", { path: "/" })
    expect(res.render).toHaveBeenCalledWith("logout", expect.any(Object))
  })

  it("redirects to post_logout_redirect_uri when valid", async () => {
    const req = {
      session: {
        user: "admin",
        destroy: vi.fn((cb) => cb(null)),
      },
      query: { post_logout_redirect_uri: "http://localhost:3000/callback", client_id: "client-abc" },
    } as any
    const res = {
      clearCookie: vi.fn(),
      redirect: vi.fn(),
    } as any

    await service.rpInitiatedLogout(req, res)

    expect(res.redirect).toHaveBeenCalledWith("http://localhost:3000/callback")
  })

  it("fires backchannel logout when backchannel=true", async () => {
    const req = {
      session: {
        user: "admin",
        destroy: vi.fn((cb) => cb(null)),
      },
      query: { backchannel: "true" },
    } as any
    const res = {
      clearCookie: vi.fn(),
      render: vi.fn(),
    } as any

    await service.rpInitiatedLogout(req, res)

    expect(mockBclService.issueAndDeliverToAll).toHaveBeenCalledWith("admin")
  })

  // Regression: the open redirect verified live before 2026-08-10. `startsWith` matching let an attacker's
  // host pass by carrying an allowed origin as a prefix or as userinfo. These MUST render, never redirect.
  // See RP-Initiated Logout 1.0 §3 and audit/02-findings/OIDC-RP-INITIATED-LOGOUT-1.0.md F-1.
  it.each([
    ["allowed-origin as a subdomain prefix", "http://localhost:3000.evil.example.com/bye"],
    ["allowed-origin as userinfo before @", "http://localhost:3001@evil.example.com/"],
    ["allowed host as a domain prefix", "https://app.example.com.evil.net/"],
    ["a non-http scheme", "javascript:alert(1)"],
    ["a scheme-relative URL", "//evil.example.com"],
    ["an unparseable value", "not a url at all"],
  ])("refuses to redirect for %s", async (_label, uri) => {
    const req = {
      session: { user: "admin", destroy: vi.fn((cb) => cb(null)) },
      // A real client with a real registered set: these are refused because they are not in it, not
      // because there was nothing to match against.
      query: { post_logout_redirect_uri: uri, client_id: "client-abc" },
    } as any
    const res = { clearCookie: vi.fn(), render: vi.fn(), redirect: vi.fn() } as any

    await service.rpInitiatedLogout(req, res)

    expect(res.redirect).not.toHaveBeenCalled()
    expect(res.render).toHaveBeenCalledWith("logout", expect.any(Object))
  })

  // RPL-W3 / T0-3. RP-Initiated Logout §2 requires the OP to ask before ending the session. `showConfirmation`
  // is the whole of `GET /api/logout` and must do nothing else — the GET used to destroy the session, deliver
  // back-channel logout tokens and redirect, all on a bare request with no middleware.
  // See audit/02-findings/OIDC-RP-INITIATED-LOGOUT-1.0.md F-2.
  describe("showConfirmation", () => {
    const confirmReq = (query: Record<string, string>, user?: string) =>
      ({
        session: { user, destroy: vi.fn((cb: (e: unknown) => void) => cb(null)) },
        query,
      }) as any

    it("renders the confirmation page without destroying, delivering or redirecting", async () => {
      const req = confirmReq({ post_logout_redirect_uri: "http://localhost:3000/bye" }, "admin")
      const res = { clearCookie: vi.fn(), render: vi.fn(), redirect: vi.fn() } as any

      await service.showConfirmation(req, res)

      expect(req.session.destroy).not.toHaveBeenCalled()
      expect(res.clearCookie).not.toHaveBeenCalled()
      expect(res.redirect).not.toHaveBeenCalled()
      expect(mockBclService.issueAndDeliverToAll).not.toHaveBeenCalled()
      expect(res.render).toHaveBeenCalledWith("logout-confirm", expect.any(Object))
    })

    it("does not deliver back-channel logout even when backchannel=true is asked for", async () => {
      const res = { clearCookie: vi.fn(), render: vi.fn(), redirect: vi.fn() } as any

      await service.showConfirmation(confirmReq({ backchannel: "true" }, "admin"), res)

      expect(mockBclService.issueAndDeliverToAll).not.toHaveBeenCalled()
      // ...but it is replayed to the POST, which is what actually delivers.
      expect(res.render).toHaveBeenCalledWith(
        "logout-confirm",
        expect.objectContaining({ backchannel: "true" })
      )
    })

    it("offers the destination only when the redirect check would honour it", async () => {
      const allowed = { clearCookie: vi.fn(), render: vi.fn() } as any
      const refused = { clearCookie: vi.fn(), render: vi.fn() } as any

      await service.showConfirmation(
        confirmReq({ post_logout_redirect_uri: "http://localhost:3000/bye", client_id: "client-abc" }),
        allowed
      )
      await service.showConfirmation(
        confirmReq({ post_logout_redirect_uri: "https://evil.example.com/bye", client_id: "client-abc" }),
        refused
      )

      expect(allowed.render).toHaveBeenCalledWith(
        "logout-confirm",
        expect.objectContaining({ redirectShown: "http://localhost:3000/bye" })
      )
      // The value is still replayed as a hidden field — it is only kept off the visible page.
      expect(refused.render).toHaveBeenCalledWith(
        "logout-confirm",
        expect.objectContaining({
          redirectShown: null,
          post_logout_redirect_uri: "https://evil.example.com/bye",
        })
      )
    })
  })

  // The confirmation form submits its parameters in the body, so the POST must read them there. §2 blesses
  // both GET and POST for a logout request; the query string is still read for callers that use it.
  describe("parameters arriving in the request body", () => {
    it("redirects on a body-supplied post_logout_redirect_uri exactly as it does for a query one", async () => {
      const req = {
        session: { user: "admin", destroy: vi.fn((cb: (e: unknown) => void) => cb(null)) },
        query: {},
        body: { post_logout_redirect_uri: "http://localhost:3000/callback", state: "xyz", client_id: "client-abc" },
      } as any
      const res = { clearCookie: vi.fn(), redirect: vi.fn() } as any

      await service.rpInitiatedLogout(req, res)

      expect(res.redirect).toHaveBeenCalledWith("http://localhost:3000/callback?state=xyz")
    })

    it("prefers the body over the query when both carry the same parameter", async () => {
      const req = {
        session: { user: "admin", destroy: vi.fn((cb: (e: unknown) => void) => cb(null)) },
        query: { post_logout_redirect_uri: "http://localhost:3000/from-query", client_id: "client-abc" },
        body: { post_logout_redirect_uri: "http://localhost:3000/from-body" },
      } as any
      const res = { clearCookie: vi.fn(), redirect: vi.fn() } as any

      await service.rpInitiatedLogout(req, res)

      expect(res.redirect).toHaveBeenCalledWith("http://localhost:3000/from-body")
    })

    it("treats an empty value as absent, as the previous req.query read did", async () => {
      const req = {
        session: { user: "admin", destroy: vi.fn((cb: (e: unknown) => void) => cb(null)) },
        query: {},
        body: { post_logout_redirect_uri: "", state: "" },
      } as any
      const res = { clearCookie: vi.fn(), render: vi.fn(), redirect: vi.fn() } as any

      await service.rpInitiatedLogout(req, res)

      expect(res.redirect).not.toHaveBeenCalled()
      expect(res.render).toHaveBeenCalledWith("logout", expect.any(Object))
    })
  })

  // RPL-W2 / T0-2. `id_token_hint` used to be `jwt.decode`d and its `sub` trusted, and that subject drives
  // back-channel delivery — so a forged hint was a remote forced-logout primitive against any user. It was
  // inert only because no client had registered a `backchannel_logout_uri`.
  // See audit/02-findings/OIDC-RP-INITIATED-LOGOUT-1.0.md F-3.
  describe("id_token_hint verification", () => {
    const opKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
    const material = {
      jwks: [{ ...(opKey.publicKey.export({ format: "jwk" }) as object), kid: "k1", alg: "ES256" }],
      issuer: "https://op.example.com",
    }
    const hintService = (m = material) =>
      new rpInitiatedLogoutService(mockBclService, async () => m as any)

    const run = async (query: Record<string, string>, m = material) => {
      const req = {
        // No session user, so the hint is the only route to a subject.
        session: { destroy: vi.fn((cb: (e: unknown) => void) => cb(null)) },
        query,
      } as any
      const res = { clearCookie: vi.fn(), render: vi.fn(), redirect: vi.fn() } as any
      await hintService(m).rpInitiatedLogout(req, res)
      return { req, res }
    }

    const genuineHint = (over: Record<string, unknown> = {}) =>
      jwt.sign(
        { iss: material.issuer, aud: "client-abc", sub: "victim", ...over },
        opKey.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
        { algorithm: "ES256", keyid: "k1" }
      )

    it("does NOT fire backchannel logout for a forged alg:none hint", async () => {
      const forged = jwt.sign({ iss: material.issuer, aud: "client-abc", sub: "victim" }, "", {
        algorithm: "none",
      })

      const { res } = await run({ backchannel: "true", id_token_hint: forged, client_id: "client-abc" })

      expect(mockBclService.issueAndDeliverToAll).not.toHaveBeenCalled()
      // Logout still completes — an unverifiable hint is not an error to the caller.
      expect(res.render).toHaveBeenCalledWith("logout", expect.objectContaining({ subject: "" }))
    })

    it("does not fire backchannel logout for a hint signed by a foreign key", async () => {
      const foreign = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
      const hint = jwt.sign(
        { iss: material.issuer, aud: "client-abc", sub: "victim" },
        foreign.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
        { algorithm: "ES256", keyid: "k1" }
      )

      await run({ backchannel: "true", id_token_hint: hint, client_id: "client-abc" })

      expect(mockBclService.issueAndDeliverToAll).not.toHaveBeenCalled()
    })

    it("fires backchannel logout for a genuine hint", async () => {
      await run({ backchannel: "true", id_token_hint: genuineHint(), client_id: "client-abc" })

      expect(mockBclService.issueAndDeliverToAll).toHaveBeenCalledWith("victim")
    })

    it("ignores a genuine hint whose aud is not the supplied client_id", async () => {
      const hint = genuineHint({ aud: "another-client" })

      await run({ backchannel: "true", id_token_hint: hint, client_id: "client-abc" })

      expect(mockBclService.issueAndDeliverToAll).not.toHaveBeenCalled()
    })

    it("prefers the session subject over the hint's", async () => {
      const req = {
        session: { user: "admin", destroy: vi.fn((cb: (e: unknown) => void) => cb(null)) },
        query: { backchannel: "true", id_token_hint: genuineHint({ sub: "victim" }), client_id: "client-abc" },
      } as any
      const res = { clearCookie: vi.fn(), render: vi.fn(), redirect: vi.fn() } as any

      await hintService().rpInitiatedLogout(req, res)

      expect(mockBclService.issueAndDeliverToAll).toHaveBeenCalledWith("admin")
    })

    // RPL-W1 / T0-4. §2 makes `client_id` OPTIONAL because the hint can name the RP, and §3's redirect
    // check needs that identity. This is the SPA's shape: a session cookie, a hint, and no `client_id`.
    it("identifies the client from a verified hint's aud when client_id is absent", async () => {
      process.env.POST_LOGOUT_REDIRECT_URIS = JSON.stringify({
        "client-abc": ["https://app.example.com/bye"],
      })
      const req = {
        session: { user: "admin", destroy: vi.fn((cb: (e: unknown) => void) => cb(null)) },
        query: {
          id_token_hint: genuineHint(),
          post_logout_redirect_uri: "https://app.example.com/bye",
        },
      } as any
      const res = { clearCookie: vi.fn(), render: vi.fn(), redirect: vi.fn() } as any

      await hintService().rpInitiatedLogout(req, res)

      expect(res.redirect).toHaveBeenCalledWith("https://app.example.com/bye")
    })

    it("does not take the client from a hint it could not verify", async () => {
      process.env.POST_LOGOUT_REDIRECT_URIS = JSON.stringify({
        "client-abc": ["https://app.example.com/bye"],
      })
      const forged = jwt.sign({ iss: material.issuer, aud: "client-abc", sub: "victim" }, "", {
        algorithm: "none",
      })
      const req = {
        session: { destroy: vi.fn((cb: (e: unknown) => void) => cb(null)) },
        query: { id_token_hint: forged, post_logout_redirect_uri: "https://app.example.com/bye" },
      } as any
      const res = { clearCookie: vi.fn(), render: vi.fn(), redirect: vi.fn() } as any

      await hintService().rpInitiatedLogout(req, res)

      expect(res.redirect).not.toHaveBeenCalled()
      expect(res.render).toHaveBeenCalledWith("logout", expect.any(Object))
    })

    it("completes logout when the key material cannot be fetched", async () => {
      const failing = new rpInitiatedLogoutService(mockBclService, async () => {
        throw new Error("discovery unavailable")
      })
      const req = {
        session: { destroy: vi.fn((cb: (e: unknown) => void) => cb(null)) },
        query: { backchannel: "true", id_token_hint: genuineHint() },
        logger: Object.assign(vi.fn(), { error: vi.fn(), warn: vi.fn(), child: vi.fn() }),
      } as any
      const res = { clearCookie: vi.fn(), render: vi.fn(), redirect: vi.fn() } as any

      await failing.rpInitiatedLogout(req, res)

      expect(mockBclService.issueAndDeliverToAll).not.toHaveBeenCalled()
      expect(req.session.destroy).toHaveBeenCalled()
      expect(res.render).toHaveBeenCalled()
    })
  })
})

describe("registeredPostLogoutRedirectUris", () => {
  const ORIGINAL = process.env.POST_LOGOUT_REDIRECT_URIS

  afterEach(() => {
    process.env.POST_LOGOUT_REDIRECT_URIS = ORIGINAL
  })

  it("returns the client's registered set", () => {
    process.env.POST_LOGOUT_REDIRECT_URIS = JSON.stringify({
      "client-a": ["https://a.example/bye", "https://a.example/gone"],
      "client-b": ["https://b.example/bye"],
    })
    expect(registeredPostLogoutRedirectUris("client-a")).toEqual([
      "https://a.example/bye",
      "https://a.example/gone",
    ])
  })

  // §3 for a client that registered nothing is "never redirect", so every one of these is conformance
  // rather than defensiveness.
  it.each([
    ["no client id", undefined, '{"client-a":["https://a.example/bye"]}'],
    ["an unknown client", "client-z", '{"client-a":["https://a.example/bye"]}'],
    ["unset configuration", "client-a", undefined],
    ["malformed JSON", "client-a", "{not json"],
    ["a JSON array rather than an object", "client-a", '["https://a.example/bye"]'],
    ["a non-array entry", "client-a", '{"client-a":"https://a.example/bye"}'],
  ])("returns an empty set for %s", (_label, clientId, config) => {
    if (config === undefined) delete process.env.POST_LOGOUT_REDIRECT_URIS
    else process.env.POST_LOGOUT_REDIRECT_URIS = config
    expect(registeredPostLogoutRedirectUris(clientId as string | undefined)).toEqual([])
  })

  it("drops non-string and empty entries rather than trusting the array wholesale", () => {
    process.env.POST_LOGOUT_REDIRECT_URIS = JSON.stringify({
      "client-a": ["https://a.example/bye", "", 42, null, "https://a.example/two"],
    })
    expect(registeredPostLogoutRedirectUris("client-a")).toEqual([
      "https://a.example/bye",
      "https://a.example/two",
    ])
  })
})

describe("isAllowedPostLogoutRedirectUri", () => {
  const REGISTERED = ["https://app.example.com/bye", "http://localhost:3000"]

  it("accepts a value that exactly matches a registered URI", () => {
    expect(isAllowedPostLogoutRedirectUri("https://app.example.com/bye", REGISTERED)).toBe(true)
    expect(isAllowedPostLogoutRedirectUri("http://localhost:3000", REGISTERED)).toBe(true)
  })

  // RPL-W1. Before 2026-08-12 the comparison was origin-based against ALLOWED_ORIGINS, so any path on an
  // allowed origin passed and every client shared one deployment-wide list. §3 wants the client's own
  // registered values, matched exactly. See audit/02-findings/OIDC-RP-INITIATED-LOGOUT-1.0.md F-1/F-4.
  it.each([
    ["a different path on a registered origin", "https://app.example.com/somewhere-else"],
    ["a trailing slash the registration does not have", "https://app.example.com/bye/"],
    ["a query string appended", "https://app.example.com/bye?x=1"],
    ["a different scheme", "http://app.example.com/bye"],
    ["different host case", "https://APP.EXAMPLE.COM/bye"],
    ["another localhost port", "http://localhost:31337/bye"],
  ])("refuses %s", (_label, candidate) => {
    expect(isAllowedPostLogoutRedirectUri(candidate, REGISTERED)).toBe(false)
  })

  // The two payloads verified live before 2026-08-10. They are now refused for the plain reason that
  // nobody registered them — no parser is involved, so no parser bug can accept them.
  it.each([
    ["allowed-origin as a subdomain prefix", "http://localhost:3000.evil.example.com/bye"],
    ["allowed-origin as userinfo before @", "http://localhost:3001@evil.example.com/"],
    ["a domain-prefix host", "https://app.example.com.evil.net/"],
    ["a non-http scheme", "javascript:alert(1)"],
    ["a scheme-relative URL", "//evil.example.com"],
    ["an unparseable value", "not a url at all"],
  ])("refuses %s", (_label, candidate) => {
    expect(isAllowedPostLogoutRedirectUri(candidate, REGISTERED)).toBe(false)
  })

  it("refuses everything when the client registered nothing", () => {
    expect(isAllowedPostLogoutRedirectUri("https://app.example.com/bye", [])).toBe(false)
    expect(isAllowedPostLogoutRedirectUri("", [])).toBe(false)
  })

  // A registered value is matched as an array element, never as a substring. `includes()` on the candidate
  // string would accept this; `some(u => u === candidate)` does not.
  it("does not accept a registered URI that is merely a substring of the candidate", () => {
    expect(
      isAllowedPostLogoutRedirectUri("https://app.example.com/bye.evil.net", REGISTERED)
    ).toBe(false)
  })

  it("is not fooled by an environment that used to widen the allowlist", () => {
    const ORIGINAL_ALLOWED = process.env.ALLOWED_ORIGINS
    const ORIGINAL_NODE_ENV = process.env.NODE_ENV
    try {
      // Both of these used to grant access. Neither is consulted any more.
      process.env.ALLOWED_ORIGINS = "https://evil.example.com"
      process.env.NODE_ENV = "development"
      expect(isAllowedPostLogoutRedirectUri("https://evil.example.com/bye", REGISTERED)).toBe(false)
      expect(isAllowedPostLogoutRedirectUri("http://localhost:9999/bye", REGISTERED)).toBe(false)
    } finally {
      process.env.ALLOWED_ORIGINS = ORIGINAL_ALLOWED
      process.env.NODE_ENV = ORIGINAL_NODE_ENV
    }
  })
})
