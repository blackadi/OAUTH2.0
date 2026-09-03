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

/**
 * **Phase 2 — the exchange leg, where the binding is checked rather than recomputed.**
 *
 * The defect these pin (found 2026-09-03 by `scripts/native-sso-verify.mjs`, live): the handler
 * computed `deviceSecretHash` from whatever `actor_token` arrived, on both legs. Authlete echoes that
 * value back on an exchange, so the hash was **re-bound** to the caller's secret instead of compared to
 * the one already bound. Sending 32 random bytes returned 200 with the victim's `sub` and `sid` and an
 * ID token whose `ds_hash` was the hash of the attacker's own secret — so holding an ID token was
 * enough, and the device secret proved nothing.
 *
 * The old code passes every case above and fails every case below, which is the point of keeping both.
 */
describe("handleNativeSso — Phase 2 verifies the presented device secret", () => {
  const secret = "the-real-device-secret"
  const boundHash = createHash("sha256").update(secret).digest("base64url")

  /** An ID token is only read for its claims here, so an unsigned one is a faithful fixture. */
  const idTokenWith = (claims: Record<string, unknown>) =>
    [
      Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
      Buffer.from(JSON.stringify(claims)).toString("base64url"),
      "",
    ].join(".")

  /** Authlete echoes the caller's `actor_token` back as `deviceSecret` on the exchange leg. */
  const phase2 = (echoed: string) =>
    ({
      action: "NATIVE_SSO",
      accessToken: "at-phase-2",
      sessionId: "sess-1",
      subject: "probe-user",
      deviceSecret: echoed,
    }) as unknown as TokenResponse

  const exchangeReq = (actorToken: string, dsHash?: string) =>
    ({
      body: {
        actor_token: actorToken,
        actor_token_type: "urn:openid:params:token-type:device-secret",
        subject_token: idTokenWith(dsHash === undefined ? { sub: "probe-user" } : { sub: "probe-user", ds_hash: dsHash }),
      },
    }) as unknown as Request

  beforeEach(() => mockProcess.mockReset())

  it("refuses a device secret whose hash is not the subject token's ds_hash", async () => {
    const res = mockRes()
    await handleNativeSso(exchangeReq("32-random-bytes-from-an-attacker", boundHash), res, phase2("32-random-bytes-from-an-attacker"), next)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "invalid_grant" }),
    )
    expect(
      mockProcess,
      "reaching /nativesso at all would mint an ID token bound to the attacker's secret",
    ).not.toHaveBeenCalled()
  })

  it("refuses a subject token that carries no ds_hash, rather than skipping the check", async () => {
    const res = mockRes()
    await handleNativeSso(exchangeReq(secret, undefined), res, phase2(secret), next)

    expect(res.status).toHaveBeenCalledWith(400)
    // Fail-closed: "nothing to compare" is the reading that turns a missing value into a bypass.
    expect(mockProcess).not.toHaveBeenCalled()
  })

  it("accepts the real secret and forwards the hash already bound to the session", async () => {
    mockProcess.mockResolvedValue({ action: "OK", responseContent: '{"access_token":"new"}' })
    const res = mockRes()
    await handleNativeSso(exchangeReq(secret, boundHash), res, phase2(secret), next)

    expect(res.status).toHaveBeenCalledWith(200)
    const sent = (mockProcess.mock.calls[0][0] as Request).body as Record<string, unknown>
    expect(sent.deviceSecret, "forwarded unchanged").toBe(secret)
    expect(
      sent.deviceSecretHash,
      "the bound hash, not a fresh computation — recomputing is what allowed re-binding",
    ).toBe(boundHash)
  })

  /**
   * `nonce` and `s_hash` reach the ID token only through `/nativesso`'s `claims`. Omitting it dropped a
   * nonce the client had sent, so OIDC Core §3.1.3.7's check could not be performed.
   */
  it("forwards additionalClaims so a nonce survives into the ID token", async () => {
    mockProcess.mockResolvedValue({ action: "OK", responseContent: "{}" })
    const res = mockRes()
    const result = { ...phase1, additionalClaims: '{"nonce":"n-1"}' } as unknown as TokenResponse
    await handleNativeSso(req(), res, result, next)

    const sent = (mockProcess.mock.calls[0][0] as Request).body as Record<string, unknown>
    expect(sent.claims).toBe('{"nonce":"n-1"}')
  })
})
