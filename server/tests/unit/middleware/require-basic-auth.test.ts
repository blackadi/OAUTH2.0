import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import logger from "../../../src/utils/logger";
import {
  requireBasicAuth,
  managementCredentialsConfigured,
  warnIfManagementCredentialsMissing,
} from "../../../src/middleware/require-basic-auth";

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    method: "GET",
    originalUrl: "/api/client/list",
    logger: Object.assign(vi.fn(), { error: vi.fn(), warn: vi.fn(), child: vi.fn() }),
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  return res as unknown as Response;
}

/** Basic base64 for `id:secret`. */
const basic = (id: string, secret: string) =>
  `Basic ${Buffer.from(`${id}:${secret}`, "utf8").toString("base64")}`;

describe("requireBasicAuth", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe("fails closed when management credentials are absent", () => {
    it("denies when both env vars are unset", () => {
      vi.stubEnv("MGMT_CLIENT_ID", "");
      vi.stubEnv("MGMT_CLIENT_SECRET", "");
      const req = mockReq({ headers: { authorization: basic("admin", "secret") } } as Partial<Request>);
      const res = mockRes();

      expect(requireBasicAuth("client_management")(req, res)).toBe(false);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "invalid_client",
        error_description: "Client authentication required",
      });
      expect(res.setHeader).toHaveBeenCalledWith("WWW-Authenticate", 'Basic realm="client_management"');
    });

    it("denies when only the client id is set", () => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin");
      vi.stubEnv("MGMT_CLIENT_SECRET", "");
      expect(requireBasicAuth("hsk")(mockReq(), mockRes())).toBe(false);
    });

    it("denies when only the secret is set", () => {
      vi.stubEnv("MGMT_CLIENT_ID", "");
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret");
      expect(requireBasicAuth("hsk")(mockReq(), mockRes())).toBe(false);
    });

    it("is indistinguishable from a request that simply omitted credentials", () => {
      // An anonymous caller must not be able to tell "server misconfigured" from "you sent nothing".
      vi.stubEnv("MGMT_CLIENT_ID", "");
      vi.stubEnv("MGMT_CLIENT_SECRET", "");
      const unsetRes = mockRes();
      requireBasicAuth("dcr")(mockReq(), unsetRes);

      vi.stubEnv("MGMT_CLIENT_ID", "admin");
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret");
      const noHeaderRes = mockRes();
      requireBasicAuth("dcr")(mockReq(), noHeaderRes);

      expect(vi.mocked(unsetRes.json).mock.calls[0]).toEqual(vi.mocked(noHeaderRes.json).mock.calls[0]);
      expect(vi.mocked(unsetRes.setHeader).mock.calls[0]).toEqual(
        vi.mocked(noHeaderRes.setHeader).mock.calls[0]
      );
    });
  });

  describe("with credentials configured", () => {
    beforeEach(() => {
      vi.stubEnv("MGMT_CLIENT_ID", "admin");
      vi.stubEnv("MGMT_CLIENT_SECRET", "secret");
    });

    it("accepts correct credentials without writing a response", () => {
      const req = mockReq({ headers: { authorization: basic("admin", "secret") } } as Partial<Request>);
      const res = mockRes();
      expect(requireBasicAuth("client_management")(req, res)).toBe(true);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it("denies a non-Basic scheme", () => {
      const req = mockReq({ headers: { authorization: "Bearer sometoken" } } as Partial<Request>);
      expect(requireBasicAuth("client_management")(req, mockRes())).toBe(false);
    });

    it("denies a payload with no colon", () => {
      const req = mockReq({
        headers: { authorization: `Basic ${Buffer.from("adminsecret").toString("base64")}` },
      } as Partial<Request>);
      expect(requireBasicAuth("client_management")(req, mockRes())).toBe(false);
    });

    it("denies a wrong client id", () => {
      const req = mockReq({ headers: { authorization: basic("root", "secret") } } as Partial<Request>);
      const res = mockRes();
      expect(requireBasicAuth("client_management")(req, res)).toBe(false);
      expect(res.json).toHaveBeenCalledWith({
        error: "invalid_client",
        error_description: "Invalid client credentials",
      });
    });

    it("denies a wrong secret of the same length", () => {
      const req = mockReq({ headers: { authorization: basic("admin", "secreT") } } as Partial<Request>);
      expect(requireBasicAuth("client_management")(req, mockRes())).toBe(false);
    });

    it("denies a secret that is a prefix of the real one", () => {
      const req = mockReq({ headers: { authorization: basic("admin", "sec") } } as Partial<Request>);
      expect(requireBasicAuth("client_management")(req, mockRes())).toBe(false);
    });
  });

  it("accepts a secret containing colons", () => {
    // Regression: the previous implementation used split(":") and silently truncated at the first colon,
    // so "pa:ss:word" was compared as "pa" — and any secret sharing that prefix would have been accepted.
    vi.stubEnv("MGMT_CLIENT_ID", "admin");
    vi.stubEnv("MGMT_CLIENT_SECRET", "pa:ss:word");
    const req = mockReq({ headers: { authorization: basic("admin", "pa:ss:word") } } as Partial<Request>);
    const res = mockRes();
    expect(requireBasicAuth("client_management")(req, res)).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects the truncated prefix of a colon-containing secret", () => {
    vi.stubEnv("MGMT_CLIENT_ID", "admin");
    vi.stubEnv("MGMT_CLIENT_SECRET", "pa:ss:word");
    const req = mockReq({ headers: { authorization: basic("admin", "pa") } } as Partial<Request>);
    expect(requireBasicAuth("client_management")(req, mockRes())).toBe(false);
  });
});

describe("management credential helpers", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("managementCredentialsConfigured reflects the environment", () => {
    vi.stubEnv("MGMT_CLIENT_ID", "");
    vi.stubEnv("MGMT_CLIENT_SECRET", "");
    expect(managementCredentialsConfigured()).toBe(false);

    vi.stubEnv("MGMT_CLIENT_ID", "admin");
    vi.stubEnv("MGMT_CLIENT_SECRET", "secret");
    expect(managementCredentialsConfigured()).toBe(true);
  });

  it("warns exactly once when credentials are missing", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined as never);
    vi.stubEnv("MGMT_CLIENT_ID", "");
    vi.stubEnv("MGMT_CLIENT_SECRET", "");
    warnIfManagementCredentialsMissing();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("MGMT_CLIENT_ID");
  });

  it("stays silent when credentials are present", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined as never);
    vi.stubEnv("MGMT_CLIENT_ID", "admin");
    vi.stubEnv("MGMT_CLIENT_SECRET", "secret");
    warnIfManagementCredentialsMissing();
    expect(warn).not.toHaveBeenCalled();
  });
});
