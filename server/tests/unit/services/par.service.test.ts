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

  // Authlete matches the channel the credentials arrive on against the client's registered
  // auth method. A client_secret_basic client rejects credentials placed in `parameters`
  // with 401 [A157357], so the Basic header must map to the top-level fields instead.
  describe("client authentication channel", () => {
    const basicHeader = (id: string, secret: string) =>
      `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`

    const makeReq = (headers: Record<string, string>, body: Record<string, unknown>) =>
      ({
        body,
        headers,
        method: "POST",
        protocol: "https",
        get: () => "auth.example.com",
        originalUrl: "/api/par",
      }) as any

    beforeEach(() => {
      vi.mocked(mockApi.pushedAuthorization.create).mockResolvedValue({ action: "CREATED" } as any)
    })

    const sentRequest = () =>
      vi.mocked(mockApi.pushedAuthorization.create).mock.calls[0][0].pushedAuthorizationRequest

    it("maps an Authorization: Basic header to top-level clientId/clientSecret", async () => {
      await service.process(
        makeReq({ authorization: basicHeader("c-1", "s-1") }, { parameters: "response_type=code" })
      )

      expect(sentRequest()).toMatchObject({ clientId: "c-1", clientSecret: "s-1" })
    })

    it("leaves `parameters` untouched when Basic is used", async () => {
      await service.process(
        makeReq({ authorization: basicHeader("c-1", "s-1") }, { parameters: "response_type=code" })
      )

      // No client_id/client_secret smuggled in — that would be the client_secret_post channel.
      expect(sentRequest().parameters).toBe("response_type=code")
    })

    it("prefers the Basic header over body credentials", async () => {
      await service.process(
        makeReq(
          { authorization: basicHeader("basic-id", "basic-secret") },
          { parameters: "response_type=code", clientId: "body-id", clientSecret: "body-secret" }
        )
      )

      const sent = sentRequest()
      expect(sent).toMatchObject({ clientId: "basic-id", clientSecret: "basic-secret" })
      expect(sent.parameters).toBe("response_type=code")
    })

    it("preserves a secret containing colons", async () => {
      await service.process(
        makeReq({ authorization: basicHeader("c-1", "a:b:c") }, { parameters: "response_type=code" })
      )

      expect(sentRequest().clientSecret).toBe("a:b:c")
    })

    it("accepts a lowercase scheme (RFC 9110 §11.1)", async () => {
      const encoded = Buffer.from("c-1:s-1").toString("base64")
      await service.process(
        makeReq({ authorization: `basic ${encoded}` }, { parameters: "response_type=code" })
      )

      expect(sentRequest()).toMatchObject({ clientId: "c-1", clientSecret: "s-1" })
    })

    it("falls back to the body channel for a non-Basic Authorization header", async () => {
      await service.process(
        makeReq(
          { authorization: "Bearer some-token" },
          { parameters: "response_type=code", clientId: "c-1", clientSecret: "s-1" }
        )
      )

      const sent = sentRequest()
      expect(sent.clientId).toBeUndefined()
      expect(sent.parameters).toBe("response_type=code&client_id=c-1&client_secret=s-1")
    })

    it("sends no credentials at all when none are presented", async () => {
      await service.process(makeReq({}, { parameters: "response_type=code" }))

      const sent = sentRequest()
      expect(sent.clientId).toBeUndefined()
      expect(sent.clientSecret).toBeUndefined()
      expect(sent.parameters).toBe("response_type=code")
    })
  })

  describe("DPoP target derivation (RFC 9449 §4.2)", () => {
    it("strips the query string from htu", async () => {
      // PushedAuthorizationRequest has no targetUri member, so htu carries the target alone.
      vi.mocked(mockApi.pushedAuthorization.create).mockResolvedValue({ action: "CREATED" } as any)

      await service.process({
        body: { parameters: "response_type=code&client_id=c-1", clientId: "c-1" },
        headers: { dpop: "proof-jwt" },
        method: "POST",
        protocol: "https",
        originalUrl: "/api/par?trace=1",
        get: () => "as.example.com",
      } as any)

      const sent = vi.mocked(mockApi.pushedAuthorization.create).mock.calls[0][0]
        .pushedAuthorizationRequest as Record<string, unknown>
      expect(sent.htu).toBe("https://as.example.com/api/par")
      expect(sent.htm).toBe("POST")
    })
  })
})
