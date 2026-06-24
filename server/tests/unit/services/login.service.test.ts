import { describe, it, expect, beforeAll, vi } from "vitest"
import type { LoginService as LoginServiceType } from "../../../src/services/login.service"

let LoginService: typeof LoginServiceType

beforeAll(async () => {
  vi.stubEnv("AUTH_USERS", "sub1:user1:pass1:User One;sub2:user2:pass2:User Two")
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
