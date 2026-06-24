import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { JwksClient } from "../../../src/utils/jwksClient"

const mockKeys = [
  { kid: "key-1", kty: "RSA", n: "abc", e: "AQAB", alg: "RS256" },
  { kid: "key-2", kty: "EC", crv: "P-256", x: "xval", y: "yval", alg: "ES256" },
]

const mockPemRsa = "-----BEGIN RSA PUBLIC KEY-----\nMOCK\n-----END RSA PUBLIC KEY-----"
const mockPemEc = "-----BEGIN EC PUBLIC KEY-----\nMOCK\n-----END EC PUBLIC KEY-----"

vi.mock("jwk-to-pem", () => ({
  default: (jwk: any) => {
    if (jwk.kty === "RSA") return mockPemRsa
    if (jwk.kty === "EC") return mockPemEc
    return "mock-pem"
  },
}))

vi.mock("../../../src/utils/logger", () => ({
  default: Object.assign(
    (msg: string) => {},
    { error: vi.fn(), child: () => ({ error: vi.fn() }) }
  ),
  createCallableLogger: () => Object.assign(
    (msg: string) => {},
    { error: vi.fn(), child: () => ({ error: vi.fn() }) }
  ),
  baseLogger: {} as any,
}))

// Use unique URI per test to avoid pollution from module-level jwksCache
let testId = 0
const uniqueUri = () => `https://example${testId++}.com/.well-known/jwks.json`

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("JwksClient", () => {
  it("fetches and returns keys", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ keys: mockKeys }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const uri = uniqueUri()
    const client = new JwksClient(uri, 300_000)
    const keys = await (client as any).fetchJwks()

    expect(keys).toEqual(mockKeys)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith(uri)

    vi.unstubAllGlobals()
  })

  it("caches keys and returns cached on second call", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ keys: mockKeys }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const uri = uniqueUri()
    const client = new JwksClient(uri, 300_000)
    await (client as any).fetchJwks()
    const keys2 = await (client as any).fetchJwks()

    expect(keys2).toEqual(mockKeys)
    expect(mockFetch).toHaveBeenCalledTimes(1)

    vi.unstubAllGlobals()
  })

  it("getPublicKey returns PEM for known kid", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ keys: mockKeys }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const uri = uniqueUri()
    const client = new JwksClient(uri, 300_000)
    const pem = await client.getPublicKey("key-1")

    expect(pem).toBe(mockPemRsa)

    vi.unstubAllGlobals()
  })

  it("getPublicKey returns undefined for unknown kid", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ keys: mockKeys }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const uri = uniqueUri()
    const client = new JwksClient(uri, 300_000)
    const pem = await client.getPublicKey("unknown-kid")

    expect(pem).toBeUndefined()

    vi.unstubAllGlobals()
  })

  it("getAllPublicKeys returns PEMs for all keys", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ keys: mockKeys }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const uri = uniqueUri()
    const client = new JwksClient(uri, 300_000)
    const pems = await client.getAllPublicKeys()

    expect(pems).toHaveLength(2)
    expect(pems[0]).toBe(mockPemRsa)
    expect(pems[1]).toBe(mockPemEc)

    vi.unstubAllGlobals()
  })

  it("throws on fetch failure", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    })
    vi.stubGlobal("fetch", mockFetch)

    const uri = uniqueUri()
    const client = new JwksClient(uri, 300_000)

    await expect(client.getPublicKey("key-1")).rejects.toThrow(
      "Failed to fetch service configuration"
    )

    vi.unstubAllGlobals()
  })
})
