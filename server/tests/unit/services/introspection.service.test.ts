import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { IntrospectionService } from "../../../src/services/introspection.service"
import { Authlete } from "@authlete/typescript-sdk"

describe("IntrospectionService", () => {
  let mockApi: Authlete
  let service: IntrospectionService

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new IntrospectionService(mockApi)
  })

  describe("process", () => {
    it("calls introspection.process with token from body", async () => {
      const mockResponse = { action: "OK", subject: "user-1" }
      vi.mocked(mockApi.introspection.process).mockResolvedValue(mockResponse as any)

      const req = { body: { token: "tok-1" }, headers: {} } as any
      const result = await service.process(req)

      expect(mockApi.introspection.process).toHaveBeenCalledWith(
        expect.objectContaining({
          introspectionRequest: { token: "tok-1" },
        })
      )
      expect(result).toEqual(mockResponse)
    })

    it("passes acrValues and maxAge for RFC 9470 step-up validation", async () => {
      const mockResponse = { action: "FORBIDDEN", responseContent: "insufficient_user_authentication" }
      vi.mocked(mockApi.introspection.process).mockResolvedValue(mockResponse as any)

      const req = {
        body: { token: "tok-1", acrValues: "urn:mace:incommon:iap:silver", maxAge: "600" },
        headers: {},
      } as any
      const result = await service.process(req)

      expect(mockApi.introspection.process).toHaveBeenCalledWith(
        expect.objectContaining({
          introspectionRequest: {
            token: "tok-1",
            acrValues: ["urn:mace:incommon:iap:silver"],
            maxAge: 600,
          },
        })
      )
      expect(result).toEqual(mockResponse)
    })

    it("normalizes acrValues to array when string", async () => {
      vi.mocked(mockApi.introspection.process).mockResolvedValue({ action: "OK" } as any)

      const req = {
        body: { token: "tok-1", acrValues: "acr1 acr2" },
        headers: {},
      } as any
      await service.process(req)

      expect(mockApi.introspection.process).toHaveBeenCalledWith(
        expect.objectContaining({
          introspectionRequest: expect.objectContaining({
            acrValues: ["acr1 acr2"],
          }),
        })
      )
    })
  })

  describe("standardProcess", () => {
    it("calls introspection.standardProcess with parameters", async () => {
      const mockResponse = { action: "OK", clientId: "client-1" }
      vi.mocked(mockApi.introspection.standardProcess).mockResolvedValue(mockResponse as any)

      const req = {
        body: { token: "tok-1" },
        headers: {},
        rawBody: "token=tok-1",
      } as any
      const result = await service.standardProcess(req)

      expect(mockApi.introspection.standardProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          standardIntrospectionRequest: { parameters: "token=tok-1" },
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })
})
