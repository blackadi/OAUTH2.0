import { describe, it, expect, vi, beforeEach } from "vitest"
import { Authlete } from "@authlete/typescript-sdk"
import { AuthleteError } from "@authlete/typescript-sdk/models/errors"
import { HealthService } from "../../../src/services/health.service"

// Builds a real AuthleteError the way the SDK does, so statusCode/body are derived
// from an actual Response rather than hand-set on a stub.
function authleteError(status: number, body: string) {
  return new AuthleteError(`HTTP ${status}`, {
    response: new Response(body, { status }),
    request: new Request("https://authlete.example.com/api/lifecycle/healthcheck"),
    body,
  })
}

describe("HealthService", () => {
  let healthcheck: ReturnType<typeof vi.fn>
  let service: HealthService

  beforeEach(() => {
    healthcheck = vi.fn()
    service = new HealthService({
      lifecycle: { getApiLifecycleHealthcheck: healthcheck },
    } as unknown as Authlete)
  })

  it("returns healthy when Authlete responds 200", async () => {
    healthcheck.mockResolvedValue("OK")

    const result = await service.checkAuthlete(false)

    expect(result).toEqual({ healthy: true, statusCode: 200, body: "OK", extended: false })
  })

  it("omits the extended argument entirely when not requested", async () => {
    healthcheck.mockResolvedValue("OK")

    await service.checkAuthlete(false)

    expect(healthcheck).toHaveBeenCalledWith(undefined)
  })

  it("passes extended=true when requested", async () => {
    healthcheck.mockResolvedValue("{}")

    const result = await service.checkAuthlete(true)

    expect(healthcheck).toHaveBeenCalledWith({ extended: true })
    expect(result.extended).toBe(true)
  })

  it("reports status and body from an HTTP error rather than a bare message", async () => {
    healthcheck.mockRejectedValue(authleteError(503, "Service Unavailable"))

    const result = await service.checkAuthlete(false)

    expect(result).toEqual({
      healthy: false,
      statusCode: 503,
      body: "Service Unavailable",
      extended: false,
    })
  })

  it("preserves the extended flag on the error path", async () => {
    healthcheck.mockRejectedValue(authleteError(500, "boom"))

    const result = await service.checkAuthlete(true)

    expect(result).toEqual({
      healthy: false,
      statusCode: 500,
      body: "boom",
      extended: true,
    })
  })

  it("returns an error with no statusCode when the transport fails", async () => {
    healthcheck.mockRejectedValue(new Error("connection refused"))

    const result = await service.checkAuthlete(false)

    expect(result).toEqual({
      healthy: false,
      error: "connection refused",
      extended: false,
    })
    expect(result.statusCode).toBeUndefined()
  })

  it("stringifies a non-Error rejection", async () => {
    healthcheck.mockRejectedValue("kaboom")

    const result = await service.checkAuthlete(false)

    expect(result).toEqual({ healthy: false, error: "kaboom", extended: false })
  })

  it("omits an empty body rather than reporting an empty string", async () => {
    healthcheck.mockResolvedValue("")

    const result = await service.checkAuthlete(false)

    expect(result).toEqual({ healthy: true, statusCode: 200, body: undefined, extended: false })
  })
})
