import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { ClientManagementService } from "../../../src/services/client.management.service"
import { Authlete } from "@authlete/typescript-sdk"

describe("ClientManagementService", () => {
  let mockApi: Authlete
  let service: ClientManagementService

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new ClientManagementService(mockApi)
  })

  describe("list", () => {
    it("calls client.list with pagination params", async () => {
      const mockResponse = { clients: [], totalCount: 0 }
      vi.mocked(mockApi.client.list).mockResolvedValue(mockResponse as any)

      const req = { body: { start: 0, end: 20 }, query: {} } as any
      const result = await service.list(req)

      expect(mockApi.client.list).toHaveBeenCalledWith(
        expect.objectContaining({ start: 0, end: 20 })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe("get", () => {
    it("calls client.get with clientId param", async () => {
      vi.mocked(mockApi.client.get).mockResolvedValue({ action: "OK" } as any)

      const req = { params: { clientId: "c-1" } } as any
      await service.get(req)
      expect(mockApi.client.get).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: "c-1" })
      )
    })
  })

  describe("create", () => {
    it("calls client.create with client input", async () => {
      vi.mocked(mockApi.client.create).mockResolvedValue({ action: "OK" } as any)

      const req = { body: { client: { clientName: "test", grantTypes: ["AUTHORIZATION_CODE"] } } } as any
      await service.create(req)

      expect(mockApi.client.create).toHaveBeenCalledWith(
        expect.objectContaining({
          client: expect.objectContaining({ clientName: "test" }),
        })
      )
    })
  })

  // CU-W2. `buildClientInput` names ~40 of the Client schema's 108 properties and Authlete's client/update
  // takes a COMPLETE object — so building the request from scratch sent an object missing ~68 fields, and a
  // one-field change could clear the rest. With a 200 response and nothing to indicate it.
  describe("update preserves fields it was not asked to change (CU-W2)", () => {
    const EXISTING = {
      clientId: 4277838306,
      clientName: "SPA",
      description: "the debugger UI",
      redirectUris: ["http://localhost:3001/callback", "https://app.example/callback"],
      tokenAuthMethod: "CLIENT_SECRET_BASIC",
      grantTypes: ["AUTHORIZATION_CODE", "REFRESH_TOKEN"],
      responseTypes: ["CODE"],
      pkceRequired: true,
      pkceS256Required: true,
      subjectType: "PUBLIC",
      // Only reachable through the SDK's escape hatch — see client-roundtrip.test.ts.
      additionalProperties: { backchannelLogoutUri: "https://rp.example.com/bcl" },
    }

    const updateReq = (client: Record<string, unknown>) =>
      ({ params: { clientId: "4277838306" }, body: { client } }) as any

    const sentClient = () =>
      (vi.mocked(mockApi.client.update).mock.calls[0][0] as any).client

    beforeEach(() => {
      vi.mocked(mockApi.client.get).mockResolvedValue(EXISTING as any)
      vi.mocked(mockApi.client.update).mockResolvedValue({ clientId: 4277838306 } as any)
    })

    it("reads the current client before writing", async () => {
      await service.update(updateReq({ clientName: "Renamed" }))

      expect(mockApi.client.get).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: "4277838306" })
      )
    })

    it("changes only the named field and preserves every other one", async () => {
      await service.update(updateReq({ clientName: "Renamed" }))

      const sent = sentClient()
      expect(sent.clientName).toBe("Renamed")
      // The ~68 fields buildClientInput never names must all still be there.
      expect(sent.redirectUris).toEqual(EXISTING.redirectUris)
      expect(sent.tokenAuthMethod).toBe("CLIENT_SECRET_BASIC")
      expect(sent.grantTypes).toEqual(EXISTING.grantTypes)
      expect(sent.responseTypes).toEqual(["CODE"])
      expect(sent.subjectType).toBe("PUBLIC")
      expect(sent.description).toBe("the debugger UI")
    })

    // The reason this is more than tidiness: these two decide how the client authenticates and whether PKCE
    // is enforced. Clearing them by renaming a client is a security regression delivered as an HTTP 200.
    it("does not clear the security-relevant fields when renaming", async () => {
      await service.update(updateReq({ clientName: "Renamed" }))

      const sent = sentClient()
      expect(sent.pkceRequired).toBe(true)
      expect(sent.pkceS256Required).toBe(true)
      expect(sent.tokenAuthMethod).toBe("CLIENT_SECRET_BASIC")
    })

    // The four properties SDK 1.0.0 does not model would vanish if the round trip did not restore them.
    it("preserves properties the SDK carries only in additionalProperties", async () => {
      await service.update(updateReq({ clientName: "Renamed" }))

      const sent = sentClient()
      expect(sent.additionalProperties?.backchannelLogoutUri ?? sent.backchannelLogoutUri)
        .toBe("https://rp.example.com/bcl")
    })

    it("still applies a genuine change to a security-relevant field", async () => {
      await service.update(updateReq({ tokenAuthMethod: "PRIVATE_KEY_JWT" }))

      expect(sentClient().tokenAuthMethod).toBe("PRIVATE_KEY_JWT")
    })

    it("does not call update when the client cannot be read", async () => {
      vi.mocked(mockApi.client.get).mockRejectedValue(new Error("[A0] no such client"))

      await expect(service.update(updateReq({ clientName: "X" }))).rejects.toThrow(/no such client/)
      expect(mockApi.client.update).not.toHaveBeenCalled()
    })
  })

  // ATTR-W1. `attributes` was the only field `buildClientInput` forwarded with `as any`, so any array
  // reached Authlete unexamined and a non-array was dropped without a word. The rejections matter as
  // much as the acceptance: a 400 tells the admin the write did not happen, which silence did not.
  describe("attributes validation", () => {
    const clientCreate = (attributes: unknown) =>
      ({ body: { client: { clientName: "test", attributes } } }) as any

    it("forwards a well-formed key/value pair array", async () => {
      vi.mocked(mockApi.client.create).mockResolvedValue({ action: "OK" } as any)

      await service.create(clientCreate([{ key: "tier", value: "gold" }]))

      expect(mockApi.client.create).toHaveBeenCalledWith(
        expect.objectContaining({
          client: expect.objectContaining({
            attributes: [{ key: "tier", value: "gold" }],
          }),
        })
      )
    })

    // `Pair` makes `value` optional and so does this schema — being stricter than the SDK here would
    // refuse a shape Authlete accepts.
    it("accepts a pair with a key and no value", async () => {
      vi.mocked(mockApi.client.create).mockResolvedValue({ action: "OK" } as any)

      await service.create(clientCreate([{ key: "flagged" }]))

      expect(mockApi.client.create).toHaveBeenCalledWith(
        expect.objectContaining({
          client: expect.objectContaining({ attributes: [{ key: "flagged" }] }),
        })
      )
    })

    it("accepts an empty array", async () => {
      vi.mocked(mockApi.client.create).mockResolvedValue({ action: "OK" } as any)

      await service.create(clientCreate([]))

      expect(mockApi.client.create).toHaveBeenCalledWith(
        expect.objectContaining({
          client: expect.objectContaining({ attributes: [] }),
        })
      )
    })

    // Each of these used to reach Authlete verbatim, or vanish. None of them reaches it now.
    const rejected: Array<[string, unknown]> = [
      ["a keyless pair — unaddressable, so a silent no-op", [{ value: "gold" }]],
      ["an empty key", [{ key: "", value: "gold" }]],
      ["a non-string key", [{ key: 42, value: "gold" }]],
      ["a non-string value", [{ key: "tier", value: { nested: true } }]],
      ["an array of strings rather than pairs", ["tier=gold"]],
      ["an object rather than an array", { tier: "gold" }],
      ["a string rather than an array", "tier=gold"],
    ]

    for (const [label, attributes] of rejected) {
      it(`rejects ${label} with 400 and never calls Authlete`, async () => {
        vi.mocked(mockApi.client.create).mockResolvedValue({ action: "OK" } as any)

        await expect(service.create(clientCreate(attributes))).rejects.toMatchObject({
          status: 400,
        })
        expect(mockApi.client.create).not.toHaveBeenCalled()
      })
    }

    it("applies on update as well as create — both share the mapper", async () => {
      vi.mocked(mockApi.client.update).mockResolvedValue({ action: "OK" } as any)

      const req = {
        params: { clientId: "c-1" },
        body: { client: { attributes: [{ value: "no key" }] } },
      } as any

      await expect(service.update(req)).rejects.toMatchObject({ status: 400 })
      expect(mockApi.client.update).not.toHaveBeenCalled()
    })

    it("leaves attributes off the input entirely when the payload omits it", async () => {
      vi.mocked(mockApi.client.create).mockResolvedValue({ action: "OK" } as any)

      await service.create({ body: { client: { clientName: "test" } } } as any)

      const sent = vi.mocked(mockApi.client.create).mock.calls[0][0] as any
      expect(sent.client).not.toHaveProperty("attributes")
    })
  })

  describe("delete", () => {
    it("calls client.delete with clientId", async () => {
      vi.mocked(mockApi.client.delete).mockResolvedValue(undefined as any)

      const req = { params: { clientId: "c-1" } } as any
      await service.delete(req)
      expect(mockApi.client.delete).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: "c-1" })
      )
    })
  })
})
