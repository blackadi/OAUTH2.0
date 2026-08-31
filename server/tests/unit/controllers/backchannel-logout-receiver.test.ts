import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextFunction, Request, Response } from "express"
import crypto from "node:crypto"

const mockGetPublicKey = vi.hoisted(() => vi.fn())
const mockGetAllPublicKeys = vi.hoisted(() => vi.fn())
vi.mock("../../../src/utils/jwksClient", () => ({
  JwksClient: class {
    getPublicKey = mockGetPublicKey
    getAllPublicKeys = mockGetAllPublicKeys
  },
}))

const mockDestroy = vi.hoisted(() => vi.fn())
vi.mock("../../../src/utils/session-store", () => ({
  destroySessionsForSubject: mockDestroy,
}))

/**
 * The config module reads `process.env` once at import, which is right for a server that boots once — so
 * `vi.stubEnv` cannot reach it after the fact. Mock it with mutable fields instead, preserving production
 * semantics while letting each case drive the values.
 */
const cfg = vi.hoisted(() => ({
  // The whole module shape: `authlete.service.ts` reads `authleteConfig` at import time, so a partial mock
  // breaks the import graph rather than the test.
  authleteConfig: { baseUrl: "https://test.invalid", serviceId: "test-service", AccessToken: "test-token" },
  jwt: { privateKey: "", publicKey: "", issuer: "" },
  jwks: { uri: "" },
  backchannelLogout: { issuer: "", audience: "" },
}))
vi.mock("../../../src/config/authlete.config", () => cfg)

import jwt from "jsonwebtoken"
import { opBackchannelLogout } from "../../../src/controllers/logout.controller"

/**
 * `POST /api/backchannel_logout` had **no unit or integration coverage at all** before 2026-08-13 — only two
 * E2E assertions, in a suite that is never run locally because it consumes Authlete quota. That is why a
 * green suite said nothing about it while it validated five of §2.6's eleven steps and logged nobody out.
 */
const ISS = "https://other-op.example.com"
const AUD = "our-client-id-at-that-op"
const EVENTS = { "http://schemas.openid.net/event/backchannel-logout": {} }

const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" })
const pem = publicKey.export({ type: "spki", format: "pem" }).toString()

function logoutToken(overrides: Record<string, unknown> = {}, signWith = privateKey) {
  const payload: Record<string, unknown> = {
    iss: ISS,
    aud: AUD,
    sub: "alice",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 120,
    jti: crypto.randomUUID(),
    events: EVENTS,
    ...overrides,
  }
  for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k]
  return jwt.sign(payload, signWith as never, { algorithm: "ES256", keyid: "k1" })
}

function mockReq(body: Record<string, unknown>): Request {
  return {
    body,
    sessionStore: { all: vi.fn(), destroy: vi.fn() },
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), child: vi.fn() },
  } as unknown as Request
}

function mockRes(): Response {
  const res: Partial<Response> = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.end = vi.fn().mockReturnValue(res)
  res.setHeader = vi.fn().mockReturnValue(res)
  return res as unknown as Response
}

const next = vi.fn() as unknown as NextFunction
const run = (body: Record<string, unknown>) => {
  const res = mockRes()
  return opBackchannelLogout(mockReq(body), res, next).then(() => res)
}

describe("opBackchannelLogout (OIDC Back-Channel Logout §2.6)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cfg.jwks.uri = "https://other-op.example.com/jwks.json"
    cfg.backchannelLogout.issuer = ISS
    cfg.backchannelLogout.audience = AUD
    mockGetPublicKey.mockResolvedValue(pem)
    mockGetAllPublicKeys.mockResolvedValue([pem])
    mockDestroy.mockResolvedValue(1)
  })

  it("accepts a conformant token and terminates the SUBJECT's sessions", async () => {
    const res = await run({ logout_token: logoutToken() })

    expect(res.status).toHaveBeenCalledWith(200)
    // The headline fix: sessions are looked up by subject, not `req.session` — which belongs to the
    // sending OP's server and has no browser session at all.
    expect(mockDestroy).toHaveBeenCalledWith(expect.anything(), "alice", expect.anything())
  })

  it("sets Cache-Control: no-store (§2.8)", async () => {
    const res = await run({ logout_token: logoutToken() })
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store")
  })

  describe("validation steps that were previously absent", () => {
    it.each([
      ["a different issuer (§2.6 step 4)", { iss: "https://evil.example.com" }],
      ["a different audience (§2.6 step 4)", { aud: "somebody-elses-client-id" }],
      ["neither sub nor sid (§2.6 step 5)", { sub: undefined }],
      ["a forbidden nonce (§2.6 step 7 / §2.4)", { nonce: "n-0S6_WzA2Mj" }],
      ["a stale iat (§2.6 step 4)", { iat: Math.floor(Date.now() / 1000) - 4000 }],
      ["an iat far in the future", { iat: Math.floor(Date.now() / 1000) + 4000 }],
    ])("rejects %s", async (_label, overrides) => {
      const res = await run({ logout_token: logoutToken(overrides) })

      expect(res.status).toHaveBeenCalledWith(400)
      expect(mockDestroy).not.toHaveBeenCalled()
    })

    it("rejects a token signed by a key the JWKS does not contain", async () => {
      const other = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey
      const res = await run({ logout_token: logoutToken({}, other) })

      expect(res.status).toHaveBeenCalledWith(400)
      expect(mockDestroy).not.toHaveBeenCalled()
    })

    it("still rejects a token with no backchannel-logout event (§2.6 step 6)", async () => {
      const res = await run({ logout_token: logoutToken({ events: {} }) })
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it("accepts a token carrying sid but no sub, without terminating anything", async () => {
      // §2.6 step 5 is satisfied. This OP issues no `sid`, so there is nothing to match — a gap in what we
      // can act on, not a reason to reject a conformant token.
      const res = await run({ logout_token: logoutToken({ sub: undefined, sid: "sess-123" }) })

      expect(res.status).toHaveBeenCalledWith(200)
      expect(mockDestroy).not.toHaveBeenCalled()
    })
  })

  describe("misconfiguration is ours, not the sender's (BCL-W3)", () => {
    it.each([
      ["JWKS_URI", () => (cfg.jwks.uri = "")],
      ["BACKCHANNEL_LOGOUT_ISSUER", () => (cfg.backchannelLogout.issuer = "")],
      ["BACKCHANNEL_LOGOUT_AUDIENCE", () => (cfg.backchannelLogout.audience = "")],
    ])(
      "answers 500, not 400, when %s is unset",
      async (_name, unset) => {
        unset()
        const res = await run({ logout_token: logoutToken() })

        expect(res.status).toHaveBeenCalledWith(500)
        expect(res.json).toHaveBeenCalledWith({ error: "server_error" })
        // Never reached the token at all — the caller must not be told its token is bad.
        expect(mockGetPublicKey).not.toHaveBeenCalled()
      },
    )
  })

  it("returns 400 when logout_token is missing entirely", async () => {
    const res = await run({})
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("returns 500 when the session store fails, not 400", async () => {
    mockDestroy.mockRejectedValue(new Error("store exploded"))
    const res = await run({ logout_token: logoutToken() })
    expect(res.status).toHaveBeenCalledWith(500)
  })
})
