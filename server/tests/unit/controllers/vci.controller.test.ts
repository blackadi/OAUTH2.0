import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextFunction, Request, Response } from "express"
import { createVciControllers } from "../../../src/controllers/vci.controller"

const mockVciService = {
  getMetadata: vi.fn(),
  getJwtIssuer: vi.fn(),
  getJwks: vi.fn(),
  createOffer: vi.fn(),
  getOfferInfo: vi.fn(),
  issueSingle: vi.fn(),
  batchIssue: vi.fn(),
  issueDeferred: vi.fn(),
}

const {
  metadata,
  jwtIssuer,
  jwks,
  offer,
  credential,
} = createVciControllers(mockVciService as any)

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

describe("VCI controllers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv("MGMT_CLIENT_ID", "")
    vi.stubEnv("MGMT_CLIENT_SECRET", "")
  })

  describe("metadata.handleMetadata", () => {
    it("returns 200 with parsed responseContent on OK", async () => {
      mockVciService.getMetadata.mockResolvedValue({
        action: "OK",
        responseContent: '{"credential_issuer":"https://example.com","credential_configurations_supported":{}}',
      })
      const req = mockReq()
      const res = mockRes()
      const next = mockNext()

      await metadata.handleMetadata(req, res, next)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({
        credential_issuer: "https://example.com",
        credential_configurations_supported: {},
      })
    })

    it("returns 200 with raw responseContent on invalid JSON", async () => {
      mockVciService.getMetadata.mockResolvedValue({ action: "OK", responseContent: "not-json" })
      const req = mockReq()
      const res = mockRes()
      const next = mockNext()

      await metadata.handleMetadata(req, res, next)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.send).toHaveBeenCalledWith("not-json")
    })

    it("returns 404 on NOT_FOUND action", async () => {
      mockVciService.getMetadata.mockResolvedValue({ action: "NOT_FOUND" })
      const req = mockReq()
      const res = mockRes()
      const next = mockNext()

      await metadata.handleMetadata(req, res, next)

      expect(res.status).toHaveBeenCalledWith(404)
    })

    it("calls next on exception", async () => {
      mockVciService.getMetadata.mockRejectedValue(new Error("metadata fail"))
      const req = mockReq()
      const res = mockRes()
      const next = mockNext()

      await metadata.handleMetadata(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "metadata fail" }))
    })
  })

  describe("jwtIssuer.handleJwtIssuer", () => {
    it("returns 200 with parsed responseContent on OK", async () => {
      mockVciService.getJwtIssuer.mockResolvedValue({
        action: "OK",
        responseContent: '{"issuer":"https://example.com"}',
      })
      const req = mockReq()
      const res = mockRes()
      const next = mockNext()

      await jwtIssuer.handleJwtIssuer(req, res, next)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ issuer: "https://example.com" })
    })
  })

  describe("jwks.handleJwks", () => {
    it("returns 200 with parsed responseContent on OK", async () => {
      mockVciService.getJwks.mockResolvedValue({
        action: "OK",
        responseContent: '{"keys":[]}',
      })
      const req = mockReq()
      const res = mockRes()
      const next = mockNext()

      await jwks.handleJwks(req, res, next)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ keys: [] })
    })
  })

  describe("offer.handleCreateOffer", () => {
    it("returns 201 on CREATED action", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin")
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
      mockVciService.createOffer.mockResolvedValue({ action: "CREATED", info: { identifier: "offer123" } })
      const req = mockReq({
        headers: { authorization: "Basic YWRtaW46c2VjcmV0" },
        body: { credentialConfigurationIds: ["VerifiedEmployee"] },
      })
      const res = mockRes()
      const next = mockNext()

      await offer.handleCreateOffer(req, res, next)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith({ action: "CREATED", info: { identifier: "offer123" } })
    })

    it("returns 401 when Basic auth fails", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin")
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
      const req = mockReq()
      const res = mockRes()
      const next = mockNext()

      await offer.handleCreateOffer(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(mockVciService.createOffer).not.toHaveBeenCalled()
    })

    it("returns 400 on CALLER_ERROR action", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin")
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
      mockVciService.createOffer.mockResolvedValue({ action: "CALLER_ERROR" })
      const req = mockReq({
        headers: { authorization: "Basic YWRtaW46c2VjcmV0" },
        body: { credentialConfigurationIds: ["VerifiedEmployee"] },
      })
      const res = mockRes()
      const next = mockNext()

      await offer.handleCreateOffer(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
    })

    it("calls next on exception", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin")
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
      mockVciService.createOffer.mockRejectedValue(new Error("create fail"))
      const req = mockReq({
        headers: { authorization: "Basic YWRtaW46c2VjcmV0" },
        body: { credentialConfigurationIds: ["VerifiedEmployee"] },
      })
      const res = mockRes()
      const next = mockNext()

      await offer.handleCreateOffer(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "create fail" }))
    })
  })

  describe("offer.handleGetOfferInfo", () => {
    it("returns 200 on OK action", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin")
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
      mockVciService.getOfferInfo.mockResolvedValue({ action: "OK", info: { identifier: "offer123" } })
      const req = mockReq({
        headers: { authorization: "Basic YWRtaW46c2VjcmV0" },
        body: { identifier: "offer123" },
      })
      const res = mockRes()
      const next = mockNext()

      await offer.handleGetOfferInfo(req, res, next)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(mockVciService.getOfferInfo).toHaveBeenCalledWith("offer123")
    })

    it("returns 404 on NOT_FOUND action", async () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin")
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret")
      mockVciService.getOfferInfo.mockResolvedValue({ action: "NOT_FOUND" })
      const req = mockReq({
        headers: { authorization: "Basic YWRtaW46c2VjcmV0" },
        body: { identifier: "nonexistent" },
      })
      const res = mockRes()
      const next = mockNext()

      await offer.handleGetOfferInfo(req, res, next)

      expect(res.status).toHaveBeenCalledWith(404)
    })
  })

  describe("credential.handleIssueSingle", () => {
    it("returns 200 on OK action", async () => {
      mockVciService.issueSingle.mockResolvedValue({ action: "OK" })
      const req = mockReq({
        body: { accessToken: "token123", order: { requestIdentifier: "cred123" } },
      })
      const res = mockRes()
      const next = mockNext()

      await credential.handleIssueSingle(req, res, next)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(mockVciService.issueSingle).toHaveBeenCalledWith("token123", { requestIdentifier: "cred123" })
    })

    it("returns 202 on ACCEPTED action", async () => {
      mockVciService.issueSingle.mockResolvedValue({ action: "ACCEPTED", transactionId: "txn123" })
      const req = mockReq({
        body: { accessToken: "token123", order: { issuanceDeferred: true } },
      })
      const res = mockRes()
      const next = mockNext()

      await credential.handleIssueSingle(req, res, next)

      expect(res.status).toHaveBeenCalledWith(202)
    })

    it("returns 401 when accessToken is missing", async () => {
      const req = mockReq({ body: {} })
      const res = mockRes()
      const next = mockNext()

      await credential.handleIssueSingle(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
    })
  })

  describe("credential.handleIssueDeferred", () => {
    it("returns 200 on OK action", async () => {
      mockVciService.issueDeferred.mockResolvedValue({ action: "OK", credential: "eyJ..." })
      const req = mockReq({
        body: { order: { requestIdentifier: "def123" } },
      })
      const res = mockRes()
      const next = mockNext()

      await credential.handleIssueDeferred(req, res, next)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(mockVciService.issueDeferred).toHaveBeenCalledWith({ requestIdentifier: "def123" })
    })
  })

  describe("credential.handleBatchIssue", () => {
    it("converts credential_requests to orders and calls batchIssue", async () => {
      mockVciService.batchIssue.mockResolvedValue({ action: "OK" })
      const req = mockReq({
        body: {
          accessToken: "token123",
          credential_requests: [
            { format: "vc+sd-jwt", vct: "https://example.com/identity" },
            { format: "mso_mdoc", doctype: "org.iso.18013.5.1.mDL" },
          ],
        },
      })
      const res = mockRes()
      const next = mockNext()

      await credential.handleBatchIssue(req, res, next)

      expect(mockVciService.batchIssue).toHaveBeenCalledWith("token123", [
        { requestIdentifier: "cred-1", credentialPayload: '{"format":"vc+sd-jwt","vct":"https://example.com/identity"}' },
        { requestIdentifier: "cred-2", credentialPayload: '{"format":"mso_mdoc","doctype":"org.iso.18013.5.1.mDL"}' },
      ])
      expect(res.status).toHaveBeenCalledWith(200)
    })

    it("passes orders directly when provided (Authlete format)", async () => {
      mockVciService.batchIssue.mockResolvedValue({ action: "OK" })
      const req = mockReq({
        body: {
          accessToken: "token123",
          orders: [
            { requestIdentifier: "my-cred", credentialPayload: "extra-data" },
          ],
        },
      })
      const res = mockRes()
      const next = mockNext()

      await credential.handleBatchIssue(req, res, next)

      expect(mockVciService.batchIssue).toHaveBeenCalledWith("token123", [
        { requestIdentifier: "my-cred", credentialPayload: "extra-data" },
      ])
    })

    it("returns 401 when accessToken is missing", async () => {
      const req = mockReq({ body: { credential_requests: [{ format: "vc+sd-jwt" }] } })
      const res = mockRes()
      const next = mockNext()

      await credential.handleBatchIssue(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
    })

    it("returns 400 when neither credential_requests nor orders is provided", async () => {
      const req = mockReq({ body: { accessToken: "token123" } })
      const res = mockRes()
      const next = mockNext()

      await credential.handleBatchIssue(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
    })
  })
})
