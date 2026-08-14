import { describe, it, expect, vi } from "vitest"
import { JwtVerificationService } from "../../../src/services/jwt-verification.service"
import type { TokenResponse, TokenCreateResponse } from "@authlete/typescript-sdk/models"
import jwt from "jsonwebtoken"

function validAssertion(): string {
  return jwt.sign({ sub: "user-1", iss: "issuer", aud: "audience" }, "dummy-secret")
}

function mockResult(overrides: Partial<TokenResponse> = {}): TokenResponse {
  return {
    action: "JWT_BEARER",
    responseContent: null,
    assertion: validAssertion(),
    clientId: 12345,
    clientIdAlias: undefined,
    scopes: ["openid"],
    ...overrides,
  } as unknown as TokenResponse
}

function mockCreateResp(action: string = "OK"): TokenCreateResponse {
  return {
    action,
    accessToken: "at-1",
    tokenType: "Bearer",
    expiresIn: 3600,
    scopes: ["openid"],
    clientId: 12345,
    subject: "user-1",
  } as unknown as TokenCreateResponse
}

describe("JwtVerificationService", () => {
  it("returns 400 with invalid_grant when assertion is missing", async () => {
    const verifyApi = vi.fn()
    const mockApi = { joseObject: { joseVerifyApi: verifyApi } }
    const service = new JwtVerificationService(mockApi as any, "svc-1")

    const result = await service.processJwtBearer(mockResult({ assertion: undefined }))

    expect(result).toEqual({ ok: false, status: 400, body: { error: "invalid_grant", error_description: "Missing assertion" } })
    expect(verifyApi).not.toHaveBeenCalled()
  })

  it("returns 400 with invalid_request when no clientId or clientIdAlias", async () => {
    const verifyApi = vi.fn()
    const mockApi = { joseObject: { joseVerifyApi: verifyApi } }
    const service = new JwtVerificationService(mockApi as any, "svc-1")

    const result = await service.processJwtBearer(mockResult({ clientId: undefined, clientIdAlias: undefined }))

    expect(result).toEqual({ ok: false, status: 400, body: { error: "invalid_request", error_description: "This authorization server requires that the client be identifiable." } })
    expect(verifyApi).not.toHaveBeenCalled()
  })

  it("returns 400 with invalid_grant when JWT verification fails", async () => {
    const verifyApi = vi.fn().mockResolvedValue({ valid: false, signatureValid: false, errorDescriptions: ["Bad signature"] })
    const mockApi = { joseObject: { joseVerifyApi: verifyApi } }
    const createFn = vi.fn()
    const service = new JwtVerificationService(mockApi as any, "svc-1", { create: createFn } as any)

    const input = mockResult()
    const result = await service.processJwtBearer(input)

    expect(result).toEqual({ ok: false, status: 400, body: { error: "invalid_grant", error_description: "Invalid assertion" } })
    expect(verifyApi).toHaveBeenCalledTimes(1)
    expect(verifyApi).toHaveBeenCalledWith({
      serviceId: "svc-1",
      joseVerifyRequest: {
        jose: input.assertion,
        clientIdentifier: "12345",
        signedByClient: true,
        mandatoryClaims: ["iss", "sub", "aud", "exp"],
        clockSkew: 60,
      },
    })
    expect(createFn).not.toHaveBeenCalled()
  })

  // 7523-W2 / 7523-W5. Both settings are DEFENCE-IN-DEPTH and are unreachable while Authlete refuses a
  // no-`exp` assertion at /auth/token with [A314305], before it ever answers JWT_BEARER. What is assertable
  // is what we send, so that is what these pin — a test claiming they reject anything would be fiction.
  it("requires `exp` on the assertion and sets an explicit clock skew", async () => {
    const verifyApi = vi.fn().mockResolvedValue({ valid: false, signatureValid: false })
    const mockApi = { joseObject: { joseVerifyApi: verifyApi } }
    const service = new JwtVerificationService(mockApi as any, "svc-1")

    await service.processJwtBearer(mockResult())

    const sent = verifyApi.mock.calls[0][0].joseVerifyRequest
    expect(sent.mandatoryClaims).toContain("exp")
    // Unset used to mean "Authlete's default, value unknown" — the finding's own requirement row.
    expect(sent.clockSkew).toBe(60)
  })

  it("uses clientIdAlias when available", async () => {
    const verifyApi = vi.fn().mockResolvedValue({ valid: false, signatureValid: false })
    const mockApi = { joseObject: { joseVerifyApi: verifyApi } }
    const service = new JwtVerificationService(mockApi as any, "svc-1")

    await service.processJwtBearer(mockResult({ clientId: undefined, clientIdAlias: "my-alias" }))

    expect(verifyApi).toHaveBeenCalledWith(expect.objectContaining({
      joseVerifyRequest: expect.objectContaining({ clientIdentifier: "my-alias" }),
    }))
  })

  it("returns 200 and minted token on success", async () => {
    const verifyApi = vi.fn().mockResolvedValue({ valid: true, signatureValid: true })
    const mockApi = { joseObject: { joseVerifyApi: verifyApi } }
    const createFn = vi.fn().mockResolvedValue(mockCreateResp("OK"))
    const service = new JwtVerificationService(mockApi as any, "svc-1", { create: createFn } as any)

    const result = await service.processJwtBearer(mockResult())

    expect(result).toEqual({
      ok: true,
      response: expect.objectContaining({ accessToken: "at-1" }),
      accessToken: "at-1",
      tokenType: "Bearer",
      expiresIn: 3600,
      scope: "openid",
    })
    expect(createFn).toHaveBeenCalledTimes(1)
  })

  describe("audience restriction — 7523-W3", () => {
    async function createRequestFor(overrides: Partial<TokenResponse> = {}) {
      const verifyApi = vi.fn().mockResolvedValue({ valid: true, signatureValid: true })
      const mockApi = { joseObject: { joseVerifyApi: verifyApi } }
      const createFn = vi.fn().mockResolvedValue(mockCreateResp("OK"))
      const service = new JwtVerificationService(mockApi as any, "svc-1", { create: createFn } as any)
      await service.processJwtBearer(mockResult(overrides))
      return createFn.mock.calls[0][0]
    }

    it("sends neither `issuer` nor `audience` — TokenCreateRequest models neither", async () => {
      const sent = await createRequestFor()

      // They were inert twice over: TokenManagementService.create() never read them, and the SDK's
      // outbound schema would have stripped them anyway. Removed rather than left as decoration.
      expect(sent).not.toHaveProperty("issuer")
      expect(sent).not.toHaveProperty("audience")
    })

    /**
     * ⚠️ THE REGRESSION GUARD. Read the comment before "fixing" a failure here.
     *
     * The assertion's `aud` identifies the AUTHORIZATION SERVER (RFC 7523 §3(3)) — it is not the audience
     * of the token being minted. Renaming the old inert `audience` field to `resources` is the obvious
     * tidy-up and would restrict every JWT-bearer token to this AS's own issuer identifier, so the token
     * would be valid at no resource server at all. Authlete accepts it and answers 200; the tokens simply
     * stop working at their intended API, silently.
     */
    it("never derives `resources` from the assertion's `aud`", async () => {
      const asIssuer = "https://as.example.com"
      const assertion = jwt.sign(
        { sub: "user-1", iss: "client-1", aud: asIssuer, exp: Math.floor(Date.now() / 1000) + 300 },
        "dummy-secret",
      )

      const sent = await createRequestFor({ assertion } as Partial<TokenResponse>)

      expect(JSON.stringify(sent)).not.toContain(asIssuer)
      expect(sent.resources).toBeUndefined()
    })

    it("forwards `resources` from the `resource` request parameter Authlete parsed", async () => {
      const sent = await createRequestFor({
        resources: ["https://api.example.com/orders"],
      } as Partial<TokenResponse>)

      expect(sent.resources).toEqual(["https://api.example.com/orders"])
    })

    it("prefers the AS's decided `accessTokenResources` over what was requested", async () => {
      const sent = await createRequestFor({
        resources: ["https://api.example.com/requested"],
        accessTokenResources: ["https://api.example.com/granted"],
      } as Partial<TokenResponse>)

      // `resources` is what the client asked for; `accessTokenResources` is what the AS decided the token
      // is for. When they differ the AS's answer is the one that governs.
      expect(sent.resources).toEqual(["https://api.example.com/granted"])
    })

    it("omits `resources` entirely when no `resource` was requested", async () => {
      const sent = await createRequestFor()

      // The path every existing lab takes — no `resource` parameter, so no audience restriction and no
      // `aud` on the issued token. This is why the change moved no curriculum transcript.
      expect(sent).not.toHaveProperty("resources")
    })
  })

  it("returns 400 when token creation returns BAD_REQUEST", async () => {
    const verifyApi = vi.fn().mockResolvedValue({ valid: true, signatureValid: true })
    const mockApi = { joseObject: { joseVerifyApi: verifyApi } }
    const createResp = mockCreateResp("BAD_REQUEST")
    const createFn = vi.fn().mockResolvedValue(createResp)
    const service = new JwtVerificationService(mockApi as any, "svc-1", { create: createFn } as any)

    const result = await service.processJwtBearer(mockResult())

    expect(result).toEqual({ ok: false, status: 400, body: createResp })
  })

  it("returns 500 for unknown token creation action", async () => {
    const verifyApi = vi.fn().mockResolvedValue({ valid: true, signatureValid: true })
    const mockApi = { joseObject: { joseVerifyApi: verifyApi } }
    const createResp = mockCreateResp("INTERNAL_SERVER_ERROR")
    const createFn = vi.fn().mockResolvedValue(createResp)
    const service = new JwtVerificationService(mockApi as any, "svc-1", { create: createFn } as any)

    const result = await service.processJwtBearer(mockResult())

    expect(result).toEqual({ ok: false, status: 500, body: createResp })
  })

  it("returns 400 with invalid_grant when sub claim is missing", async () => {
    const verifyApi = vi.fn().mockResolvedValue({ valid: true, signatureValid: true })
    const mockApi = { joseObject: { joseVerifyApi: verifyApi } }
    const noSubJwt = jwt.sign({ iss: "issuer", aud: "audience" }, "dummy-secret")
    const createFn = vi.fn()
    const service = new JwtVerificationService(mockApi as any, "svc-1", { create: createFn } as any)

    const result = await service.processJwtBearer(mockResult({ assertion: noSubJwt }))

    expect(result).toEqual({ ok: false, status: 400, body: { error: "invalid_grant", error_description: "The value of the 'sub' claim failed to be extracted from the payload of the assertion." } })
    expect(createFn).not.toHaveBeenCalled()
  })
})
