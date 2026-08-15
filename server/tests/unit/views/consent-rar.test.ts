import { describe, it, expect } from "vitest"
import { renderFile } from "ejs"
import path from "node:path"

/**
 * 9396-W2 — a detail object's `type`, `actions` and `locations` reach `consent.ejs`.
 *
 * Why a *view* test rather than a controller one. RFC 9396 §2's whole point is that the end-user is shown
 * what they are approving; a detail object that Authlete parsed correctly, the controller forwarded
 * correctly, and the template silently dropped is the failure this guards against — and it is invisible to
 * every other kind of test here. The controller tests assert `authorizationDetails` is passed to `render`;
 * none of them renders anything, so removing the `rar-section` block from the template breaks no test.
 *
 * Rendering the real file is the point. Asserting against a hand-built HTML string would pass forever.
 */
const CONSENT_VIEW = path.join(__dirname, "../../../src/views/consent.ejs")

const BASE_LOCALS = {
  clientName: "Test App",
  redirectUri: "https://client.example.com/cb",
  scopes: ["openid", "profile"],
  claims: [],
  csrfToken: "csrf-token-value",
  authorizationDetails: undefined as unknown,
}

describe("consent.ejs — rich authorization details (RFC 9396)", () => {
  it("renders type, actions and locations for a detail object", async () => {
    const detail = {
      type: "payment_initiation",
      locations: ["https://api.bank.example.com/payments"],
      actions: ["initiate", "status"],
    }

    const html = await renderFile(CONSENT_VIEW, { ...BASE_LOCALS, authorizationDetails: [detail] })

    // §2's three most common members. Each is asserted separately so a failure names which one vanished.
    expect(html).toContain("payment_initiation")
    expect(html).toContain("https://api.bank.example.com/payments")
    expect(html).toContain("initiate")
    expect(html).toContain("status")
  })

  it("renders every detail object when more than one is requested", async () => {
    const html = await renderFile(CONSENT_VIEW, {
      ...BASE_LOCALS,
      authorizationDetails: [
        { type: "payment_initiation", actions: ["initiate"] },
        { type: "account_information", actions: ["read"], locations: ["https://api.bank.example.com/accounts"] },
      ],
    })

    // §2 allows an array, and approving only the first of two is a consent defect rather than a display one.
    expect(html).toContain("payment_initiation")
    expect(html).toContain("account_information")
    expect(html).toContain("https://api.bank.example.com/accounts")
  })

  it("escapes detail values rather than interpolating them as markup", async () => {
    const html = await renderFile(CONSENT_VIEW, {
      ...BASE_LOCALS,
      authorizationDetails: [{ type: "<img src=x onerror=alert(1)>", actions: ["read"] }],
    })

    // `type` is attacker-influenced — it arrives in the authorization request. The template uses `<%=`,
    // which escapes; this pins that, because switching one tag to `<%-` would be an XSS on the consent page.
    expect(html).not.toContain("<img src=x")
    expect(html).toContain("&lt;img")
  })

  it("omits the details section entirely when none were requested", async () => {
    const html = await renderFile(CONSENT_VIEW, { ...BASE_LOCALS, authorizationDetails: undefined })

    expect(html).not.toContain("Rich Authorization Details")
    // The ordinary consent page must still render — this is the path every non-RAR flow takes.
    expect(html).toContain("Test App")
  })
})
