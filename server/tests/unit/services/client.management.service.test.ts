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
