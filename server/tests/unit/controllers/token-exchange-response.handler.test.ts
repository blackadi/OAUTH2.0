import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextFunction, Request, Response } from "express"

/**
 * ⚠️ CHARACTERIZATION TEST — these assertions encode DELIBERATE defects, not desired behaviour.
 *
 * `token-exchange-response.handler.ts` intentionally drops four RFC 8693 request parameters, omits a
 * REQUIRED response member, and substitutes the subject token when Authlete resolves no subject. Those
 * gaps are the teaching material for **Module 06 Exercise 6** and are documented as known limitations in
 * **docs/TOKEN-EXCHANGE-TUTORIAL.md Part 12**.
 *
 * This file exists so the gaps cannot be "fixed" silently. A previous server change (pinning the SDK to
 * 1.0.0) fixed a different defect that Module 06's gate was built on, and nothing failed — the lab just
 * became wrong, because labs are prose. If you are changing the handler on purpose, that is fine, but you
 * must also update:
 *
 *   - docs/curriculum/modules/06-machine-and-delegated-grants/lab.md      (Exercise 6a/6b/6c)
 *   - docs/curriculum/modules/06-machine-and-delegated-grants/quiz-answers.md
 *   - docs/TOKEN-EXCHANGE-TUTORIAL.md                                    (Part 12, Parts 7/9/11)
 *   - docs/curriculum/PROGRESS.md                                        (Build Log entry)
 *
 * Verified against the live server on 2026-08-06.
 */

const mocks = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock("../../../src/services/token.operations.service", () => ({
  TokenManagementService: function () {
    return { create: mocks.mockCreate }
  },
}))

import { handleTokenExchange } from "../../../src/controllers/token-exchange-response.handler"

function mockReq(): Request {
  return {
    body: {},
    headers: {},
    logger: Object.assign(vi.fn(), { error: vi.fn() }),
  } as unknown as Request
}

function mockRes(): Response {
  const res: Partial<Response> = {}
  res.status = vi.fn().mockReturnValue(res)
  res.type = vi.fn().mockReturnValue(res)
  res.send = vi.fn().mockReturnValue(res)
  res.setHeader = vi.fn().mockReturnValue(res)
  return res as unknown as Response
}

const next = () => vi.fn() as unknown as NextFunction

/** Everything Authlete hands back on a TOKEN_EXCHANGE action, including what the handler ignores. */
const authleteResult = {
  action: "TOKEN_EXCHANGE",
  clientId: 1523514379,
  scopes: ["profile"],
  subject: "admin",
  subjectToken: "EXAMPLE-subject-token",
  subjectTokenType: "ACCESS_TOKEN",
  // ── all four of the following are resolved by Authlete and dropped by the handler ──
  resources: ["https://api.example.com/orders"],
  audiences: ["https://partner.example.com"],
  requestedTokenType: "urn:ietf:params:oauth:token-type:id_token",
  actorToken: "EXAMPLE-actor-token",
  actorTokenInfo: { subject: "service-a" },
} as never

/** The request the handler sends to /auth/token/create. */
const sentCreateRequest = () => (mocks.mockCreate.mock.calls[0][0] as Request).body as Record<string, unknown>

