import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockAuthlete } from "../../helpers/mock-authlete"
import { AuthorizationService } from "../../../src/services/authorization.service"
import { Authlete } from "@authlete/typescript-sdk"

describe("AuthorizationService", () => {
  let mockApi: Authlete
  let service: AuthorizationService

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete
    service = new AuthorizationService(mockApi)
  })

  describe("process", () => {
    it("calls authorization.processRequest with the request parameters", async () => {
      const mockResponse = { action: "INTERACTION", clientId: "123", client: {} }
      vi.mocked(mockApi.authorization.processRequest).mockResolvedValue(mockResponse as any)

      const req = { method: "POST", body: { client_id: "123" }, headers: {} } as any
      const result = await service.process(req)

      expect(mockApi.authorization.processRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizationRequest: expect.objectContaining({
            parameters: expect.stringContaining("client_id=123"),
          }),
        })
      )
      expect(result).toEqual(mockResponse)
    })

    // 9101-W5. `reqBody` IS req.query/req.body, and it was mutated with a `parameters` key and passed
    // through as the whole AuthorizationRequest — so every client parameter was also offered to Authlete as
    // a top-level vendor field. Not exploitable (the request type has three members and no
    // `clientCertificate`), but `context` did survive, and jar.service.ts calling the same Authlete API
    // already built the request from named fields.
    describe("the Authlete request is built from named fields (9101-W5)", () => {
      beforeEach(() => {
        vi.mocked(mockApi.authorization.processRequest).mockResolvedValue({
          action: "INTERACTION",
        } as any)
      })

      const sentRequest = () =>
        (vi.mocked(mockApi.authorization.processRequest).mock.calls[0][0] as any)
          .authorizationRequest

      it("sends `parameters` and nothing else", async () => {
        const req = {
          method: "GET",
          query: { client_id: "123", response_type: "code", scope: "openid" },
          headers: {},
        } as any

        await service.process(req)

        expect(Object.keys(sentRequest())).toEqual(["parameters"])
      })

      // The one member that actually crossed the boundary. `context` is arbitrary text Authlete attaches to
      // the ticket; a client should not be choosing it.
      it("does not let a ?context= query parameter reach Authlete as `context`", async () => {
        const req = {
          method: "GET",
          query: { client_id: "123", context: "attacker-supplied" },
          headers: {},
        } as any

        await service.process(req)

        expect(sentRequest()).not.toHaveProperty("context")
        // It still belongs in the query string Authlete parses — dropping it there would change what the
        // client asked for. Only the vendor field is refused.
        expect(sentRequest().parameters).toContain("context=attacker-supplied")
      })

      it("does not let ?cimdOptions= reach Authlete either", async () => {
        const req = {
          method: "GET",
          query: { client_id: "123", cimdOptions: "anything" },
          headers: {},
        } as any

        await service.process(req)

        expect(sentRequest()).not.toHaveProperty("cimdOptions")
      })

      // A service that rewrites the Express request it was handed is a trap for the next reader, and the
      // controller reads req.query directly for `prompt` and `properties`.
      it("does not mutate req.query", async () => {
        const query: Record<string, unknown> = { client_id: "123" }
        const req = { method: "GET", query, headers: {} } as any

        await service.process(req)

        expect(query).toEqual({ client_id: "123" })
        expect(query).not.toHaveProperty("parameters")
      })

      it("does not mutate req.body on the POST path", async () => {
        const body: Record<string, unknown> = { client_id: "123" }
        const req = { method: "POST", body, headers: {} } as any

        await service.process(req)

        expect(body).not.toHaveProperty("parameters")
      })
    })
  })

  describe("fail", () => {
    it("calls authorization.fail with ticket and reason", async () => {
      const mockResponse = { action: "INTERNAL_SERVER_ERROR" }
      vi.mocked(mockApi.authorization.fail).mockResolvedValue(mockResponse as any)

      const result = await service.fail("ticket-1", "DENIED")

      expect(mockApi.authorization.fail).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizationFailRequest: { ticket: "ticket-1", reason: "DENIED" },
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe("issue", () => {
    it("calls authorization.issue with ticket from session", async () => {
      const mockResponse = { action: "LOCATION", authorizationCode: "abc123" }
      vi.mocked(mockApi.authorization.issue).mockResolvedValue(mockResponse as any)

      const req = {
        session: {
          user: "user-1",
          authorization: {
            authorizationIssueRequest: { ticket: "ticket-123", subject: "user-1" },
          },
        },
        headers: {},
      } as any
      const result = await service.issue(req)

      expect(mockApi.authorization.issue).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizationIssueRequest: expect.objectContaining({ ticket: "ticket-123" }),
        })
      )
      expect(result).toEqual(mockResponse)
    })

    it("throws when ticket is missing from session", async () => {
      const req = { session: { user: "user-1" }, headers: {} } as any
      await expect(service.issue(req)).rejects.toThrow("Missing ticket in session")
    })
  })
})
