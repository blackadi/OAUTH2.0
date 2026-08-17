import { describe, it, expect, vi, beforeEach } from "vitest"
import { createHash } from "node:crypto"
import type { Request, Response, NextFunction } from "express"
import type { TokenResponse } from "@authlete/typescript-sdk/models"

/**
 * `handleNativeSso` had no unit test until 2026-08-17, and the only coverage —
 * `tests/integration/native-sso.routes.test.ts` — drives the two `/api/nativesso/*` routes and never
 * reaches this handler, which hangs off the token endpoint's `NATIVE_SSO` action.
 *
 * That gap is why F-4 survived: the handler demanded a `deviceSecret` that Authlete does **not** return
 * on a Phase 1 authorization-code exchange, so enabling `nativeSsoSupported` would have produced an
 * HTTP 500 on the very first request. These cases pin the mint-and-hash behaviour that replaced it.
 */

const mockProcess = vi.hoisted(() => vi.fn())
vi.mock("../../../src/services/native-sso.service", () => ({
  NativeSsoService: class {
    process = mockProcess
  },
}))

import { handleNativeSso } from "../../../src/controllers/native-sso-response.handler"

function mockRes(): Response {
  const res: Partial<Response> = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.send = vi.fn().mockReturnValue(res)
  res.setHeader = vi.fn().mockReturnValue(res)
  return res as unknown as Response
}

const req = () => ({ body: {} }) as unknown as Request
const next = (() => {}) as unknown as NextFunction

/** What Authlete actually returns for a Phase 1 exchange — verified live 2026-08-17. No `deviceSecret`. */
const phase1 = {
  action: "NATIVE_SSO",
  accessToken: "at-phase-1",
  refreshToken: "rt-1",
  sessionId: "sess-1",
  subject: "probe-user",
} as unknown as TokenResponse

beforeEach(() => {
  vi.clearAllMocks()
  mockProcess.mockResolvedValue({ action: "OK", responseContent: '{"device_secret":"x"}' })
})

describe("handleNativeSso — device secret minting (F-4)", () => {
  it("mints a device secret when Authlete returns none, instead of answering 500", async () => {
    const r = req()
    const res = mockRes()

    await handleNativeSso(r, res, phase1, next)

    // The regression: this used to be `500 server_error, "Missing accessToken or deviceSecret"`.
    expect(res.status).not.toHaveBeenCalledWith(500)
    expect(mockProcess).toHaveBeenCalledTimes(1)
    expect(r.body.deviceSecret).toEqual(expect.any(String))
    expect(r.body.deviceSecret.length).toBeGreaterThan(20)
  })

  it("computes deviceSecretHash as base64url(SHA-256(secret))", async () => {
    const r = req()
    await handleNativeSso(r, mockRes(), phase1, next)

    const expected = createHash("sha256").update(r.body.deviceSecret).digest("base64url")
    expect(r.body.deviceSecretHash).toBe(expected)
    // base64url: no padding, no `+`, no `/`. Authlete echoes this value as the ID token's `ds_hash`.
    expect(r.body.deviceSecretHash).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it("forwards Authlete's device secret unchanged on Phase 2 rather than minting a new one", async () => {
    // On the token-exchange leg Authlete DOES return one. Replacing it would break the `ds_hash`
    // already bound to the session — the second app would present a secret nobody has hashed.
    const r = req()
    await handleNativeSso(
      r,
      mockRes(),
      { ...phase1, deviceSecret: "secret-from-authlete" } as unknown as TokenResponse,
      next,
    )

    expect(r.body.deviceSecret).toBe("secret-from-authlete")
    expect(r.body.deviceSecretHash).toBe(
      createHash("sha256").update("secret-from-authlete").digest("base64url"),
    )
  })

  it("mints a DIFFERENT secret on every call", async () => {
    const a = req()
    const b = req()
    await handleNativeSso(a, mockRes(), phase1, next)
    await handleNativeSso(b, mockRes(), phase1, next)

    expect(a.body.deviceSecret).not.toBe(b.body.deviceSecret)
  })

  it("still answers 500 when the access token is missing, which IS a server error", async () => {
    const res = mockRes()
    await handleNativeSso(req(), res, { action: "NATIVE_SSO" } as unknown as TokenResponse, next)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(mockProcess).not.toHaveBeenCalled()
  })

  it("prefers the JWT access token when Authlete issues one", async () => {
    const r = req()
    await handleNativeSso(
      r,
      mockRes(),
      { ...phase1, jwtAccessToken: "jwt-at" } as unknown as TokenResponse,
      next,
    )
    expect(r.body.accessToken).toBe("jwt-at")
  })

  it("maps CALLER_ERROR to 400 and INTERNAL_SERVER_ERROR to 500", async () => {
    mockProcess.mockResolvedValue({ action: "CALLER_ERROR", resultMessage: "bad" })
    const a = mockRes()
    await handleNativeSso(req(), a, phase1, next)
    expect(a.status).toHaveBeenCalledWith(400)

    mockProcess.mockResolvedValue({ action: "INTERNAL_SERVER_ERROR", resultMessage: "boom" })
    const b = mockRes()
    await handleNativeSso(req(), b, phase1, next)
    expect(b.status).toHaveBeenCalledWith(500)
  })
})
