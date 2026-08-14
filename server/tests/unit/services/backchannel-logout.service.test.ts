import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { BackchannelLogoutService } from "../../../src/services/backchannel-logout.service"
import { Authlete } from "@authlete/typescript-sdk"

describe("BackchannelLogoutService", () => {
  let service: BackchannelLogoutService
  let mockApi: Authlete
  let mockConfig: { baseUrl: string; serviceId: string; AccessToken: string }

  beforeEach(() => {
    mockConfig = {
      baseUrl: "https://authlete.example.com",
      serviceId: "svc-1",
      AccessToken: "tok-1",
    }
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new BackchannelLogoutService(mockConfig, mockApi)
    vi.stubGlobal("fetch", vi.fn())
  })

  describe("issueToken", () => {
    it("calls Authlete logout token endpoint and returns response", async () => {
      const mockResponse = {
        action: "OK",
        logoutToken: "lt-1",
        backchannelLogoutUri: "https://rp.example.com/logout",
      }
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as any)

      const result = await service.issueToken("client-1", "user-1")

      expect(fetch).toHaveBeenCalledWith(
        "https://authlete.example.com/api/svc-1/backchannel/logout/token",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer tok-1",
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ clientIdentifier: "client-1", subject: "user-1" }),
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe("issueAndDeliver", () => {
    it("issues token and delivers to RP", async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            action: "OK",
            logoutToken: "lt-1",
            backchannelLogoutUri: "https://rp.example.com/logout",
          }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        } as any)

      const result = await service.issueAndDeliver("client-1", "user-1")

      expect(result).toEqual({
        clientId: "client-1",
        success: true,
        statusCode: 200,
        backchannelLogoutUri: "https://rp.example.com/logout",
      })
    })
  })

  // BCL-W6. Listing clients used to be a second hand-written `fetch()` to Authlete, alongside the one
  // this file legitimately keeps because SDK 1.0.0 has no backchannel logout token API. It now goes
  // through `client.list` like every other Authlete call in the repo.
  describe("issueAndDeliverToAll", () => {
    it("lists clients through the SDK, not a raw fetch", async () => {
      vi.mocked(mockApi.client.list).mockResolvedValue({
        clients: [{
          clientId: 1,
          clientName: "RP One",
          // Where the SDK actually puts it: `Client` models 104 of Authlete's 108 properties and this
          // is one of the four it omits, so `collectExtraKeys$` files it here rather than dropping it.
          additionalProperties: { backchannelLogoutUri: "https://rp1.example.com/bcl" },
        }],
        totalCount: 1,
      } as any)
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            action: "OK",
            logoutToken: "lt-1",
            backchannelLogoutUri: "https://rp1.example.com/bcl",
          }),
        } as any)
        .mockResolvedValueOnce({ ok: true, status: 200 } as any)

      const results = await service.issueAndDeliverToAll("user-1")

      expect(mockApi.client.list).toHaveBeenCalledWith(
        expect.objectContaining({ serviceId: "svc-1", start: 0, end: 100 })
      )
      // The only `fetch()` calls left are the logout-token issue and the delivery to the RP. Neither
      // is a client listing — asserted by URL rather than by count, so an extra delivery cannot pass.
      for (const [url] of vi.mocked(fetch).mock.calls) {
        expect(String(url)).not.toContain("/client/get/list")
      }
      expect(results).toEqual([
        expect.objectContaining({ clientId: "1", clientName: "RP One", success: true }),
      ])
    })

    // The fix rests on a fact about the SDK, so the fact is asserted rather than assumed. SDK 1.0.0's
    // `Client` models 104 of Authlete 3.0.16's 108 properties and `backchannelLogoutUri` is one of the
    // four omitted — but `Client$inboundSchema` wraps itself in `collectExtraKeys$`, so it is filed
    // under `additionalProperties` instead of being stripped. `Service$inboundSchema` is a plain
    // `z.object` and does strip; the two models genuinely differ.
    //
    // If a future SDK ever strips here too, `issueAndDeliverToAll` would deliver to NOBODY while still
    // answering 200. This test fails first, loudly, instead.
    it("SDK 1.0.0 files backchannelLogoutUri under additionalProperties rather than dropping it", async () => {
      const { Client$inboundSchema } = await import("@authlete/typescript-sdk/models")

      const parsed = Client$inboundSchema.parse({
        clientId: 1,
        backchannelLogoutUri: "https://rp1.example.com/bcl",
      })

      expect(parsed.additionalProperties?.backchannelLogoutUri).toBe("https://rp1.example.com/bcl")
      expect(parsed).not.toHaveProperty("backchannelLogoutUri")
    })

    it("skips clients with no backchannelLogoutUri", async () => {
      vi.mocked(mockApi.client.list).mockResolvedValue({
        clients: [{ clientId: 1, clientName: "No BCL" }],
        totalCount: 1,
      } as any)

      const results = await service.issueAndDeliverToAll("user-1")

      expect(results).toEqual([])
      expect(fetch).not.toHaveBeenCalled()
    })

    it("prefers clientIdAlias over the numeric clientId as the identifier", async () => {
      vi.mocked(mockApi.client.list).mockResolvedValue({
        clients: [{
          clientId: 1,
          clientIdAlias: "rp-one",
          additionalProperties: { backchannelLogoutUri: "https://rp1.example.com/bcl" },
        }],
        totalCount: 1,
      } as any)
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            action: "OK",
            logoutToken: "lt-1",
            backchannelLogoutUri: "https://rp1.example.com/bcl",
          }),
        } as any)
        .mockResolvedValueOnce({ ok: true, status: 200 } as any)

      const results = await service.issueAndDeliverToAll("user-1")

      expect(results[0].clientId).toBe("rp-one")
    })

    // A failed listing is reported as a batch result rather than thrown: the caller is sweeping every
    // RP and needs to see which were reached. The raw-fetch version reported `HTTP <status>`; the SDK
    // throws instead, so the message is the error's, and the *shape* of the result is what matters.
    it("reports a listing failure as a batch result rather than throwing", async () => {
      vi.mocked(mockApi.client.list).mockRejectedValue(new Error("Authlete unreachable"))

      const results = await service.issueAndDeliverToAll("user-1")

      expect(results).toEqual([
        {
          clientId: "batch",
          success: false,
          error: "Failed to list clients: Authlete unreachable",
        },
      ])
    })

    it("pages until totalCount is reached and delivers to each client once", async () => {
      vi.mocked(mockApi.client.list)
        .mockResolvedValueOnce({
          clients: [{ clientId: 1, additionalProperties: { backchannelLogoutUri: "https://rp1.example.com/bcl" } }],
          totalCount: 150,
        } as any)
        .mockResolvedValueOnce({
          clients: [
            // Repeated across pages — must not be delivered to twice.
            { clientId: 1, additionalProperties: { backchannelLogoutUri: "https://rp1.example.com/bcl" } },
            { clientId: 2, additionalProperties: { backchannelLogoutUri: "https://rp2.example.com/bcl" } },
          ],
          totalCount: 150,
        } as any)
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          action: "OK",
          logoutToken: "lt",
          backchannelLogoutUri: "https://rp.example.com/bcl",
        }),
      } as any)

      const results = await service.issueAndDeliverToAll("user-1")

      expect(mockApi.client.list).toHaveBeenCalledTimes(2)
      expect(vi.mocked(mockApi.client.list).mock.calls[1][0]).toMatchObject({ start: 100, end: 200 })
      expect(results.map((r) => r.clientId)).toEqual(["1", "2"])
    })
  })
})
