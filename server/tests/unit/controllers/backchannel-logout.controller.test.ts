import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextFunction, Request, Response } from "express"

const mocks = vi.hoisted(() => ({
  mockIssueToken: vi.fn(),
  mockIssueAndDeliver: vi.fn(),
  mockIssueAndDeliverToAll: vi.fn(),
}))

vi.mock("../../../src/services/backchannel-logout.service", () => ({
  BackchannelLogoutService: function() { return { issueToken: mocks.mockIssueToken, issueAndDeliver: mocks.mockIssueAndDeliver, issueAndDeliverToAll: mocks.mockIssueAndDeliverToAll } },
}))

import {
  backchannelLogoutIssueController,
  backchannelLogoutDeliverController,
  backchannelLogoutDeliverAllController,
} from "../../../src/controllers/backchannel-logout.controller"

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

describe("backchannelLogoutIssueController", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs() })

  it("returns 401 when Basic auth fails", async () => {
    vi.stubEnv("MGMT_CLIENT_ID", "admin")
    vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await backchannelLogoutIssueController.handleIssueToken(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(mocks.mockIssueToken).not.toHaveBeenCalled()
  })

  it("returns 400 when clientIdentifier is missing", async () => {
    vi.stubEnv("MGMT_CLIENT_ID", "admin")
    vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
    const req = mockReq({ headers: { authorization: "Basic YWRtaW46c2VjcmV0" } })
    const res = mockRes()
    const next = mockNext()

    await backchannelLogoutIssueController.handleIssueToken(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(mocks.mockIssueToken).not.toHaveBeenCalled()
  })

  it("returns 200 on OK action", async () => {
    vi.stubEnv("MGMT_CLIENT_ID", "admin")
    vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
    mocks.mockIssueToken.mockResolvedValue({ action: "OK", token: "lt-1" })
    const req = mockReq({ body: { clientIdentifier: "c-1" }, headers: { authorization: "Basic YWRtaW46c2VjcmV0" } })
    const res = mockRes()
    const next = mockNext()

    await backchannelLogoutIssueController.handleIssueToken(req, res, next)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(mocks.mockIssueToken).toHaveBeenCalledWith("c-1", undefined, undefined)
  })

  it("returns 400 on CALLER_ERROR action", async () => {
    vi.stubEnv("MGMT_CLIENT_ID", "admin")
    vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
    mocks.mockIssueToken.mockResolvedValue({ action: "CALLER_ERROR" })
    const req = mockReq({ body: { clientIdentifier: "c-1" }, headers: { authorization: "Basic YWRtaW46c2VjcmV0" } })
    const res = mockRes()
    const next = mockNext()

    await backchannelLogoutIssueController.handleIssueToken(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("returns 500 for unknown action", async () => {
    vi.stubEnv("MGMT_CLIENT_ID", "admin")
    vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
    mocks.mockIssueToken.mockResolvedValue({ action: "SERVER_ERROR" })
    const req = mockReq({ body: { clientIdentifier: "c-1" }, headers: { authorization: "Basic YWRtaW46c2VjcmV0" } })
    const res = mockRes()
    const next = mockNext()

    await backchannelLogoutIssueController.handleIssueToken(req, res, next)

    expect(res.status).toHaveBeenCalledWith(500)
  })

  it("calls next on exception", async () => {
    vi.stubEnv("MGMT_CLIENT_ID", "admin")
    vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
    mocks.mockIssueToken.mockRejectedValue(new Error("boom"))
    const req = mockReq({ body: { clientIdentifier: "c-1" }, headers: { authorization: "Basic YWRtaW46c2VjcmV0" } })
    const res = mockRes()
    const next = mockNext()

    await backchannelLogoutIssueController.handleIssueToken(req, res, next)

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }))
  })
})

describe("backchannelLogoutDeliverController", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs() })

  it("returns 401 when Basic auth fails", async () => {
    vi.stubEnv("MGMT_CLIENT_ID", "admin")
    vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await backchannelLogoutDeliverController.handleDeliver(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
  })

  it("returns 400 when clientIdentifier missing", async () => {
    vi.stubEnv("MGMT_CLIENT_ID", "admin")
    vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
    const req = mockReq({ headers: { authorization: "Basic YWRtaW46c2VjcmV0" } })
    const res = mockRes()
    const next = mockNext()

    await backchannelLogoutDeliverController.handleDeliver(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("returns 200 on successful delivery", async () => {
    vi.stubEnv("MGMT_CLIENT_ID", "admin")
    vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
    mocks.mockIssueAndDeliver.mockResolvedValue({ success: true })
    const req = mockReq({ body: { clientIdentifier: "c-1" }, headers: { authorization: "Basic YWRtaW46c2VjcmV0" } })
    const res = mockRes()
    const next = mockNext()

    await backchannelLogoutDeliverController.handleDeliver(req, res, next)

    expect(res.status).toHaveBeenCalledWith(200)
  })

  it("returns 502 on failed delivery", async () => {
    vi.stubEnv("MGMT_CLIENT_ID", "admin")
    vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
    mocks.mockIssueAndDeliver.mockResolvedValue({ success: false })
    const req = mockReq({ body: { clientIdentifier: "c-1" }, headers: { authorization: "Basic YWRtaW46c2VjcmV0" } })
    const res = mockRes()
    const next = mockNext()

    await backchannelLogoutDeliverController.handleDeliver(req, res, next)

    expect(res.status).toHaveBeenCalledWith(502)
  })
})

describe("backchannelLogoutDeliverAllController", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs() })

  it("returns 401 when Basic auth fails", async () => {
    vi.stubEnv("MGMT_CLIENT_ID", "admin")
    vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
    const req = mockReq()
    const res = mockRes()
    const next = mockNext()

    await backchannelLogoutDeliverAllController.handleDeliverAll(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
  })

  it("returns 400 when subject and sessionId are both missing", async () => {
    vi.stubEnv("MGMT_CLIENT_ID", "admin")
    vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
    const req = mockReq({ body: {}, headers: { authorization: "Basic YWRtaW46c2VjcmV0" } })
    const res = mockRes()
    const next = mockNext()

    await backchannelLogoutDeliverAllController.handleDeliverAll(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("returns 200 with results", async () => {
    vi.stubEnv("MGMT_CLIENT_ID", "admin")
    vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
    mocks.mockIssueAndDeliverToAll.mockResolvedValue([{ success: true }])
    const req = mockReq({ body: { subject: "user-1" }, headers: { authorization: "Basic YWRtaW46c2VjcmV0" } })
    const res = mockRes()
    const next = mockNext()

    await backchannelLogoutDeliverAllController.handleDeliverAll(req, res, next)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(mocks.mockIssueAndDeliverToAll).toHaveBeenCalledWith("user-1", undefined)
  })

  it("calls next on exception", async () => {
    vi.stubEnv("MGMT_CLIENT_ID", "admin")
    vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
    mocks.mockIssueAndDeliverToAll.mockRejectedValue(new Error("all-boom"))
    const req = mockReq({ body: { subject: "user-1" }, headers: { authorization: "Basic YWRtaW46c2VjcmV0" } })
    const res = mockRes()
    const next = mockNext()

    await backchannelLogoutDeliverAllController.handleDeliverAll(req, res, next)

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "all-boom" }))
  })
})
