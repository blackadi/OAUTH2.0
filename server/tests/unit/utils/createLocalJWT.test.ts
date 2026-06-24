import { describe, it, expect, vi, beforeAll } from "vitest"
import jwt from "jsonwebtoken"

const testPrivateKey = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIPpQjVpD2wkGxKHxTnNSh1jB8q2M9xvtTpw1Lgyh86LNoAoGCCqGSM49
AwEHoUQDQgAEyYZWUBR+S5o2SUnvmQa0akH4aj516ivC1R1vTUUi6/MJLvB3cbt+
+d18oFcqfwKsK2h9ucHiENplCZ+qksXdvQ==
-----END EC PRIVATE KEY-----`

const testPublicKey = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEyYZWUBR+S5o2SUnvmQa0akH4aj51
6ivC1R1vTUUi6/MJLvB3cbt++d18oFcqfwKsK2h9ucHiENplCZ+qksXdvQ==
-----END PUBLIC KEY-----`

let createLocalJWT: any

describe("createLocalJWT", () => {
  beforeAll(async () => {
    vi.resetModules()
    vi.doMock("../../../src/config/authlete.config", () => ({
      jwt: {
        privateKey: testPrivateKey,
        publicKey: testPublicKey,
      },
    }))
    const mod = await import("../../../src/utils/createLocalJWT")
    createLocalJWT = mod.createLocalJWT
  })

  it("returns an object with token and publicKey", () => {
    const result = createLocalJWT("issuer", "subject", ["audience"])
    expect(result).toHaveProperty("token")
    expect(result).toHaveProperty("publicKey")
    expect(typeof result.token).toBe("string")
    expect(result.publicKey).toBe(testPublicKey)
  })

  it("returns a valid JWT that can be decoded", () => {
    const { token } = createLocalJWT("iss-1", "sub-1", ["aud-1"])
    const decoded = jwt.decode(token, { complete: true })
    expect(decoded).not.toBeNull()
    expect(decoded!.header).toHaveProperty("alg", "ES256")
    expect(decoded!.payload).toHaveProperty("iss", "iss-1")
    expect(decoded!.payload).toHaveProperty("sub", "sub-1")
    expect(decoded!.payload).toHaveProperty("aud")
  })

  it("sets audience as array", () => {
    const { token } = createLocalJWT("iss", "sub", ["client-1", "client-2"])
    const decoded = jwt.decode(token) as any
    expect(decoded.aud).toEqual(["client-1", "client-2"])
  })

  it("sets iat and exp claims", () => {
    const { token } = createLocalJWT("iss", "sub", ["aud"])
    const decoded = jwt.decode(token) as any
    expect(decoded.iat).toBeDefined()
    expect(decoded.exp).toBeDefined()
    expect(decoded.exp - decoded.iat).toBe(300)
  })

  it("sets kid in header", () => {
    const { token } = createLocalJWT("iss", "sub", ["aud"])
    const decoded = jwt.decode(token, { complete: true })
    expect(decoded!.header).toHaveProperty(
      "kid",
      "jeQR9ibbekADE-Bb_szzi3pKK_WeLUvRJ4FneHEnk4s"
    )
  })
})
