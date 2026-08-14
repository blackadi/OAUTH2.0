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
    const result = createLocalJWT("issuer", "subject", ["audience"], "client-1")
    expect(result).toHaveProperty("token")
    expect(result).toHaveProperty("publicKey")
    expect(typeof result.token).toBe("string")
    expect(result.publicKey).toBe(testPublicKey)
  })

  it("returns a valid JWT that can be decoded", () => {
    const { token } = createLocalJWT("iss-1", "sub-1", ["aud-1"], "client-1")
    const decoded = jwt.decode(token, { complete: true })
    expect(decoded).not.toBeNull()
    expect(decoded!.header).toHaveProperty("alg", "ES256")
    expect(decoded!.payload).toHaveProperty("iss", "iss-1")
    expect(decoded!.payload).toHaveProperty("sub", "sub-1")
    expect(decoded!.payload).toHaveProperty("aud")
  })

  it("sets audience as array", () => {
    const { token } = createLocalJWT("iss", "sub", ["client-1", "client-2"], "client-1")
    const decoded = jwt.decode(token) as any
    expect(decoded.aud).toEqual(["client-1", "client-2"])
  })

  it("sets iat and exp claims", () => {
    const { token } = createLocalJWT("iss", "sub", ["aud"], "client-1")
    const decoded = jwt.decode(token) as any
    expect(decoded.iat).toBeDefined()
    expect(decoded.exp).toBeDefined()
    expect(decoded.exp - decoded.iat).toBe(300)
  })

  it("sets kid in header", () => {
    const { token } = createLocalJWT("iss", "sub", ["aud"], "client-1")
    const decoded = jwt.decode(token, { complete: true })
    expect(decoded!.header).toHaveProperty(
      "kid",
      "jeQR9ibbekADE-Bb_szzi3pKK_WeLUvRJ4FneHEnk4s"
    )
  })

  it("includes acr and auth_time when provided (RFC 9470)", () => {
    const authTime = Math.floor(Date.now() / 1000) - 60
    const { token } = createLocalJWT("iss", "sub", ["aud"], "client-1", { acr: "pwd", authTime })
    const decoded = jwt.decode(token) as any
    expect(decoded.acr).toBe("pwd")
    expect(decoded.auth_time).toBe(authTime)
  })

  it("omits acr and auth_time when not provided", () => {
    const { token } = createLocalJWT("iss", "sub", ["aud"], "client-1")
    const decoded = jwt.decode(token) as any
    expect(decoded.acr).toBeUndefined()
    expect(decoded.auth_time).toBeUndefined()
  })

  it("includes acr without auth_time", () => {
    const { token } = createLocalJWT("iss", "sub", ["aud"], "client-1", { acr: "pwd" })
    const decoded = jwt.decode(token) as any
    expect(decoded.acr).toBe("pwd")
    expect(decoded.auth_time).toBeUndefined()
  })

  // 9068-W2. This is the only JWT in the repo a learner can obtain and decode as an "access token", and
  // Module 04's objective is to state RFC 9068 §2's required claims and `typ` value. It used to emit
  // `typ: JWT` and five claims — so the one available specimen contradicted the lesson it illustrates.
  describe("RFC 9068 §2 conformance (9068-W2)", () => {
    it("sets typ: at+jwt, which §2.1 requires and jsonwebtoken does not default to", () => {
      const { token } = createLocalJWT("iss", "sub", ["aud"], "client-1")
      const decoded = jwt.decode(token, { complete: true })

      expect(decoded!.header.typ).toBe("at+jwt")
      // §4 check 1 makes a resource server MUST-reject `typ: JWT` on an access token.
      expect(decoded!.header.typ).not.toBe("JWT")
      // Overriding the header must not have cost us alg or kid.
      expect(decoded!.header.alg).toBe("ES256")
      expect(decoded!.header).toHaveProperty("kid")
    })

    it("carries all seven claims §2.2 marks REQUIRED", () => {
      const { token } = createLocalJWT("iss-1", "sub-1", ["aud-1"], "client-1")
      const decoded = jwt.decode(token) as any

      for (const claim of ["iss", "exp", "aud", "sub", "client_id", "iat", "jti"]) {
        expect(decoded[claim], `§2.2 REQUIRED claim \`${claim}\` is missing`).toBeDefined()
      }
      expect(decoded.client_id).toBe("client-1")
    })

    // §2.2 requires jti, and §4's replay guidance is why: a resource server can only detect a replayed
    // token if each one is distinguishable. A constant or a claim-derived value would satisfy the schema
    // and defeat the purpose.
    it("gives every token a distinct jti", () => {
      const a = jwt.decode(createLocalJWT("iss", "sub", ["aud"], "c").token) as any
      const b = jwt.decode(createLocalJWT("iss", "sub", ["aud"], "c").token) as any

      expect(a.jti).toBeTruthy()
      expect(a.jti).not.toBe(b.jti)
    })

    it("includes scope when supplied (§2.2.3)", () => {
      const { token } = createLocalJWT("iss", "sub", ["aud"], "c", { scope: "openid profile" })
      const decoded = jwt.decode(token) as any

      expect(decoded.scope).toBe("openid profile")
    })

    // §2.2.3 is a SHOULD, so absence is conformant — but an empty string is not the same as absence, and
    // `scope: ""` would tell a resource server the token grants nothing rather than that nothing was said.
    it("omits scope rather than emitting it empty", () => {
      const bare = jwt.decode(createLocalJWT("iss", "sub", ["aud"], "c").token) as any
      const blank = jwt.decode(createLocalJWT("iss", "sub", ["aud"], "c", { scope: "" }).token) as any

      expect(bare).not.toHaveProperty("scope")
      expect(blank).not.toHaveProperty("scope")
    })
  })
})
