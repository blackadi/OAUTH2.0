import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import router from "../../../src/routes/openapi.routes";

describe("openapi routes", () => {
  const app = express();
  app.use(router);

  it("GET /openapi.json returns 200 with valid spec", async () => {
    const res = await request(app).get("/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    expect(res.body.openapi).toBe("3.0.3");
    expect(res.body.info).toBeDefined();
    expect(res.body.info.title).toContain("Authlete");
    expect(res.body.paths).toBeDefined();
    expect(res.body.paths["/token"]).toBeDefined();
    expect(res.body.paths["/authorization"]).toBeDefined();
  });

  it("spec contains all expected endpoints", async () => {
    const res = await request(app).get("/openapi.json");
    const paths = Object.keys(res.body.paths);
    expect(paths).toContain("/token");
    expect(paths).toContain("/userinfo");
    expect(paths).toContain("/introspection");
    expect(paths).toContain("/revocation");
    expect(paths).toContain("/par");
    expect(paths).toContain("/ciba/authentication");
    expect(paths).toContain("/device/authorization");
    expect(paths).toContain("/metrics");
    expect(paths).toContain("/health");
    expect(paths).toContain("/gm/{grantId}");
    expect(paths).toContain("/logout");
  });

  it("spec has security schemes", async () => {
    const res = await request(app).get("/openapi.json");
    expect(res.body.components.securitySchemes.bearerAuth).toBeDefined();
    expect(res.body.components.securitySchemes.basicAuth).toBeDefined();
  });
});
