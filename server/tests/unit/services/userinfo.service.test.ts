import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { UserInfoService } from "../../../src/services/userinfo.service"
import { isTokenPresentationError } from "../../../src/utils/dpop"
import { Authlete } from "@authlete/typescript-sdk"

/** Minimal Express-request stand-in matching what UserInfoService.process reads. */
function mkReq(opts: {
  method?: string
  authorization?: string
  dpop?: string
  contentType?: string
  body?: unknown
  originalUrl?: string
}) {
  const headers: Record<string, string> = {}
  if (opts.authorization !== undefined) headers.authorization = opts.authorization
  if (opts.dpop !== undefined) headers.dpop = opts.dpop
  if (opts.contentType) headers["content-type"] = opts.contentType
  return {
    method: opts.method ?? "GET",
    headers,
    body: opts.body,
    originalUrl: opts.originalUrl ?? "/api/userinfo",
    protocol: "https",
    get: (name: string) => (name.toLowerCase() === "host" ? "as.example.com" : undefined),
    is: (type: string) => (opts.contentType && opts.contentType.includes(type) ? type : false),
  } as never
}

describe("UserInfoService", () => {
  let mockApi: Authlete
  let service: UserInfoService

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new UserInfoService(mockApi)
    vi.mocked(mockApi.userinfo.process).mockResolvedValue({
      action: "OK",
      subject: "user-1",
    } as never)
  })

  const sentRequest = () =>
    vi.mocked(mockApi.userinfo.process).mock.calls[0][0].userinfoRequest

  describe("process — Bearer scheme", () => {
    it("extracts a Bearer token from the Authorization header", async () => {
      const result = await service.process(mkReq({ authorization: "Bearer tok-1" }))

      expect(sentRequest()).toEqual({ token: "tok-1" })
      expect(result).toEqual({ action: "OK", subject: "user-1" })
    })

    it("extracts a lower-case bearer token — RFC 9110 §11.1", async () => {
      await service.process(mkReq({ authorization: "bearer tok-1" }))
      expect(sentRequest()).toEqual({ token: "tok-1" })
    })

    it("reads access_token from a form-encoded body — RFC 6750 §2.2", async () => {
      await service.process(
        mkReq({
          method: "POST",
          contentType: "application/x-www-form-urlencoded",
          body: { access_token: "tok-body" },
        })
      )
      expect(sentRequest()).toEqual({ token: "tok-body" })
    })
  })

  describe("process — DPoP scheme (RFC 9449 §7.1)", () => {
    it("accepts the DPoP scheme and forwards the proof with htm/htu/targetUri", async () => {
      await service.process(
        mkReq({ authorization: "DPoP tok-1", dpop: "dpop-proof-jwt" })
      )

      expect(sentRequest()).toEqual({
        token: "tok-1",
        dpop: "dpop-proof-jwt",
        htm: "GET",
        htu: "https://as.example.com/api/userinfo",
        targetUri: "https://as.example.com/api/userinfo",
      })
    })

    it("accepts a lower-case dpop scheme", async () => {
      await service.process(mkReq({ authorization: "dpop tok-1", dpop: "proof" }))
      expect(sentRequest()).toMatchObject({ token: "tok-1", dpop: "proof" })
    })

    it("keeps the query string out of htu but in targetUri — RFC 9449 §4.2", async () => {
      await service.process(
        mkReq({
          authorization: "DPoP tok-1",
          dpop: "proof",
          originalUrl: "/api/userinfo?schema=openid",
        })
      )

      expect(sentRequest()).toMatchObject({
        htu: "https://as.example.com/api/userinfo",
        targetUri: "https://as.example.com/api/userinfo?schema=openid",
      })
    })

    it("reports the request method as htm", async () => {
      await service.process(
        mkReq({ method: "POST", authorization: "DPoP tok-1", dpop: "proof" })
      )
      expect(sentRequest()).toMatchObject({ htm: "POST" })
    })
  })

  describe("process — presentations rejected locally", () => {
    const expectRejected = async (
      req: ReturnType<typeof mkReq>,
      status: number,
      code: string | null
    ) => {
      await expect(service.process(req)).rejects.toSatisfy(isTokenPresentationError)
      try {
        await service.process(req)
      } catch (err) {
        if (!isTokenPresentationError(err)) throw err
        expect(err.status).toBe(status)
        expect(err.code).toBe(code)
      }
      // Nothing reaches the authorization server.
      expect(mockApi.userinfo.process).not.toHaveBeenCalled()
    }

    it("rejects the DPoP scheme with no proof header — §7.1", async () => {
      await expectRejected(
        mkReq({ authorization: "DPoP tok-1" }),
        401,
        "invalid_dpop_proof"
      )
    })

    it("advertises only DPoP when the DPoP scheme was used without a proof", async () => {
      try {
        await service.process(mkReq({ authorization: "DPoP tok-1" }))
        expect.unreachable()
      } catch (err) {
        if (!isTokenPresentationError(err)) throw err
        expect(err.schemes).toEqual(["dpop"])
      }
    })

    it("rejects the Bearer scheme carrying a proof — §7.2 downgrade guard", async () => {
      await expectRejected(
        mkReq({ authorization: "Bearer tok-1", dpop: "proof" }),
        400,
        "invalid_request"
      )
    })

    it("rejects a request with no credentials, with no error code — RFC 6750 §3.1", async () => {
      await expectRejected(mkReq({}), 401, null)
    })

    it("rejects an unsupported scheme rather than forwarding it as a token", async () => {
      await expectRejected(mkReq({ authorization: "Basic dXNlcjpwYXNz" }), 401, null)
    })

    it("rejects the token being sent twice — RFC 6750 §2", async () => {
      await expectRejected(
        mkReq({
          method: "POST",
          authorization: "Bearer tok-1",
          contentType: "application/x-www-form-urlencoded",
          body: { access_token: "tok-2" },
        }),
        400,
        "invalid_request"
      )
    })
  })

  describe("process — client-supplied fields are never trusted", () => {
    // A POST body used to be spread wholesale into the Authlete request, letting a client choose the
    // `htu` its own proof would be validated against. A proof captured at another endpoint was then
    // replayable here, defeating the RFC 9449 §4.3 binding check.
    it("ignores dpop, htm, htu and targetUri supplied in the body", async () => {
      await service.process(
        mkReq({
          method: "POST",
          authorization: "DPoP tok-1",
          dpop: "real-proof",
          contentType: "application/x-www-form-urlencoded",
          body: {
            dpop: "smuggled-proof-for-another-endpoint",
            htm: "POST",
            htu: "https://as.example.com/api/par",
            targetUri: "https://as.example.com/api/par",
          },
        })
      )

      expect(sentRequest()).toEqual({
        token: "tok-1",
        dpop: "real-proof",
        htm: "POST",
        htu: "https://as.example.com/api/userinfo",
        targetUri: "https://as.example.com/api/userinfo",
      })
    })

    it("ignores a clientCertificate supplied in the body", async () => {
      await service.process(
        mkReq({
          method: "POST",
          authorization: "Bearer tok-1",
          contentType: "application/x-www-form-urlencoded",
          body: { clientCertificate: "-----BEGIN CERTIFICATE-----" },
        })
      )
      expect(sentRequest()).toEqual({ token: "tok-1" })
    })

    it("does not forward DPoP fields when the Bearer scheme was used", async () => {
      await service.process(mkReq({ authorization: "Bearer tok-1" }))
      const sent = sentRequest()
      expect(sent).not.toHaveProperty("dpop")
      expect(sent).not.toHaveProperty("htu")
      expect(sent).not.toHaveProperty("htm")
    })
  })

  describe("issue", () => {
    it("calls userinfo.issue with the request", async () => {
      const mockResponse = { action: "OK" }
      vi.mocked(mockApi.userinfo.issue).mockResolvedValue(mockResponse as never)

      const result = await service.issue({ subject: "user-1", claims: ["name"] } as never)
      expect(mockApi.userinfo.issue).toHaveBeenCalledWith({
        serviceId: expect.any(String),
        userinfoIssueRequest: { subject: "user-1", claims: ["name"] },
      })
      expect(result).toEqual(mockResponse)
    })
  })
})
