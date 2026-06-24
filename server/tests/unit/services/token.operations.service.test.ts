import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { TokenManagementService } from "../../../src/services/token.operations.service"
import { Authlete } from "@authlete/typescript-sdk"

describe("TokenManagementService", () => {
  let mockApi: Authlete
  let service: TokenManagementService

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new TokenManagementService(mockApi)
  })

  describe("create", () => {
    it("calls token.management.create with normalized request", async () => {
      const mockResponse = { action: "OK", accessToken: "at-1" }
      vi.mocked(mockApi.token.management.create).mockResolvedValue(mockResponse as any)

      const req = { body: { grant_type: "authorization_code", clientId: "123", subject: "user-1" }, headers: {} } as any
      const result = await service.create(req)

      expect(mockApi.token.management.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenCreateRequest: expect.objectContaining({
            grantType: "AUTHORIZATION_CODE",
            clientId: 123,
            subject: "user-1",
          }),
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe("update", () => {
    it("calls token.management.update with access token", async () => {
      vi.mocked(mockApi.token.management.update).mockResolvedValue({ action: "OK" } as any)

      const req = { body: { accessToken: "at-1" } } as any
      await service.update(req)

      expect(mockApi.token.management.update).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenUpdateRequest: expect.objectContaining({ accessToken: "at-1" }),
        })
      )
    })
  })

  describe("delete", () => {
    it("calls token.management.delete", async () => {
      vi.mocked(mockApi.token.management.delete).mockResolvedValue(undefined as any)

      await service.delete("tok-1")
      expect(mockApi.token.management.delete).toHaveBeenCalledWith(
        expect.objectContaining({ accessTokenIdentifier: "tok-1" })
      )
    })
  })

  describe("list", () => {
    it("calls token.management.list", async () => {
      const mockResponse = { tokens: [] }
      vi.mocked(mockApi.token.management.list).mockResolvedValue(mockResponse as any)

      const result = await service.list()
      expect(mockApi.token.management.list).toHaveBeenCalledOnce()
      expect(result).toEqual(mockResponse)
    })
  })

  describe("revoke", () => {
    it("calls token.management.revoke", async () => {
      vi.mocked(mockApi.token.management.revoke).mockResolvedValue({ action: "OK" } as any)

      const req = { body: { accessTokenIdentifier: "ati-1" } } as any
      await service.revoke(req)
      expect(mockApi.token.management.revoke).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenRevokeRequest: expect.objectContaining({ accessTokenIdentifier: "ati-1" }),
        })
      )
    })
  })
})
