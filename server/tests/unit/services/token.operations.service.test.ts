import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { TokenManagementService } from "../../../src/services/token.operations.service"
import { Authlete } from "@authlete/typescript-sdk"

describe("TokenManagementService", () => {
  let mockApi: Authlete
  let service: TokenManagementService

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new TokenManagementService(mockApi)
  })

  describe("create", () => {
    it("calls token.management.create with normalized request", async () => {
      const mockResponse = { action: "OK", accessToken: "at-1" }
      vi.mocked(mockApi.token.management.create).mockResolvedValue(mockResponse as any)

      const req = { body: { grant_type: "authorization_code", clientId: "123", subject: "user-1" }, headers: {} } as any
      const result = await service.create(req)

      expect(mockApi.token.management.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenCreateRequest: expect.objectContaining({
            grantType: "AUTHORIZATION_CODE",
            clientId: 123,
            subject: "user-1",
          }),
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  // B1-W3. normalizeGrantType ended `|| "AUTHORIZATION_CODE"`, so an unrecognised or absent grant type was
  // not refused — it was answered wrongly, and `grantType` is Authlete's record of what authorised the
  // token. These cases assert **rejection, not coercion**, which is the distinction the work item names.
  describe("grant type resolution (B1-W3)", () => {
    const createWith = (grant: unknown) =>
      ({ body: { grant_type: grant, clientId: "123", subject: "user-1" }, headers: {} }) as any

    // Every member of SDK 1.0.0's closed `GrantType` enum, by Authlete's own name.
    const enumNames: Array<[string, string]> = [
      ["authorization_code", "AUTHORIZATION_CODE"],
      ["implicit", "IMPLICIT"],
      ["password", "PASSWORD"],
      ["client_credentials", "CLIENT_CREDENTIALS"],
      ["refresh_token", "REFRESH_TOKEN"],
      ["ciba", "CIBA"],
      ["device_code", "DEVICE_CODE"],
      ["token_exchange", "TOKEN_EXCHANGE"],
      ["jwt_bearer", "JWT_BEARER"],
      ["pre_authorized_code", "PRE_AUTHORIZED_CODE"],
    ]

    // The canonical `grant_type` wire values — what a client actually sends. Three of these five mapped to
    // nothing before, so device-code, token-exchange and CIBA tokens were all recorded as authorization-code.
    const wireValues: Array<[string, string]> = [
      ["urn:ietf:params:oauth:grant-type:jwt-bearer", "JWT_BEARER"],
      ["urn:ietf:params:oauth:grant-type:device_code", "DEVICE_CODE"],
      ["urn:ietf:params:oauth:grant-type:token-exchange", "TOKEN_EXCHANGE"],
      ["urn:openid:params:grant-type:ciba", "CIBA"],
      ["urn:ietf:params:oauth:grant-type:pre-authorized_code", "PRE_AUTHORIZED_CODE"],
    ]

    for (const [raw, expected] of [...enumNames, ...wireValues]) {
      it(`${raw} -> ${expected}`, async () => {
        vi.mocked(mockApi.token.management.create).mockResolvedValue({ action: "OK" } as any)

        await service.create(createWith(raw))

        expect(mockApi.token.management.create).toHaveBeenCalledWith(
          expect.objectContaining({
            tokenCreateRequest: expect.objectContaining({ grantType: expected }),
          })
        )
      })
    }

    it("CIBA is reachable at all — it had no entry in the map", async () => {
      vi.mocked(mockApi.token.management.create).mockResolvedValue({ action: "OK" } as any)

      await service.create(createWith("urn:openid:params:grant-type:ciba"))

      const sent = vi.mocked(mockApi.token.management.create).mock.calls[0][0] as any
      expect(sent.tokenCreateRequest.grantType).not.toBe("AUTHORIZATION_CODE")
    })

    // Each of these produced a token recorded as AUTHORIZATION_CODE, with HTTP 200.
    const refused: Array<[string, unknown]> = [
      ["an unknown grant type", "magic_beans"],
      ["a near-miss typo", "authorisation_code"],
      ["a URN that does not exist", "urn:ietf:params:oauth:grant-type:nope"],
      ["an empty string", ""],
      ["undefined", undefined],
      ["a value that sanitises to nothing", "!!!"],
    ]

    for (const [label, grant] of refused) {
      it(`refuses ${label} with 400 and does not call Authlete`, async () => {
        vi.mocked(mockApi.token.management.create).mockResolvedValue({ action: "OK" } as any)

        await expect(service.create(createWith(grant))).rejects.toMatchObject({ status: 400 })
        expect(mockApi.token.management.create).not.toHaveBeenCalled()
      })
    }

    it("names the offending value when there is one, and the field when there is not", async () => {
      await expect(service.create(createWith("magic_beans"))).rejects.toThrow(/magic_beans/)
      await expect(service.create(createWith(undefined))).rejects.toThrow(/grant_type/)
    })

    // token-exchange-response.handler.ts (an AGENTS.md *deliberate defect*, locked by its own
    // characterization test) reaches this method with `grantType: "TOKEN_EXCHANGE"` in req.body — the
    // camelCase key, not `grant_type`. If the refusal above ever swallowed that spelling, the exchange
    // path would 400 and Module 06's exercises would break. Asserted here so the coupling is visible from
    // this side too.
    it("accepts the camelCase grantType key the token-exchange handler sets", async () => {
      vi.mocked(mockApi.token.management.create).mockResolvedValue({ action: "OK" } as any)

      const req = {
        body: { grantType: "TOKEN_EXCHANGE", clientId: 123, subject: "sub", scopes: ["read"] },
        headers: {},
      } as any
      await service.create(req)

      expect(mockApi.token.management.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenCreateRequest: expect.objectContaining({ grantType: "TOKEN_EXCHANGE" }),
        })
      )
    })
  })

  describe("update", () => {
    it("calls token.management.update with access token", async () => {
      vi.mocked(mockApi.token.management.update).mockResolvedValue({ action: "OK" } as any)

      const req = { body: { accessToken: "at-1" } } as any
      await service.update(req)

      expect(mockApi.token.management.update).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenUpdateRequest: expect.objectContaining({ accessToken: "at-1" }),
        })
      )
    })
  })

  describe("delete", () => {
    it("calls token.management.delete", async () => {
      vi.mocked(mockApi.token.management.delete).mockResolvedValue(undefined as any)

      await service.delete("tok-1")
      expect(mockApi.token.management.delete).toHaveBeenCalledWith(
        expect.objectContaining({ accessTokenIdentifier: "tok-1" })
      )
    })
  })

  describe("list", () => {
    it("calls token.management.list", async () => {
      const mockResponse = { tokens: [] }
      vi.mocked(mockApi.token.management.list).mockResolvedValue(mockResponse as any)

      const result = await service.list()
      expect(mockApi.token.management.list).toHaveBeenCalledOnce()
      expect(result).toEqual(mockResponse)
    })
  })

  describe("revoke", () => {
    it("calls token.management.revoke", async () => {
      vi.mocked(mockApi.token.management.revoke).mockResolvedValue({ action: "OK" } as any)

      const req = { body: { accessTokenIdentifier: "ati-1" } } as any
      await service.revoke(req)
      expect(mockApi.token.management.revoke).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenRevokeRequest: expect.objectContaining({ accessTokenIdentifier: "ati-1" }),
        })
      )
    })
  })

  // Two callers with deliberately different argument sources: the admin route passes an Express
  // Request, and token.controller.ts's ID_TOKEN_REISSUABLE branch passes server-derived params.
  describe("reissueIdToken", () => {
    it("reads an Express request body — the admin route", async () => {
      vi.mocked(mockApi.token.management.reissueIdToken).mockResolvedValue({ action: "OK" } as any)

      const req = { body: { accessToken: "at-1", refreshToken: "rt-1", sub: "user-1" } } as any
      await service.reissueIdToken(req)
      expect(mockApi.token.management.reissueIdToken).toHaveBeenCalledWith(
        expect.objectContaining({
          idtokenReissueRequest: expect.objectContaining({
            accessToken: "at-1",
            refreshToken: "rt-1",
            sub: "user-1",
          }),
        })
      )
    })

    it("accepts a plain params object — the token endpoint's reissue branch", async () => {
      vi.mocked(mockApi.token.management.reissueIdToken).mockResolvedValue({ action: "OK" } as any)

      await service.reissueIdToken({
        accessToken: "at-2",
        refreshToken: "rt-2",
        sub: "admin",
        idTokenAudType: "string",
      })
      expect(mockApi.token.management.reissueIdToken).toHaveBeenCalledWith(
        expect.objectContaining({
          idtokenReissueRequest: expect.objectContaining({
            accessToken: "at-2",
            refreshToken: "rt-2",
            sub: "admin",
            idTokenAudType: "string",
          }),
        })
      )
    })

    it("refuses either shape without both tokens — both are REQUIRED by the reissue API", async () => {
      await expect(service.reissueIdToken({ accessToken: "at-3" })).rejects.toThrow(
        /accessToken and refreshToken/
      )
      await expect(service.reissueIdToken({ body: { refreshToken: "rt-3" } } as any)).rejects.toThrow(
        /accessToken and refreshToken/
      )
      expect(mockApi.token.management.reissueIdToken).not.toHaveBeenCalled()
    })
  })
})
