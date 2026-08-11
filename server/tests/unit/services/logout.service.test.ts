import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
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
