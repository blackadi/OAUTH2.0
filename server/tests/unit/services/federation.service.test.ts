import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { FederationService } from "../../../src/services/federation.service"
import { Authlete } from "@authlete/typescript-sdk"

function mockReq(body: Record<string, unknown> = {}) {
  return {
    body,
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), child: vi.fn() },
  } as never
}

describe("FederationService", () => {
  let mockApi: Authlete
  let service: FederationService

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new FederationService(mockApi)
  })

  describe("configuration", () => {
    /**
     * `requestBody` is optional in the SDK type and mandatory in practice: without it the SDK sends no
     * `Content-Type`, and Authlete answers `400 [A258201] … Content-Type header is not specified.` The SDK
     * throws, so the *caller* used to receive a 400 for a fault that was entirely ours.
     */
    it("passes requestBody so the SDK sends a Content-Type at all", async () => {
      vi.mocked(mockApi.federation.configuration).mockResolvedValue({ action: "OK" } as never)

      await service.configuration(mockReq())

      expect(mockApi.federation.configuration).toHaveBeenCalledWith(
        expect.objectContaining({ requestBody: {} }),
      )
    })

    it("returns Authlete's response verbatim for the controller to map", async () => {
      // Verified live: with the body present the call reaches Authlete's real answer —
      // INTERNAL_SERVER_ERROR / [A316201], because no federation JWK Set is configured. The fix changes
      // the failure from a misleading 400 to an honest 500; it does not make federation work.
      const real = {
        action: "INTERNAL_SERVER_ERROR",
        resultCode: "A316201",
        responseContent: '{"error":"server_error","error_description":"[A316201] Because a JWK Set for federation has not been set up…"}',
      }
      vi.mocked(mockApi.federation.configuration).mockResolvedValue(real as never)

      expect(await service.configuration(mockReq())).toEqual(real)
    })
  })

  describe("registration", () => {
    it("forwards entityConfiguration and trustChain", async () => {
      vi.mocked(mockApi.federation.registration).mockResolvedValue({ action: "OK" } as never)

      await service.registration(mockReq({ entityConfiguration: "ec-jwt", trustChain: "tc-jwt" }))

      expect(mockApi.federation.registration).toHaveBeenCalledWith(
        expect.objectContaining({
          federationRegistrationRequest: { entityConfiguration: "ec-jwt", trustChain: "tc-jwt" },
        }),
      )
    })

    it("rejects locally when neither field is present, without calling Authlete", async () => {
      await expect(service.registration(mockReq({}))).rejects.toThrow(/entityConfiguration or trustChain/)
      expect(mockApi.federation.registration).not.toHaveBeenCalled()
    })
  })
})
