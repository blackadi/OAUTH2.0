import { describe, it, expect } from "vitest"
import { base32Decode, base32Encode, verifyTotp, currentTotp, otpAuthUri } from "../../../src/utils/totp"

/**
 * Every vector here is copied from a specification, not invented — see `src/utils/totp.ts`'s header
 * comment for why that matters for a hand-rolled implementation.
 */

describe("base32Decode / base32Encode — RFC 4648 §10 test vectors", () => {
  const vectors: Array<[string, string]> = [
    ["f", "MY======"],
    ["fo", "MZXQ===="],
    ["foo", "MZXW6==="],
    ["foob", "MZXW6YQ="],
    ["fooba", "MZXW6YTB"],
    ["foobar", "MZXW6YTBOI======"],
  ]

  it.each(vectors)("encodes %j to %s", (plain, encoded) => {
    expect(base32Encode(Buffer.from(plain, "ascii"))).toBe(encoded)
  })

  it.each(vectors)("decodes %s back to %j", (plain, encoded) => {
    expect(base32Decode(encoded).toString("ascii")).toBe(plain)
  })

  it("rejects a character outside the base32 alphabet", () => {
    expect(() => base32Decode("this-is-not-base32!")).toThrow(/Invalid base32 character/)
  })
})

describe("verifyTotp — RFC 6238 Appendix B test vectors (SHA-1)", () => {
  // RFC 6238's own vectors use an 8-digit truncation of the same HOTP value this module truncates to 6
  // digits; `x mod 10^6` is exactly the last 6 digits of `x mod 10^8`, so the last 6 digits of each
  // published 8-digit vector are the correct 6-digit answer for the same (secret, time) pair.
  const ASCII_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"))
  const vectors: Array<[number, string]> = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ]

  it.each(vectors)("time %i produces code %s", (time, expected) => {
    expect(verifyTotp(expected, ASCII_SECRET, time)).toBe(true)
  })

  it.each(vectors)("currentTotp(secret, %i) generates the same code %s that verifyTotp accepts", (time, expected) => {
    expect(currentTotp(ASCII_SECRET, time)).toBe(expected)
  })

  it("rejects a code from a different time step outside the tolerance window", () => {
    // 59 and 1111111109 are far more than one 30s step apart, so 59's code must not validate at
    // 1111111109's time.
    expect(verifyTotp("287082", ASCII_SECRET, 1111111109)).toBe(false)
  })

  it("rejects a well-formed but wrong code", () => {
    expect(verifyTotp("000000", ASCII_SECRET, 59)).toBe(false)
  })

  it("rejects input that is not exactly 6 digits", () => {
    expect(verifyTotp("28708", ASCII_SECRET, 59)).toBe(false)
    expect(verifyTotp("2870822", ASCII_SECRET, 59)).toBe(false)
    expect(verifyTotp("28708a", ASCII_SECRET, 59)).toBe(false)
  })

  it("tolerates one step of clock drift either side (RFC 6238 §5.2)", () => {
    // Code for time 59 (step 1) must also validate at step 0 (time 0-29) and step 2 (time 60-89).
    expect(verifyTotp("287082", ASCII_SECRET, 59 - 30)).toBe(true)
    expect(verifyTotp("287082", ASCII_SECRET, 59 + 30)).toBe(true)
  })

  it("rejects a code two steps away, outside the tolerance window", () => {
    expect(verifyTotp("287082", ASCII_SECRET, 59 + 60)).toBe(false)
  })
})

describe("otpAuthUri", () => {
  it("builds a well-formed otpauth:// URI carrying the secret, issuer, and this module's fixed parameters", () => {
    const uri = otpAuthUri("JBSWY3DPEHPK3PXP", "Example Issuer", "demo-account")
    expect(uri).toMatch(/^otpauth:\/\/totp\//)
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP")
    expect(uri).toContain("algorithm=SHA1")
    expect(uri).toContain("digits=6")
    expect(uri).toContain("period=30")
    expect(decodeURIComponent(uri.split("?")[0].replace("otpauth://totp/", ""))).toBe(
      "Example Issuer:demo-account"
    )
  })
})
