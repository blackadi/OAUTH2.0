import { describe, it, expect } from "vitest"
import { hasDualChannelClientAuth, parseBasicAuth } from "../../../src/utils/basic-auth"

const encode = (s: string) => Buffer.from(s).toString("base64")

describe("parseBasicAuth", () => {
  it("decodes client id and secret", () => {
    expect(parseBasicAuth(`Basic ${encode("c-1:s-1")}`)).toEqual({
      clientId: "c-1",
      clientSecret: "s-1",
    })
  })

  it("splits on the first colon only, so a secret may contain colons", () => {
    expect(parseBasicAuth(`Basic ${encode("c-1:a:b:c")}`)).toEqual({
      clientId: "c-1",
      clientSecret: "a:b:c",
    })
  })

  it("treats the scheme case-insensitively (RFC 9110 §11.1)", () => {
    const expected = { clientId: "c-1", clientSecret: "s-1" }
    expect(parseBasicAuth(`basic ${encode("c-1:s-1")}`)).toEqual(expected)
    expect(parseBasicAuth(`BASIC ${encode("c-1:s-1")}`)).toEqual(expected)
    expect(parseBasicAuth(`bAsIc ${encode("c-1:s-1")}`)).toEqual(expected)
  })

  it("allows an empty secret", () => {
    expect(parseBasicAuth(`Basic ${encode("c-1:")}`)).toEqual({
      clientId: "c-1",
      clientSecret: "",
    })
  })

  it("returns undefined for a different scheme", () => {
    expect(parseBasicAuth(`Bearer ${encode("c-1:s-1")}`)).toBeUndefined()
    expect(parseBasicAuth(`DPoP ${encode("c-1:s-1")}`)).toBeUndefined()
  })

  it("returns undefined when the header is missing or empty", () => {
    expect(parseBasicAuth(undefined)).toBeUndefined()
    expect(parseBasicAuth("")).toBeUndefined()
    expect(parseBasicAuth("Basic")).toBeUndefined()
    expect(parseBasicAuth("Basic ")).toBeUndefined()
  })

  it("returns undefined when there is no colon separator", () => {
    expect(parseBasicAuth(`Basic ${encode("no-colon-here")}`)).toBeUndefined()
  })

  it("returns undefined when the client id is empty", () => {
    expect(parseBasicAuth(`Basic ${encode(":secret-only")}`)).toBeUndefined()
  })
})

describe("hasDualChannelClientAuth", () => {
  const encode = (v: string) => Buffer.from(v).toString("base64");
  const basic = `Basic ${encode("client-1:secret-1")}`;

  it("is true when a Basic header and a body secret are both present", () => {
    // RFC 6749 §2.3.1: "The client MUST NOT use more than one authentication method in each
    // request." Verified live 2026-08-12 that Authlete accepts this and lets Basic win, so the
    // rule is enforced here or nowhere.
    expect(hasDualChannelClientAuth(basic, { client_secret: "secret-1" })).toBe(true);
    expect(hasDualChannelClientAuth(basic, { clientSecret: "secret-1" })).toBe(true);
  });

  it("is true even when the two secrets disagree", () => {
    // The dangerous shape: Authlete issues a token on the Basic credentials and silently
    // ignores the body value, so a client debugging the wrong secret sees success.
    expect(hasDualChannelClientAuth(basic, { client_secret: "a-different-secret" })).toBe(true);
  });

  it("is false for either channel alone", () => {
    expect(hasDualChannelClientAuth(basic, { grant_type: "client_credentials" })).toBe(false);
    expect(hasDualChannelClientAuth(undefined, { client_secret: "secret-1" })).toBe(false);
  });

  it("is false for a bare client_id beside a Basic header", () => {
    // client_id is not a credential; a public client legitimately sends one with no secret,
    // and §2.3.1's methods are distinguished by where the *secret* travels.
    expect(hasDualChannelClientAuth(basic, { client_id: "client-1" })).toBe(false);
  });

  it("is false when the Basic header is malformed", () => {
    // Nothing was authenticated on that channel, so there is no second method to object to.
    expect(hasDualChannelClientAuth("Basic !!!not-base64", { client_secret: "s" })).toBe(false);
    expect(hasDualChannelClientAuth("Bearer tok", { client_secret: "s" })).toBe(false);
  });

  it("is false for an empty body secret", () => {
    expect(hasDualChannelClientAuth(basic, { client_secret: "" })).toBe(false);
  });
});
