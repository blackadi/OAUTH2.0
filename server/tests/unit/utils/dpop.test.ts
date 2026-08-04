import { describe, it, expect } from "vitest"
import { Request } from "express"
import {
  authChallenge,
  dpopHttpTarget,
  extractAccessToken,
  isTokenPresentationError,
  TokenPresentationError,
} from "../../../src/utils/dpop"

/** Minimal Express-request stand-in. `is()` mimics Express's content-type matching. */
function mkReq(opts: {
  method?: string
  authorization?: string
  contentType?: string
  body?: unknown
  originalUrl?: string
  protocol?: string
  host?: string
}): Request {
  const headers: Record<string, string> = {}
  if (opts.authorization !== undefined) headers.authorization = opts.authorization
  if (opts.contentType) headers["content-type"] = opts.contentType
  return {
    method: opts.method ?? "GET",
    headers,
    body: opts.body,
    originalUrl: opts.originalUrl ?? "/api/userinfo",
    protocol: opts.protocol ?? "https",
    get: (name: string) =>
      name.toLowerCase() === "host" ? opts.host ?? "as.example.com" : undefined,
    is: (type: string) =>
      opts.contentType && opts.contentType.includes(type) ? type : false,
  } as unknown as Request
}

describe("extractAccessToken", () => {
  describe("Authorization header schemes", () => {
    // RFC 6750 §2.1 Bearer, RFC 9449 §7.1 DPoP. RFC 9110 §11.1: auth-scheme is case-insensitive.
    it.each([
      ["Bearer", "bearer"],
      ["bearer", "bearer"],
      ["BEARER", "bearer"],
      ["DPoP", "dpop"],
      ["dpop", "dpop"],
      ["DPOP", "dpop"],
    ])("accepts %s and reports scheme %s", (sent, scheme) => {
      const result = extractAccessToken(mkReq({ authorization: `${sent} tok-1` }))
      expect(result).toEqual({ token: "tok-1", scheme })
    })

    it("tolerates extra whitespace between scheme and token", () => {
      expect(extractAccessToken(mkReq({ authorization: "DPoP    tok-1" }))).toEqual({
        token: "tok-1",
        scheme: "dpop",
      })
    })

    it("does not treat a tab-separated header as malformed", () => {
      expect(extractAccessToken(mkReq({ authorization: "Bearer\ttok-1" }))).toEqual({
        token: "tok-1",
        scheme: "bearer",
      })
    })
  })

  describe("presentations that are not an access token", () => {
    // The bug this replaced did authHeader.replace("Bearer ", ""), which forwarded these verbatim
    // and asked the authorization server to look them up as tokens.
    it.each([
      ["Basic dXNlcjpwYXNz"],
      ["Negotiate abc"],
      ["Digest username=x"],
    ])("returns null for an unsupported scheme (%s)", (header) => {
      expect(extractAccessToken(mkReq({ authorization: header }))).toBeNull()
    })

    it("returns null when there is no Authorization header", () => {
      expect(extractAccessToken(mkReq({}))).toBeNull()
    })

    it("returns null for an empty Authorization header", () => {
      expect(extractAccessToken(mkReq({ authorization: "" }))).toBeNull()
    })

    it("returns null for a scheme with no credentials", () => {
      expect(extractAccessToken(mkReq({ authorization: "Bearer" }))).toBeNull()
      expect(extractAccessToken(mkReq({ authorization: "DPoP   " }))).toBeNull()
    })

    it("returns null for a bare token with no scheme", () => {
      expect(extractAccessToken(mkReq({ authorization: "tok-1" }))).toBeNull()
    })
  })

  describe("form-encoded body — RFC 6750 §2.2", () => {
    it("reads access_token from a form-encoded body", () => {
      const req = mkReq({
        method: "POST",
        contentType: "application/x-www-form-urlencoded",
        body: { access_token: "tok-body" },
      })
      expect(extractAccessToken(req)).toEqual({ token: "tok-body", scheme: "bearer" })
    })

    it("ignores access_token in a JSON body — §2.2 covers form encoding only", () => {
      const req = mkReq({
        method: "POST",
        contentType: "application/json",
        body: { access_token: "tok-body" },
      })
      expect(extractAccessToken(req)).toBeNull()
    })

    it("ignores a body on GET", () => {
      const req = mkReq({
        method: "GET",
        contentType: "application/x-www-form-urlencoded",
        body: { access_token: "tok-body" },
      })
      expect(extractAccessToken(req)).toBeNull()
    })

    it("ignores the non-standard `token` body field", () => {
      // Authlete's request model calls it `token`; RFC 6750 §2.2 calls it `access_token`. Honouring
      // `token` from the body is how a client used to smuggle in server-determined fields.
      const req = mkReq({
        method: "POST",
        contentType: "application/x-www-form-urlencoded",
        body: { token: "tok-body" },
      })
      expect(extractAccessToken(req)).toBeNull()
    })
  })

  describe("more than one transmission method — RFC 6750 §2", () => {
    it("throws when the token is in both the header and the body", () => {
      const req = mkReq({
        method: "POST",
        authorization: "Bearer tok-hdr",
        contentType: "application/x-www-form-urlencoded",
        body: { access_token: "tok-body" },
      })
      expect(() => extractAccessToken(req)).toThrow(TokenPresentationError)
      try {
        extractAccessToken(req)
      } catch (err) {
        expect(isTokenPresentationError(err)).toBe(true)
        if (isTokenPresentationError(err)) {
          expect(err.status).toBe(400)
          expect(err.code).toBe("invalid_request")
        }
      }
    })

    it("does not throw when the body carries an unrelated field", () => {
      const req = mkReq({
        method: "POST",
        authorization: "Bearer tok-hdr",
        contentType: "application/x-www-form-urlencoded",
        body: { schema: "openid" },
      })
      expect(extractAccessToken(req)).toEqual({ token: "tok-hdr", scheme: "bearer" })
    })
  })
})

