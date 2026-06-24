import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { RevocationService } from "../../../src/services/revocation.service"
import { Authlete } from "@authlete/typescript-sdk"

describe("RevocationService", () => {
  let mockApi: Authlete
  let service: RevocationService

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new RevocationService(mockApi)
  })

  describe("process", () => {
    it("calls revocation.process with parameters", async () => {
      const mockResponse = { action: "OK" }
      vi.mocked(mockApi.revocation.process).mockResolvedValue(mockResponse as any)

      const req = {
        body: { token: "tok-1" },
        headers: {},
        rawBody: "token=tok-1",
      } as any
      const result = await service.process(req)

      expect(mockApi.revocation.process).toHaveBeenCalledWith(
        expect.objectContaining({
          revocationRequest: expect.objectContaining({ parameters: "token=tok-1" }),
        })
      )
      expect(result).toEqual(mockResponse)
    })

    it("throws when body is empty", async () => {
      const req = { body: {}, headers: {} } as any
      await expect(service.process(req)).rejects.toThrow("Revocation request body is empty")
    })

    it("extracts Basic auth credentials", async () => {
      vi.mocked(mockApi.revocation.process).mockResolvedValue({ action: "OK" } as any)
      const basic = Buffer.from("client-1:secret-1").toString("base64")

      const req = {
        headers: { authorization: `Basic ${basic}` },
        body: { token: "tok-1" },
        rawBody: "token=tok-1",
      } as any
      await service.process(req)

      expect(mockApi.revocation.process).toHaveBeenCalledWith(
        expect.objectContaining({
          revocationRequest: expect.objectContaining({ clientId: "client-1", clientSecret: "secret-1" }),
        })
      )
    })
  })
})
