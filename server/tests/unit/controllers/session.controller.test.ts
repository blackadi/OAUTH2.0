import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextFunction, Request, Response } from "express"

import { createSessionController } from "../../../src/controllers/session.controller"

/**
 * What the RP is told when the end user **refuses**.
 *
 * Both refusal branches used to report a "you need to do something and try again" error rather than
 * "the user said no", so a conforming client would retry instead of stopping:
 *
 *   Cancel on the login screen   -> NOT_LOGGED_IN    -> login_required
 *   Deny on the consent screen   -> CONSENT_REQUIRED -> consent_required
 *
 * RFC 6749 §4.1.2.1 gives `access_denied` for *"The resource owner or authorization server denied the
 * request"*, and Authlete's `DENIED` is what produces it — measured against service 2147478188:
 * `[A060306] The end-user denied the authorization request.`
 *
 * `fapi2-security-profile-final-user-rejects-authentication` failed on this with 93 successes on
 * 2026-09-01. Neither branch had a unit test, which is how both values survived.
 *
 * **The near-miss these also guard.** `NOT_LOGGED_IN` and `CONSENT_REQUIRED` are *correct* in
 * `authorization.service.ts`'s `decideWithoutInteraction` — the `prompt=none` path, where the user
 * genuinely is not logged in and interaction is forbidden. Those are pinned separately in
 * `authorization.controller.test.ts`. The two paths must not be unified.
 */
const TICKET = "ticket-refusal"

function mockRes(): Response {
  const res: Partial<Response> = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.send = vi.fn().mockReturnValue(res)
  res.redirect = vi.fn().mockReturnValue(res)
  res.setHeader = vi.fn().mockReturnValue(res)
  res.render = vi.fn().mockReturnValue(res)
  return res as unknown as Response
}

function mockReq(body: Record<string, unknown>, session: Record<string, unknown>): Request {
  return {
    body,
    headers: {},
    ip: "127.0.0.1",
    session,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as unknown as Request
}

describe("SessionController — how a user's refusal is reported", () => {
  let fail: ReturnType<typeof vi.fn>
  let controller: ReturnType<typeof createSessionController>
  let next: NextFunction

  beforeEach(() => {
    // LOCATION + a redirect URI is the shape `sendAuthorizationFailResponse` expects.
    fail = vi.fn().mockResolvedValue({
      action: "LOCATION",
      responseContent: "https://rp.example.com/cb?error=access_denied",
    })
    controller = createSessionController(
      { validateUser: vi.fn() } as never,
      { fail } as never,
    )
    next = vi.fn() as unknown as NextFunction
  })

  it("sends DENIED when the user presses Cancel on the login screen", async () => {
    await controller.handleLogin(
      mockReq({ login: "cancel" }, {
        authorization: { authorizationIssueRequest: { ticket: TICKET } },
      }) as never,
      mockRes(),
      next,
    )

    expect(fail).toHaveBeenCalledWith(TICKET, "DENIED")
  })

  it("sends DENIED when the user presses Deny on the consent screen", async () => {
    await controller.handleConsent(
      mockReq({ decision: "deny" }, {
        user: "subject-1",
        authorization: { authorizationIssueRequest: { ticket: TICKET } },
      }) as never,
      mockRes(),
      next,
    )

    expect(fail).toHaveBeenCalledWith(TICKET, "DENIED")
  })

  // The specific wrong answers, named so a revert is loud rather than silent.
  it("never reports a refusal as login_required or consent_required", async () => {
    await controller.handleLogin(
      mockReq({ login: "cancel" }, {
        authorization: { authorizationIssueRequest: { ticket: TICKET } },
      }) as never,
      mockRes(),
      next,
    )
    await controller.handleConsent(
      mockReq({ decision: "deny" }, {
        user: "subject-1",
        authorization: { authorizationIssueRequest: { ticket: TICKET } },
      }) as never,
      mockRes(),
      next,
    )

    const reasons = fail.mock.calls.map((c) => c[1])
    expect(reasons).toEqual(["DENIED", "DENIED"])
    expect(reasons).not.toContain("NOT_LOGGED_IN")
    expect(reasons).not.toContain("CONSENT_REQUIRED")
    // Not the CIBA fail API's value: this API treats ACCESS_DENIED as a missing `reason` and
    // answers server_error — measured, [A060201].
    expect(reasons).not.toContain("ACCESS_DENIED")
  })

  it("does not call fail at all when the user approves", async () => {
    await controller.handleLogin(
      mockReq({ login: "submit", username: "admin", password: "wrong" }, {
        authorization: { authorizationIssueRequest: { ticket: TICKET } },
      }) as never,
      mockRes(),
      next,
    )

    expect(fail).not.toHaveBeenCalled()
  })
})
