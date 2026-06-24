import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { JwksService } from "../../../src/services/jwks.service"
import { Authlete } from "@authlete/typescript-sdk"

describe("JwksService", () => {
  let mockApi: Authlete
  let service: JwksService

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new JwksService(mockApi)
  })

  it("calls jwkSetEndpoint.serviceJwksGetApi", async () => {
    const mockResponse = { keys: [{ kty: "RSA" }] }
    vi.mocked(mockApi.jwkSetEndpoint.serviceJwksGetApi).mockResolvedValue(mockResponse as any)

    const result = await service.serviceJwksGetApi()

    expect(mockApi.jwkSetEndpoint.serviceJwksGetApi).toHaveBeenCalledWith(
      expect.objectContaining({ pretty: true })
    )
    expect(result).toEqual(mockResponse)
  })
})
