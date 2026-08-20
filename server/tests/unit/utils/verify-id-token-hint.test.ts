import { describe, it, expect, beforeAll } from "vitest"
import { generateKeyPairSync, KeyObject } from "node:crypto"
import jwt from "jsonwebtoken"
import { verifyIdTokenHint, ID_TOKEN_HINT_ALGS } from "../../../src/utils/verify-id-token-hint"

// RPL-W2 / T0-2. An `id_token_hint` is a signed assertion (RP-Initiated Logout §2), and its `sub` drives
// back-channel logout delivery. Before this, the code called `jwt.decode` and trusted the result, so a
// hand-crafted unsigned JWT could name any subject. These tests pin the verification.

const ISSUER = "https://op.example.com"
const AUDIENCE = "client-abc"
const SUBJECT = "user-42"

interface Signer {
  privatePem: string
  jwk: Record<string, unknown>
}

/** Mint an EC P-256 keypair and express the public half as a JWK, the way the service's JWKS serves it. */
function ecSigner(kid: string): Signer {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
  return { privatePem: pem(privateKey), jwk: { ...jwkOf(publicKey), kid, alg: "ES256", use: "sig" } }
}

function rsaSigner(kid: string): Signer {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
  return { privatePem: pem(privateKey), jwk: { ...jwkOf(publicKey), kid, alg: "RS256", use: "sig" } }
}

const pem = (k: KeyObject) => k.export({ type: "pkcs8", format: "pem" }).toString()
const jwkOf = (k: KeyObject) => k.export({ format: "jwk" }) as Record<string, unknown>

let op: Signer
let foreign: Signer
let second: Signer

beforeAll(() => {
  op = ecSigner("op-key-1")
  foreign = ecSigner("op-key-1") // same kid, different key — the substitution case
  second = rsaSigner("op-key-2")
})

const sign = (
  signer: Signer,
  payload: Record<string, unknown>,
  opts: jwt.SignOptions = {}
) => jwt.sign(payload, signer.privatePem, { algorithm: "ES256", ...opts })

const genuine = (over: Record<string, unknown> = {}) => ({
  iss: ISSUER,
  aud: AUDIENCE,
  sub: SUBJECT,
  exp: Math.floor(Date.now() / 1000) + 3600,
  ...over,
})

const verify = (hint: string, over: Partial<Parameters<typeof verifyIdTokenHint>[1]> = {}) =>
  verifyIdTokenHint(hint, { jwks: [op.jwk], issuer: ISSUER, audience: AUDIENCE, ...over })

