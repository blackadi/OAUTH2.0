import { describe, it, expect, vi, beforeEach } from "vitest"
import { BackchannelLogoutService } from "../../../src/services/backchannel-logout.service"
import { rpInitiatedLogoutService } from "../../../src/services/logout.service"

describe("rpInitiatedLogoutService", () => {
  let service: rpInitiatedLogoutService
  let mockBclService: BackchannelLogoutService

  beforeEach(() => {
    mockBclService = new BackchannelLogoutService({
      baseUrl: "https://authlete.example.com",
      serviceId: "svc-1",
      AccessToken: "tok-1",
    })
    vi.spyOn(mockBclService, "issueAndDeliverToAll").mockResolvedValue([])
    service = new rpInitiatedLogoutService(mockBclService)
  })

  it("destroys session and clears cookie on logout", async () => {
    const req = {
      session: {
        user: "admin",
        destroy: vi.fn((cb) => cb(null)),
      },
      query: {},
    } as any
    const res = {
      clearCookie: vi.fn(),
      render: vi.fn(),
    } as any

    await service.rpInitiatedLogout(req, res)

    expect(req.session.destroy).toHaveBeenCalled()
    expect(res.clearCookie).toHaveBeenCalledWith("connect.sid", { path: "/" })
    expect(res.render).toHaveBeenCalledWith("logout", expect.any(Object))
  })

  it("redirects to post_logout_redirect_uri when valid", async () => {
    const req = {
      session: {
        user: "admin",
        destroy: vi.fn((cb) => cb(null)),
      },
      query: { post_logout_redirect_uri: "http://localhost:3000/callback" },
    } as any
    const res = {
      clearCookie: vi.fn(),
      redirect: vi.fn(),
    } as any

    await service.rpInitiatedLogout(req, res)

    expect(res.redirect).toHaveBeenCalledWith("http://localhost:3000/callback")
  })

  it("fires backchannel logout when backchannel=true", async () => {
    const req = {
      session: {
        user: "admin",
        destroy: vi.fn((cb) => cb(null)),
      },
      query: { backchannel: "true" },
    } as any
    const res = {
      clearCookie: vi.fn(),
      render: vi.fn(),
    } as any

    await service.rpInitiatedLogout(req, res)

    expect(mockBclService.issueAndDeliverToAll).toHaveBeenCalledWith("admin")
  })
})