describe("handleTokenExchange — characterization of deliberate gaps", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockCreate.mockResolvedValue({
      action: "OK",
      accessToken: "EXAMPLE-exchanged-token",
      tokenType: "Bearer",
      expiresIn: 86400,
      scopes: ["profile"],
      clientId: 1523514379,
      subject: "admin",
    })
  })

  describe("four request parameters are dropped (Module 06 Exercise 6b)", () => {
    it("forwards exactly grantType, clientId, scopes and subject — nothing else", async () => {
      await handleTokenExchange(mockReq(), mockRes(), authleteResult, next())

      expect(Object.keys(sentCreateRequest()).sort()).toEqual([
        "clientId",
        "grantType",
        "scopes",
        "subject",
      ])
    })

    // B1-W3 coupling, asserted from this side too. `normalizeGrantType` in token.operations.service.ts
    // now REFUSES an unrecognised grant type with 400 instead of coercing it to AUTHORIZATION_CODE. This
    // handler is its second caller, and it sends the camelCase `grantType` key rather than `grant_type`.
    // If that spelling ever stopped resolving, every token exchange would 400 and Module 06 Exercise 6
    // would break — with the mock in this file hiding it, since the mock never runs the real resolver.
    // So the assertion here is on the literal value the real resolver has to keep accepting.
    it("sends the grantType spelling that normalizeGrantType must keep accepting", async () => {
      await handleTokenExchange(mockReq(), mockRes(), authleteResult, next())

      expect(sentCreateRequest().grantType).toBe("TOKEN_EXCHANGE")
    })

    it("drops `resources`, so the issued token cannot be audience-restricted", async () => {
      await handleTokenExchange(mockReq(), mockRes(), authleteResult, next())
      expect(sentCreateRequest().resources).toBeUndefined()
    })

    // Unlike every other case in this block, this one can never legitimately change: Authlete's
    // `TokenCreateRequest` has no audience field at all, so there is nowhere to forward `audiences` to.
    // `resources` above is a choice this server makes; this is a vendor boundary. Both look identical from
    // the outside — same dropped parameter, same missing `aud`, same 200 — which is how they got conflated
    // (8693-W1). If this assertion ever fails, the SDK gained a field; check the schema before "fixing" it.
    it("drops `audiences` — and cannot do otherwise; Authlete models no audience field", async () => {
      await handleTokenExchange(mockReq(), mockRes(), authleteResult, next())
      expect(sentCreateRequest().audiences).toBeUndefined()
    })

    it("drops `actorToken`, silently downgrading delegation to impersonation", async () => {
      await handleTokenExchange(mockReq(), mockRes(), authleteResult, next())
      const sent = sentCreateRequest()
      expect(sent.actorToken).toBeUndefined()
      expect(sent.actorTokenInfo).toBeUndefined()
    })

    it("drops `requestedTokenType`", async () => {
      await handleTokenExchange(mockReq(), mockRes(), authleteResult, next())
      expect(sentCreateRequest().requestedTokenType).toBeUndefined()
    })

    it("passes no token lifetime, so the service default applies", async () => {
      await handleTokenExchange(mockReq(), mockRes(), authleteResult, next())
      expect(sentCreateRequest().accessTokenDuration).toBeUndefined()
    })
  })

  describe("the response violates RFC 8693 §2.2.1 (Module 06 Exercise 6a)", () => {
    it("omits `issued_token_type`, which §2.2.1 marks REQUIRED", async () => {
      const res = mockRes()
      await handleTokenExchange(mockReq(), res, authleteResult, next())

      const body = vi.mocked(res.send).mock.calls[0][0] as Record<string, unknown>
      expect(body).not.toHaveProperty("issued_token_type")
    })

    it("emits `client_id` and `subject`, which the spec does not define", async () => {
      const res = mockRes()
      await handleTokenExchange(mockReq(), res, authleteResult, next())

      const body = vi.mocked(res.send).mock.calls[0][0] as Record<string, unknown>
      expect(body).toHaveProperty("client_id")
      expect(body).toHaveProperty("subject")
    })

    it("returns exactly the six members it does today", async () => {
      const res = mockRes()
      await handleTokenExchange(mockReq(), res, authleteResult, next())

      const body = vi.mocked(res.send).mock.calls[0][0] as Record<string, unknown>
      expect(Object.keys(body).sort()).toEqual([
        "access_token",
        "client_id",
        "expires_in",
        "scope",
        "subject",
        "token_type",
      ])
    })
  })

  describe("the subject falls back to the subject token (Module 06 Exercise 6c)", () => {
    it("uses Authlete's resolved subject when there is one", async () => {
      await handleTokenExchange(mockReq(), mockRes(), authleteResult, next())
      expect(sentCreateRequest().subject).toBe("admin")
    })

    it("substitutes the raw subject token when Authlete resolves no subject", async () => {
      // The client-credentials case: no user, so no subject. `|| subjectToken` puts a live
      // credential into an identity field instead of failing closed.
      const noSubject = { ...(authleteResult as object), subject: undefined } as never
      await handleTokenExchange(mockReq(), mockRes(), noSubject, next())

      expect(sentCreateRequest().subject).toBe("EXAMPLE-subject-token")
    })
  })

  describe("action mapping", () => {
    it.each([
      ["OK", 200],
      ["BAD_REQUEST", 400],
      ["FORBIDDEN", 403],
      ["INTERNAL_SERVER_ERROR", 500],
    ])("maps %s to HTTP %i", async (action, status) => {
      mocks.mockCreate.mockResolvedValue({ action, accessToken: "t", scopes: [] })
      const res = mockRes()
      await handleTokenExchange(mockReq(), res, authleteResult, next())

      expect(res.status).toHaveBeenCalledWith(status)
    })

    it("maps an unknown action to 500", async () => {
      mocks.mockCreate.mockResolvedValue({ action: "SOMETHING_NEW" })
      const res = mockRes()
      await handleTokenExchange(mockReq(), res, authleteResult, next())

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  it("forwards a thrown error to next() rather than answering", async () => {
    mocks.mockCreate.mockRejectedValue(new Error("authlete unreachable"))
    const res = mockRes()
    const n = next()
    await handleTokenExchange(mockReq(), res, authleteResult, n)

    expect(n).toHaveBeenCalledWith(expect.objectContaining({ message: "authlete unreachable" }))
    expect(res.status).not.toHaveBeenCalled()
  })
})
