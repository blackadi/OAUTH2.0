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

  describe("DPoP target derivation (RFC 9449 §4.2)", () => {
    const sentRequest = () =>
      (vi.mocked(mockApi.introspection.process).mock.calls[0][0] as {
        introspectionRequest: Record<string, unknown>
      }).introspectionRequest

    const run = (body: Record<string, unknown>, originalUrl: string) => {
      vi.mocked(mockApi.introspection.process).mockResolvedValue({ action: "OK" } as never)
      return service.process({
        body,
        headers: { dpop: "proof-jwt" },
        method: "POST",
        protocol: "https",
        originalUrl,
        get: () => "as.example.com",
      } as never)
    }

    it("strips the query and fragment from htu, keeping them in targetUri", async () => {
      await run({ token: "tok-1" }, "/api/introspection?trace=1")

      expect(sentRequest().htu).toBe("https://as.example.com/api/introspection")
      expect(sentRequest().targetUri).toBe("https://as.example.com/api/introspection?trace=1")
    })

    it("ignores a caller-supplied targetUri", async () => {
      // A caller able to choose targetUri could replay a proof minted for another endpoint —
      // the same defect already closed at UserInfo. It is server-determined, like htm/htu/dpop.
      await run(
        { token: "tok-1", targetUri: "https://as.example.com/api/par" },
        "/api/introspection",
      )

      expect(sentRequest().targetUri).toBe("https://as.example.com/api/introspection")
    })
  })
})
