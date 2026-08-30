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
          standardIntrospectionRequest: expect.objectContaining({ parameters: "token=tok-1" }),
        })
      )
      expect(result).toEqual(mockResponse)
    })

    /**
     * The JWT branch's signing algorithm, which had no way to be set at all.
     *
     * `introspectionSignAlg` was already named in the `excluded` set — recognised as
     * Authlete-specific and kept out of `parameters` — and then never added to the request. So the
     * endpoint could not say how to sign, and Authlete's default is RS256.
     *
     * That was a live 500 rather than a theoretical gap: this deployment's JWK Set holds one EC
     * P-256 key, so asking for a JWT introspection response answered `[A405201] The key to sign the
     * JWS with the algorithm ('RS256') is not available.` RS256 is also not permitted by FAPI 2.0
     * §5.4.1 (PS256, ES256 and EdDSA only), so the default was non-conformant either way.
     *
     * There is nowhere else to set it: the SDK's `Client` model has no introspection signing
     * property, and `Service` carries only `introspectionSignatureKeyId` — a key, not an algorithm.
     * Pinning that key ID was tried against the live service and Authlete still asked for RS256.
     */
    it("defaults the JWT signing algorithm to ES256 rather than Authlete's RS256", async () => {
      vi.mocked(mockApi.introspection.standardProcess).mockResolvedValue({ action: "JWT" } as never)

      await service.standardProcess({
        body: { token: "tok-1" },
        headers: { accept: "application/token-introspection+jwt" },
        rawBody: "token=tok-1",
      } as never)

      const sent = (vi.mocked(mockApi.introspection.standardProcess).mock.calls[0][0] as {
        standardIntrospectionRequest: Record<string, unknown>
      }).standardIntrospectionRequest
      expect(sent.introspectionSignAlg).toBe("ES256")
    })

    it("lets the caller override the algorithm, and forwards the encryption pair", async () => {
      vi.mocked(mockApi.introspection.standardProcess).mockResolvedValue({ action: "JWT" } as never)

      await service.standardProcess({
        body: {
          token: "tok-1",
          introspectionSignAlg: "PS256",
          introspectionEncryptionAlg: "ECDH-ES",
          introspectionEncryptionEnc: "A128GCM",
        },
        headers: {},
        rawBody: "token=tok-1",
      } as never)

      const sent = (vi.mocked(mockApi.introspection.standardProcess).mock.calls[0][0] as {
        standardIntrospectionRequest: Record<string, unknown>
      }).standardIntrospectionRequest
      expect(sent.introspectionSignAlg).toBe("PS256")
      expect(sent.introspectionEncryptionAlg).toBe("ECDH-ES")
      expect(sent.introspectionEncryptionEnc).toBe("A128GCM")
      // Still excluded from `parameters`: they configure the response, they are not RFC 7662 request
      // parameters, and leaking them into the form would make Authlete reject the request.
      expect(sent.parameters).toBe("token=tok-1")
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
