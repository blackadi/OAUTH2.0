import { describe, it, expect } from "vitest"
import {
  validateRequired,
  validateAuthorizationParams,
  validateTokenParams,
  validateIntrospectionParams,
} from "../../../src/utils/validate"

describe("validateRequired", () => {
  it("returns null when all fields present", () => {
    expect(validateRequired({ a: "1", b: "2" }, ["a", "b"])).toBeNull()
  })

  it("returns error when field is missing", () => {
    expect(validateRequired({ a: "1" }, ["a", "b"])).toBe(
      "Missing required parameter: b"
    )
  })

  it("returns error when field is empty string", () => {
    expect(validateRequired({ a: "" }, ["a"])).toBe(
      "Missing required parameter: a"
    )
  })

  it("returns error when field is null", () => {
    expect(validateRequired({ a: null }, ["a"])).toBe(
      "Missing required parameter: a"
    )
  })

  it("returns error when field is undefined", () => {
    expect(validateRequired({ a: undefined }, ["a"])).toBe(
      "Missing required parameter: a"
    )
  })

  it("returns null for empty requiredFields", () => {
    expect(validateRequired({}, [])).toBeNull()
  })
})

describe("validateAuthorizationParams", () => {
  // `client_id` is the only parameter required in every request shape, so it is the only thing this
  // pre-flight check enforces. Everything else is shape-dependent and belongs to the authorization
  // server, which can also answer per RFC 6749 §4.1.2.1 (error redirect) where this function cannot.
  it("accepts a plain request", () => {
    expect(
      validateAuthorizationParams({
        response_type: "code",
        client_id: "c1",
        redirect_uri: "http://localhost",
      })
    ).toBeNull()
  })

  it("accepts the canonical JAR shape — client_id + request only (RFC 9101 §5)", () => {
    // The regression guard. This previously failed with "Missing required parameter: response_type",
    // because a per-shape allowlist demanded parameters that RFC 9101 §5 keeps inside the signed
    // object and §6.3 says the server must read from there regardless.
    expect(
      validateAuthorizationParams({
        client_id: "c1",
        request: "eyJhbGciOiJFUzI1NiIsInR5cCI6Im9hdXRoLWF1dGh6LXJlcStqd3QifQ.e30.sig",
      })
    ).toBeNull()
  })

  it("accepts the PAR shape — client_id + request_uri (RFC 9126)", () => {
    expect(
      validateAuthorizationParams({
        request_uri: "urn:ietf:params:oauth:request_uri:abc",
        client_id: "c1",
      })
    ).toBeNull()
  })

  it("accepts a plain request with no redirect_uri (RFC 6749 §3.1.2.3)", () => {
    // Optional when exactly one full redirection URI is registered — only the authorization server
    // knows how many are registered, so this check must not demand it.
    expect(
      validateAuthorizationParams({ response_type: "code", client_id: "c1" })
    ).toBeNull()
  })

  it("no longer rejects a request missing response_type", () => {
    // Not "valid" — just not this function's call. Authlete rejects it, and does so by redirecting to
    // the redirection URI with an error parameter, which is what RFC 6749 §4.1.2.1 requires.
    expect(
      validateAuthorizationParams({ client_id: "c1", redirect_uri: "http://localhost" })
    ).toBeNull()
  })

  it("returns an error when client_id is missing, whatever the shape", () => {
    for (const query of [
      { response_type: "code", redirect_uri: "http://localhost" },
      { request_uri: "urn:ietf:params:oauth:request_uri:abc" },
      { request: "eyJ.e30.sig" },
      {},
    ]) {
      expect(validateAuthorizationParams(query)).toContain("client_id")
    }
  })

  it("treats an empty client_id as missing", () => {
    expect(validateAuthorizationParams({ client_id: "" })).toContain("client_id")
  })
})

describe("validateTokenParams", () => {
  it("returns null when grant_type present", () => {
    expect(validateTokenParams({ grant_type: "authorization_code" })).toBeNull()
  })

  it("returns error when grant_type missing", () => {
    expect(validateTokenParams({})).toContain("grant_type")
  })
})

describe("validateIntrospectionParams", () => {
  it("returns null when token present", () => {
    expect(validateIntrospectionParams({ token: "tok-1" })).toBeNull()
  })

  it("returns error when token missing", () => {
    expect(validateIntrospectionParams({})).toContain("token")
  })
})
