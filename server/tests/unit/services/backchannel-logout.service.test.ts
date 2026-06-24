import { describe, it, expect, vi, beforeEach } from "vitest"
import { BackchannelLogoutService } from "../../../src/services/backchannel-logout.service"

describe("BackchannelLogoutService", () => {
  let service: BackchannelLogoutService
  let mockConfig: { baseUrl: string; serviceId: string; AccessToken: string }

  beforeEach(() => {
    mockConfig = {
      baseUrl: "https://authlete.example.com",
      serviceId: "svc-1",
      AccessToken: "tok-1",
    }
    service = new BackchannelLogoutService(mockConfig)
    vi.stubGlobal("fetch", vi.fn())
  })

  describe("issueToken", () => {
    it("calls Authlete logout token endpoint and returns response", async () => {
      const mockResponse = {
        action: "OK",
        logoutToken: "lt-1",
        backchannelLogoutUri: "https://rp.example.com/logout",
      }
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as any)

      const result = await service.issueToken("client-1", "user-1")

      expect(fetch).toHaveBeenCalledWith(
        "https://authlete.example.com/api/svc-1/backchannel/logout/token",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer tok-1",
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ clientIdentifier: "client-1", subject: "user-1" }),
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe("issueAndDeliver", () => {
    it("issues token and delivers to RP", async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            action: "OK",
            logoutToken: "lt-1",
            backchannelLogoutUri: "https://rp.example.com/logout",
          }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        } as any)

      const result = await service.issueAndDeliver("client-1", "user-1")

      expect(result).toEqual({
        clientId: "client-1",
        success: true,
        statusCode: 200,
        backchannelLogoutUri: "https://rp.example.com/logout",
      })
    })
  })
})
