import { describe, it, expect, vi, beforeEach } from "vitest"
import { HealthService } from "../../../src/services/health.service"

describe("HealthService", () => {
  let service: HealthService
  let mockConfig: { baseUrl: string }

  beforeEach(() => {
    mockConfig = { baseUrl: "https://authlete.example.com" }
    service = new HealthService(mockConfig)
  })

  it("returns healthy when Authlete responds ok", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("OK"),
    })
    vi.stubGlobal("fetch", mockFetch)

    const result = await service.checkAuthlete(false)

    expect(mockFetch).toHaveBeenCalledWith(
      "https://authlete.example.com/api/lifecycle/healthcheck",
      { headers: {} }
    )
    expect(result).toEqual({ healthy: true, statusCode: 200, body: "OK", extended: false })
  })

  it("returns unhealthy when Authlete errors", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve("Service Unavailable"),
    })
    vi.stubGlobal("fetch", mockFetch)

    const result = await service.checkAuthlete(false)

    expect(result).toEqual({ healthy: false, statusCode: 503, body: "Service Unavailable", extended: false })
  })

  it("passes extended=true when requested", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve("{}") })
    vi.stubGlobal("fetch", mockFetch)

    await service.checkAuthlete(true)

    expect(mockFetch).toHaveBeenCalledWith(
      "https://authlete.example.com/api/lifecycle/healthcheck?extended=true",
      { headers: {} }
    )
  })
})
