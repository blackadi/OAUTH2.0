import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { TokenService } from "../../../src/services/token.service"
import { Authlete } from "@authlete/typescript-sdk"

describe("TokenService", () => {
  let mockApi: Authlete
  let service: TokenService

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new TokenService(mockApi)
  })

  describe("process", () => {
    it("calls token.process with clientId from Basic auth", async () => {
      const mockResponse = { action: "OK", accessToken: "at-1" }
      vi.mocked(mockApi.token.process).mockResolvedValue(mockResponse as any)

      const basic = Buffer.from("client-1:secret-1").toString("base64")
      const req = {
        headers: { authorization: `Basic ${basic}` },
        body: { grant_type: "authorization_code", code: "code-1" },
      } as any
      const result = await service.process(req)

      expect(mockApi.token.process).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenRequest: expect.objectContaining({ clientId: "client-1", clientSecret: "secret-1" }),
        })
      )
      expect(result).toEqual(mockResponse)
    })


    describe("DPoP target derivation (RFC 9449 §4.2)", () => {
      it("strips the query string from htu", async () => {
        // TokenRequest has no targetUri member, so htu is the only field carrying the target.
        // Sending the query string made proof validation fail for an entirely correct client.
        vi.mocked(mockApi.token.process).mockResolvedValue({ action: "OK" } as any)

        await service.process({
          headers: { dpop: "proof-jwt" },
          body: { grant_type: "client_credentials" },
          method: "POST",
          protocol: "https",
          originalUrl: "/api/token?debug=1",
          get: () => "as.example.com",
        } as any)

        const sent = vi.mocked(mockApi.token.process).mock.calls[0][0].tokenRequest as
          Record<string, unknown>
        expect(sent.htu).toBe("https://as.example.com/api/token")
        expect(sent.htm).toBe("POST")
      })
    })

    // Basic parsing moved to utils/basic-auth.ts. The previous inline
    // `credentials.split(":")` truncated a secret at its second colon and let a
    // malformed header clobber body-supplied credentials.
    describe("Basic auth parsing", () => {
      const sentRequest = () =>
        vi.mocked(mockApi.token.process).mock.calls[0][0].tokenRequest

      const run = (headers: Record<string, string>, body: Record<string, unknown> = {}) => {
        vi.mocked(mockApi.token.process).mockResolvedValue({ action: "OK" } as any)
        return service.process({
          headers,
          body: { grant_type: "client_credentials", ...body },
        } as any)
      }

      it("preserves a secret containing colons", async () => {
        const basic = Buffer.from("client-1:pa:ss:word").toString("base64")
        await run({ authorization: `Basic ${basic}` })

        expect(sentRequest()).toMatchObject({
          clientId: "client-1",
          clientSecret: "pa:ss:word",
        })
      })

      it("accepts a lowercase scheme (RFC 9110 §11.1)", async () => {
        const basic = Buffer.from("client-1:secret-1").toString("base64")
        await run({ authorization: `basic ${basic}` })

        expect(sentRequest()).toMatchObject({
          clientId: "client-1",
          clientSecret: "secret-1",
        })
      })

      it("keeps body credentials when the Basic payload has no colon", async () => {
        const malformed = Buffer.from("no-colon-here").toString("base64")
        await run({ authorization: `Basic ${malformed}` }, {
          clientId: "body-id",
          clientSecret: "body-secret",
        })

        // Previously the whole payload became clientId and clientSecret went undefined.
        expect(sentRequest()).toMatchObject({
          clientId: "body-id",
          clientSecret: "body-secret",
        })
      })

      it("ignores a non-Basic scheme and uses body credentials", async () => {
        await run({ authorization: "Bearer some-token" }, {
          clientId: "body-id",
          clientSecret: "body-secret",
        })

        expect(sentRequest()).toMatchObject({
          clientId: "body-id",
          clientSecret: "body-secret",
        })
      })
    })

    it("calls token.fail with the request", async () => {
      const mockResponse = { action: "INTERNAL_SERVER_ERROR" }
      vi.mocked(mockApi.token.fail).mockResolvedValue(mockResponse as any)

      const result = await service.fail({ ticket: "t-1", reason: "INVALID_REQUEST" } as any)
      expect(mockApi.token.fail).toHaveBeenCalledWith({
        serviceId: expect.any(String),
        tokenFailRequest: { ticket: "t-1", reason: "INVALID_REQUEST" },
      })
      expect(result).toEqual(mockResponse)
    })

    it("calls token.issue with the request", async () => {
      const mockResponse = { action: "OK", accessToken: "at-1" }
      vi.mocked(mockApi.token.issue).mockResolvedValue(mockResponse as any)

      const result = await service.issue({ ticket: "t-1" } as any)
      expect(mockApi.token.issue).toHaveBeenCalledWith({
        serviceId: expect.any(String),
        tokenIssueRequest: { ticket: "t-1" },
      })
      expect(result).toEqual(mockResponse)
    })
  })
})
