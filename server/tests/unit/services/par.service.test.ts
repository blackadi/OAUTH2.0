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

    const req = { body: { parameters: "response_type=code&client_id=c-1", clientId: "c-1", clientSecret: "s-1" } } as any
    const result = await service.process(req)

    expect(mockApi.pushedAuthorization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        pushedAuthorizationRequest: {
          parameters: "response_type=code&client_id=c-1",
          clientId: "c-1",
          clientSecret: "s-1",
        },
      })
    )
    expect(result).toEqual(mockResponse)
  })

  it("throws when parameters missing", async () => {
    const req = { body: {} } as any
    await expect(service.process(req)).rejects.toThrow("Missing required body field: parameters")
  })
})
