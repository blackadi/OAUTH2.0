import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextFunction, Request, Response } from "express"

const mocks = vi.hoisted(() => ({
  mockProcess: vi.fn(),
  mockFail: vi.fn(),
  mockIssue: vi.fn(),
  mockValidate: vi.fn(),
  mockProcessJwtBearer: vi.fn(),
  mockLoginValidate: vi.fn(),
}))

vi.mock("../../../src/services/token.service", () => ({
  TokenService: function() { return { process: mocks.mockProcess, fail: mocks.mockFail, issue: mocks.mockIssue } },
}))

vi.mock("../../../src/services/login.service", () => ({
  LoginService: function() { return { validateUser: mocks.mockLoginValidate } },
}))

vi.mock("../../../src/services/jwt-verification.service", () => ({
  JwtVerificationService: function() { return { processJwtBearer: mocks.mockProcessJwtBearer } },
}))

vi.mock("../../../src/utils/validate", () => ({
  validateTokenParams: mocks.mockValidate,
}))

import { tokenController } from "../../../src/controllers/token.controller"

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    headers: {},
    logger: { error: vi.fn() },
    ...overrides,
  } as unknown as Request
}

function mockRes(): Response {
  const res: Partial<Response> = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.send = vi.fn().mockReturnValue(res)
  res.setHeader = vi.fn().mockReturnValue(res)
  return res as unknown as Response
}

function mockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction
}

describe("tokenController.handleToken", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 400 when validation fails", async () => {
    mocks.mockValidate.mockReturnValue("grant_type is required")
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await tokenController.handleToken(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: "invalid_request",
      error_description: "grant_type is required",
    })
    expect(mocks.mockProcess).not.toHaveBeenCalled()
  })

  it("returns 200 on OK action", async () => {
    mocks.mockValidate.mockReturnValue(null)
    mocks.mockProcess.mockResolvedValue({ action: "OK", responseContent: '{"access_token":"at-1"}' })
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await tokenController.handleToken(req, res, next)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.send).toHaveBeenCalledWith('{"access_token":"at-1"}')
  })

  it("returns 400 on BAD_REQUEST action", async () => {
    mocks.mockValidate.mockReturnValue(null)
    mocks.mockProcess.mockResolvedValue({ action: "BAD_REQUEST", responseContent: null })
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await tokenController.handleToken(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("returns 401 on INVALID_CLIENT with Authorization header", async () => {
    mocks.mockValidate.mockReturnValue(null)
    mocks.mockProcess.mockResolvedValue({ action: "INVALID_CLIENT", responseContent: null })
    const req = mockReq({ headers: { authorization: "Basic xxx" } })
    const res = mockRes()
    const next = mockNext()

    await tokenController.handleToken(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.setHeader).toHaveBeenCalledWith("WWW-Authenticate", 'Basic realm="Authlete"')
  })

  it("returns 400 on INVALID_CLIENT without Authorization header", async () => {
    mocks.mockValidate.mockReturnValue(null)
    mocks.mockProcess.mockResolvedValue({ action: "INVALID_CLIENT", responseContent: null })
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await tokenController.handleToken(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("returns 500 on INTERNAL_SERVER_ERROR action", async () => {
    mocks.mockValidate.mockReturnValue(null)
    mocks.mockProcess.mockResolvedValue({ action: "INTERNAL_SERVER_ERROR", responseContent: null })
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await tokenController.handleToken(req, res, next)

    expect(res.status).toHaveBeenCalledWith(500)
  })

  it("returns 200 on JWT_BEARER with successful verification", async () => {
    mocks.mockValidate.mockReturnValue(null)
    mocks.mockProcess.mockResolvedValue({ action: "JWT_BEARER", assertion: "jwt", clientId: 1 })
    mocks.mockProcessJwtBearer.mockResolvedValue({
      ok: true,
      accessToken: "at-jwt",
      tokenType: "Bearer",
      expiresIn: 3600,
      scope: "openid",
      clientId: 1,
      subject: "user-1",
    })
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await tokenController.handleToken(req, res, next)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.send).toHaveBeenCalledWith(JSON.stringify({
      access_token: "at-jwt",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "openid",
      client_id: 1,
      subject: "user-1",
    }))
  })

  it("passes through JWT_BEARER error result", async () => {
    mocks.mockValidate.mockReturnValue(null)
    mocks.mockProcess.mockResolvedValue({ action: "JWT_BEARER", assertion: "jwt", clientId: 1 })
    mocks.mockProcessJwtBearer.mockResolvedValue({ ok: false, status: 400, body: { error: "invalid_request", error_description: "Missing assertion" } })
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await tokenController.handleToken(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: "invalid_request", error_description: "Missing assertion" })
  })

  it("returns 200 on PASSWORD with valid credentials", async () => {
    mocks.mockValidate.mockReturnValue(null)
    mocks.mockProcess.mockResolvedValue({ action: "PASSWORD", username: "admin", password: "pass", ticket: "t-1" })
    mocks.mockLoginValidate.mockResolvedValue({ subject: "sub-1", name: "Admin" })
    mocks.mockIssue.mockResolvedValue({ action: "OK", responseContent: '{"access_token":"at-pw"}' })
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await tokenController.handleToken(req, res, next)

    expect(mocks.mockLoginValidate).toHaveBeenCalledWith("admin", "pass")
    expect(mocks.mockIssue).toHaveBeenCalledWith({ ticket: "t-1", subject: "sub-1" })
  })

  it("returns 500 on PASSWORD with invalid credentials", async () => {
    mocks.mockValidate.mockReturnValue(null)
    mocks.mockProcess.mockResolvedValue({ action: "PASSWORD", username: "admin", password: "wrong", ticket: "t-1" })
    mocks.mockLoginValidate.mockResolvedValue(null)
    mocks.mockFail.mockResolvedValue({ action: "OK", responseContent: null })
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await tokenController.handleToken(req, res, next)

    expect(mocks.mockLoginValidate).toHaveBeenCalledWith("admin", "wrong")
    expect(mocks.mockFail).toHaveBeenCalledWith({
      ticket: "t-1",
      reason: "INVALID_RESOURCE_OWNER_CREDENTIALS",
    })
  })

  it("returns 400 on PASSWORD when missing fields", async () => {
    mocks.mockValidate.mockReturnValue(null)
    mocks.mockProcess.mockResolvedValue({ action: "PASSWORD" })
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await tokenController.handleToken(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("returns 500 for unknown action", async () => {
    mocks.mockValidate.mockReturnValue(null)
    mocks.mockProcess.mockResolvedValue({ action: "UNKNOWN_ACTION" })
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await tokenController.handleToken(req, res, next)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.send).toHaveBeenCalledWith("Unknown token action")
  })

  it("calls next with error on exception", async () => {
    mocks.mockValidate.mockReturnValue(null)
    mocks.mockProcess.mockRejectedValue(new Error("API failure"))
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await tokenController.handleToken(req, res, next)

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "API failure" }))
  })
})
