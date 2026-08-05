import { describe, it, expect } from "vitest"
import { parseProperties } from "../../../src/utils/properties"

describe("parseProperties", () => {
  it("passes an array through unchanged", () => {
    const input = [{ key: "a", value: "1", hidden: false }]
    expect(parseProperties(input)).toEqual(input)
  })

  it("parses a JSON string encoding an array", () => {
    expect(parseProperties('[{"key":"a","value":"1"}]')).toEqual([
      { key: "a", value: "1" },
    ])
  })

  it("never returns a string — Authlete requires an array on the wire", () => {
    const result = parseProperties('[{"key":"a","value":"1"}]')
    expect(Array.isArray(result)).toBe(true)
    expect(typeof result).not.toBe("string")
  })

  it("returns undefined for a JSON string that decodes to a non-array", () => {
    expect(parseProperties('{"key":"a"}')).toBeUndefined()
  })

  it("returns undefined for malformed JSON rather than forwarding it", () => {
    expect(parseProperties("{not json")).toBeUndefined()
  })

  it("returns undefined for a plain object", () => {
    expect(parseProperties({ key: "a", value: "1" })).toBeUndefined()
  })

  it("returns undefined for undefined, null and empty string", () => {
    expect(parseProperties(undefined)).toBeUndefined()
    expect(parseProperties(null)).toBeUndefined()
    expect(parseProperties("")).toBeUndefined()
  })

  it("preserves the hidden flag", () => {
    expect(parseProperties('[{"key":"a","value":"1","hidden":true}]')).toEqual([
      { key: "a", value: "1", hidden: true },
    ])
  })

  it("returns an empty array for an encoded empty array", () => {
    expect(parseProperties("[]")).toEqual([])
  })
})
