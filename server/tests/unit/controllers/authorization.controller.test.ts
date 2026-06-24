import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextFunction, Request, Response } from "express"

const mocks = vi.hoisted(() => ({
  mockProcess: vi.fn(),
  mockValidate: vi.fn(),
}))

vi.mock("../../../src/services/authorization.service", () => ({
  AuthorizationService: function() { return { process: mocks.mockProcess } },
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

  it("redirects on NO_INTERACTION", async () => {
    mocks.mockValidate.mockReturnValue(null)
    mocks.mockProcess.mockResolvedValue({ action: "NO_INTERACTION", responseContent: "https://rp.example.com/cb" })
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await authorizationController.handleAuthorization(req, res, next)

    expect(res.redirect).toHaveBeenCalledWith("https://rp.example.com/cb")
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
