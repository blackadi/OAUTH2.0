import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("express-session", () => ({
  default: vi.fn((opts: Record<string, unknown>) => opts),
}))

vi.mock("../../../src/config/app.config", () => ({
  server: {
    nodeEnv: "development",
    sessionSecret: "test-secret",
  },
}))

let sessionMiddleware: any

beforeEach(async () => {
  vi.clearAllMocks()
  const mod = await import("../../../src/middleware/session")
  sessionMiddleware = mod.sessionMiddleware
})

describe("sessionMiddleware", () => {
  it("returns a session middleware", () => {
    const middleware = sessionMiddleware()
    expect(middleware).toBeDefined()
  })

  it("uses default secret from config", () => {
    const mw = sessionMiddleware()
    expect(mw.secret).toBe("test-secret")
    expect(mw.resave).toBe(false)
    expect(mw.saveUninitialized).toBe(false)
  })

  it("merges provided options", () => {
    const mw = sessionMiddleware({ secret: "custom-secret" })
    expect(mw.secret).toBe("custom-secret")
    expect(mw.resave).toBe(false)
  })

  it("merges cookie options", () => {
    const mw = sessionMiddleware({
      cookie: { maxAge: 999, sameSite: "strict" },
    })
    expect(mw.cookie.maxAge).toBe(999)
    expect(mw.cookie.sameSite).toBe("strict")
    expect(mw.cookie.httpOnly).toBe(true)
  })

  it("cookie defaults are applied when no cookie options given", () => {
    const mw = sessionMiddleware()
    expect(mw.cookie).toBeDefined()
    expect(mw.cookie.httpOnly).toBe(true)
    expect(mw.cookie.secure).toBe(false)
  })
})
