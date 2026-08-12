import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// `developmentOnly` reads `server.nodeEnv` from the config module, so the gate is exercised by mocking the
// config rather than by mutating process.env after import.
const mocks = vi.hoisted(() => ({ nodeEnv: "development" }));

vi.mock("../../../src/config/app.config", () => ({
  server: {
    get nodeEnv() {
      return mocks.nodeEnv;
    },
    port: 3000,
  },
  session: { secret: "test-secret" },
  logging: { level: "error", morganFormat: "dev" },
  redis: { url: undefined },
  protectedResource: { resource: undefined, documentation: undefined },
}));

const mockComplete = vi.fn();
const mockVerification = vi.fn();
const mockAuthorization = vi.fn();

vi.mock("../../../src/services/authlete.service", () => ({
  authleteApi: {
    deviceFlow: {
      complete: mockComplete,
      verification: mockVerification,
      authorization: mockAuthorization,
    },
  },
  serviceId: "test-service-id",
}));

describe("device routes — the /api/device/complete gate", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockComplete.mockResolvedValue({ action: "SUCCESS" });
    const router = (await import("../../../src/routes/device.routes")).default;
    app = express();
    app.use(express.json());
    app.use(router);
  });

  const body = { userCode: "ABCD-EFGH", result: "AUTHORIZED", subject: "admin" };

  it("reaches the controller in development", async () => {
    mocks.nodeEnv = "development";

    const res = await request(app).post("/api/device/complete").send(body);

    expect(res.status).toBe(200);
    expect(mockComplete).toHaveBeenCalled();
  });

  // Regression: before 2026-08-10 this route carried no middleware at all — no auth, no limiter, no gate — so
  // any caller could approve a live user code as any subject and the device's next poll returned a token for
  // them. See audit/02-findings/RFC8628-device-authorization-grant.md F-3.
  it.each(["production", "test", undefined])(
    "answers 404 and never reaches Authlete when nodeEnv is %s",
    async (env) => {
      mocks.nodeEnv = env as string;

      const res = await request(app).post("/api/device/complete").send(body);

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "not_found" });
      expect(mockComplete).not.toHaveBeenCalled();
    }
  );

  it("does not gate the protocol endpoints, which grant nothing on their own", async () => {
    mocks.nodeEnv = "production";
    mockAuthorization.mockResolvedValue({ action: "OK" });
    mockVerification.mockResolvedValue({ action: "VALID" });

    const authz = await request(app)
      .post("/api/device/authorization")
      .send({ parameters: "client_id=1", clientId: "1" });
    const verify = await request(app).post("/api/device/verification").send({ userCode: "ABCD-EFGH" });

    expect(authz.status).not.toBe(404);
    expect(verify.status).not.toBe(404);
  });
});
