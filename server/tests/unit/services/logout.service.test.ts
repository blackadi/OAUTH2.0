import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { generateKeyPairSync } from "node:crypto"
import jwt from "jsonwebtoken"
import { BackchannelLogoutService } from "../../../src/services/backchannel-logout.service"
import {
  isAllowedPostLogoutRedirectUri,
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
      query: { post_logout_redirect_uri: "http://localhost:3000/callback" },
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
      query: { post_logout_redirect_uri: uri },
    } as any
    const res = { clearCookie: vi.fn(), render: vi.fn(), redirect: vi.fn() } as any

    await service.rpInitiatedLogout(req, res)

    expect(res.redirect).not.toHaveBeenCalled()
    expect(res.render).toHaveBeenCalledWith("logout", expect.any(Object))
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

    it("prefers the session subject and never consults the hint", async () => {
      const req = {
        session: { user: "admin", destroy: vi.fn((cb: (e: unknown) => void) => cb(null)) },
        query: { backchannel: "true", id_token_hint: genuineHint({ sub: "victim" }) },
      } as any
      const res = { clearCookie: vi.fn(), render: vi.fn(), redirect: vi.fn() } as any

      await hintService().rpInitiatedLogout(req, res)

      expect(mockBclService.issueAndDeliverToAll).toHaveBeenCalledWith("admin")
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

describe("isAllowedPostLogoutRedirectUri", () => {
  const ORIGINAL_ALLOWED = process.env.ALLOWED_ORIGINS
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV

  afterEach(() => {
    process.env.ALLOWED_ORIGINS = ORIGINAL_ALLOWED
    process.env.NODE_ENV = ORIGINAL_NODE_ENV
  })

  it("accepts an exact match against LOGOUT_REDIRECT_URI regardless of environment", () => {
    process.env.NODE_ENV = "production"
    process.env.ALLOWED_ORIGINS = ""
    expect(
      isAllowedPostLogoutRedirectUri("https://app.example.com/bye", "https://app.example.com/bye")
    ).toBe(true)
  })

  it("accepts any path on an exactly-matching allowed origin", () => {
    process.env.NODE_ENV = "production"
    process.env.ALLOWED_ORIGINS = "https://app.example.com,https://admin.example.com"
    expect(
      isAllowedPostLogoutRedirectUri("https://app.example.com/logged-out", "https://unused.example")
    ).toBe(true)
  })

  it("closes the prefix bypass in production", () => {
    process.env.NODE_ENV = "production"
    process.env.ALLOWED_ORIGINS = "https://app.example.com"
    expect(
      isAllowedPostLogoutRedirectUri("https://app.example.com.evil.net/", "https://unused.example")
    ).toBe(false)
  })

  it("closes the userinfo bypass in production", () => {
    process.env.NODE_ENV = "production"
    process.env.ALLOWED_ORIGINS = "https://app.example.com"
    expect(
      isAllowedPostLogoutRedirectUri("https://app.example.com@evil.net/", "https://unused.example")
    ).toBe(false)
  })

  it("does not allow arbitrary localhost ports in production", () => {
    process.env.NODE_ENV = "production"
    process.env.ALLOWED_ORIGINS = ""
    expect(isAllowedPostLogoutRedirectUri("http://localhost:31337/bye", "http://localhost:3000")).toBe(
      false
    )
  })

  it("allows any localhost port outside production, by exact host", () => {
    process.env.NODE_ENV = "development"
    process.env.ALLOWED_ORIGINS = ""
    expect(isAllowedPostLogoutRedirectUri("http://localhost:31337/bye", "http://localhost:3000")).toBe(
      true
    )
    // ...but "localhost" as a prefix of another host is still a different host.
    expect(
      isAllowedPostLogoutRedirectUri("http://localhost.evil.net/bye", "http://localhost:3000")
    ).toBe(false)
  })

  it("normalises host case when comparing origins", () => {
    process.env.NODE_ENV = "production"
    process.env.ALLOWED_ORIGINS = "https://app.example.com"
    expect(
      isAllowedPostLogoutRedirectUri("https://APP.EXAMPLE.COM/bye", "https://unused.example")
    ).toBe(true)
  })

  it("ignores a malformed ALLOWED_ORIGINS entry rather than widening the allowlist", () => {
    process.env.NODE_ENV = "production"
    process.env.ALLOWED_ORIGINS = "not-a-url,https://app.example.com"
    expect(isAllowedPostLogoutRedirectUri("https://evil.net/", "https://unused.example")).toBe(false)
    expect(isAllowedPostLogoutRedirectUri("https://app.example.com/", "https://unused.example")).toBe(
      true
    )
  })
})
