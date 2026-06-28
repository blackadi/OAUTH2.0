import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../../src/app";

vi.mock("../../../src/services/authlete.service", () => ({
  authleteApi: {},
  serviceId: "test-service",
}));

describe("CSRF Protection", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MGMT_CLIENT_ID", "");
    vi.stubEnv("MGMT_CLIENT_SECRET", "");
    app = createApp();
  });

  describe("GET /api/session/login", () => {
    it("renders CSRF token in hidden input", async () => {
      const res = await request(app)
        .get("/api/session/login")
        .expect(200);

      expect(res.text).toMatch(/name="_csrf" value="[a-f0-9]{64}"/);
      expect(res.text).toContain("Sign in");
    });
  });

  describe("POST /api/session/login", () => {
    it("rejects missing CSRF token with 403", async () => {
      const agent = request.agent(app);
      await agent.get("/api/session/login");

      const res = await agent
        .post("/api/session/login")
        .send("username=admin&password=password&login=submit");

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: "invalid_request" });
    });

    it("rejects wrong CSRF token with 403", async () => {
      const agent = request.agent(app);
      await agent.get("/api/session/login");

      const res = await agent
        .post("/api/session/login")
        .send("_csrf=invalidtoken&username=admin&password=password&login=submit");

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: "invalid_request" });
    });

    it("accepts valid CSRF token (does not 403)", async () => {
      const agent = request.agent(app);
      const pageRes = await agent.get("/api/session/login");

      const match = pageRes.text.match(/name="_csrf" value="([a-f0-9]{64})"/);
      expect(match).not.toBeNull();
      const csrfToken = match![1];

      const res = await agent
        .post("/api/session/login")
        .send(`_csrf=${csrfToken}&username=admin&password=password&login=submit`);

      expect(res.status).not.toBe(403);
    });

    it("still rejects after consuming token (no new GET)", async () => {
      const agent = request.agent(app);
      const pageRes = await agent.get("/api/session/login");

      const match = pageRes.text.match(/name="_csrf" value="([a-f0-9]{64})"/);
      expect(match).not.toBeNull();
      const csrfToken = match![1];

      await agent
        .post("/api/session/login")
        .send(`_csrf=${csrfToken}&username=admin&password=password&login=submit`);

      const res = await agent
        .post("/api/session/login")
        .send(`_csrf=${csrfToken}&username=admin&password=password&login=submit`);

      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/session/consent", () => {
    it("renders CSRF token in hidden input", async () => {
      const agent = request.agent(app);
      await agent.get("/api/session/login");

      const res = await agent
        .get("/api/session/consent")
        .expect(403);

      expect(res.body).toMatchObject({ error: "Forbidden" });
    });
  });
});