describe("dpopHttpTarget", () => {
  // RFC 9449 §4.2: htu is the target URI without query and fragment.
  it("strips the query string from htu but keeps it in targetUri", () => {
    const req = mkReq({ originalUrl: "/api/userinfo?schema=openid&x=1" })
    expect(dpopHttpTarget(req)).toEqual({
      htu: "https://as.example.com/api/userinfo",
      targetUri: "https://as.example.com/api/userinfo?schema=openid&x=1",
    })
  })

  it("returns identical values when there is no query", () => {
    const req = mkReq({ originalUrl: "/api/userinfo" })
    expect(dpopHttpTarget(req)).toEqual({
      htu: "https://as.example.com/api/userinfo",
      targetUri: "https://as.example.com/api/userinfo",
    })
  })

  it("strips a fragment", () => {
    const req = mkReq({ originalUrl: "/api/userinfo#frag" })
    expect(dpopHttpTarget(req).htu).toBe("https://as.example.com/api/userinfo")
  })

  it("preserves the port and honours the request protocol", () => {
    const req = mkReq({ protocol: "http", host: "localhost:3000", originalUrl: "/api/userinfo?a=b" })
    expect(dpopHttpTarget(req)).toEqual({
      htu: "http://localhost:3000/api/userinfo",
      targetUri: "http://localhost:3000/api/userinfo?a=b",
    })
  })
})

describe("authChallenge", () => {
  it("lists both schemes with no error code — RFC 6750 §3.1", () => {
    expect(authChallenge(["bearer", "dpop"])).toBe("Bearer, DPoP")
  })

  it("attaches error params to the last scheme listed", () => {
    expect(authChallenge(["bearer", "dpop"], "invalid_request", "nope")).toBe(
      'Bearer, DPoP error="invalid_request",error_description="nope"'
    )
  })

  it("emits a single DPoP challenge when that is the only relevant scheme", () => {
    expect(authChallenge(["dpop"], "invalid_dpop_proof", "no proof")).toBe(
      'DPoP error="invalid_dpop_proof",error_description="no proof"'
    )
  })

  it("omits error_description when there is none", () => {
    expect(authChallenge(["bearer"], "invalid_token")).toBe('Bearer error="invalid_token"')
  })

  it("strips quotes and backslashes so the quoted-string cannot be broken out of", () => {
    // RFC 9110 §5.6.4 — an unescaped `"` would terminate the parameter value early.
    const challenge = authChallenge(["dpop"], "invalid_request", 'he said "hi" \\ bye')
    expect(challenge).toBe('DPoP error="invalid_request",error_description="he said hi  bye"')
    expect(challenge.match(/"/g)).toHaveLength(4)
  })
})

describe("isTokenPresentationError", () => {
  it("recognises a real instance", () => {
    expect(isTokenPresentationError(new TokenPresentationError(401, null, null))).toBe(true)
  })

  it("recognises a structurally identical object from another module instance", () => {
    // Guards the ts-node-dev hot-reload case where `instanceof` compares two distinct classes.
    expect(isTokenPresentationError({ isTokenPresentationError: true })).toBe(true)
  })

  it("rejects unrelated errors and values", () => {
    expect(isTokenPresentationError(new Error("boom"))).toBe(false)
    expect(isTokenPresentationError(null)).toBe(false)
    expect(isTokenPresentationError(undefined)).toBe(false)
    expect(isTokenPresentationError("nope")).toBe(false)
    expect(isTokenPresentationError({ isTokenPresentationError: "yes" })).toBe(false)
  })
})

describe("TokenPresentationError", () => {
  it("defaults to advertising both schemes", () => {
    expect(new TokenPresentationError(401, null, null).schemes).toEqual(["bearer", "dpop"])
  })

  it("carries a usable message when there is no description", () => {
    expect(new TokenPresentationError(401, null, null).message).toBe(
      "access token presentation rejected"
    )
  })
})
