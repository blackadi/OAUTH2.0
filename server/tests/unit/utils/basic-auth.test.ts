import { describe, it, expect } from "vitest"
import { parseBasicAuth } from "../../../src/utils/basic-auth"

const encode = (s: string) => Buffer.from(s).toString("base64")

describe("parseBasicAuth", () => {
  it("decodes client id and secret", () => {
    expect(parseBasicAuth(`Basic ${encode("c-1:s-1")}`)).toEqual({
      clientId: "c-1",
      clientSecret: "s-1",
    })
  })

  it("splits on the first colon only, so a secret may contain colons", () => {
    expect(parseBasicAuth(`Basic ${encode("c-1:a:b:c")}`)).toEqual({
      clientId: "c-1",
      clientSecret: "a:b:c",
    })
  })

  it("treats the scheme case-insensitively (RFC 9110 §11.1)", () => {
    const expected = { clientId: "c-1", clientSecret: "s-1" }
    expect(parseBasicAuth(`basic ${encode("c-1:s-1")}`)).toEqual(expected)
    expect(parseBasicAuth(`BASIC ${encode("c-1:s-1")}`)).toEqual(expected)
    expect(parseBasicAuth(`bAsIc ${encode("c-1:s-1")}`)).toEqual(expected)
  })

  it("allows an empty secret", () => {
    expect(parseBasicAuth(`Basic ${encode("c-1:")}`)).toEqual({
      clientId: "c-1",
      clientSecret: "",
    })
  })

  it("returns undefined for a different scheme", () => {
    expect(parseBasicAuth(`Bearer ${encode("c-1:s-1")}`)).toBeUndefined()
    expect(parseBasicAuth(`DPoP ${encode("c-1:s-1")}`)).toBeUndefined()
  })

  it("returns undefined when the header is missing or empty", () => {
    expect(parseBasicAuth(undefined)).toBeUndefined()
    expect(parseBasicAuth("")).toBeUndefined()
    expect(parseBasicAuth("Basic")).toBeUndefined()
    expect(parseBasicAuth("Basic ")).toBeUndefined()
  })

  it("returns undefined when there is no colon separator", () => {
    expect(parseBasicAuth(`Basic ${encode("no-colon-here")}`)).toBeUndefined()
  })

  it("returns undefined when the client id is empty", () => {
    expect(parseBasicAuth(`Basic ${encode(":secret-only")}`)).toBeUndefined()
  })
})
