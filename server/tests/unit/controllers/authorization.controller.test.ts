import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextFunction, Request, Response } from "express"

const mocks = vi.hoisted(() => ({
  mockProcess: vi.fn(),
  mockValidate: vi.fn(),
  mockIssue: vi.fn(),
  mockFail: vi.fn(),
  mockIsConsentGranted: vi.fn(),
}))

vi.mock("../../../src/services/authorization.service", () => ({
  AuthorizationService: function() {
    return { process: mocks.mockProcess, issue: mocks.mockIssue, fail: mocks.mockFail }
  },
}))

vi.mock("../../../src/services/consent-store.service", () => ({
  default: { isConsentGranted: mocks.mockIsConsentGranted },
}))

vi.mock("../../../src/utils/validate", () => ({
  validateAuthorizationParams: mocks.mockValidate,
}))

import { authorizationController } from "../../../src/controllers/authorization.controller"

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: "GET",
    query: {},
    body: {},
    logger: Object.assign(vi.fn(), { error: vi.fn() }),
    session: {},
    ...overrides,
  } as unknown as Request
}

function mockRes(): Response {
  const res: Partial<Response> = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.send = vi.fn().mockReturnValue(res)
  res.redirect = vi.fn().mockReturnValue(res)
  res.setHeader = vi.fn().mockReturnValue(res)
  return res as unknown as Response
}

function mockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction
}

