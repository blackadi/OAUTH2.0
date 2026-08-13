import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { GrantManagementService } from "../../../src/services/grant-management.service"
import { Authlete } from "@authlete/typescript-sdk"

/**
 * `req.is()` is consulted by `extractAccessToken` for the RFC 6750 §2.2 form-body case, and
 * `req.get()`/`originalUrl` by `dpopHttpTarget`. A bare `{ headers }` object is not enough.
 */
function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    headers: { authorization: "Bearer tok-1" },
    method: "GET",
    protocol: "https",
    originalUrl: "/api/gm/g-1",
    get: vi.fn().mockReturnValue("as.example.com"),
    is: vi.fn().mockReturnValue(false),
    ...overrides,
  } as never
}

describe("GrantManagementService", () => {
  let mockApi: Authlete
  let service: GrantManagementService

  const sentRequest = () =>
    (vi.mocked(mockApi.grantManagement.processRequest).mock.calls[0][0] as {
      gMRequest: Record<string, unknown>
    }).gMRequest

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new GrantManagementService(mockApi)
  })

  describe("query", () => {
    it("calls grantManagement.processRequest with QUERY action", async () => {
      const mockResponse = { action: "OK", grantId: "g-1" }
      vi.mocked(mockApi.grantManagement.processRequest).mockResolvedValue(mockResponse as never)

      const result = await service.query(mockReq(), "g-1")

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
      vi.mocked(mockApi.grantManagement.processRequest).mockResolvedValue(mockResponse as never)

      const result = await service.revoke(mockReq(), "g-1")

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

  describe("DPoP", () => {
    it("forwards the proof, without which Authlete answers [A281305]", async () => {
      // Verified live 2026-08-12: a DPoP-bound token sent to /gm with no proof is refused with
      // "The access token is bound to a public key but the grant management request includes no
      // DPoP header." Passing the ownership check and then dropping the proof would simply move
      // the 401 one call later.
      vi.mocked(mockApi.grantManagement.processRequest).mockResolvedValue({ action: "OK" } as never)

      await service.query(
        mockReq({ headers: { authorization: "DPoP tok-1", dpop: "proof-jwt" } }),
        "g-1",
      )

      expect(sentRequest()).toMatchObject({
        accessToken: "tok-1",
        dpop: "proof-jwt",
        htm: "GET",
        htu: "https://as.example.com/api/gm/g-1",
      })
    })

    it("excludes the query string from htu (RFC 9449 §4.2)", async () => {
      vi.mocked(mockApi.grantManagement.processRequest).mockResolvedValue({ action: "OK" } as never)

      await service.query(
        mockReq({
          headers: { authorization: "DPoP tok-1", dpop: "proof-jwt" },
          originalUrl: "/api/gm/g-1?verbose=true",
        }),
        "g-1",
      )

      expect(sentRequest().htu).toBe("https://as.example.com/api/gm/g-1")
    })

    it("sends no DPoP fields for a Bearer presentation", async () => {
      vi.mocked(mockApi.grantManagement.processRequest).mockResolvedValue({ action: "OK" } as never)

      await service.query(mockReq(), "g-1")

      expect(sentRequest()).not.toHaveProperty("dpop")
      expect(sentRequest()).not.toHaveProperty("htu")
    })
  })
})
