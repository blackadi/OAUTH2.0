import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { HskService } from "../../../src/services/hsk.service"
import { Authlete } from "@authlete/typescript-sdk"

describe("HskService", () => {
  let mockApi: Authlete
  let service: HskService

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new HskService(mockApi)
  })

  describe("create", () => {
    it("calls hardwareSecurityKeys.create with valid body", async () => {
      const mockResponse = { action: "SUCCESS", hsk: { handle: "abc123", kty: "EC", use: "sig" } }
      vi.mocked(mockApi.hardwareSecurityKeys.create).mockResolvedValue(mockResponse as any)

      const req = { body: { kty: "EC", use: "sig", kid: "my-key", hsmName: "google", alg: "ES256" } } as any
      const result = await service.create(req)

      expect(mockApi.hardwareSecurityKeys.create).toHaveBeenCalledWith(
        expect.objectContaining({
          hskCreateRequest: {
            kty: "EC",
            use: "sig",
            kid: "my-key",
            hsmName: "google",
            alg: "ES256",
          },
        })
      )
      expect(result).toEqual(mockResponse)
    })

    it("throws when kty is missing", async () => {
      const req = { body: { hsmName: "google" } } as any
      await expect(service.create(req)).rejects.toThrow("Missing required body field: kty")
    })

    it("throws when hsmName is missing", async () => {
      const req = { body: { kty: "EC" } } as any
      await expect(service.create(req)).rejects.toThrow("Missing required body field: hsmName")
    })
  })

  describe("get", () => {
    it("calls hardwareSecurityKeys.get with handle", async () => {
      const mockResponse = { action: "SUCCESS", hsk: { handle: "abc123" } }
      vi.mocked(mockApi.hardwareSecurityKeys.get).mockResolvedValue(mockResponse as any)

      const result = await service.get("abc123")

      expect(mockApi.hardwareSecurityKeys.get).toHaveBeenCalledWith(
        expect.objectContaining({ handle: "abc123" })
      )
      expect(result).toEqual(mockResponse)
    })

    it("throws when handle is empty", async () => {
      await expect(service.get("")).rejects.toThrow("Missing required parameter: handle")
    })
  })

  describe("delete", () => {
    it("calls hardwareSecurityKeys.delete with handle", async () => {
      const mockResponse = { action: "SUCCESS" }
      vi.mocked(mockApi.hardwareSecurityKeys.delete).mockResolvedValue(mockResponse as any)

      const result = await service.delete("abc123")

      expect(mockApi.hardwareSecurityKeys.delete).toHaveBeenCalledWith(
        expect.objectContaining({ handle: "abc123" })
      )
      expect(result).toEqual(mockResponse)
    })

    it("throws when handle is empty", async () => {
      await expect(service.delete("")).rejects.toThrow("Missing required parameter: handle")
    })
  })

  describe("list", () => {
    it("calls hardwareSecurityKeys.list", async () => {
      const mockResponse = { action: "SUCCESS", hsks: [] }
      vi.mocked(mockApi.hardwareSecurityKeys.list).mockResolvedValue(mockResponse as any)

      const result = await service.list()

      expect(mockApi.hardwareSecurityKeys.list).toHaveBeenCalledWith(
        expect.objectContaining({})
      )
      expect(result).toEqual(mockResponse)
    })
  })
})
