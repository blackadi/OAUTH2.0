import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";

const mockProcess = vi.fn();
const mockStandardProcess = vi.fn();

vi.mock("../../../src/services/authlete.service", () => ({
  authleteApi: {
    introspection: {
      get process() {
        return mockProcess;
      },
      get standardProcess() {
        return mockStandardProcess;
      },
    },
  },
  serviceId: "test-service-id",
}));

import introspectionRoutes from "../../../src/routes/introspection.routes";

/**
 * T1-1 / 7662-W1 + W2 — RFC 7662 §2.1's authorisation requirement.
 *
 * > the endpoint MUST also require some form of authorization to access this endpoint, such as client
 * > authentication… or a separate OAuth 2.0 access token
 *
 * Until 2026-08-12 `routes/introspection.routes.ts` registered both handlers with **no middleware at all**:
 * any caller could post an arbitrary string and learn whether it was a live token, then harvest `sub`,
 * `scope`, `client_id` and `exp` from the hits. §2.1 names that ("token scanning") as the reason the
 * requirement exists. See audit/02-findings/RFC7662-token-introspection.md F-1.
 *
 * The assertion that matters most in every case below is **that Authlete is never reached** on a rejected
 * request. A 401 that still introspected would close nothing: the oracle is the Authlete call, not the
 * response body.
 */
describe("introspection routes — the §2.1 authorisation gate", () => {
  let app: express.Express;

  const ORIGINAL_ID = process.env.MGMT_CLIENT_ID;
  const ORIGINAL_SECRET = process.env.MGMT_CLIENT_SECRET;

  const basic = (id: string, secret: string) =>
    `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
  const ADMIN = basic("mgmt-id", "mgmt-secret");

  const ENDPOINTS = [
    ["proprietary", "/api/introspection", () => mockProcess],
    ["RFC 7662", "/api/introspection/standard", () => mockStandardProcess],
  ] as const;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MGMT_CLIENT_ID = "mgmt-id";
    process.env.MGMT_CLIENT_SECRET = "mgmt-secret";
    mockProcess.mockResolvedValue({ action: "OK", active: true });
    mockStandardProcess.mockResolvedValue({ action: "OK", responseContent: '{"active":true}' });

    app = express();
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());
    app.use("/api", introspectionRoutes);
  });

  afterEach(() => {
    process.env.MGMT_CLIENT_ID = ORIGINAL_ID;
    process.env.MGMT_CLIENT_SECRET = ORIGINAL_SECRET;
  });

  describe.each(ENDPOINTS)("%s endpoint (%s)", (_label, path, authleteCall) => {
    it("answers an authenticated caller", async () => {
      const res = await request(app)
        .post(path)
        .set("Authorization", ADMIN)
        .type("form")
        .send("token=at-1");

      expect(res.status).toBe(200);
      expect(authleteCall()).toHaveBeenCalled();
    });

    it.each([
      ["no credentials", undefined],
      ["a wrong secret", basic("mgmt-id", "wrong")],
      ["a wrong id", basic("wrong", "mgmt-secret")],
      ["a Bearer token instead", "Bearer some-access-token"],
      ["a malformed Basic payload with no colon", `Basic ${Buffer.from("nocolon").toString("base64")}`],
    ])("rejects %s with 401 and never calls Authlete", async (_case, header) => {
      const req = request(app).post(path).type("form").send("token=at-1");
      if (header) req.set("Authorization", header);
      const res = await req;

      expect(res.status).toBe(401);
      expect(res.headers["www-authenticate"]).toContain("Basic");
      expect(authleteCall()).not.toHaveBeenCalled();
    });

    // requireBasicAuth fails closed. An operator who has not set the management credentials gets an endpoint
    // that refuses everyone, not one that admits everyone.
    it.each(["MGMT_CLIENT_ID", "MGMT_CLIENT_SECRET"])(
      "rejects every caller when %s is unset",
      async (unset) => {
        delete process.env[unset];

        const res = await request(app)
          .post(path)
          .set("Authorization", ADMIN)
          .type("form")
          .send("token=at-1");

        expect(res.status).toBe(401);
        expect(authleteCall()).not.toHaveBeenCalled();
      }
    );
  });

  // The gate runs before request validation, so a caller cannot distinguish "malformed" from "unknown token".
  it("returns 401 rather than 400 for an unauthenticated request with no token at all", async () => {
    const res = await request(app).post("/api/introspection").type("form").send("");

    expect(res.status).toBe(401);
    expect(mockProcess).not.toHaveBeenCalled();
  });

  // Regression for the block deleted from introspection.service.ts on 2026-08-12. It used to decode
  // `Authorization: Basic` and append the result to `parameters` as client_id/client_secret. Now that the
  // header carries this deployment's *management* credentials, doing so would ship the admin secret to
  // Authlete labelled as a client secret.
  it("never forwards the admin credentials to Authlete as client credentials", async () => {
    await request(app)
      .post("/api/introspection/standard")
      .set("Authorization", ADMIN)
      .type("form")
      .send("token=at-1");

    const sent = JSON.stringify(mockStandardProcess.mock.calls[0]?.[0] ?? {});
    expect(sent).not.toContain("mgmt-secret");
    expect(sent).not.toContain("mgmt-id");
    expect(sent).not.toContain("client_secret");
  });

  // Client credentials remain supportable — they belong in the body, which reaches Authlete verbatim.
  it("still passes body-supplied client credentials through to Authlete", async () => {
    await request(app)
      .post("/api/introspection/standard")
      .set("Authorization", ADMIN)
      .type("form")
      .send("token=at-1&client_id=c-1&client_secret=s-1");

    const sent = JSON.stringify(mockStandardProcess.mock.calls[0]?.[0] ?? {});
    expect(sent).toContain("client_id=c-1");
    expect(sent).toContain("client_secret=s-1");
  });
  // 7662-W2. §2.1's stated purpose is preventing token scanning, and an unthrottled oracle is still an
  // oracle — so the limiter is part of the fix, not decoration. `generalLimiter` is 60/min, keyed by IP and
  // shared across this file's requests, so this loops until it trips rather than assuming a fixed count.
  // Last test in the file: once the limiter is saturated it stays so for the rest of the window.
  it("rate-limits the endpoint (429) as well as authenticating it", async () => {
    let sawTooMany = false;
    for (let i = 0; i < 80 && !sawTooMany; i++) {
      const res = await request(app).post("/api/introspection/standard").type("form").send("token=t");
      if (res.status === 429) sawTooMany = true;
    }
    expect(sawTooMany).toBe(true);
  });

});
