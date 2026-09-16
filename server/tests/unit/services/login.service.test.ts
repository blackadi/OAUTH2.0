import { describe, it, expect, beforeAll, afterEach, vi } from "vitest"
import type { LoginService as LoginServiceType } from "../../../src/services/login.service"
import { base32Encode } from "../../../src/utils/totp"

let LoginService: typeof LoginServiceType

// RFC 6238 Appendix B's own secret, base32-encoded (base32Encode is checked against RFC 4648 §10's
// vectors in totp.test.ts), so the OTP tests below can reuse the RFC's published (time, code) pairs
// instead of needing a "generate a code" helper of their own.
const RFC_6238_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"))

beforeAll(async () => {
  vi.stubEnv("AUTH_USERS", "sub1:user1:pass1:User One;sub2:user2:pass2:User Two")
  vi.stubEnv("AUTH_OTP_SECRET", RFC_6238_SECRET)
  const mod = await import("../../../src/services/login.service")
  LoginService = mod.LoginService
})

describe("LoginService", () => {
  it("returns user when credentials match", async () => {
    const service = new LoginService()
    const result = await service.validateUser("user1", "pass1")
    expect(result).toEqual({ subject: "sub1", name: "User One" })
  })

  it("returns null when credentials do not match", async () => {
    const service = new LoginService()
    const result = await service.validateUser("user1", "wrong")
    expect(result).toBeNull()
  })

  it("returns null for unknown username", async () => {
    const service = new LoginService()
    const result = await service.validateUser("nobody", "pass")
    expect(result).toBeNull()
  })
})

describe("LoginService — verifyOtp (RFC 6238 Appendix B, via the stubbed AUTH_OTP_SECRET)", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("accepts the code for the current time", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(59 * 1000)) // RFC 6238 vector: T=59 -> ...082 (6-digit: 287082)
    const service = new LoginService()
    expect(service.verifyOtp("287082")).toBe(true)
  })

  it("rejects a code from a different time step", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1111111109 * 1000)) // a different RFC vector's time
    const service = new LoginService()
    expect(service.verifyOtp("287082")).toBe(false) // that code belongs to T=59, not this time
  })

  it("rejects a well-formed but wrong code", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(59 * 1000))
    const service = new LoginService()
    expect(service.verifyOtp("000000")).toBe(false)
  })
})

describe("LoginService — otpEnrollmentInfo", () => {
  it("returns the configured secret and a matching otpauth:// URI", () => {
    const service = new LoginService()
    const info = service.otpEnrollmentInfo()
    expect(info.secret).toBe(RFC_6238_SECRET)
    expect(info.otpauthUri).toMatch(/^otpauth:\/\/totp\//)
    expect(info.otpauthUri).toContain(`secret=${RFC_6238_SECRET}`)
  })
})
