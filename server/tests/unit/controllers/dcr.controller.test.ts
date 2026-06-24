import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextFunction, Request, Response } from "express"

const mocks = vi.hoisted(() => ({
  mockRegister: vi.fn(),
  mockGet: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
}))

vi.mock("../../../src/services/dcr.service", () => ({
  DcrService: function() { return { register: mocks.mockRegister, get: mocks.mockGet, update: mocks.mockUpdate, delete: mocks.mockDelete } },
}))

import { dcrRegisterController, dcrGetController, dcrUpdateController, dcrDeleteController } from "../../../src/controllers/dcr.controller"

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, headers: {}, logger: { error: vi.fn() }, ...overrides } as unknown as Request
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

describe("DCR controllers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  describe("dcrRegisterController.handleDcrRegister", () => {
    it("returns 401 when Basic auth fails with MGMT vars set", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin")
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
      const req = mockReq()
      const res = mockRes()
      const next = mockNext()

      await dcrRegisterController.handleDcrRegister(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(mocks.mockRegister).not.toHaveBeenCalled()
    })

    it("returns 201 on CREATED action", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin")
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
      const req = mockReq({ headers: { authorization: "Basic YWRtaW46c2VjcmV0" } })
      const res = mockRes()
      const next = mockNext()
      mocks.mockRegister.mockResolvedValue({ action: "CREATED", responseContent: '{"client_id":"c-1"}' })

      await dcrRegisterController.handleDcrRegister(req, res, next)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalled()
    })

    it("returns 400 on BAD_REQUEST action", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin")
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
      const req = mockReq({ headers: { authorization: "Basic YWRtaW46c2VjcmV0" } })
      const res = mockRes()
      const next = mockNext()
      mocks.mockRegister.mockResolvedValue({ action: "BAD_REQUEST", responseContent: null })

      await dcrRegisterController.handleDcrRegister(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
    })

    it("calls next on exception", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin")
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
      const req = mockReq({ headers: { authorization: "Basic YWRtaW46c2VjcmV0" } })
      const res = mockRes()
      const next = mockNext()
      mocks.mockRegister.mockRejectedValue(new Error("DCR fail"))

      await dcrRegisterController.handleDcrRegister(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "DCR fail" }))
    })

    it("skips auth when MGMT vars not set", async () => {
      const req = mockReq()
      const res = mockRes()
      const next = mockNext()
      mocks.mockRegister.mockResolvedValue({ action: "OK", responseContent: null })

      await dcrRegisterController.handleDcrRegister(req, res, next)

      expect(mocks.mockRegister).toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(200)
    })
  })

  describe("dcrGetController.handleDcrGet", () => {
    it("returns 200 with action OK", async () => {
      const req = mockReq()
      const res = mockRes()
      const next = mockNext()
      mocks.mockGet.mockResolvedValue({ action: "OK", responseContent: '{"client_id":"c-1"}' })

      await dcrGetController.handleDcrGet(req, res, next)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalled()
    })

    it("calls next on exception", async () => {
      const req = mockReq()
      const res = mockRes()
      const next = mockNext()
      mocks.mockGet.mockRejectedValue(new Error("get fail"))

      await dcrGetController.handleDcrGet(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "get fail" }))
    })
  })

  describe("dcrUpdateController.handleDcrUpdate", () => {
    it("returns 200 on UPDATED action", async () => {
      const req = mockReq()
      const res = mockRes()
      const next = mockNext()
      mocks.mockUpdate.mockResolvedValue({ action: "UPDATED", responseContent: null })

      await dcrUpdateController.handleDcrUpdate(req, res, next)

      expect(res.status).toHaveBeenCalledWith(200)
    })
  })

  describe("dcrDeleteController.handleDcrDelete", () => {
    it("returns 204 on DELETED action", async () => {
      const req = mockReq()
      const res = mockRes()
      const next = mockNext()
      mocks.mockDelete.mockResolvedValue({ action: "DELETED" })

      await dcrDeleteController.handleDcrDelete(req, res, next)

      expect(res.status).toHaveBeenCalledWith(204)
    })

    it("returns 500 on INTERNAL_SERVER_ERROR", async () => {
      const req = mockReq()
      const res = mockRes()
      const next = mockNext()
      mocks.mockDelete.mockResolvedValue({ action: "INTERNAL_SERVER_ERROR", responseContent: null })

      await dcrDeleteController.handleDcrDelete(req, res, next)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })
})