describe("authorizationController.handleAuthorization", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 400 when validation fails", async () => {
    mocks.mockValidate.mockReturnValue("response_type is required")
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await authorizationController.handleAuthorization(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: "invalid_request",
      error_description: "response_type is required",
    })
    expect(mocks.mockProcess).not.toHaveBeenCalled()
  })

  it("returns 400 on BAD_REQUEST action", async () => {
    mocks.mockValidate.mockReturnValue(null)
    mocks.mockProcess.mockResolvedValue({ action: "BAD_REQUEST", responseContent: "bad" })
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await authorizationController.handleAuthorization(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.send).toHaveBeenCalledWith("bad")
  })

  it("returns 500 on INTERNAL_SERVER_ERROR action", async () => {
    mocks.mockValidate.mockReturnValue(null)
    mocks.mockProcess.mockResolvedValue({ action: "INTERNAL_SERVER_ERROR", responseContent: "err" })
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await authorizationController.handleAuthorization(req, res, next)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.send).toHaveBeenCalledWith("err")
  })

  it("redirects on LOCATION action", async () => {
    mocks.mockValidate.mockReturnValue(null)
    mocks.mockProcess.mockResolvedValue({ action: "LOCATION", responseContent: "https://rp.example.com/cb" })
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await authorizationController.handleAuthorization(req, res, next)

    expect(res.redirect).toHaveBeenCalledWith("https://rp.example.com/cb")
  })

  it("renders form on FORM action", async () => {
    mocks.mockValidate.mockReturnValue(null)
    mocks.mockProcess.mockResolvedValue({ action: "FORM", responseContent: "<html>form</html>" })
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await authorizationController.handleAuthorization(req, res, next)

    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/html;charset=UTF-8")
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.send).toHaveBeenCalledWith("<html>form</html>")
  })

  /**
   * T1-7 — OIDC-W1 = 9470-W3, which must not be split.
   *
   * `NO_INTERACTION` is how Authlete answers `prompt=none`, with a ticket and `responseContent: null`. It
   * used to be redirected to, emitting `Location:` empty — neither a success nor one of OIDC Core §3.1.2.6's
   * four errors. And the `prompt=none` code that existed **fabricated** an authentication event
   * (`acr: "pwd"`, `auth_time: now`) whenever the session had none, so routing this action into it would have
   * attested authentications this OP never observed.
   * See audit/02-findings/OIDC-CORE-1.0.md F-1 and RFC9470-step-up-authentication.md F-3.
   */
  describe("NO_INTERACTION (prompt=none)", () => {
    const noInteraction = (extra: Record<string, unknown> = {}) => ({
      action: "NO_INTERACTION",
      responseContent: null,
      ticket: "ticket-none",
      client: { clientId: 42, clientName: "Test App" },
      scopes: [{ name: "openid" }],
      ...extra,
    })

    beforeEach(() => {
      mocks.mockValidate.mockReturnValue(null)
      mocks.mockIsConsentGranted.mockReturnValue(true)
      mocks.mockFail.mockResolvedValue({ action: "LOCATION", responseContent: "https://rp.example.com/cb?error=login_required" })
      mocks.mockIssue.mockResolvedValue({ responseContent: "https://rp.example.com/cb?code=abc" })
    })

    it("never emits an empty Location", async () => {
      mocks.mockProcess.mockResolvedValue(noInteraction())
      const req = mockReq({ session: {} } as Partial<Request>)
      const res = mockRes()

      await authorizationController.handleAuthorization(req, res, mockNext())

      expect(res.redirect).not.toHaveBeenCalledWith("")
    })

    it("fails with NOT_LOGGED_IN when no user is authenticated", async () => {
      mocks.mockProcess.mockResolvedValue(noInteraction())
      const req = mockReq({ session: {} } as Partial<Request>)

      await authorizationController.handleAuthorization(req, mockRes(), mockNext())

      expect(mocks.mockFail).toHaveBeenCalledWith("ticket-none", "NOT_LOGGED_IN")
      expect(mocks.mockIssue).not.toHaveBeenCalled()
    })

    it("fails with CONSENT_REQUIRED when stored consent does not cover the scopes", async () => {
      mocks.mockIsConsentGranted.mockReturnValue(false)
      mocks.mockProcess.mockResolvedValue(noInteraction())
      const req = mockReq({ session: { user: "admin" } } as Partial<Request>)

      await authorizationController.handleAuthorization(req, mockRes(), mockNext())

      expect(mocks.mockFail).toHaveBeenCalledWith("ticket-none", "CONSENT_REQUIRED")
      expect(mocks.mockIssue).not.toHaveBeenCalled()
    })

    it("issues when the session satisfies the request", async () => {
      mocks.mockProcess.mockResolvedValue(noInteraction())
      const req = mockReq({
        session: { user: "admin", stepUp: { acr: "pwd", authTime: Math.floor(Date.now() / 1000) } },
      } as Partial<Request>)
      const res = mockRes()

      await authorizationController.handleAuthorization(req, res, mockNext())

      expect(mocks.mockIssue).toHaveBeenCalled()
      expect(res.redirect).toHaveBeenCalledWith("https://rp.example.com/cb?code=abc")
    })

    // The fabrication, from both directions. A session with no recorded authentication event must not be
    // able to satisfy a step-up requirement — and must not have one invented for it.
    it("fails with ACR_NOT_SATISFIED when an essential acr cannot be evidenced", async () => {
      mocks.mockProcess.mockResolvedValue(noInteraction({ acrs: ["mfa"], acrEssential: true }))
      const req = mockReq({ session: { user: "admin" } } as Partial<Request>)

      await authorizationController.handleAuthorization(req, mockRes(), mockNext())

      expect(mocks.mockFail).toHaveBeenCalledWith("ticket-none", "ACR_NOT_SATISFIED")
      expect(mocks.mockIssue).not.toHaveBeenCalled()
    })

    // EXCEEDS_MAX_AGE is reachable for the first time here: on the login POST the user has just
    // authenticated, so max_age passes by construction. This is the path where nobody re-authenticated.
    it("fails with EXCEEDS_MAX_AGE when the recorded authentication is too old", async () => {
      mocks.mockProcess.mockResolvedValue(noInteraction({ maxAge: 60 }))
      const req = mockReq({
        session: { user: "admin", stepUp: { acr: "pwd", authTime: Math.floor(Date.now() / 1000) - 600 } },
      } as Partial<Request>)

      await authorizationController.handleAuthorization(req, mockRes(), mockNext())

      expect(mocks.mockFail).toHaveBeenCalledWith("ticket-none", "EXCEEDS_MAX_AGE")
      expect(mocks.mockIssue).not.toHaveBeenCalled()
    })

    it("fails with EXCEEDS_MAX_AGE when max_age is asked for and nothing was recorded", async () => {
      mocks.mockProcess.mockResolvedValue(noInteraction({ maxAge: 60 }))
      const req = mockReq({ session: { user: "admin" } } as Partial<Request>)

      await authorizationController.handleAuthorization(req, mockRes(), mockNext())

      expect(mocks.mockFail).toHaveBeenCalledWith("ticket-none", "EXCEEDS_MAX_AGE")
    })

    // The regression that matters most: no invented acr/auth_time reaches Authlete.
    it("does not invent an authentication event when the session recorded none", async () => {
      mocks.mockProcess.mockResolvedValue(noInteraction())
      const req = mockReq({ session: { user: "admin" } } as Partial<Request>)

      await authorizationController.handleAuthorization(req, mockRes(), mockNext())

      expect(mocks.mockIssue).toHaveBeenCalled()
      expect((req as unknown as { session: { stepUp?: unknown } }).session.stepUp).toBeUndefined()
    })
  })

  it("redirects to login on INTERACTION action", async () => {
    mocks.mockValidate.mockReturnValue(null)
    mocks.mockProcess.mockResolvedValue({
      action: "INTERACTION",
      ticket: "ticket-1",
      client: { clientId: 42, clientName: "Test App" },
      scopes: [{ name: "openid" }, { name: "profile" }],
      resultMessage: "msg",
      idTokenClaims: null,
      authorizationDetails: null,
    })
    const req = mockReq({ query: { client_id: "42", response_type: "code" } })
    const res = mockRes()
    const next = mockNext()

    await authorizationController.handleAuthorization(req, res, next)

    expect(res.redirect).toHaveBeenCalled()
    const redirectUrl = (res.redirect as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(redirectUrl).toContain("/api/session/login")
    expect(redirectUrl).toContain("client_id=42")
    expect(req.session).toBeDefined()
  })

  it("returns 500 for unknown action", async () => {
    mocks.mockValidate.mockReturnValue(null)
    mocks.mockProcess.mockResolvedValue({ action: "UNKNOWN" })
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await authorizationController.handleAuthorization(req, res, next)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.send).toHaveBeenCalledWith("Unknown authorization action")
  })

  it("calls next with error on exception", async () => {
    mocks.mockValidate.mockReturnValue(null)
    mocks.mockProcess.mockRejectedValue(new Error("API error"))
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await authorizationController.handleAuthorization(req, res, next)

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "API error" }))
  })
})
