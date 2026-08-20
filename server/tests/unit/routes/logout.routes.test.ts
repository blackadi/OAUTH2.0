import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import bodyParser from "body-parser";
import session from "express-session";
import path from "node:path";

import logoutRoutes from "../../../src/routes/logout.routes";

/**
 * T0-3 / RPL-W3 — the confirmation step required by RP-Initiated Logout 1.0 §2.
 *
 * These assertions are the ones that fail if `GET /api/logout` is ever returned to a one-shot logout: before
 * 2026-08-12 the GET destroyed the session, delivered back-channel logout tokens and redirected, with no
 * middleware at all — so `<img src="…/api/logout">` on any page the user visited logged them out.
 * See audit/02-findings/OIDC-RP-INITIATED-LOGOUT-1.0.md F-2.
 *
 * Nothing here reaches Authlete: no test passes an `id_token_hint` (which would fetch the OP's JWKS and the
 * discovery document) or `backchannel=true` with a subject.
 */
describe("logout routes — the §2 confirmation step", () => {
  let app: express.Express;

  const CLIENT = "client-abc";

  beforeEach(() => {
    // RPL-W1: the redirect decision reads the identified client's registered set (§3) and nothing else.
    process.env.POST_LOGOUT_REDIRECT_URIS = JSON.stringify({
      [CLIENT]: ["http://localhost:3000/bye"],
    });
    app = express();
    app.set("view engine", "ejs");
    app.set("views", path.resolve(__dirname, "../../../src/views"));
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(
      session({ secret: "test-secret", resave: false, saveUninitialized: false })
    );
    // Stand-in for a logged-in browser session. `x-test-user` seeds the subject the real flow sets at login.
    app.use((req, _res, next) => {
      const user = req.headers["x-test-user"];
      if (typeof user === "string") req.session.user = user;
      next();
    });
    app.use("/api", logoutRoutes);
  });

  afterEach(() => {
    delete process.env.POST_LOGOUT_REDIRECT_URIS;
  });

  const csrfFrom = (html: string): string => {
    const match = html.match(/name="_csrf" value="([^"]*)"/);
    if (!match) throw new Error("no _csrf field in the rendered page");
    return match[1];
  };

  describe("GET renders a question and changes nothing", () => {
    it("returns 200 with a CSRF-carrying form that posts back to /api/logout", async () => {
      const res = await request(app).get("/api/logout").set("x-test-user", "admin");

      expect(res.status).toBe(200);
      expect(res.text).toContain('action="/api/logout"');
      expect(res.text).toContain('method="post"');
      expect(csrfFrom(res.text)).toMatch(/^[0-9a-f]{64}$/);
    });

    it("does not destroy the session or clear the cookie", async () => {
      const agent = request.agent(app);
      await agent.get("/api/logout").set("x-test-user", "admin");

      const after = await agent.get("/api/logout");

      // Still signed in: the confirmation page names the subject the first request established.
      expect(after.text).toContain("admin");
      expect(after.headers["set-cookie"] ?? []).not.toContainEqual(
        expect.stringContaining("connect.sid=;")
      );
    });

    it("never redirects, even for a post_logout_redirect_uri that the POST would honour", async () => {
      const res = await request(app)
        .get("/api/logout")
        .query({ post_logout_redirect_uri: "http://localhost:3000/bye", state: "xyz", client_id: CLIENT })
        .redirects(0);

      expect(res.status).toBe(200);
      expect(res.headers.location).toBeUndefined();
    });

    it("replays the RP's parameters as hidden fields so the POST carries what the GET was given", async () => {
      const res = await request(app).get("/api/logout").query({
        post_logout_redirect_uri: "http://localhost:3000/bye",
        state: "xyz",
        client_id: "client-abc",
        backchannel: "true",
      });

      expect(res.text).toContain('name="post_logout_redirect_uri" value="http://localhost:3000/bye"');
      expect(res.text).toContain('name="state" value="xyz"');
      expect(res.text).toContain('name="client_id" value="client-abc"');
      expect(res.text).toContain('name="backchannel" value="true"');
    });

    // The displayed destination is presentational; the security decision stays on the POST. Echoing an
    // unvetted URI back to the user would be a phishing aid.
    it("does not show a destination the redirect check would refuse", async () => {
      const res = await request(app)
        .get("/api/logout")
        .query({ post_logout_redirect_uri: "https://evil.example.com/bye", client_id: CLIENT });

      expect(res.status).toBe(200);
      expect(res.text).not.toContain("You will be returned to");
    });
  });

  describe("POST is the only thing that ends a session", () => {
    it("refuses a POST with no CSRF token and leaves the session alive", async () => {
      const agent = request.agent(app);
      await agent.get("/api/logout").set("x-test-user", "admin");

      const res = await agent.post("/api/logout").type("form").send({});

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        error: "invalid_request",
        message: "CSRF token mismatch",
      });
      expect((await agent.get("/api/logout")).text).toContain("admin");
    });

    it("refuses a POST carrying a token from someone else's session", async () => {
      const victim = request.agent(app);
      const attacker = request.agent(app);
      await victim.get("/api/logout").set("x-test-user", "admin");
      const foreign = csrfFrom((await attacker.get("/api/logout")).text);

      const res = await victim.post("/api/logout").type("form").send({ _csrf: foreign });

      expect(res.status).toBe(403);
      expect((await victim.get("/api/logout")).text).toContain("admin");
    });

    it("logs out and redirects when the token matches and the URI is allowed", async () => {
      const agent = request.agent(app);
      const token = csrfFrom((await agent.get("/api/logout").set("x-test-user", "admin")).text);

      const res = await agent
        .post("/api/logout")
        .type("form")
        .redirects(0)
        .send({
          _csrf: token,
          post_logout_redirect_uri: "http://localhost:3000/bye",
          state: "xyz",
          client_id: CLIENT,
        });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("http://localhost:3000/bye?state=xyz");
      expect(res.headers["set-cookie"]?.join(";")).toContain("connect.sid=;");
    });

    // RPL-W1 / T0-4. §3 matches against the *client's* registered values, so a request that names no client
    // has an empty set and MUST NOT redirect — even to a URI another client registered.
    // See audit/02-findings/OIDC-RP-INITIATED-LOGOUT-1.0.md F-1 and F-4.
    it("refuses a registered URI when no client can be identified", async () => {
      const agent = request.agent(app);
      const token = csrfFrom((await agent.get("/api/logout").set("x-test-user", "admin")).text);

      const res = await agent
        .post("/api/logout")
        .type("form")
        .redirects(0)
        .send({ _csrf: token, post_logout_redirect_uri: "http://localhost:3000/bye" });

      expect(res.status).toBe(200);
      expect(res.headers.location).toBeUndefined();
    });

    it("refuses a URI registered to a different client", async () => {
      process.env.POST_LOGOUT_REDIRECT_URIS = JSON.stringify({
        "client-other": ["http://localhost:3000/bye"],
      });
      const agent = request.agent(app);
      const token = csrfFrom((await agent.get("/api/logout").set("x-test-user", "admin")).text);

      const res = await agent
        .post("/api/logout")
        .type("form")
        .redirects(0)
        .send({ _csrf: token, post_logout_redirect_uri: "http://localhost:3000/bye", client_id: CLIENT });

      expect(res.status).toBe(200);
      expect(res.headers.location).toBeUndefined();
    });

    // The redirect rules are unchanged by T0-3 — this is the 2026-08-10 fix, re-asserted at the route layer
    // now that the decision is reached through a POST. See F-1 in the same audit entry.
    it.each([
      ["allowed-origin as a subdomain prefix", "http://localhost:3000.evil.example.com/bye"],
      ["allowed-origin as userinfo before @", "http://localhost:3001@evil.example.com/"],
    ])("still refuses to redirect for %s", async (_label, uri) => {
      const agent = request.agent(app);
      const token = csrfFrom((await agent.get("/api/logout").set("x-test-user", "admin")).text);

      const res = await agent
        .post("/api/logout")
        .type("form")
        .redirects(0)
        .send({ _csrf: token, post_logout_redirect_uri: uri, client_id: CLIENT });

      expect(res.status).toBe(200);
      expect(res.headers.location).toBeUndefined();
      expect(res.text).toContain("Signed out");
    });
  });

  // OIDC-RP-INITIATED-LOGOUT-1.0 F-1's second aggravating factor. T0-3 shipped the confirmation page and
  // nothing else; the limiter was left out visibly rather than folded in, and this closes it. `generalLimiter`
  // is 60/min keyed by IP and shared across this file's requests, so this loops until it trips rather than
  // assuming a fixed count.
  //
  // MUST STAY LAST IN THE FILE: once the limiter is saturated it stays so for the rest of the window, so any
  // test added after this one would see 429 instead of its own assertion. Same arrangement, and the same
  // reason, as `introspection.routes.test.ts`.
  describe("rate limiting", () => {
    it("rate-limits GET /api/logout (429) without changing what it validates", async () => {
      let sawTooMany = false;
      for (let i = 0; i < 90 && !sawTooMany; i++) {
        const res = await request(app).get("/api/logout");
        if (res.status === 429) sawTooMany = true;
      }
      expect(sawTooMany).toBe(true);
    });

    it("rate-limits POST /api/logout too — the half that destroys a session", async () => {
      const res = await request(app).post("/api/logout").type("form").send({ _csrf: "irrelevant" });
      expect(res.status).toBe(429);
    });
  });
});
