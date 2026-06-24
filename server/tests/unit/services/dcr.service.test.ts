import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { DcrService } from "../../../src/services/dcr.service"
import { Authlete } from "@authlete/typescript-sdk"

describe("DcrService", () => {
  let mockApi: Authlete
  let service: DcrService

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new DcrService(mockApi)
  })

  describe("register", () => {
    it("calls dynamicClientRegistration.register with json", async () => {
      const mockResponse = { action: "CREATED", responseContent: '{"client_id":"c-1"}' }
      vi.mocked(mockApi.dynamicClientRegistration.register).mockResolvedValue(mockResponse as any)

      const req = { body: { json: '{"client_name":"test"}' } } as any
      const result = await service.register(req)

      expect(mockApi.dynamicClientRegistration.register).toHaveBeenCalledWith(
        expect.objectContaining({ requestBody: { json: '{"client_name":"test"}' } })
      )
      expect(result).toEqual(mockResponse)
    })

    it("throws when json missing", async () => {
      const req = { body: {} } as any
      await expect(service.register(req)).rejects.toThrow("Missing required body field: json")
    })
  })

  describe("get", () => {
    it("calls dynamicClientRegistration.get with token and clientId", async () => {
      const mockResponse = { action: "OK", responseContent: '{"client_id":"c-1"}' }
      vi.mocked(mockApi.dynamicClientRegistration.get).mockResolvedValue(mockResponse as any)

      const req = { body: { token: "reg-token", clientId: "c-1" } } as any
      const result = await service.get(req)

      expect(mockApi.dynamicClientRegistration.get).toHaveBeenCalledWith(
        expect.objectContaining({ requestBody: { token: "reg-token", clientId: "c-1" } })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe("update", () => {
    it("calls dynamicClientRegistration.update with json, token, clientId", async () => {
      vi.mocked(mockApi.dynamicClientRegistration.update).mockResolvedValue({ action: "UPDATED" } as any)

      const req = { body: { json: '{"client_name":"new"}', token: "reg-token", clientId: "c-1" } } as any
      await service.update(req)

      expect(mockApi.dynamicClientRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: { json: '{"client_name":"new"}', token: "reg-token", clientId: "c-1" },
        })
      )
    })
  })

  describe("delete", () => {
    it("calls dynamicClientRegistration.delete with token and clientId", async () => {
      vi.mocked(mockApi.dynamicClientRegistration.delete).mockResolvedValue({ action: "DELETED" } as any)

      const req = { body: { token: "reg-token", clientId: "c-1" } } as any
      await service.delete(req)

      expect(mockApi.dynamicClientRegistration.delete).toHaveBeenCalledWith(
        expect.objectContaining({ requestBody: { token: "reg-token", clientId: "c-1" } })
      )
    })
  })
})
