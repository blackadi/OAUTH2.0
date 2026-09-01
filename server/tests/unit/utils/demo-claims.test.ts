import { describe, it, expect } from "vitest"
import { claimValuesFor, requestedIdTokenClaimNames } from "../../../src/utils/demo-claims"

/**
 * The two halves of the id_token claims defect (fixed 2026-09-01).
 *
 * `AuthorizationResponse.idTokenClaims` is the OIDC claims *request* — `{"name":null,…}`, where `null`
 * means "no special requirements" — and it was being passed to Authlete as
 * `AuthorizationIssueRequest.claims`, which is the claim *values*. Authlete embedded it verbatim, so
 * every id_token carried `"name": null` while `/api/userinfo` returned `"name": "admin"` for the same
 * claim. `fapi2-security-profile-final-test-claims-parameter-identity-claims` reported 21 invalid
 * claims plus "Value of name differs between id_token and userinfo".
 */
describe("requestedIdTokenClaimNames", () => {
  it("takes the names out of a claims request", () => {
    expect(requestedIdTokenClaimNames('{"name":null,"email":null,"zoneinfo":null}')).toEqual([
      "name",
      "email",
      "zoneinfo",
    ])
  })

  // `null` is the claims-request syntax for "no special requirements"; an object carries requirements
  // like `essential`. Both are requests for the claim, and neither is a value.
  it("treats a claim with requirements the same as a bare one", () => {
    expect(
      requestedIdTokenClaimNames('{"email":{"essential":true},"name":null}'),
    ).toEqual(["email", "name"])
  })

  // A request the server cannot read is Authlete's to reject, and it already accepted this one.
  it.each([
    ["absent", undefined],
    ["null", null],
    ["empty", ""],
    ["not JSON", "{name:"],
    ["an array", '["name","email"]'],
    ["a bare string", '"name"'],
  ])("returns nothing when the request is %s", (_label, input) => {
    expect(requestedIdTokenClaimNames(input as string | null | undefined)).toEqual([])
  })
})

describe("claimValuesFor", () => {
  /**
   * These exact values are pinned by three lab transcripts —
   * `docs/curriculum/modules/{02,05,08}/…/lab.md` — which quote the userinfo response byte for byte.
   * Changing one breaks prose that no other gate can see. The extraction into this shared function was
   * required to be behaviour-preserving, and this is that assertion.
   */
  it("produces the demo profile the userinfo endpoint has always returned", () => {
    const names = [
      "name", "given_name", "family_name", "nickname", "preferred_username",
      "email", "email_verified", "zoneinfo", "locale", "updated_at",
    ]
    const values = claimValuesFor("admin", names)

    expect(values).toMatchObject({
      name: "admin",
      given_name: "admin",
      family_name: "admin",
      nickname: "admin",
      preferred_username: "admin",
      email: "admin@example.com",
      email_verified: true,
      zoneinfo: "UTC",
      locale: "en-US",
    })
    expect(typeof values.updated_at).toBe("number")
    expect(Object.keys(values).sort()).toEqual([...names].sort())
  })

  /**
   * OIDC Core §5.1: *"If a Claim is not returned, that Claim Name SHOULD be omitted from the JSON
   * object representing the Claims"*. Omitted — not `null`. Emitting `null` is the whole defect: the
   * suite reads a null claim as present-but-invalid, which is why it said "differs" rather than
   * "missing".
   */
  it("omits claims it has no value for, rather than nulling them", () => {
    const unserved = [
      "gender", "birthdate", "address", "phone_number", "phone_number_verified",
      "website", "picture", "profile", "middle_name",
    ]
    const values = claimValuesFor("admin", unserved)

    expect(values).toEqual({})
    for (const name of unserved) expect(name in values).toBe(false)
  })

  it("returns only the claims asked for", () => {
    expect(claimValuesFor("admin", ["email"])).toEqual({ email: "admin@example.com" })
    expect(claimValuesFor("admin", [])).toEqual({})
  })

  it("keys the values off the subject it is given", () => {
    const values = claimValuesFor("alice", ["name", "email"])
    expect(values).toEqual({ name: "alice", email: "alice@example.com" })
  })
})
