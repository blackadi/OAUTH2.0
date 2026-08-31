import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Request, Response } from "express"

const mockProcess = vi.hoisted(() => vi.fn())
vi.mock("../../../src/services/jar.service", () => ({
  JarService: class {
    process = mockProcess
  },
}))

import { jarController } from "../../../src/controllers/jar.controller"

function mockReq(overrides: Record<string, unknown> = {}): Request {
  const basic = `Basic ${Buffer.from("test-admin:test-secret").toString("base64")}`
  return {
    body: { request: "eyJhbGciOiJFUzI1NiJ9.e30.sig", clientId: "c-1" },
    headers: { authorization: basic },
    logger: { info: vi.fn(), error: vi.fn() },
    ...overrides,
  } as unknown as Request
}

function mockRes(): Response {
  const res: Partial<Response> = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.setHeader = vi.fn().mockReturnValue(res)
  return res as unknown as Response
}

/** The whole Authlete authorization response, as `/auth/authorization` really returns it. */
const fullAuthleteResponse = {
  action: "INTERACTION",
  resultCode: "A004001",
  resultMessage: "[A004001] Authlete has successfully issued a ticket…",
  responseContent: null,
  scopes: [{ name: "openid" }],
  ticket: "SECRET-TICKET-VALUE",
  service: { serviceName: "demo", apiKey: 3693555522 },
  client: { clientId: 1523514379, clientSecret: "SECRET" },
}

describe("jarController.process", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("MGMT_CLIENT_ID", "test-admin")
    vi.stubEnv("MGMT_CLIENT_SECRET", "test-secret")
  })
  afterEach(() => vi.unstubAllEnvs())

  describe("authentication (B1-W2)", () => {
    it("rejects an unauthenticated caller WITHOUT calling Authlete", async () => {
      // The gate must run first: the response carries a ticket, which is a credential.
      const res = mockRes()
      await jarController.process(mockReq({ headers: {} }), res)

      expect(mockProcess).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.setHeader).toHaveBeenCalledWith("WWW-Authenticate", 'Basic realm="jar"')
    })

    it("fails closed when management credentials are unset", async () => {
      vi.unstubAllEnvs()
      const res = mockRes()
      await jarController.process(mockReq(), res)

      expect(mockProcess).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(401)
    })
  })

  describe("response allowlist (B1-W1)", () => {
    it("never returns the ticket, service or client", async () => {
      mockProcess.mockResolvedValue(fullAuthleteResponse)
      const res = mockRes()

      await jarController.process(mockReq(), res)

      const body = vi.mocked(res.json).mock.calls[0][0] as Record<string, unknown>
      expect(body).not.toHaveProperty("ticket")
      expect(body).not.toHaveProperty("service")
      expect(body).not.toHaveProperty("client")
      expect(JSON.stringify(body)).not.toContain("SECRET")
    })

    it("keeps the fields the endpoint exists for", async () => {
      // `resultMessage` and `scopes` are the pedagogical payload — why a request object was refused,
      // and what the signed object asked for. Module 05's lab reads exactly these.
      mockProcess.mockResolvedValue(fullAuthleteResponse)
      const res = mockRes()

      await jarController.process(mockReq(), res)

      expect(res.json).toHaveBeenCalledWith({
        action: "INTERACTION",
        resultCode: "A004001",
        resultMessage: "[A004001] Authlete has successfully issued a ticket…",
        // Kept deliberately even when null: on a debugging endpoint, "Authlete returned no content"
        // is a fact worth seeing. It is exactly what made T1-7's NO_INTERACTION branch mislead.
        responseContent: null,
        scopes: [{ name: "openid" }],
      })
    })

    it("drops an unknown field rather than passing it through", async () => {
      // Allowlist, not denylist: the next field the SDK adds must not leak by default.
      mockProcess.mockResolvedValue({ action: "INTERACTION", somethingNew: "leak-me" })
      const res = mockRes()

      await jarController.process(mockReq(), res)

      expect(res.json).toHaveBeenCalledWith({ action: "INTERACTION" })
    })
  })

  describe("action to status (B1-W1)", () => {
    it.each([
      ["BAD_REQUEST", 400],
      ["INTERNAL_SERVER_ERROR", 500],
      ["INTERACTION", 200],
      ["NO_INTERACTION", 200],
      ["LOCATION", 200],
      ["FORM", 200],
    ])("maps %s to %i", async (action, status) => {
      mockProcess.mockResolvedValue({ action, resultMessage: "m" })
      const res = mockRes()

      await jarController.process(mockReq(), res)

      expect(res.status).toHaveBeenCalledWith(status)
    })
  })

  describe("local validation", () => {
    it.each(["request", "clientId"])("returns 400 when %s is missing", async (field) => {
      const body: Record<string, unknown> = { request: "jwt", clientId: "c-1" }
      delete body[field]
      const res = mockRes()

      await jarController.process(mockReq({ body }), res)

      expect(mockProcess).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(400)
    })
  })
})
