import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { UserInfoService } from "../../../src/services/userinfo.service"
import { Authlete } from "@authlete/typescript-sdk"

describe("UserInfoService", () => {
  let mockApi: Authlete
  let service: UserInfoService

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new UserInfoService(mockApi)
  })

  describe("process", () => {
    it("extracts Bearer token from Authorization header", async () => {
      const mockResponse = { action: "OK", subject: "user-1" }
      vi.mocked(mockApi.userinfo.process).mockResolvedValue(mockResponse as any)

      const req = { method: "POST", headers: { authorization: "Bearer tok-1" }, body: {} } as any
      const result = await service.process(req)

      expect(mockApi.userinfo.process).toHaveBeenCalledWith(
        expect.objectContaining({
          userinfoRequest: { token: "tok-1" },
        })
      )
      expect(result).toEqual(mockResponse)
    })

    it("handles GET requests with empty body", async () => {
      vi.mocked(mockApi.userinfo.process).mockResolvedValue({ action: "OK" } as any)

      const req = { method: "GET", headers: {}, body: {} } as any
      await service.process(req)

      expect(mockApi.userinfo.process).toHaveBeenCalledWith(
        expect.objectContaining({
          userinfoRequest: {},
        })
      )
    })
  })

  describe("issue", () => {
    it("calls userinfo.issue with the request", async () => {
      const mockResponse = { action: "OK" }
      vi.mocked(mockApi.userinfo.issue).mockResolvedValue(mockResponse as any)

      const result = await service.issue({ subject: "user-1", claims: ["name"] } as any)
      expect(mockApi.userinfo.issue).toHaveBeenCalledWith({
        serviceId: expect.any(String),
        userinfoIssueRequest: { subject: "user-1", claims: ["name"] },
      })
      expect(result).toEqual(mockResponse)
    })
  })
})
