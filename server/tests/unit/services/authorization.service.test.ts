import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { AuthorizationService } from "../../../src/services/authorization.service"
import { Authlete } from "@authlete/typescript-sdk"

describe("AuthorizationService", () => {
  let mockApi: Authlete
  let service: AuthorizationService

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new AuthorizationService(mockApi)
  })

  describe("process", () => {
    it("calls authorization.processRequest with the request parameters", async () => {
      const mockResponse = { action: "INTERACTION", clientId: "123", client: {} }
      vi.mocked(mockApi.authorization.processRequest).mockResolvedValue(mockResponse as any)

      const req = { method: "POST", body: { client_id: "123" }, headers: {} } as any
      const result = await service.process(req)

      expect(mockApi.authorization.processRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizationRequest: expect.objectContaining({
            parameters: expect.stringContaining("client_id=123"),
          }),
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe("fail", () => {
    it("calls authorization.fail with ticket and reason", async () => {
      const mockResponse = { action: "INTERNAL_SERVER_ERROR" }
      vi.mocked(mockApi.authorization.fail).mockResolvedValue(mockResponse as any)

      const result = await service.fail("ticket-1", "DENIED")

      expect(mockApi.authorization.fail).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizationFailRequest: { ticket: "ticket-1", reason: "DENIED" },
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe("issue", () => {
    it("calls authorization.issue with ticket from session", async () => {
      const mockResponse = { action: "LOCATION", authorizationCode: "abc123" }
      vi.mocked(mockApi.authorization.issue).mockResolvedValue(mockResponse as any)

      const req = {
        session: {
          user: "user-1",
          authorization: {
            authorizationIssueRequest: { ticket: "ticket-123", subject: "user-1" },
          },
        },
        headers: {},
      } as any
      const result = await service.issue(req)

      expect(mockApi.authorization.issue).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizationIssueRequest: expect.objectContaining({ ticket: "ticket-123" }),
        })
      )
      expect(result).toEqual(mockResponse)
    })

    it("throws when ticket is missing from session", async () => {
      const req = { session: { user: "user-1" }, headers: {} } as any
      await expect(service.issue(req)).rejects.toThrow("Missing ticket in session")
    })
  })
})
