import { describe, it, expect } from "vitest"
import { randomString, createPkcePair } from "../../../src/utils/crypto"

describe("randomString", () => {
  it("returns a string of the specified length", () => {
    expect(randomString(10)).toHaveLength(10)
    expect(randomString(0)).toHaveLength(0)
    expect(randomString(100)).toHaveLength(100)
  })

  it("only contains alphanumeric characters", () => {
    const result = randomString(1000)
    expect(result).toMatch(/^[0-9a-z]+$/)
  })

  it("produces different values on successive calls", () => {
    const a = randomString(20)
    const b = randomString(20)
    expect(a).not.toBe(b)
  })
})

describe("createPkcePair", () => {
  it("returns an object with codeVerifier and codeChallenge", async () => {
    const pair = await createPkcePair()
    expect(pair).toHaveProperty("codeVerifier")
    expect(pair).toHaveProperty("codeChallenge")
    expect(typeof pair.codeVerifier).toBe("string")
    expect(typeof pair.codeChallenge).toBe("string")
  })

  it("produces different pairs on successive calls", async () => {
    const [a, b] = await Promise.all([createPkcePair(), createPkcePair()])
    expect(a.codeVerifier).not.toBe(b.codeVerifier)
    expect(a.codeChallenge).not.toBe(b.codeChallenge)
  })

  it("produces a URL-safe base64 challenge without padding", async () => {
    const pair = await createPkcePair()
    expect(pair.codeChallenge).not.toContain("=")
    expect(pair.codeChallenge).not.toContain("+")
    expect(pair.codeChallenge).not.toContain("/")
  })

  it("generates a verifier that is 64 chars by default", async () => {
    const pair = await createPkcePair()
    expect(pair.codeVerifier).toHaveLength(64)
  })
})
