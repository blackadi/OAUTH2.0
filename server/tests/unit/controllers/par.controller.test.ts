import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextFunction, Request, Response } from "express"

import { createParControllers } from "../../../src/controllers/par.controller"

/**
 * 9126-W1's controller half. `validateOrThrow(parSchema, req.body)` ran unconditionally, and `parSchema`
 * requires a `parameters` field — so a conformant RFC 9126 §2.1 request, which has no envelope and
 * carries its parameters *as* the body, was rejected with `400 Missing required field: parameters`
 * before the service was ever called. Three OpenID Foundation conformance runs died there on
 * 2026-09-01, each after 27–46 passing configuration checks and before a single OAuth request.
 *
 * These cases pin the gate itself: the form shape gets through, the JSON envelope's contract is
 * unchanged. The service's own handling of the two shapes is in
 * tests/unit/services/par.service.test.ts.
 */
function mockRes(): Response {
  const res: Partial<Response> = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.send = vi.fn().mockReturnValue(res)
  res.setHeader = vi.fn().mockReturnValue(res)
  return res as unknown as Response
}

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    headers: {},
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  } as unknown as Request
}

describe("ParController — envelope validation gate (9126-W1)", () => {
  let process: ReturnType<typeof vi.fn>
  let controller: ReturnType<typeof createParControllers>
  let next: NextFunction

  beforeEach(() => {
    process = vi.fn().mockResolvedValue({ action: "CREATED", responseContent: "{}" })
    controller = createParControllers({ process } as never)
    next = vi.fn() as unknown as NextFunction
  })

  it("lets a form-encoded request reach the service", async () => {
    const rawBody = "client_id=1241400020&request=eyJhbGciOiJFUzI1NiJ9.e30.sig"
    const res = mockRes()

    await controller.handle(mockReq({ rawBody } as Partial<Request>), res, next)

    expect(process).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalledWith(400)
  })

  it("still rejects a JSON body with no `parameters`", async () => {
    const res = mockRes()

    await controller.handle(mockReq({ body: { clientId: "c-1" } }), res, next)

    expect(process).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "invalid_request" }),
    )
  })

  it("accepts the JSON envelope unchanged", async () => {
    const res = mockRes()

    await controller.handle(
      mockReq({ body: { parameters: "response_type=code&client_id=c-1" } }),
      res,
      next,
    )

    expect(process).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalledWith(400)
  })

  // RFC 6749 §2.3.1 is enforced ahead of the Authlete call, and must stay enforced on the form path —
  // that is the shape where body credentials reach Authlete verbatim inside `parameters`.
  it("refuses dual-channel credentials on the form path", async () => {
    const res = mockRes()
    const authorization = `Basic ${Buffer.from("c-1:s-1").toString("base64")}`

    await controller.handle(
      mockReq({
        rawBody: "client_id=c-1&client_secret=other-secret",
        body: { client_id: "c-1", client_secret: "other-secret" },
        headers: { authorization },
      } as Partial<Request>),
      res,
      next,
    )

    expect(process).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
  })
})
