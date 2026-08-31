import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { Authlete } from "@authlete/typescript-sdk";
import { createMockAuthlete } from "../../helpers/mock-authlete";
import { requireGrantOwnership } from "../../../src/middleware/require-grant-ownership";

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    params: { grantId: "grant-alice" },
    headers: { authorization: "Bearer tok-1" },
    method: "GET",
    protocol: "https",
    originalUrl: "/api/gm/grant-alice",
    get: vi.fn().mockReturnValue("as.example.com"),
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), child: vi.fn() },
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  return res as unknown as Response;
}

describe("requireGrantOwnership", () => {
  let mockApi: Authlete;
  let next: NextFunction;

  const mw = (scope: "grant_management_query" | "grant_management_revoke" = "grant_management_query") =>
    requireGrantOwnership(scope, { authleteApi: mockApi, serviceId: "test-service" });

  beforeEach(() => {
    mockApi = createMockAuthlete() as unknown as Authlete;
    next = vi.fn() as unknown as NextFunction;
  });

  it("passes the request through when the token is bound to the requested grant", async () => {
    vi.mocked(mockApi.introspection.process).mockResolvedValue({
      action: "OK",
      grantId: "grant-alice",
      subject: "alice",
    } as never);
    const res = mockRes();

    await mw()(mockReq(), res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("denies a token bound to a DIFFERENT grant — the cross-user BOLA", async () => {
    // Verified live before this fix: bob's token could read and delete alice's grant.
    vi.mocked(mockApi.introspection.process).mockResolvedValue({
      action: "OK",
      grantId: "grant-bob",
      subject: "bob",
    } as never);
    const res = mockRes();

    await mw()(mockReq({ params: { grantId: "grant-alice" } } as Partial<Request>), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "access_denied",
      error_description: "The access token is not associated with the requested grant",
    });
  });

  it("denies a token with no grant at all (client credentials), indistinguishably", async () => {
    vi.mocked(mockApi.introspection.process).mockResolvedValue({ action: "OK" } as never);
    const res = mockRes();

    await mw()(mockReq(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    // Same body as the mismatch case: the caller cannot tell the two apart.
    expect(res.json).toHaveBeenCalledWith({
      error: "access_denied",
      error_description: "The access token is not associated with the requested grant",
    });
  });

  it("returns 401 with NO error code when no token is presented (RFC 6750 §3.1)", async () => {
    const res = mockRes();
    await mw()(mockReq({ headers: {} } as Partial<Request>), res, next);

    expect(mockApi.introspection.process).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    // §3.1: "the resource server SHOULD NOT include an error code or other error information."
    expect(res.json).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalled();
    // Both schemes advertised — RFC 9449 §7.2. A client holding a bound token must be told
    // DPoP is available, or it cannot present that token at all.
    expect(res.setHeader).toHaveBeenCalledWith("WWW-Authenticate", "Bearer, DPoP");
  });

  it("returns 401 for a whitespace-only bearer value", async () => {
    const res = mockRes();
    await mw()(mockReq({ headers: { authorization: "Bearer    " } } as Partial<Request>), res, next);
    expect(mockApi.introspection.process).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects the DPoP scheme with no proof — 401 invalid_dpop_proof (RFC 9449 §7.1)", async () => {
    const res = mockRes();
    await mw()(mockReq({ headers: { authorization: "DPoP tok-1" } } as Partial<Request>), res, next);

    expect(mockApi.introspection.process).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "invalid_dpop_proof" }),
    );
    // Only DPoP is offered back: Bearer cannot carry the proof this presentation needs.
    expect(res.setHeader).toHaveBeenCalledWith(
      "WWW-Authenticate",
      expect.stringMatching(/^DPoP error="invalid_dpop_proof"/),
    );
  });

  it("rejects Bearer + a DPoP proof — 400, the §7.2 downgrade", async () => {
    const res = mockRes();
    await mw()(
      mockReq({ headers: { authorization: "Bearer tok-1", dpop: "proof-jwt" } } as Partial<Request>),
      res,
      next,
    );

    // Accepting this would make Bearer a working route for a DPoP-bound token.
    expect(mockApi.introspection.process).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "invalid_request" }),
    );
  });

  it("matches the auth-scheme case-insensitively (RFC 9110 §11.1)", async () => {
    vi.mocked(mockApi.introspection.process).mockResolvedValue({
      action: "OK",
      grantId: "grant-alice",
    } as never);

    await mw()(
      mockReq({ headers: { authorization: "bEaReR tok-1" } } as Partial<Request>),
      mockRes(),
      next,
    );

    expect(next).toHaveBeenCalledWith();
  });

  it("returns 400 when grantId is missing from the path", async () => {
    const res = mockRes();
    await mw()(mockReq({ params: {} } as Partial<Request>), res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("maps UNAUTHORIZED to 401 and echoes the challenge", async () => {
    vi.mocked(mockApi.introspection.process).mockResolvedValue({
      action: "UNAUTHORIZED",
      responseContent: 'Bearer error="invalid_token"',
    } as never);
    const res = mockRes();

    await mw()(mockReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.setHeader).toHaveBeenCalledWith("WWW-Authenticate", 'Bearer error="invalid_token"');
    expect(next).not.toHaveBeenCalled();
  });

  it("maps FORBIDDEN (insufficient scope) to 403 and echoes the challenge", async () => {
    vi.mocked(mockApi.introspection.process).mockResolvedValue({
      action: "FORBIDDEN",
      responseContent: 'Bearer error="insufficient_scope"',
    } as never);
    const res = mockRes();

    await mw()(mockReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.setHeader).toHaveBeenCalledWith("WWW-Authenticate", 'Bearer error="insufficient_scope"');
  });

  it("maps BAD_REQUEST to 400", async () => {
    vi.mocked(mockApi.introspection.process).mockResolvedValue({ action: "BAD_REQUEST" } as never);
    const res = mockRes();
    await mw()(mockReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("maps INTERNAL_SERVER_ERROR to 500", async () => {
    vi.mocked(mockApi.introspection.process).mockResolvedValue({
      action: "INTERNAL_SERVER_ERROR",
    } as never);
    const res = mockRes();
    await mw()(mockReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  it("fails closed on an unusable (undefined) introspection response", async () => {
    vi.mocked(mockApi.introspection.process).mockResolvedValue(undefined as never);
    const res = mockRes();
    await mw()(mockReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  it("fails closed to the error handler when introspection throws", async () => {
    vi.mocked(mockApi.introspection.process).mockRejectedValue(new Error("network down"));
    const res = mockRes();

    await mw()(mockReq(), res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.status).not.toHaveBeenCalled();
  });

  it("asks Authlete to enforce the required scope", async () => {
    vi.mocked(mockApi.introspection.process).mockResolvedValue({
      action: "OK",
      grantId: "grant-alice",
    } as never);

    await mw("grant_management_revoke")(mockReq(), mockRes(), next);

    expect(mockApi.introspection.process).toHaveBeenCalledWith({
      serviceId: "test-service",
      introspectionRequest: { token: "tok-1", scopes: ["grant_management_revoke"] },
    });
  });

  it("forwards a DPoP proof presented with the DPoP scheme", async () => {
    vi.mocked(mockApi.introspection.process).mockResolvedValue({
      action: "OK",
      grantId: "grant-alice",
    } as never);
    const req = mockReq({
      headers: { authorization: "DPoP tok-1", dpop: "proof-jwt" },
    } as Partial<Request>);

    await mw()(req, mockRes(), next);

    expect(mockApi.introspection.process).toHaveBeenCalledWith({
      serviceId: "test-service",
      introspectionRequest: expect.objectContaining({
        dpop: "proof-jwt",
        htm: "GET",
        htu: "https://as.example.com/api/gm/grant-alice",
      }),
    });
  });

  it("excludes the query string from htu (RFC 9449 §4.2)", async () => {
    vi.mocked(mockApi.introspection.process).mockResolvedValue({
      action: "OK",
      grantId: "grant-alice",
    } as never);
    const req = mockReq({
      headers: { authorization: "DPoP tok-1", dpop: "proof-jwt" },
      originalUrl: "/api/gm/grant-alice?verbose=true",
    } as Partial<Request>);

    await mw()(req, mockRes(), next);

    // Sending the query string here fails proof validation for a client that is entirely correct.
    const sent = vi.mocked(mockApi.introspection.process).mock.calls[0][0] as {
      introspectionRequest: { htu: string };
    };
    expect(sent.introspectionRequest.htu).toBe("https://as.example.com/api/gm/grant-alice");
  });

  it("relays a DPoP nonce from the introspection response", async () => {
    vi.mocked(mockApi.introspection.process).mockResolvedValue({
      action: "OK",
      grantId: "grant-alice",
      dpopNonce: "nonce-1",
    } as never);
    const res = mockRes();

    await mw()(mockReq(), res, next);

    expect(res.setHeader).toHaveBeenCalledWith("DPoP-Nonce", "nonce-1");
  });
});
