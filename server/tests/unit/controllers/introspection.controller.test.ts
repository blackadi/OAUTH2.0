import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextFunction, Request, Response } from "express"

const mocks = vi.hoisted(() => ({
  mockProcess: vi.fn(),
}))

vi.mock("../../../src/services/introspection.service", () => ({
  IntrospectionService: function() { return { process: mocks.mockProcess, standardProcess: vi.fn() } },
}))

vi.mock("../../../src/utils/validate", () => ({
  validateIntrospectionParams: vi.fn(() => null),
}))

import { introspectionController } from "../../../src/controllers/introspection.controller"

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    body: { token: "test-token" },
    headers: {},
    logger: vi.fn(),
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

describe("IntrospectionController — RFC 9470 step-up", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 200 on OK with full result", async () => {
    mocks.mockProcess.mockResolvedValue({
      action: "OK",
      acr: "pwd",
      authTime: 1700000000,
      subject: "user-1",
    })
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await introspectionController.handleIntrospection(req, res, next)

    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ action: "OK", acr: "pwd", authTime: 1700000000 })
    )
  })

  it("returns 403 with structured step-up challenge on insufficient_user_authentication (ACR)", async () => {
    const wwwAuth = 'Bearer error="insufficient_user_authentication",error_description="ACR mismatch",error_uri="https://docs.authlete.com/#A341302",acr_values="urn:mace:incommon:iap:silver"'
    mocks.mockProcess.mockResolvedValue({
      action: "FORBIDDEN",
      responseContent: wwwAuth,
      acr: "pwd",
      authTime: 1700000000,
    })
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await introspectionController.handleIntrospection(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.setHeader).toHaveBeenCalledWith("WWW-Authenticate", wwwAuth)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "insufficient_user_authentication",
        acr_values: "urn:mace:incommon:iap:silver",
        acr: "pwd",
        auth_time: 1700000000,
      })
    )
  })

  it("returns 403 with structured step-up challenge on insufficient_user_authentication (max_age)", async () => {
    const wwwAuth = 'Bearer error="insufficient_user_authentication",error_description="auth_time too old",max_age="600"'
    mocks.mockProcess.mockResolvedValue({
      action: "FORBIDDEN",
      responseContent: wwwAuth,
      acr: "pwd",
      authTime: 1700000000,
    })
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await introspectionController.handleIntrospection(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "insufficient_user_authentication",
        max_age: "600",
        acr: "pwd",
        auth_time: 1700000000,
      })
    )
  })

  it("returns 403 with plain text for non-step-up FORBIDDEN", async () => {
    const wwwAuth = 'Bearer error="insufficient_scope",error_description="scope mismatch"'
    mocks.mockProcess.mockResolvedValue({
      action: "FORBIDDEN",
      responseContent: wwwAuth,
    })
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await introspectionController.handleIntrospection(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.send).toHaveBeenCalledWith(wwwAuth)
    // Should NOT call json() for non-step-up errors
    expect(res.json).not.toHaveBeenCalled()
  })

  it("returns 401 on UNAUTHORIZED", async () => {
    mocks.mockProcess.mockResolvedValue({
      action: "UNAUTHORIZED",
      responseContent: "Bearer error=\"invalid_token\"",
    })
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await introspectionController.handleIntrospection(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.send).toHaveBeenCalledWith("Bearer error=\"invalid_token\"")
  })

  it("returns 400 on BAD_REQUEST", async () => {
    mocks.mockProcess.mockResolvedValue({
      action: "BAD_REQUEST",
      responseContent: "missing token",
    })
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await introspectionController.handleIntrospection(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
  })
})
