import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { VciService } from "../../../src/services/vci.service"
import { Authlete } from "@authlete/typescript-sdk"

describe("VciService", () => {
  let mockApi: Authlete
  let service: VciService

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new VciService(mockApi)
  })

  describe("getMetadata", () => {
    it("calls verifiableCredentials.getMetadata", async () => {
      const mockResponse = { action: "OK", responseContent: '{"credential_issuer":"https://example.com"}' }
      vi.mocked(mockApi.verifiableCredentials.getMetadata).mockResolvedValue(mockResponse as any)

      const result = await service.getMetadata(true)

      expect(mockApi.verifiableCredentials.getMetadata).toHaveBeenCalledWith(
        expect.objectContaining({ vciMetadataRequest: { pretty: true } })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe("getJwtIssuer", () => {
    it("calls verifiableCredentials.getJwtIssuer", async () => {
      const mockResponse = { action: "OK", responseContent: '{"issuer":"https://example.com"}' }
      vi.mocked(mockApi.verifiableCredentials.getJwtIssuer).mockResolvedValue(mockResponse as any)

      const result = await service.getJwtIssuer(false)

      expect(mockApi.verifiableCredentials.getJwtIssuer).toHaveBeenCalledWith(
        expect.objectContaining({ vciJwtissuerRequest: { pretty: false } })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe("getJwks", () => {
    it("calls verifiableCredentials.getJwks", async () => {
      const mockResponse = { action: "OK", responseContent: '{"keys":[]}' }
      vi.mocked(mockApi.verifiableCredentials.getJwks).mockResolvedValue(mockResponse as any)

      const result = await service.getJwks(true)

      expect(mockApi.verifiableCredentials.getJwks).toHaveBeenCalledWith(
        expect.objectContaining({ vciJwksRequest: { pretty: true } })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe("createOffer", () => {
    it("calls verifiableCredentials.createOffer with valid body", async () => {
      const mockResponse = { action: "CREATED", info: { identifier: "offer123" } }
      vi.mocked(mockApi.verifiableCredentials.createOffer).mockResolvedValue(mockResponse as any)

      const req = {
        body: {
          credentialConfigurationIds: ["VerifiedEmployee"],
          subject: "user123",
          duration: 3600,
        },
        logger: vi.fn(),
      } as any

      const result = await service.createOffer(req)

      expect(mockApi.verifiableCredentials.createOffer).toHaveBeenCalledWith(
        expect.objectContaining({
          vciOfferCreateRequest: expect.objectContaining({
            credentialConfigurationIds: ["VerifiedEmployee"],
            subject: "user123",
            duration: 3600,
          }),
        })
      )
      expect(result).toEqual(mockResponse)
    })

    it("throws when credentialConfigurationIds is missing", async () => {
      const req = { body: {}, logger: vi.fn() } as any
      await expect(service.createOffer(req)).rejects.toThrow("Missing required body field: credentialConfigurationIds")
    })

    it("throws when credentialConfigurationIds is empty", async () => {
      const req = { body: { credentialConfigurationIds: [] }, logger: vi.fn() } as any
      await expect(service.createOffer(req)).rejects.toThrow("Missing required body field: credentialConfigurationIds")
    })
  })

  describe("getOfferInfo", () => {
    it("calls verifiableCredentials.getOfferInfo with identifier", async () => {
      const mockResponse = { action: "OK", info: { identifier: "offer123" } }
      vi.mocked(mockApi.verifiableCredentials.getOfferInfo).mockResolvedValue(mockResponse as any)

      const result = await service.getOfferInfo("offer123")

      expect(mockApi.verifiableCredentials.getOfferInfo).toHaveBeenCalledWith(
        expect.objectContaining({ vciOfferInfoRequest: { identifier: "offer123" } })
      )
      expect(result).toEqual(mockResponse)
    })

    it("throws when identifier is empty", async () => {
      await expect(service.getOfferInfo("")).rejects.toThrow("Missing required body field: identifier")
    })
  })

  describe("issueSingle", () => {
    it("calls verifiableCredentials.issue", async () => {
      const mockResponse = { action: "OK", credential: "eyJ..." }
      vi.mocked(mockApi.verifiableCredentials.issue).mockResolvedValue(mockResponse as any)

      const result = await service.issueSingle("token123", { requestIdentifier: "cred123" })

      expect(mockApi.verifiableCredentials.issue).toHaveBeenCalledWith(
        expect.objectContaining({
          vciSingleIssueRequest: { accessToken: "token123", order: { requestIdentifier: "cred123" } },
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe("batchIssue", () => {
    it("calls verifiableCredentials.batchIssue with orders", async () => {
      const mockResponse = { action: "OK", responseContent: '{"credential_responses":[]}' }
      vi.mocked(mockApi.verifiableCredentials.batchIssue).mockResolvedValue(mockResponse as any)

      const orders = [
        { requestIdentifier: "cred-1", credentialPayload: '{"format":"vc+sd-jwt","vct":"https://example.com/identity"}' },
      ]
      const result = await service.batchIssue("token123", orders)

      expect(mockApi.verifiableCredentials.batchIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          vciBatchIssueRequest: { accessToken: "token123", orders },
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe("issueDeferred", () => {
    it("calls verifiableCredentials.deferredIssue", async () => {
      const mockResponse = { action: "OK", credential: "eyJ..." }
      vi.mocked(mockApi.verifiableCredentials.deferredIssue).mockResolvedValue(mockResponse as any)

      const result = await service.issueDeferred({ requestIdentifier: "def123" })

      expect(mockApi.verifiableCredentials.deferredIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          vciDeferredIssueRequest: { order: { requestIdentifier: "def123" } },
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })
})
