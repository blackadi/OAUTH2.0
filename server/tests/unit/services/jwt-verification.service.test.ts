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
  it("returns 400 when assertion is missing", async () => {
    const verifyApi = vi.fn()
    const mockApi = { joseObject: { joseVerifyApi: verifyApi } }
    const service = new JwtVerificationService(mockApi as any, "svc-1")

    const result = await service.processJwtBearer(mockResult({ assertion: undefined }))

    expect(result).toEqual({ ok: false, status: 400, body: { error: "invalid_request", error_description: "Missing assertion" } })
    expect(verifyApi).not.toHaveBeenCalled()
  })

  it("returns 500 when no clientId or clientIdAlias", async () => {
    const verifyApi = vi.fn()
    const mockApi = { joseObject: { joseVerifyApi: verifyApi } }
    const service = new JwtVerificationService(mockApi as any, "svc-1")

    const result = await service.processJwtBearer(mockResult({ clientId: undefined, clientIdAlias: undefined }))

    expect(result).toEqual({ ok: false, status: 500, body: { error: "server_error", error_description: "Client identifier not available from token response" } })
    expect(verifyApi).not.toHaveBeenCalled()
  })

  it("returns 400 when JWT verification fails", async () => {
    const verifyApi = vi.fn().mockResolvedValue({ valid: false, signatureValid: false, errorDescriptions: ["Bad signature"] })
    const mockApi = { joseObject: { joseVerifyApi: verifyApi } }
    const createFn = vi.fn()
    const service = new JwtVerificationService(mockApi as any, "svc-1", { create: createFn } as any)

    const input = mockResult()
    const result = await service.processJwtBearer(input)

    expect(result).toEqual({ ok: false, status: 400, body: { error: "invalid_request", error_description: "Invalid assertion" } })
    expect(verifyApi).toHaveBeenCalledTimes(1)
    expect(verifyApi).toHaveBeenCalledWith({
      serviceId: "svc-1",
      joseVerifyRequest: {
        jose: input.assertion,
        clientIdentifier: "12345",
        signedByClient: true,
        mandatoryClaims: ["iss", "sub", "aud"],
      },
    })
    expect(createFn).not.toHaveBeenCalled()
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
      clientId: 12345,
      subject: "user-1",
    })
    expect(createFn).toHaveBeenCalledTimes(1)
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

  it("returns 403 when token creation returns FORBIDDEN", async () => {
    const verifyApi = vi.fn().mockResolvedValue({ valid: true, signatureValid: true })
    const mockApi = { joseObject: { joseVerifyApi: verifyApi } }
    const createResp = mockCreateResp("FORBIDDEN")
    const createFn = vi.fn().mockResolvedValue(createResp)
    const service = new JwtVerificationService(mockApi as any, "svc-1", { create: createFn } as any)

    const result = await service.processJwtBearer(mockResult())

    expect(result).toEqual({ ok: false, status: 403, body: createResp })
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
})
