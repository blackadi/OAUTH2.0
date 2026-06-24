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
  it("requires response_type, client_id, redirect_uri without request_uri", () => {
    expect(
      validateAuthorizationParams({
        response_type: "code",
        client_id: "c1",
        redirect_uri: "http://localhost",
      })
    ).toBeNull()
  })

  it("returns error when response_type is missing", () => {
    const err = validateAuthorizationParams({ client_id: "c1", redirect_uri: "http" })
    expect(err).toContain("response_type")
  })

  it("requires client_id and request_uri when request_uri present", () => {
    expect(
      validateAuthorizationParams({
        request_uri: "urn:ietf:params:oauth:request_uri:abc",
        client_id: "c1",
      })
    ).toBeNull()
  })

  it("returns error when client_id missing with request_uri", () => {
    const err = validateAuthorizationParams({ request_uri: "urn:..." })
    expect(err).toContain("client_id")
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
