import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
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

// T1-1 / 7662-W1: both introspection endpoints now require this deployment's admin Basic auth before any
// Authlete call. These cases exercise the RFC 9470 step-up mapping, so they authenticate and move on; the
// gate itself is covered by tests/unit/routes/introspection.routes.test.ts.
const ADMIN_HEADER = `Basic ${Buffer.from("mgmt-id:mgmt-secret").toString("base64")}`

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    body: { token: "test-token" },
    headers: { authorization: ADMIN_HEADER },
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
  const ORIGINAL_ID = process.env.MGMT_CLIENT_ID
  const ORIGINAL_SECRET = process.env.MGMT_CLIENT_SECRET

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.MGMT_CLIENT_ID = "mgmt-id"
    process.env.MGMT_CLIENT_SECRET = "mgmt-secret"
  })

  afterEach(() => {
    process.env.MGMT_CLIENT_ID = ORIGINAL_ID
    process.env.MGMT_CLIENT_SECRET = ORIGINAL_SECRET
  })

  // The gate must run before anything else, including request validation: an unauthenticated caller must not
  // be able to tell "malformed request" from "no such token".
  it("rejects an unauthenticated call without reaching Authlete", async () => {
    const req = mockReq({ headers: {} } as Partial<Request>)
    const res = mockRes()

    await introspectionController.handleIntrospection(req, res, mockNext())

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.setHeader).toHaveBeenCalledWith("WWW-Authenticate", expect.stringContaining("Basic"))
    expect(mocks.mockProcess).not.toHaveBeenCalled()
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

  // 9470-W6. The parser used to `split(/,\s*/)`, which splits on EVERY comma — including one inside a
  // quoted value, which RFC 9110 §11.2 explicitly permits. On this path the description is the whole
  // point: RFC 9470 step-up tells the client WHY it must re-authenticate, so a truncated one is a broken
  // feature. The `error_description` below is the exact shape that used to be cut in half.
  it("keeps a comma inside a quoted error_description intact", async () => {
    const wwwAuth =
      'Bearer error="insufficient_user_authentication",' +
      'error_description="Authentication is insufficient, please re-authenticate with a stronger method",' +
      'acr_values="urn:mace:incommon:iap:silver",max_age="300"'
    mocks.mockProcess.mockResolvedValue({ action: "FORBIDDEN", responseContent: wwwAuth })
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await introspectionController.handleIntrospection(req, res, next)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "insufficient_user_authentication",
        error_description:
          "Authentication is insufficient, please re-authenticate with a stronger method",
        // The parameters after the comma-bearing one must still be found.
        acr_values: "urn:mace:incommon:iap:silver",
        max_age: "300",
      })
    )
  })

  it("honours a backslash-escaped quote inside a description", async () => {
    const wwwAuth =
      'Bearer error="insufficient_user_authentication",' +
      'error_description="the \\"acr\\" claim did not match, try again",max_age="60"'
    mocks.mockProcess.mockResolvedValue({ action: "FORBIDDEN", responseContent: wwwAuth })
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await introspectionController.handleIntrospection(req, res, next)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error_description: 'the "acr" claim did not match, try again',
        max_age: "60",
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
