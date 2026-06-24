import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { TokenService } from "../../../src/services/token.service"
import { Authlete } from "@authlete/typescript-sdk"

describe("TokenService", () => {
  let mockApi: Authlete
  let service: TokenService

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new TokenService(mockApi)
  })

  describe("process", () => {
    it("calls token.process with clientId from Basic auth", async () => {
      const mockResponse = { action: "OK", accessToken: "at-1" }
      vi.mocked(mockApi.token.process).mockResolvedValue(mockResponse as any)

      const basic = Buffer.from("client-1:secret-1").toString("base64")
      const req = {
        headers: { authorization: `Basic ${basic}` },
        body: { grant_type: "authorization_code", code: "code-1" },
      } as any
      const result = await service.process(req)

      expect(mockApi.token.process).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenRequest: expect.objectContaining({ clientId: "client-1", clientSecret: "secret-1" }),
        })
      )
      expect(result).toEqual(mockResponse)
    })

    it("calls token.fail with the request", async () => {
      const mockResponse = { action: "INTERNAL_SERVER_ERROR" }
      vi.mocked(mockApi.token.fail).mockResolvedValue(mockResponse as any)

      const result = await service.fail({ ticket: "t-1", reason: "INVALID_REQUEST" } as any)
      expect(mockApi.token.fail).toHaveBeenCalledWith({
        serviceId: expect.any(String),
        tokenFailRequest: { ticket: "t-1", reason: "INVALID_REQUEST" },
      })
      expect(result).toEqual(mockResponse)
    })

    it("calls token.issue with the request", async () => {
      const mockResponse = { action: "OK", accessToken: "at-1" }
      vi.mocked(mockApi.token.issue).mockResolvedValue(mockResponse as any)

      const result = await service.issue({ ticket: "t-1" } as any)
      expect(mockApi.token.issue).toHaveBeenCalledWith({
        serviceId: expect.any(String),
        tokenIssueRequest: { ticket: "t-1" },
      })
      expect(result).toEqual(mockResponse)
    })
  })
})
