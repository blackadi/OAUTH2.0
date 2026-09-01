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

  /**
   * 9126-W1. `POST /api/par` used to require the JSON envelope's `parameters` field, so a conformant
   * RFC 9126 §2.1 request — form-encoded, parameters at the top level — earned
   * `400 Missing required body field: parameters` and never reached Authlete. Three OpenID Foundation
   * conformance runs died there on 2026-09-01 before making a single OAuth request.
   *
   * `rawBody` is set by `app.ts`'s `express.urlencoded` verify hook for
   * `application/x-www-form-urlencoded` only, which is what keeps the two shapes apart. The JSON cases
   * above are the compatibility half of this: the SPA and the labs must be unaffected.
   */
  describe("RFC 9126 §2.1 wire format", () => {
    const formReq = (rawBody: string, extra: Record<string, unknown> = {}) =>
      ({
        // Express still parses a form body into `req.body`; the service must ignore it and use rawBody.
        body: Object.fromEntries(new URLSearchParams(rawBody)),
        rawBody,
        headers: {},
        method: "POST",
        protocol: "https",
        get: () => "as.example.com",
        originalUrl: "/api/par",
        ...extra,
      }) as any

    const sentRequest = () =>
      vi.mocked(mockApi.pushedAuthorization.create).mock.calls[0][0].pushedAuthorizationRequest

    beforeEach(() => {
      vi.mocked(mockApi.pushedAuthorization.create).mockResolvedValue({ action: "CREATED" } as any)
    })

    it("forwards a form-encoded body verbatim as `parameters`", async () => {
      const raw =
        "client_id=1241400020&request=eyJhbGciOiJFUzI1NiJ9.e30.sig" +
        "&client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer" +
        "&client_assertion=eyJhbGciOiJFUzI1NiJ9.e30.sig2"

      await service.process(formReq(raw))

      // Verbatim: exact encoding and parameter order are what Authlete and the request object's
      // signature both depend on.
      expect(sentRequest().parameters).toBe(raw)
    })

    it("does not append body credentials when the form body already carries them", async () => {
      // The regression this guards: `client_id` is a real key in the parsed body, so the
      // client_secret_post merging branch would have appended a second copy.
      const raw = "client_id=c-1&client_secret=s-1&response_type=code"

      await service.process(formReq(raw))

      expect(sentRequest().parameters).toBe(raw)
      expect(sentRequest().parameters.match(/client_id=/g)).toHaveLength(1)
    })

    it("still lets an Authorization: Basic header own the credential channel", async () => {
      const raw = "response_type=code&scope=openid"
      const authorization = `Basic ${Buffer.from("c-1:s-1").toString("base64")}`

      await service.process(formReq(raw, { headers: { authorization } }))

      expect(sentRequest()).toMatchObject({ clientId: "c-1", clientSecret: "s-1" })
      expect(sentRequest().parameters).toBe(raw)
    })

    it("carries DPoP through the form path", async () => {
      await service.process(
        formReq("client_id=c-1&response_type=code", { headers: { dpop: "proof-jwt" } }),
      )

      expect(sentRequest()).toMatchObject({
        dpop: "proof-jwt",
        htm: "POST",
        htu: "https://as.example.com/api/par",
      })
    })

    it("prefers rawBody over a JSON `parameters` field if somehow both arrive", async () => {
      await service.process(formReq("from=raw", { body: { parameters: "from=json" } }))

      expect(sentRequest().parameters).toBe("from=raw")
    })

    it("still rejects a request carrying neither shape", async () => {
      await expect(service.process({ body: {}, headers: {} } as any)).rejects.toThrow(
        "Missing required body field: parameters",
      )
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
