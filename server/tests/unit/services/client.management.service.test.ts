import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { ClientManagementService } from "../../../src/services/client.management.service"
import { Authlete } from "@authlete/typescript-sdk"

describe("ClientManagementService", () => {
  let mockApi: Authlete
  let service: ClientManagementService

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new ClientManagementService(mockApi)
  })

  describe("list", () => {
    it("calls client.list with pagination params", async () => {
      const mockResponse = { clients: [], totalCount: 0 }
      vi.mocked(mockApi.client.list).mockResolvedValue(mockResponse as any)

      const req = { body: { start: 0, end: 20 }, query: {} } as any
      const result = await service.list(req)

      expect(mockApi.client.list).toHaveBeenCalledWith(
        expect.objectContaining({ start: 0, end: 20 })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe("get", () => {
    it("calls client.get with clientId param", async () => {
      vi.mocked(mockApi.client.get).mockResolvedValue({ action: "OK" } as any)

      const req = { params: { clientId: "c-1" } } as any
      await service.get(req)
      expect(mockApi.client.get).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: "c-1" })
      )
    })
  })

  describe("create", () => {
    it("calls client.create with client input", async () => {
      vi.mocked(mockApi.client.create).mockResolvedValue({ action: "OK" } as any)

      const req = { body: { client: { clientName: "test", grantTypes: ["AUTHORIZATION_CODE"] } } } as any
      await service.create(req)

      expect(mockApi.client.create).toHaveBeenCalledWith(
        expect.objectContaining({
          client: expect.objectContaining({ clientName: "test" }),
        })
      )
    })
  })

  describe("delete", () => {
    it("calls client.delete with clientId", async () => {
      vi.mocked(mockApi.client.delete).mockResolvedValue(undefined as any)

      const req = { params: { clientId: "c-1" } } as any
      await service.delete(req)
      expect(mockApi.client.delete).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: "c-1" })
      )
    })
  })
})
