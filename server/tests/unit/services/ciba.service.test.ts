import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { CibaService } from "../../../src/services/ciba.service"
import { Authlete } from "@authlete/typescript-sdk"

describe("CibaService", () => {
  let mockApi: Authlete
  let service: CibaService

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new CibaService(mockApi)
  })

  describe("process", () => {
    /**
     * Authlete matches the *channel* credentials arrive on against the client's registered auth method, so
     * the caller picks the channel and this service must not reinterpret it. Until 2026-08-13 the
     * `Authorization` header was never read, so a `CLIENT_SECRET_BASIC` client — the configuration
     * `AGENTS.md` recommends for CIBA — could not authenticate at all.
     */
    const sent = () =>
      (vi.mocked(mockApi.ciba.processAuthentication).mock.calls[0][0] as {
        backchannelAuthenticationRequest: Record<string, unknown>
      }).backchannelAuthenticationRequest

    const run = (body: Record<string, unknown>, headers: Record<string, string> = {}) => {
      vi.mocked(mockApi.ciba.processAuthentication).mockResolvedValue({ action: "USER_IDENTIFICATION" } as never)
      return service.process({ body, headers } as never)
    }

    const PARAMS = "login_hint=user-1&scope=openid"
    const basicHeader = `Basic ${Buffer.from("c-1:s-1").toString("base64")}`

    it("Authorization: Basic -> top-level fields, parameters untouched (client_secret_basic)", async () => {
      await run({ parameters: PARAMS }, { authorization: basicHeader })

      expect(sent()).toEqual({ parameters: PARAMS, clientId: "c-1", clientSecret: "s-1" })
    })

    it("body clientId + clientSecret -> merged into parameters (client_secret_post)", async () => {
      await run({ parameters: PARAMS, clientId: "c-1", clientSecret: "s-1" })

      // Not top-level: putting a client_secret_post client's credentials there is the mirror-image of
      // the [A157357] error a client_secret_basic client gets when they land in `parameters`.
      expect(sent().clientId).toBeUndefined()
      expect(sent().clientSecret).toBeUndefined()
      const p = new URLSearchParams(sent().parameters as string)
      expect(p.get("client_id")).toBe("c-1")
      expect(p.get("client_secret")).toBe("s-1")
      expect(p.get("login_hint")).toBe("user-1")
    })

    it("body clientId only -> client_id in parameters, no secret (public client)", async () => {
      await run({ parameters: PARAMS, clientId: "c-1" })

      const p = new URLSearchParams(sent().parameters as string)
      expect(p.get("client_id")).toBe("c-1")
      expect(p.get("client_secret")).toBeNull()
      expect(sent().clientId).toBeUndefined()
    })

    it("Basic wins when both channels are present, matching token/PAR", async () => {
      await run({ parameters: PARAMS, clientId: "body-client", clientSecret: "body-secret" },
        { authorization: basicHeader })

      expect(sent()).toEqual({ parameters: PARAMS, clientId: "c-1", clientSecret: "s-1" })
      expect(sent().parameters).not.toContain("body-client")
    })

    it("returns Authlete's response unchanged", async () => {
      const mockResponse = { action: "USER_IDENTIFICATION", ticket: "t-1" }
      vi.mocked(mockApi.ciba.processAuthentication).mockResolvedValue(mockResponse as never)

      const result = await service.process({ body: { parameters: PARAMS }, headers: {} } as never)
      expect(result).toEqual(mockResponse)
    })

    it("throws when parameters missing", async () => {
      const req = { body: {}, headers: {} } as any
      await expect(service.process(req)).rejects.toThrow("Missing required body field: parameters")
    })
  })

  describe("issue", () => {
    it("calls ciba.issue with ticket", async () => {
      const mockResponse = { action: "OK", authReqId: "ari-1" }
      vi.mocked(mockApi.ciba.issue).mockResolvedValue(mockResponse as any)

      const result = await service.issue("t-1")
      expect(mockApi.ciba.issue).toHaveBeenCalledWith(
        expect.objectContaining({
          backchannelAuthenticationIssueRequest: { ticket: "t-1" },
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe("fail", () => {
    it("calls ciba.fail with ticket and reason", async () => {
      const mockResponse = { action: "FORBIDDEN" }
      vi.mocked(mockApi.ciba.fail).mockResolvedValue(mockResponse as any)

      const result = await service.fail("t-1", "ACCESS_DENIED")
      expect(mockApi.ciba.fail).toHaveBeenCalledWith(
        expect.objectContaining({
          backchannelAuthenticationFailRequest: { ticket: "t-1", reason: "ACCESS_DENIED" },
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe("complete", () => {
    it("calls ciba.complete with ticket, result, subject", async () => {
      const mockResponse = { action: "NOTIFICATION" }
      vi.mocked(mockApi.ciba.complete).mockResolvedValue(mockResponse as any)

      const result = await service.complete("t-1", "AUTHORIZED", "user-1", { authTime: 123 })
      expect(mockApi.ciba.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          backchannelAuthenticationCompleteRequest: expect.objectContaining({
            ticket: "t-1",
            result: "AUTHORIZED",
            subject: "user-1",
            authTime: 123,
          }),
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })
})
