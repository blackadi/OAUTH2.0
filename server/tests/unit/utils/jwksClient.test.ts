import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest"
import { generateKeyPairSync, createPublicKey, KeyObject } from "node:crypto"
import { JwksClient } from "../../../src/utils/jwksClient"

// These tests used to `vi.mock("jwk-to-pem")` and feed it fake material — `{ kty: "RSA", n: "abc" }` and
// `{ kty: "EC", crv: "P-256", x: "xval", y: "yval" }`. With the converter stubbed out they asserted only
// that the stub's return value came back, so **they proved nothing about key conversion**: the EC fixture
// is not a valid key at all and throws in `jwk-to-pem` and in Node's `createPublicKey` alike.
//
// The mock is gone. `jwksClient.ts` now converts with `crypto.createPublicKey` (dropping `jwk-to-pem`,
// whose `elliptic` advisory GHSA-848j-6mx2-7j84 has no patched release), so these use **real generated
// keys** and check the real PEM — the same pattern `verify-id-token-hint.test.ts` already used.

const mockPemFor = (jwk: Record<string, unknown>) =>
  createPublicKey({ key: jwk as never, format: "jwk" })
    .export({ type: "spki", format: "pem" })
    .toString()

const jwkOf = (k: KeyObject) => k.export({ format: "jwk" }) as Record<string, unknown>

let mockKeys: Record<string, unknown>[]
let pemRsa: string
let pemEc: string

beforeAll(() => {
  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 })
  const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
  mockKeys = [
    { ...jwkOf(rsa.publicKey), kid: "key-1", alg: "RS256", use: "sig" },
    { ...jwkOf(ec.publicKey), kid: "key-2", alg: "ES256", use: "sig" },
  ]
  pemRsa = mockPemFor(mockKeys[0])
  pemEc = mockPemFor(mockKeys[1])
})

vi.mock("../../../src/utils/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  baseLogger: {} as any,
}))

// Use unique URI per test to avoid pollution from module-level jwksCache
let testId = 0
const uniqueUri = () => `https://example${testId++}.com/.well-known/jwks.json`

const stubFetch = (keys: unknown) => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ keys }),
  })
  vi.stubGlobal("fetch", mockFetch)
  return mockFetch
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("JwksClient", () => {
  it("fetches and returns keys", async () => {
    const mockFetch = stubFetch(mockKeys)

    const uri = uniqueUri()
    const client = new JwksClient(uri, 300_000)
    const keys = await (client as any).fetchJwks()

    expect(keys).toEqual(mockKeys)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith(uri)
  })

  it("caches keys and returns cached on second call", async () => {
    const mockFetch = stubFetch(mockKeys)

    const uri = uniqueUri()
    const client = new JwksClient(uri, 300_000)
    await (client as any).fetchJwks()
    const keys2 = await (client as any).fetchJwks()

    expect(keys2).toEqual(mockKeys)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("getPublicKey returns PEM for known kid", async () => {
    stubFetch(mockKeys)

    const client = new JwksClient(uniqueUri(), 300_000)
    const pem = await client.getPublicKey("key-1")

    expect(pem).toBe(pemRsa)
    // Not just "a string the converter returned" — a real SPKI public key.
    expect(pem).toMatch(/^-----BEGIN PUBLIC KEY-----/)
    expect(pem).toMatch(/-----END PUBLIC KEY-----\n?$/)
  })

  it("getPublicKey converts EC keys as well as RSA", async () => {
    stubFetch(mockKeys)

    const client = new JwksClient(uniqueUri(), 300_000)
    const pem = await client.getPublicKey("key-2")

    expect(pem).toBe(pemEc)
    expect(pem).not.toBe(pemRsa)
  })

  it("never emits a private key, even if the JWKS serves one", async () => {
    // A JWKS should carry public halves only, but this converts whatever it is given and the method is
    // named `getPublicKey`. `createPublicKey` derives the public half and drops `d`; assert that, because
    // the failure mode is a private key in a value every caller treats as publishable.
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
    const privateJwk = { ...jwkOf(privateKey), kid: "leaky" }
    expect(privateJwk.d).toBeDefined()

    stubFetch([privateJwk])

    const client = new JwksClient(uniqueUri(), 300_000)
    const pem = await client.getPublicKey("leaky")

    expect(pem).toMatch(/^-----BEGIN PUBLIC KEY-----/)
    expect(pem).not.toMatch(/PRIVATE KEY/)
  })

  it("getPublicKey returns undefined for unknown kid", async () => {
    stubFetch(mockKeys)

    const client = new JwksClient(uniqueUri(), 300_000)
    const pem = await client.getPublicKey("unknown-kid")

    expect(pem).toBeUndefined()
  })

  it("getAllPublicKeys returns PEMs for all keys", async () => {
    stubFetch(mockKeys)

    const client = new JwksClient(uniqueUri(), 300_000)
    const pems = await client.getAllPublicKeys()

    expect(pems).toHaveLength(2)
    expect(pems[0]).toBe(pemRsa)
    expect(pems[1]).toBe(pemEc)
  })

  it("throws on a malformed JWK rather than returning a bogus key", async () => {
    // `{ x: "xval", y: "yval" }` was the old EC fixture. It is not a key, and the mock hid that.
    stubFetch([{ kid: "bad", kty: "EC", crv: "P-256", x: "xval", y: "yval" }])

    const client = new JwksClient(uniqueUri(), 300_000)

    await expect(client.getPublicKey("bad")).rejects.toThrow()
  })

  it("throws on fetch failure", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    })
    vi.stubGlobal("fetch", mockFetch)

    const client = new JwksClient(uniqueUri(), 300_000)

    await expect(client.getPublicKey("key-1")).rejects.toThrow(
      "Failed to fetch service configuration"
    )
  })
})
