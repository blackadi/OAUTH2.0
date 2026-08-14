import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextFunction, Request, Response } from "express"

/**
 * `localSignedToken.handleLocalSignedToken` — the dev-only RFC 9068 fixture endpoint.
 *
 * The service is mocked, so nothing is signed here and no `JWT_PRIVATE_KEY_PEM` is needed. What this file
 * asserts is the half a signing test cannot see: **which query parameters reach `localSignedToken`, and in
 * what form.** That is where 9068-W2 found two defects — `client_id` was never collected at all, and `acr`
 * and `authTime` were advertised in `openapi.routes.ts` while the controller dropped them.
 *
 * The token's own shape (`typ: at+jwt`, the seven §2.2 claims, a distinct `jti`) is asserted against a real
 * key in `tests/unit/utils/createLocalJWT.test.ts`. The two gates in front of this handler — the
 * `NODE_ENV` 404 and admin Basic auth, in that order — are asserted at the route in
 * `tests/integration/admin-surfaces.routes.test.ts`.
 */

const mocks = vi.hoisted(() => ({
  mockLocalSignedToken: vi.fn(),
  nodeEnv: "development",
}))

vi.mock("../../../src/services/token.operations.service", () => ({
  TokenManagementService: function () {
    return { localSignedToken: mocks.mockLocalSignedToken }
  },
}))

vi.mock("../../../src/config/app.config", () => ({
  get server() {
    return { nodeEnv: mocks.nodeEnv }
  },
  appConfig: {},
}))

vi.mock("../../../src/config/authlete.config", () => ({
  jwt: { issuer: "https://env-issuer.example.com", privateKey: "", publicKey: "" },
  authleteConfig: { baseUrl: "https://authlete.example.com", serviceId: "svc", AccessToken: "tok" },
}))

vi.mock("../../../src/middleware/require-basic-auth", () => ({
  // `requireBasicAuth(realm)` returns the checker the handler calls. Stubbed to pass, because the gate
  // itself is a route-level concern — asserted in tests/integration/admin-surfaces.routes.test.ts, which
  // is the only place that can see it runs *after* the NODE_ENV 404.
  requireBasicAuth: () => () => true,
}))

import { localSignedToken } from "../../../src/controllers/token.management.controller"

function mockReq(query: Record<string, unknown>): Request {
  return {
    query,
    headers: { authorization: `Basic ${Buffer.from("id:secret").toString("base64")}` },
    logger: Object.assign(vi.fn(), { error: vi.fn() }),
  } as unknown as Request
}

function mockRes(): Response {
  const res: Partial<Response> = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.send = vi.fn().mockReturnValue(res)
  res.setHeader = vi.fn().mockReturnValue(res)
  return res as unknown as Response
}

const next = () => vi.fn() as unknown as NextFunction

/** The positional/options pair the handler passed to the service. */
function sentArgs() {
  return mocks.mockLocalSignedToken.mock.calls[0]
}

const FULL = { iss: "i", sub: "s", aud: "a b", client_id: "c-1" }

describe("localSignedToken.handleLocalSignedToken (9068-W2)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.nodeEnv = "development"
    mocks.mockLocalSignedToken.mockReturnValue({ token: "signed.jwt.here", publicKey: "pub" })
  })

  it("forwards iss, sub, the split aud array and client_id", async () => {
    const res = mockRes()
    await localSignedToken.handleLocalSignedToken(mockReq(FULL), res, next())

    const [iss, sub, aud, clientId] = sentArgs()
    expect(iss).toBe("i")
    expect(sub).toBe("s")
    expect(aud).toEqual(["a", "b"])
    expect(clientId).toBe("c-1")
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it("falls back to the configured issuer when iss is omitted", async () => {
    await localSignedToken.handleLocalSignedToken(
      mockReq({ sub: "s", aud: "a", client_id: "c-1" }),
      mockRes(),
      next()
    )

    expect(sentArgs()[0]).toBe("https://env-issuer.example.com")
  })

  // The defect: `client_id` was not collected, so the fixture could never satisfy §2.2's REQUIRED set.
  it("refuses a request with no client_id, and does not call the service", async () => {
    const res = mockRes()
    await localSignedToken.handleLocalSignedToken(
      mockReq({ iss: "i", sub: "s", aud: "a" }),
      res,
      next()
    )

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "invalid_request",
        error_description: expect.stringContaining("client_id"),
      })
    )
    expect(mocks.mockLocalSignedToken).not.toHaveBeenCalled()
  })

  it("still refuses a request missing sub or aud", async () => {
    for (const query of [
      { iss: "i", aud: "a", client_id: "c" },
      { iss: "i", sub: "s", client_id: "c" },
    ]) {
      vi.clearAllMocks()
      const res = mockRes()
      await localSignedToken.handleLocalSignedToken(mockReq(query), res, next())

      expect(res.status).toHaveBeenCalledWith(400)
      expect(mocks.mockLocalSignedToken).not.toHaveBeenCalled()
    }
  })

  describe("scope (§2.2.3, a SHOULD)", () => {
    it("forwards it when supplied", async () => {
      await localSignedToken.handleLocalSignedToken(
        mockReq({ ...FULL, scope: "openid profile" }),
        mockRes(),
        next()
      )

      expect(sentArgs()[4]).toMatchObject({ scope: "openid profile" })
    })

    it("passes undefined when absent, so no empty claim is emitted", async () => {
      await localSignedToken.handleLocalSignedToken(mockReq(FULL), mockRes(), next())

      expect(sentArgs()[4].scope).toBeUndefined()
    })
  })

  // `acr` and `authTime` were documented as query parameters of this endpoint and reached nothing:
  // `localSignedToken` took three arguments and dropped them before `createLocalJWT` could see them.
  describe("acr and authTime — advertised in openapi.routes.ts, previously dropped here", () => {
    it("forwards both", async () => {
      await localSignedToken.handleLocalSignedToken(
        mockReq({ ...FULL, acr: "pwd", authTime: "1700000000" }),
        mockRes(),
        next()
      )

      expect(sentArgs()[4]).toMatchObject({ acr: "pwd", authTime: 1700000000 })
    })

    it("passes no authTime when absent", async () => {
      await localSignedToken.handleLocalSignedToken(mockReq(FULL), mockRes(), next())

      expect(sentArgs()[4].authTime).toBeUndefined()
    })

    // An unparseable value must yield nothing rather than a number. `Number("")` is 0, which is finite and
    // would stamp `auth_time` as the Unix epoch — a fabricated authentication time, which is exactly what
    // 9470-W3 removed from the `prompt=none` path. A resource server enforces `max_age` against this claim.
    it.each(["", "   ", "not-a-number", "-1", "0", "1.5", "1e3000"])(
      "yields no authTime for %o rather than inventing one",
      async (authTime) => {
        vi.clearAllMocks()
        mocks.mockLocalSignedToken.mockReturnValue({ token: "t", publicKey: "p" })

        await localSignedToken.handleLocalSignedToken(
          mockReq({ ...FULL, authTime }),
          mockRes(),
          next()
        )

        expect(sentArgs()[4].authTime).toBeUndefined()
      }
    )
  })

  it("keeps the production 404 ahead of everything else", async () => {
    mocks.nodeEnv = "production"
    const res = mockRes()

    await localSignedToken.handleLocalSignedToken(mockReq(FULL), res, next())

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({ error: "not_found" })
    expect(mocks.mockLocalSignedToken).not.toHaveBeenCalled()
  })
})
