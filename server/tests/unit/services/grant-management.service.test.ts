import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { GrantManagementService } from "../../../src/services/grant-management.service"
import { Authlete } from "@authlete/typescript-sdk"

describe("GrantManagementService", () => {
  let mockApi: Authlete
  let service: GrantManagementService

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new GrantManagementService(mockApi)
  })

  describe("query", () => {
    it("calls grantManagement.processRequest with QUERY action", async () => {
      const mockResponse = { action: "OK", grantId: "g-1" }
      vi.mocked(mockApi.grantManagement.processRequest).mockResolvedValue(mockResponse as any)

      const req = { headers: { authorization: "Bearer tok-1" } } as any
      const result = await service.query(req, "g-1")

      expect(mockApi.grantManagement.processRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          gMRequest: expect.objectContaining({
            accessToken: "tok-1",
            gmAction: "QUERY",
            grantId: "g-1",
          }),
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe("revoke", () => {
    it("calls grantManagement.processRequest with REVOKE action", async () => {
      const mockResponse = { action: "OK" }
      vi.mocked(mockApi.grantManagement.processRequest).mockResolvedValue(mockResponse as any)

      const req = { headers: { authorization: "Bearer tok-1" } } as any
      const result = await service.revoke(req, "g-1")

      expect(mockApi.grantManagement.processRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          gMRequest: expect.objectContaining({
            accessToken: "tok-1",
            gmAction: "REVOKE",
            grantId: "g-1",
          }),
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })
})
