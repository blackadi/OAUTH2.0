import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { ParService } from "../../../src/services/par.service"
import { Authlete } from "@authlete/typescript-sdk"

describe("ParService", () => {
  let mockApi: Authlete
  let service: ParService

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new ParService(mockApi)
  })

  it("calls pushedAuthorization.create with parameters", async () => {
    const mockResponse = { action: "CREATED", requestUri: "urn:ietf:params:oauth:request_uri:abc" }
    vi.mocked(mockApi.pushedAuthorization.create).mockResolvedValue(mockResponse as any)

    const req = { body: { parameters: "response_type=code&client_id=c-1", clientId: "c-1", clientSecret: "s-1" }, headers: {}, method: "POST", protocol: "https", get: () => "localhost", originalUrl: "/api/par" } as any
    const result = await service.process(req)

    expect(mockApi.pushedAuthorization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        pushedAuthorizationRequest: {
          parameters: "response_type=code&client_id=c-1&client_secret=s-1",
        },
      })
    )
    expect(result).toEqual(mockResponse)
  })

  it("throws when parameters missing", async () => {
    const req = { body: {}, headers: {} } as any
    await expect(service.process(req)).rejects.toThrow("Missing required body field: parameters")
  })

  it("forwards DPoP headers when present", async () => {
    const mockResponse = { action: "CREATED", requestUri: "urn:ietf:params:oauth:request_uri:dpop-test" }
    vi.mocked(mockApi.pushedAuthorization.create).mockResolvedValue(mockResponse as any)

    const req = {
      body: { parameters: "response_type=code&client_id=c-1", clientId: "c-1", clientSecret: "s-1" },
      headers: { dpop: "dpop-proof-jwt" },
      method: "POST",
      protocol: "https",
      get: () => "auth.example.com",
      originalUrl: "/api/par",
    } as any
    const result = await service.process(req)

    expect(mockApi.pushedAuthorization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        pushedAuthorizationRequest: expect.objectContaining({
          dpop: "dpop-proof-jwt",
          htm: "POST",
          htu: "https://auth.example.com/api/par",
        }),
      })
    )
    expect(result).toEqual(mockResponse)
  })
})
