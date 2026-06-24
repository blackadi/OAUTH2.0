import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { DiscoveryService } from "../../../src/services/discovery.service"
import { Authlete } from "@authlete/typescript-sdk"

describe("DiscoveryService", () => {
  let mockApi: Authlete
  let service: DiscoveryService

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new DiscoveryService(mockApi)
  })

  it("calls service.getConfiguration", async () => {
    const mockResponse = { issuer: "https://example.com" }
    vi.mocked(mockApi.service.getConfiguration).mockResolvedValue(mockResponse as any)

    const req = {} as any
    const result = await service.getConfiguration(req)

    expect(mockApi.service.getConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({ pretty: true })
    )
    expect(result).toEqual(mockResponse)
  })
})
