import { describe, it, expect } from "vitest"
import { appendToParams } from "../../../src/utils/params"

describe("appendToParams", () => {
  it("preserves the parameters already present", () => {
    const out = new URLSearchParams(
      appendToParams("login_hint=user-1&scope=openid", [{ key: "client_id", value: "c-1" }]),
    )
    expect(out.get("login_hint")).toBe("user-1")
    expect(out.get("scope")).toBe("openid")
    expect(out.get("client_id")).toBe("c-1")
  })

  it("replaces rather than duplicates an existing key", () => {
    // `set`, not `append`: a caller-supplied client_id must be overwritten by the authenticated one.
    // A duplicated key is a parameter the AS may resolve either way.
    const out = appendToParams("client_id=attacker", [{ key: "client_id", value: "c-1" }])
    expect(new URLSearchParams(out).getAll("client_id")).toEqual(["c-1"])
  })

  it("url-encodes values that need it", () => {
    const out = appendToParams("", [{ key: "client_secret", value: "a b&c=d" }])
    expect(new URLSearchParams(out).get("client_secret")).toBe("a b&c=d")
  })

  it("handles an empty parameter string", () => {
    expect(appendToParams("", [{ key: "client_id", value: "c-1" }])).toBe("client_id=c-1")
  })
})
