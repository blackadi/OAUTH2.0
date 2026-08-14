import { describe, it, expect } from "vitest"
import { Client$inboundSchema, ClientInput$outboundSchema } from "@authlete/typescript-sdk/models"

/**
 * The SDK claim that `client.management.service.ts`'s read-modify-write update depends on (CU-W2).
 *
 * SDK 1.0.0's `Client` models **104** of Authlete 3.0.16's **108** properties. The four it omits —
 * `backchannelLogoutUri`, `backchannelLogoutSessionRequired`, `spiffeId`, `spiffeBundleEndpoint` — survive a
 * round trip only because the two schemas are a **matched pair**:
 *
 *   `Client$inboundSchema`      wraps itself in `collectExtraKeys$`, so unmodelled members arrive under
 *                               `additionalProperties` instead of being stripped
 *   `ClientInput$outboundSchema` ends in `.transform(v => ({ ...v.additionalProperties, ...remap$(…) }))`,
 *                               spreading them back to the top level
 *
 * **If either half changed, `update()` would silently delete those four fields from every client it touched**
 * — including `backchannelLogoutUri`, which `backchannel-logout.service.ts` reads to decide who receives a
 * logout token. That is the same defect CU-W2 exists to fix, reintroduced by the fix itself.
 *
 * `Service$inboundSchema` is a plain `z.object` and does **not** do this. Do not generalise between them.
 */
describe("SDK Client ⇄ ClientInput round trip (CU-W2's premise)", () => {
  const WIRE = {
    clientId: 4277838306,
    clientName: "SPA",
    redirectUris: ["http://localhost:3001/callback"],
    tokenAuthMethod: "CLIENT_SECRET_BASIC",
    pkceRequired: true,
    // The four properties SDK 1.0.0's `Client` type does not model:
    backchannelLogoutUri: "https://rp.example.com/bcl",
    backchannelLogoutSessionRequired: true,
    spiffeId: "spiffe://example/workload",
    spiffeBundleEndpoint: "https://example/bundle",
  }

  it("collects the unmodelled properties on the way in", () => {
    const parsed = Client$inboundSchema.parse(WIRE)

    expect(parsed.additionalProperties).toEqual({
      backchannelLogoutUri: "https://rp.example.com/bcl",
      backchannelLogoutSessionRequired: true,
      spiffeId: "spiffe://example/workload",
      spiffeBundleEndpoint: "https://example/bundle",
    })
    // Not present at the top level — which is why `client.backchannelLogoutUri` does not compile.
    expect(parsed).not.toHaveProperty("backchannelLogoutUri")
  })

  it("spreads them back to the top level on the way out", () => {
    const out = ClientInput$outboundSchema.parse(Client$inboundSchema.parse(WIRE))

    expect(out.backchannelLogoutUri).toBe("https://rp.example.com/bcl")
    expect(out.backchannelLogoutSessionRequired).toBe(true)
    expect(out.spiffeId).toBe("spiffe://example/workload")
    expect(out.spiffeBundleEndpoint).toBe("https://example/bundle")
    // The wrapper key must not itself reach Authlete.
    expect(out).not.toHaveProperty("additionalProperties")
  })

  it("preserves the modelled properties too, so nothing is lost either way", () => {
    const out = ClientInput$outboundSchema.parse(Client$inboundSchema.parse(WIRE))

    expect(out.clientName).toBe("SPA")
    expect(out.redirectUris).toEqual(["http://localhost:3001/callback"])
    expect(out.tokenAuthMethod).toBe("CLIENT_SECRET_BASIC")
    expect(out.pkceRequired).toBe(true)
  })
})
