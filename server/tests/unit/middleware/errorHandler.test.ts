import { describe, it, expect, vi, beforeEach } from "vitest"
import { errorHandler, errorStatusFrom } from "../../../src/middleware/errorHandler"

const mockConfig = vi.hoisted(() => ({ nodeEnv: "development" }))

vi.mock("../../../src/config/app.config", () => ({
  server: mockConfig,
}))

vi.mock("../../../src/utils/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  baseLogger: {} as any,
}))

function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    path: "/api/test",
    accepts: () => false,
    logger: { error: vi.fn() },
    ...overrides,
  } as any
}

function mockRes() {
  const res: any = {}
  res.status = vi.fn(() => res)
  res.json = vi.fn(() => res)
  res.render = vi.fn(() => res)
  return res
}

beforeEach(() => {
  vi.clearAllMocks()
  mockConfig.nodeEnv = "development"
})

describe("errorHandler", () => {
  it("returns JSON for API routes", () => {
    const req = mockReq({ path: "/api/test" })
    const res = mockRes()
    const err = new Error("test error")

    errorHandler(err, req, res, () => {})

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Internal Server Error",
        message: "test error",
      })
    )
    expect(res.render).not.toHaveBeenCalled()
  })

  it("returns HTML for non-API routes with Accept header", () => {
    mockConfig.nodeEnv = "production"
    const req = mockReq({
      path: "/login",
      accepts: (type: string) => type === "html",
    })
    const res = mockRes()
    const err = new Error("page error")

    errorHandler(err, req, res, () => {})

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.render).toHaveBeenCalledWith("error", {
      title: "Error 500",
      message: "page error",
      status: 500,
      path: "/login",
      details: null,
    })
    expect(res.json).not.toHaveBeenCalled()
  })

  it("uses error.status if present", () => {
    const req = mockReq()
    const res = mockRes()
    const err = { status: 401, message: "Unauthorized" }

    errorHandler(err, req, res, () => {})

    expect(res.status).toHaveBeenCalledWith(401)
  })

  it("uses error.statusCode if status is absent", () => {
    const req = mockReq()
    const res = mockRes()
    const err = { statusCode: 403, message: "Forbidden" }

    errorHandler(err, req, res, () => {})

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it("falls back to 500 if no status on error", () => {
    const req = mockReq()
    const res = mockRes()
    const err = { message: "boom" }

    errorHandler(err, req, res, () => {})

    expect(res.status).toHaveBeenCalledWith(500)
  })

  // EH-W1. The Authlete SDK's AuthleteError subclasses carry the status of the response they were
  // *reading*, so a 200 whose body fails Zod validation arrives here as `statusCode: 200`. Emitting it
  // verbatim served every unparseable Authlete response as an HTTP success carrying an error body.
  it("clamps a 2xx statusCode to 500 — the SDK ResponseValidationError case", () => {
    const req = mockReq()
    const res = mockRes()
    const err = { statusCode: 200, message: "Response validation failed" }

    errorHandler(err, req, res, () => {})

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Internal Server Error" })
    )
  })

  it("clamps a 3xx status to 500", () => {
    const req = mockReq()
    const res = mockRes()

    errorHandler({ status: 302, message: "Found" }, req, res, () => {})

    expect(res.status).toHaveBeenCalledWith(500)
  })

  it("falls back to 500 for a non-numeric status", () => {
    const req = mockReq()
    const res = mockRes()

    errorHandler({ status: "teapot", message: "nope" }, req, res, () => {})

    expect(res.status).toHaveBeenCalledWith(500)
  })

  it("prefers a usable statusCode when status is out of range", () => {
    const req = mockReq()
    const res = mockRes()

    errorHandler({ status: 200, statusCode: 404 }, req, res, () => {})

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it("keeps an AppError status verbatim", async () => {
    const { AppError } = await import("../../../src/utils/app-error")
    const req = mockReq()
    const res = mockRes()

    errorHandler(new AppError("Missing parameter", 400), req, res, () => {})

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("includes stack trace in development", () => {
    const req = mockReq()
    const res = mockRes()
    const err = new Error("dev error")

    errorHandler(err, req, res, () => {})

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ stack: expect.any(String) })
    )
  })

  it("excludes stack trace in production", () => {
    mockConfig.nodeEnv = "production"
    const req = mockReq()
    const res = mockRes()
    const err = new Error("prod error")

    errorHandler(err, req, res, () => {})

    expect(res.json).toHaveBeenCalledWith(
      expect.not.objectContaining({ stack: expect.any(String) })
    )
  })

  it("uses req.logger when available", () => {
    const loggerMock = { error: vi.fn() }
    const req = mockReq({ logger: loggerMock })
    const res = mockRes()
    const err = new Error("logged error")

    errorHandler(err, req, res, () => {})

    expect(loggerMock.error).toHaveBeenCalled()
  })
})

// T2-9 / EH-W5. `errorStatusFrom` is exported so no handler re-derives
// `err.status || err.statusCode || 500` locally — that fallback IS the defect the clamp removes, and it fails
// silently because the wrong status is itself the symptom. Asserted directly so the contract is pinned to the
// function rather than only to the middleware that happens to call it.
describe("errorStatusFrom (exported for reuse)", () => {
  it("trusts a 4xx/5xx supplied by the error", () => {
    expect(errorStatusFrom({ status: 400 })).toBe(400)
    expect(errorStatusFrom({ status: 401 })).toBe(401)
    expect(errorStatusFrom({ statusCode: 503 })).toBe(503)
    expect(errorStatusFrom({ status: 599 })).toBe(599)
  })

  it("prefers `status` over `statusCode`", () => {
    expect(errorStatusFrom({ status: 403, statusCode: 500 })).toBe(403)
  })

  // The case the whole clamp exists for: the SDK's ResponseValidationError carries the status of the
  // *successful* response it was reading, so a 200 body that fails Zod validation arrives as statusCode 200.
  it("refuses a 2xx — this is the defect it was written to stop", () => {
    expect(errorStatusFrom({ statusCode: 200 })).toBe(500)
    expect(errorStatusFrom({ status: 204 })).toBe(500)
  })

  it("refuses 3xx, non-integers and junk", () => {
    for (const err of [
      { status: 302 },
      { status: 399 },
      { status: 0 },
      { status: 600 },
      { status: 404.5 },
      { status: NaN },
      { status: "not a number" },
      { status: null },
      {},
      null,
      undefined,
      "a string",
      42,
    ]) {
      expect(errorStatusFrom(err), `${JSON.stringify(err)} should clamp to 500`).toBe(500)
    }
  })

  // A numeric string is what a header or query value would give you, and it is a usable status.
  it("accepts a numeric string inside the range", () => {
    expect(errorStatusFrom({ status: "404" })).toBe(404)
  })
})
