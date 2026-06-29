import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextFunction, Request, Response } from "express"
import { createHskControllers } from "../../../src/controllers/hsk.controller"

const mockHskService = {
  create: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
  list: vi.fn(),
}

const { create, get, delete: del, list } = createHskControllers(mockHskService as any)

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, headers: {}, params: {}, logger: { error: vi.fn() }, ...overrides } as unknown as Request
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

describe("HSK controllers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv("MGMT_CLIENT_ID", "")
    vi.stubEnv("MGMT_CLIENT_SECRET", "")
  })

  describe("hskCreateController.handleCreate", () => {
    it("returns 401 when Basic auth fails with MGMT vars set", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin")
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
      const req = mockReq()
      const res = mockRes()
      const next = mockNext()

      await create.handleCreate(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(mockHskService.create).not.toHaveBeenCalled()
    })

    it("returns 201 on SUCCESS action", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin")
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
      const req = mockReq({ headers: { authorization: "Basic YWRtaW46c2VjcmV0" }, body: { kty: "EC", hsmName: "google" } })
      const res = mockRes()
      const next = mockNext()
      mockHskService.create.mockResolvedValue({ action: "SUCCESS", hsk: { handle: "abc" } })

      await create.handleCreate(req, res, next)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith({ action: "SUCCESS", hsk: { handle: "abc" } })
    })

    it("returns 400 on INVALID_REQUEST action", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin")
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
      const req = mockReq({ headers: { authorization: "Basic YWRtaW46c2VjcmV0" }, body: { kty: "EC", hsmName: "google" } })
      const res = mockRes()
      const next = mockNext()
      mockHskService.create.mockResolvedValue({ action: "INVALID_REQUEST" })

      await create.handleCreate(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
    })

    it("returns 404 on NOT_FOUND action", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin")
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
      const req = mockReq({ headers: { authorization: "Basic YWRtaW46c2VjcmV0" }, body: { kty: "EC", hsmName: "nonexistent" } })
      const res = mockRes()
      const next = mockNext()
      mockHskService.create.mockResolvedValue({ action: "NOT_FOUND" })

      await create.handleCreate(req, res, next)

      expect(res.status).toHaveBeenCalledWith(404)
    })

    it("calls next on exception", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin")
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
      const req = mockReq({ headers: { authorization: "Basic YWRtaW46c2VjcmV0" }, body: { kty: "EC", hsmName: "google" } })
      const res = mockRes()
      const next = mockNext()
      mockHskService.create.mockRejectedValue(new Error("HSK create fail"))

      await create.handleCreate(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "HSK create fail" }))
    })

    it("skips auth when MGMT vars not set", async () => {
      const req = mockReq({ body: { kty: "EC", hsmName: "google" } })
      const res = mockRes()
      const next = mockNext()
      mockHskService.create.mockResolvedValue({ action: "SUCCESS", hsk: { handle: "abc" } })

      await create.handleCreate(req, res, next)

      expect(mockHskService.create).toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(201)
    })

    it("returns 400 when service throws AppError", async () => {
      const AppError = (await import("../../../src/utils/app-error")).AppError
      mockHskService.create.mockRejectedValue(new AppError("Missing required field: kty", 400))
      const req = mockReq({ body: { hsmName: "google" } })
      const res = mockRes()
      const next = mockNext()

      await create.handleCreate(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
    })
  })

  describe("hskGetController.handleGet", () => {
    it("returns 200 on SUCCESS action", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin")
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
      const req = mockReq({ headers: { authorization: "Basic YWRtaW46c2VjcmV0" }, params: { handle: "abc123" } })
      const res = mockRes()
      const next = mockNext()
      mockHskService.get.mockResolvedValue({ action: "SUCCESS", hsk: { handle: "abc123" } })

      await get.handleGet(req, res, next)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(mockHskService.get).toHaveBeenCalledWith("abc123")
    })

    it("returns 404 on NOT_FOUND action", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin")
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
      const req = mockReq({ headers: { authorization: "Basic YWRtaW46c2VjcmV0" }, params: { handle: "nonexistent" } })
      const res = mockRes()
      const next = mockNext()
      mockHskService.get.mockResolvedValue({ action: "NOT_FOUND" })

      await get.handleGet(req, res, next)

      expect(res.status).toHaveBeenCalledWith(404)
    })

    it("calls next on exception", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin")
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
      const req = mockReq({ headers: { authorization: "Basic YWRtaW46c2VjcmV0" }, params: { handle: "abc123" } })
      const res = mockRes()
      const next = mockNext()
      mockHskService.get.mockRejectedValue(new Error("get fail"))

      await get.handleGet(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "get fail" }))
    })
  })

  describe("hskDeleteController.handleDelete", () => {
    it("returns 204 on SUCCESS action", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin")
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
      const req = mockReq({ headers: { authorization: "Basic YWRtaW46c2VjcmV0" }, params: { handle: "abc123" } })
      const res = mockRes()
      const next = mockNext()
      mockHskService.delete.mockResolvedValue({ action: "SUCCESS" })

      await del.handleDelete(req, res, next)

      expect(res.status).toHaveBeenCalledWith(204)
      expect(mockHskService.delete).toHaveBeenCalledWith("abc123")
    })

    it("returns 404 on NOT_FOUND action", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin")
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
      const req = mockReq({ headers: { authorization: "Basic YWRtaW46c2VjcmV0" }, params: { handle: "nonexistent" } })
      const res = mockRes()
      const next = mockNext()
      mockHskService.delete.mockResolvedValue({ action: "NOT_FOUND" })

      await del.handleDelete(req, res, next)

      expect(res.status).toHaveBeenCalledWith(404)
    })

    it("calls next on exception", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin")
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
      const req = mockReq({ headers: { authorization: "Basic YWRtaW46c2VjcmV0" }, params: { handle: "abc123" } })
      const res = mockRes()
      const next = mockNext()
      mockHskService.delete.mockRejectedValue(new Error("delete fail"))

      await del.handleDelete(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "delete fail" }))
    })
  })

  describe("hskListController.handleList", () => {
    it("returns 200 on SUCCESS action", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin")
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
      const req = mockReq({ headers: { authorization: "Basic YWRtaW46c2VjcmV0" } })
      const res = mockRes()
      const next = mockNext()
      mockHskService.list.mockResolvedValue({ action: "SUCCESS", hsks: [{ handle: "abc" }] })

      await list.handleList(req, res, next)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(mockHskService.list).toHaveBeenCalled()
    })

    it("returns 400 on INVALID_REQUEST action", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin")
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
      const req = mockReq({ headers: { authorization: "Basic YWRtaW46c2VjcmV0" } })
      const res = mockRes()
      const next = mockNext()
      mockHskService.list.mockResolvedValue({ action: "INVALID_REQUEST" })

      await list.handleList(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
    })

    it("calls next on exception", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin")
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
      const req = mockReq({ headers: { authorization: "Basic YWRtaW46c2VjcmV0" } })
      const res = mockRes()
      const next = mockNext()
      mockHskService.list.mockRejectedValue(new Error("list fail"))

      await list.handleList(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "list fail" }))
    })
  })
})