describe("verifyIdTokenHint", () => {
  describe("accepts a genuine hint", () => {
    it("returns the subject for a valid ES256 hint", () => {
      const result = verify(sign(op, genuine()))
      expect(result).toMatchObject({ subject: SUBJECT, expired: false })
      expect(result.reason).toBeUndefined()
    })

    it("accepts an aud array that contains the client_id", () => {
      const hint = sign(op, genuine({ aud: ["someone-else", AUDIENCE] }))
      expect(verify(hint).subject).toBe(SUBJECT)
    })

    it("leaves aud unpinned when no client_id was supplied", () => {
      // §2 makes `client_id` OPTIONAL, so a hint for another client must still identify its subject.
      const hint = sign(op, genuine({ aud: "a-different-client" }))
      expect(verify(hint, { audience: undefined }).subject).toBe(SUBJECT)
    })

    it("selects the right key by kid from a multi-key set", () => {
      const hint = sign(second, genuine(), { algorithm: "RS256", keyid: "op-key-2" })
      expect(verifyIdTokenHint(hint, { jwks: [op.jwk, second.jwk], issuer: ISSUER }).subject).toBe(SUBJECT)
    })

    it("tries every key when the header carries no kid", () => {
      // `sign` sets no `kid`, so this exercises the try-all-candidates fallback with the matching key last.
      const hint = sign(second, genuine(), { algorithm: "RS256" })
      expect(verifyIdTokenHint(hint, { jwks: [op.jwk, second.jwk], issuer: ISSUER }).subject).toBe(SUBJECT)
    })

    it("skips an unconvertible key and keeps going to a good one", () => {
      // The `jwk_conversion_failed` branch. Conversion moved from `jwk-to-pem` to Node's
      // `createPublicKey` (dropping `elliptic`, whose GHSA-848j-6mx2-7j84 has no fix), so the throw now
      // comes from Node as ERR_CRYPTO_INVALID_JWK — the branch must stay reachable, and a bad key in the
      // set must not deny service for a good one sharing the kid-less fallback path.
      const junk = { kty: "EC", crv: "P-256", x: "not-a-point", y: "not-a-point" }
      const hint = sign(op, genuine())
      expect(verifyIdTokenHint(hint, { jwks: [junk, op.jwk], issuer: ISSUER }).subject).toBe(SUBJECT)
    })

    it("reports jwk_conversion_failed when every candidate is unconvertible", () => {
      const junk = { kty: "EC", crv: "P-256", x: "not-a-point", y: "not-a-point" }
      const result = verifyIdTokenHint(sign(op, genuine()), { jwks: [junk], issuer: ISSUER })
      expect(result.subject).toBeUndefined()
      expect(result.reason).toBe("jwk_conversion_failed")
    })

    it("accepts an expired hint and reports it as expired", () => {
      // Deliberate: a hint is an *old* token by definition. The signature still proves the OP issued it.
      const hint = sign(op, genuine({ exp: Math.floor(Date.now() / 1000) - 86_400 }))
      expect(verify(hint)).toMatchObject({ subject: SUBJECT, expired: true })
    })
  })

  describe("refuses anything it cannot verify", () => {
    it("refuses alg: none — the forged-hint case", () => {
      const forged = jwt.sign(genuine(), "", { algorithm: "none" })
      const result = verify(forged)
      expect(result.subject).toBeUndefined()
      expect(result.reason).toBe("unsupported_alg:none")
    })

    it("refuses HS256 even when the HMAC is internally valid", () => {
      // Symmetric algorithms are keyed on a secret this server does not hold, so an HS256 hint is not
      // evidence to the OP. Client 1523514379 signs ID tokens this way; its hints are ignored by design.
      const hs = jwt.sign(genuine(), "a-client-secret", { algorithm: "HS256" })
      expect(verify(hs).reason).toBe("unsupported_alg:HS256")
    })

    it("refuses a valid signature from a foreign key presenting a known kid", () => {
      const result = verify(sign(foreign, genuine()))
      expect(result.subject).toBeUndefined()
      expect(result.reason).toBeTruthy()
    })

    it("refuses a wrong iss", () => {
      expect(verify(sign(op, genuine({ iss: "https://evil.example.com" }))).subject).toBeUndefined()
    })

    it("refuses an aud that does not contain the client_id", () => {
      expect(verify(sign(op, genuine({ aud: "another-client" }))).subject).toBeUndefined()
    })

    it("refuses a hint whose kid matches no key", () => {
      const hint = jwt.sign(genuine(), op.privatePem, { algorithm: "ES256", keyid: "not-our-kid" })
      expect(verify(hint).reason).toBe("unknown_kid:not-our-kid")
    })

    it("refuses a verified hint with no sub", () => {
      const hint = sign(op, { iss: ISSUER, aud: AUDIENCE })
      expect(verify(hint)).toMatchObject({ reason: "no_sub" })
    })

    it.each([
      ["an empty string", ""],
      ["a non-JWT string", "not-a-jwt"],
      ["a truncated JWT", "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0"],
    ])("refuses %s", (_label, hint) => {
      expect(verify(hint).subject).toBeUndefined()
    })

    it("fails closed when the key set is empty", () => {
      expect(verify(sign(op, genuine()), { jwks: [] }).reason).toBe("no_keys")
    })

    it("fails closed when no expected issuer is known", () => {
      // Discovery unavailable must not mean "skip the iss check" — that would let any signed token in.
      expect(verify(sign(op, genuine()), { issuer: "" }).reason).toBe("no_expected_issuer")
    })

    it("skips a key that cannot be converted rather than aborting", () => {
      const junk = { kid: "op-key-1", kty: "oct", k: "not-an-asymmetric-key" }
      const result = verifyIdTokenHint(sign(op, genuine()), {
        jwks: [junk, op.jwk],
        issuer: ISSUER,
        audience: AUDIENCE,
      })
      expect(result.subject).toBe(SUBJECT)
    })

    it("never throws, whatever it is handed", () => {
      for (const hint of ["", "...", "a.b.c", "🙈", "e30.e30.e30"]) {
        expect(() => verify(hint)).not.toThrow()
      }
    })
  })

  it("pins nine asymmetric algorithms and excludes HS* and none", () => {
    expect(ID_TOKEN_HINT_ALGS).toHaveLength(9)
    expect(ID_TOKEN_HINT_ALGS.some((a) => a.startsWith("HS"))).toBe(false)
    expect(ID_TOKEN_HINT_ALGS).not.toContain("none" as never)
    // EdDSA is absent because jsonwebtoken@9 cannot verify it — fail closed rather than appear to support it.
    expect(ID_TOKEN_HINT_ALGS).not.toContain("EdDSA" as never)
  })
})
