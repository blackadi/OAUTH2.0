import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { JarService } from "../../../src/services/jar.service"
import { Authlete } from "@authlete/typescript-sdk"

describe("JarService", () => {
  let mockApi: Authlete
  let service: JarService

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new JarService(mockApi)
  })

  describe("process", () => {
    it("calls authorization.processRequest with JWT and client_id in parameters", async () => {
      const mockResponse = { action: "INTERACTION", ticket: "t-1", requestObjectPayload: '{"iss":"c-1","response_type":"code","client_id":"c-1","redirect_uri":"http://localhost:3000/cb"}' }
      vi.mocked(mockApi.authorization.processRequest).mockResolvedValue(mockResponse as any)

      const result = await service.process("jwt-header.jwt-payload.jwt-sig", "c-1")

      expect(mockApi.authorization.processRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizationRequest: expect.objectContaining({
            parameters: expect.stringContaining("client_id=c-1"),
          }),
        })
      )
      expect(mockApi.authorization.processRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizationRequest: expect.objectContaining({
            parameters: expect.stringContaining("request=jwt-header.jwt-payload.jwt-sig"),
          }),
        })
      )
      expect(result).toEqual(mockResponse)
    })

    it("returns requestObjectPayload when Authlete decodes the JWT", async () => {
      const mockResponse = {
        action: "INTERACTION",
        ticket: "t-2",
        requestObjectPayload: '{"iss":"c-2","aud":"https://as.example.com","response_type":"code","client_id":"c-2","redirect_uri":"http://localhost:3000/cb","scope":"openid","state":"abc123"}',
      }
      vi.mocked(mockApi.authorization.processRequest).mockResolvedValue(mockResponse as any)

      const result = await service.process("header.payload.sig", "c-2")

      expect(result.requestObjectPayload).toBeDefined()
      const payload = JSON.parse(result.requestObjectPayload)
      expect(payload.iss).toBe("c-2")
      expect(payload.response_type).toBe("code")
    })
  })
})
