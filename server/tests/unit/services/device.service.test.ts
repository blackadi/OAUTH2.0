import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { DeviceService } from "../../../src/services/device.service"
import { Authlete } from "@authlete/typescript-sdk"

describe("DeviceService", () => {
  let mockApi: Authlete
  let service: DeviceService

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new DeviceService(mockApi)
  })

  describe("authorization", () => {
    it("calls deviceFlow.authorization with parameters", async () => {
      const mockResponse = { action: "OK", deviceCode: "dc-1", userCode: "uc-1" }
      vi.mocked(mockApi.deviceFlow.authorization).mockResolvedValue(mockResponse as any)

      const req = { body: { parameters: "client_id=c-1&scope=openid", clientId: "c-1", clientSecret: "s-1" } } as any
      const result = await service.authorization(req)

      expect(mockApi.deviceFlow.authorization).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceAuthorizationRequest: {
            parameters: "client_id=c-1&scope=openid",
            clientId: "c-1",
            clientSecret: "s-1",
          },
        })
      )
      expect(result).toEqual(mockResponse)
    })

    it("throws when parameters is missing", async () => {
      const req = { body: {} } as any
      await expect(service.authorization(req)).rejects.toThrow("Missing required body field: parameters")
    })
  })

  describe("verification", () => {
    it("calls deviceFlow.verification with userCode", async () => {
      const mockResponse = { action: "VALID", clientId: 12345, clientName: "Test App" }
      vi.mocked(mockApi.deviceFlow.verification).mockResolvedValue(mockResponse as any)

      const result = await service.verification("ABC123")

      expect(mockApi.deviceFlow.verification).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceVerificationRequest: { userCode: "ABC123" },
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe("complete", () => {
    it("calls deviceFlow.complete with userCode, result, and subject", async () => {
      const mockResponse = { action: "SUCCESS" }
      vi.mocked(mockApi.deviceFlow.complete).mockResolvedValue(mockResponse as any)

      const result = await service.complete("ABC123", "AUTHORIZED", "user-1")

      expect(mockApi.deviceFlow.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceCompleteRequest: expect.objectContaining({
            userCode: "ABC123",
            result: "AUTHORIZED",
            subject: "user-1",
          }),
        })
      )
      expect(result).toEqual(mockResponse)
    })

    it("passes extra fields when provided", async () => {
      const mockResponse = { action: "SUCCESS" }
      vi.mocked(mockApi.deviceFlow.complete).mockResolvedValue(mockResponse as any)

      await service.complete("ABC123", "AUTHORIZED", "user-1", {
        acr: "2",
        authTime: 1000,
      })

      expect(mockApi.deviceFlow.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceCompleteRequest: expect.objectContaining({
            acr: "2",
            authTime: 1000,
          }),
        })
      )
    })
  })
})
