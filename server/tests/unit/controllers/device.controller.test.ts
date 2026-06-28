import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextFunction, Request, Response } from "express"
import { createDeviceControllers } from "../../../src/controllers/device.controller"

const mockDeviceService = {
  authorization: vi.fn(),
  verification: vi.fn(),
  complete: vi.fn(),
}

const { authorization, verification, complete } = createDeviceControllers(mockDeviceService as any)

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, headers: {}, logger: Object.assign(vi.fn(), { error: vi.fn() }), ...overrides } as unknown as Request
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

describe("deviceAuthorizationController", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 400 when parameters is missing", async () => {
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await authorization.handle(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: "invalid_request", error_description: "Missing required field: parameters" })
  })

  it("returns 200 on OK action", async () => {
    mockDeviceService.authorization.mockResolvedValue({ action: "OK", deviceCode: "dc-1", userCode: "uc-1" })
    const req = mockReq({ body: { parameters: "client_id=c-1&scope=openid" } })
    const res = mockRes()
    const next = mockNext()

    await authorization.handle(req, res, next)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ action: "OK", deviceCode: "dc-1", userCode: "uc-1" })
  })

  it("returns 400 on BAD_REQUEST action", async () => {
    mockDeviceService.authorization.mockResolvedValue({ action: "BAD_REQUEST" })
    const req = mockReq({ body: { parameters: "bad" } })
    const res = mockRes()
    const next = mockNext()

    await authorization.handle(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("returns 401 on UNAUTHORIZED action", async () => {
    mockDeviceService.authorization.mockResolvedValue({ action: "UNAUTHORIZED" })
    const req = mockReq({ body: { parameters: "bad" } })
    const res = mockRes()
    const next = mockNext()

    await authorization.handle(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
  })

  it("calls next on exception", async () => {
    mockDeviceService.authorization.mockRejectedValue(new Error("boom"))
    const req = mockReq({ body: { parameters: "test" } })
    const res = mockRes()
    const next = mockNext()

    await authorization.handle(req, res, next)

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }))
  })
})

describe("deviceVerificationController", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 400 when userCode is missing", async () => {
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await verification.handle(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: "invalid_request", error_description: "Missing required field: userCode" })
  })

  it("returns 200 on VALID action", async () => {
    mockDeviceService.verification.mockResolvedValue({ action: "VALID", clientId: 12345, clientName: "Test App" })
    const req = mockReq({ body: { userCode: "ABC123" } })
    const res = mockRes()
    const next = mockNext()

    await verification.handle(req, res, next)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ action: "VALID", clientId: 12345, clientName: "Test App" })
  })

  it("returns 404 on NOT_EXIST action", async () => {
    mockDeviceService.verification.mockResolvedValue({ action: "NOT_EXIST" })
    const req = mockReq({ body: { userCode: "INVALID" } })
    const res = mockRes()
    const next = mockNext()

    await verification.handle(req, res, next)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it("returns 400 on EXPIRED action", async () => {
    mockDeviceService.verification.mockResolvedValue({ action: "EXPIRED" })
    const req = mockReq({ body: { userCode: "OLD" } })
    const res = mockRes()
    const next = mockNext()

    await verification.handle(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("calls next on exception", async () => {
    mockDeviceService.verification.mockRejectedValue(new Error("verify-boom"))
    const req = mockReq({ body: { userCode: "ABC123" } })
    const res = mockRes()
    const next = mockNext()

    await verification.handle(req, res, next)

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "verify-boom" }))
  })
})

describe("deviceCompleteController", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 400 when userCode is missing", async () => {
    const req = mockReq({ body: { result: "AUTHORIZED", subject: "user-1" } })
    const res = mockRes()
    const next = mockNext()

    await complete.handle(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: "invalid_request", error_description: "Missing required field: userCode" })
  })

  it("returns 400 when result is missing", async () => {
    const req = mockReq({ body: { userCode: "ABC123", subject: "user-1" } })
    const res = mockRes()
    const next = mockNext()

    await complete.handle(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("returns 400 when subject is missing", async () => {
    const req = mockReq({ body: { userCode: "ABC123", result: "AUTHORIZED" } })
    const res = mockRes()
    const next = mockNext()

    await complete.handle(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("returns 200 on SUCCESS action", async () => {
    mockDeviceService.complete.mockResolvedValue({ action: "SUCCESS" })
    const req = mockReq({ body: { userCode: "ABC123", result: "AUTHORIZED", subject: "user-1" } })
    const res = mockRes()
    const next = mockNext()

    await complete.handle(req, res, next)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ action: "SUCCESS" })
  })

  it("returns 404 on USER_CODE_NOT_EXIST action", async () => {
    mockDeviceService.complete.mockResolvedValue({ action: "USER_CODE_NOT_EXIST" })
    const req = mockReq({ body: { userCode: "GHOST", result: "AUTHORIZED", subject: "user-1" } })
    const res = mockRes()
    const next = mockNext()

    await complete.handle(req, res, next)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it("returns 400 on USER_CODE_EXPIRED action", async () => {
    mockDeviceService.complete.mockResolvedValue({ action: "USER_CODE_EXPIRED" })
    const req = mockReq({ body: { userCode: "OLD", result: "AUTHORIZED", subject: "user-1" } })
    const res = mockRes()
    const next = mockNext()

    await complete.handle(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("calls next on exception", async () => {
    mockDeviceService.complete.mockRejectedValue(new Error("complete-boom"))
    const req = mockReq({ body: { userCode: "ABC123", result: "AUTHORIZED", subject: "user-1" } })
    const res = mockRes()
    const next = mockNext()

    await complete.handle(req, res, next)

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "complete-boom" }))
  })
})
