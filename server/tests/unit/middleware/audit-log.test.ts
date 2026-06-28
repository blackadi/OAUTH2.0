import { describe, it, expect, vi, beforeEach } from "vitest";
import { auditMiddleware } from "../../../src/middleware/audit-log";
import { auditLogger } from "../../../src/utils/audit-logger";

vi.mock("../../../src/utils/audit-logger", () => ({
  auditLogger: { info: vi.fn() },
}));

function mockReq(overrides: Record<string, any> = {}) {
  return {
    id: "req-1",
    method: "GET",
    originalUrl: "/api/test",
    ip: "127.0.0.1",
    headers: { "user-agent": "test-agent" },
    session: {},
    ...overrides,
  } as any;
}

function mockRes() {
  const handlers: Record<string, () => void> = {};
  const res: any = {
    statusCode: 200,
    on: vi.fn((event: string, handler: () => void) => {
      handlers[event] = handler;
    }),
  };
  res._emitFinish = () => handlers.finish?.();
  return res;
}

function mockNext() {
  return vi.fn();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("auditMiddleware", () => {
  it("calls next immediately", () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    auditMiddleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("logs audit entry on finish", () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    auditMiddleware(req, res, next);
    res._emitFinish();

    expect(auditLogger.info).toHaveBeenCalledOnce();
    const entry = (auditLogger.info as any).mock.calls[0][1];
    expect(entry.type).toBe("audit");
    expect(entry.reqId).toBe("req-1");
    expect(entry.method).toBe("GET");
    expect(entry.path).toBe("/api/test");
    expect(entry.status).toBe(200);
    expect(entry.ip).toBe("127.0.0.1");
    expect(entry.userAgent).toBe("test-agent");
  });

  it("includes user from session", () => {
    const req = mockReq({ session: { user: "admin" } });
    const res = mockRes();
    const next = mockNext();

    auditMiddleware(req, res, next);
    res._emitFinish();

    expect((auditLogger.info as any).mock.calls[0][1].user).toBe("admin");
  });

  it("extracts clientId from Basic auth", () => {
    const encoded = Buffer.from("my-client:my-secret").toString("base64");
    const req = mockReq({ headers: { authorization: `Basic ${encoded}`, "user-agent": "" } });
    const res = mockRes();
    const next = mockNext();

    auditMiddleware(req, res, next);
    res._emitFinish();

    expect((auditLogger.info as any).mock.calls[0][1].clientId).toBe("my-client");
  });

  it("records authType bearer for Bearer token", () => {
    const req = mockReq({ headers: { authorization: "Bearer tok-1", "user-agent": "" } });
    const res = mockRes();
    const next = mockNext();

    auditMiddleware(req, res, next);
    res._emitFinish();

    expect((auditLogger.info as any).mock.calls[0][1].authType).toBe("bearer");
  });

  it("skips clientId extraction when Basic auth has no colon", () => {
    const encoded = Buffer.from("invalid").toString("base64");
    const req = mockReq({ headers: { authorization: `Basic ${encoded}`, "user-agent": "" } });
    const res = mockRes();
    const next = mockNext();

    auditMiddleware(req, res, next);
    res._emitFinish();

    expect((auditLogger.info as any).mock.calls[0][1].clientId).toBeUndefined();
  });
});
