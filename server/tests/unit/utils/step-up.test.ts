import { describe, it, expect } from "vitest"
import { checkStepUpRequirements } from "../../../src/utils/step-up"

/**
 * T1-7 / 9470-W3 + OIDC-W1. The `prompt=none` path used to invent an authentication event rather than check
 * one — `acr: "pwd"` with no evidence, `auth_time: now` for an event at an unknown earlier time — and then
 * had Authlete stamp both on the tokens. These cases pin the opposite rule: absence is answered as "no".
 * See audit/02-findings/RFC9470-step-up-authentication.md F-3.
 */
describe("checkStepUpRequirements", () => {
  const NOW = 1_700_000_000

  it("passes when nothing is required", () => {
    expect(checkStepUpRequirements({}, {}, NOW)).toBeNull()
  })

  describe("acr", () => {
    it("passes when an essential acr is satisfied", () => {
      expect(
        checkStepUpRequirements({ acrs: ["pwd"], acrEssential: true }, { acr: "pwd" }, NOW)
      ).toBeNull()
    })

    it("passes when any one of several essential acrs matches", () => {
      expect(
        checkStepUpRequirements({ acrs: ["mfa", "pwd"], acrEssential: true }, { acr: "pwd" }, NOW)
      ).toBeNull()
    })

    it("fails when an essential acr is not among the requested values", () => {
      expect(
        checkStepUpRequirements({ acrs: ["mfa"], acrEssential: true }, { acr: "pwd" }, NOW)
      ).toBe("ACR_NOT_SATISFIED")
    })

    // The fabrication case. No recorded ACR is not a reason to skip an essential requirement.
    it("fails an essential acr when no authentication context was recorded", () => {
      expect(checkStepUpRequirements({ acrs: ["pwd"], acrEssential: true }, {}, NOW)).toBe(
        "ACR_NOT_SATISFIED"
      )
    })

    // OIDC Core §5.5.1.1 — a non-essential claim request is a preference, not a requirement. Failing on it
    // would refuse conformant requests.
    it.each([
      ["acrEssential is false", { acrs: ["mfa"], acrEssential: false }],
      ["acrEssential is absent", { acrs: ["mfa"] }],
    ])("does not fail a non-essential acr mismatch when %s", (_label, required) => {
      expect(checkStepUpRequirements(required, { acr: "pwd" }, NOW)).toBeNull()
      expect(checkStepUpRequirements(required, {}, NOW)).toBeNull()
    })

    it("does not fail when acrEssential is true but no acrs were requested", () => {
      expect(checkStepUpRequirements({ acrEssential: true, acrs: [] }, {}, NOW)).toBeNull()
      expect(checkStepUpRequirements({ acrEssential: true }, {}, NOW)).toBeNull()
    })
  })

  describe("max_age", () => {
    it("passes when the authentication is within max_age", () => {
      expect(checkStepUpRequirements({ maxAge: 300 }, { authTime: NOW - 299 }, NOW)).toBeNull()
    })

    it("passes at exactly max_age", () => {
      expect(checkStepUpRequirements({ maxAge: 300 }, { authTime: NOW - 300 }, NOW)).toBeNull()
    })

    it("fails one second past max_age", () => {
      expect(checkStepUpRequirements({ maxAge: 300 }, { authTime: NOW - 301 }, NOW)).toBe(
        "EXCEEDS_MAX_AGE"
      )
    })

    // The other half of the fabrication case: an unknown authentication time is not freshness.
    it("fails when max_age is requested and no authTime was recorded", () => {
      expect(checkStepUpRequirements({ maxAge: 300 }, {}, NOW)).toBe("EXCEEDS_MAX_AGE")
    })

    // `max_age=0` demands a fresh authentication and is meaningful, so it must not be treated as "unset".
    it("treats max_age=0 as a requirement, not as absent", () => {
      expect(checkStepUpRequirements({ maxAge: 0 }, { authTime: NOW }, NOW)).toBeNull()
      expect(checkStepUpRequirements({ maxAge: 0 }, { authTime: NOW - 1 }, NOW)).toBe(
        "EXCEEDS_MAX_AGE"
      )
      expect(checkStepUpRequirements({ maxAge: 0 }, {}, NOW)).toBe("EXCEEDS_MAX_AGE")
    })

    it("does not check max_age when the client did not ask for it", () => {
      expect(checkStepUpRequirements({}, { authTime: NOW - 99999 }, NOW)).toBeNull()
    })
  })

  // ACR is evaluated first, so a request failing both reports the stronger, more specific reason.
  it("reports ACR_NOT_SATISFIED when both requirements fail", () => {
    expect(
      checkStepUpRequirements({ acrs: ["mfa"], acrEssential: true, maxAge: 60 }, {}, NOW)
    ).toBe("ACR_NOT_SATISFIED")
  })
})
