import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { CibaService } from "../../../src/services/ciba.service"
import { Authlete } from "@authlete/typescript-sdk"

describe("CibaService", () => {
  let mockApi: Authlete
  let service: CibaService

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new CibaService(mockApi)
  })

  describe("process", () => {
    it("calls ciba.processAuthentication with parameters", async () => {
      const mockResponse = { action: "USER_IDENTIFICATION", ticket: "t-1" }
      vi.mocked(mockApi.ciba.processAuthentication).mockResolvedValue(mockResponse as any)

      const req = { body: { parameters: "login_hint=user-1&scope=openid", clientId: "c-1", clientSecret: "s-1" } } as any
      const result = await service.process(req)

      expect(mockApi.ciba.processAuthentication).toHaveBeenCalledWith(
        expect.objectContaining({
          backchannelAuthenticationRequest: {
            parameters: "login_hint=user-1&scope=openid",
            clientId: "c-1",
            clientSecret: "s-1",
          },
        })
      )
      expect(result).toEqual(mockResponse)
    })

    it("throws when parameters missing", async () => {
      const req = { body: {} } as any
      await expect(service.process(req)).rejects.toThrow("Missing required body field: parameters")
    })
  })

  describe("issue", () => {
    it("calls ciba.issue with ticket", async () => {
      const mockResponse = { action: "OK", authReqId: "ari-1" }
      vi.mocked(mockApi.ciba.issue).mockResolvedValue(mockResponse as any)

      const result = await service.issue("t-1")
      expect(mockApi.ciba.issue).toHaveBeenCalledWith(
        expect.objectContaining({
          backchannelAuthenticationIssueRequest: { ticket: "t-1" },
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe("fail", () => {
    it("calls ciba.fail with ticket and reason", async () => {
      const mockResponse = { action: "FORBIDDEN" }
      vi.mocked(mockApi.ciba.fail).mockResolvedValue(mockResponse as any)

      const result = await service.fail("t-1", "ACCESS_DENIED")
      expect(mockApi.ciba.fail).toHaveBeenCalledWith(
        expect.objectContaining({
          backchannelAuthenticationFailRequest: { ticket: "t-1", reason: "ACCESS_DENIED" },
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe("complete", () => {
    it("calls ciba.complete with ticket, result, subject", async () => {
      const mockResponse = { action: "NOTIFICATION" }
      vi.mocked(mockApi.ciba.complete).mockResolvedValue(mockResponse as any)

      const result = await service.complete("t-1", "AUTHORIZED", "user-1", { authTime: 123 })
      expect(mockApi.ciba.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          backchannelAuthenticationCompleteRequest: expect.objectContaining({
            ticket: "t-1",
            result: "AUTHORIZED",
            subject: "user-1",
            authTime: 123,
          }),
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })
})
