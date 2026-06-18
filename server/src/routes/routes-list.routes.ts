import { Router } from "express";

const router = Router();

type RouteEntry = {
  method: string;
  path: string;
  description?: string;
  body?: string;
};

const ROUTES: RouteEntry[] = [
  // ── Authorization ──────────────────────────────────────────
  {
    method: "GET",
    path: "/api/authorization",
    description: "OAuth authorization endpoint — renders login page (requires ?response_type, ?client_id, ?redirect_uri, ?scope)",
  },
  {
    method: "POST",
    path: "/api/authorization/issue",
    description: "Authorization issue response (Authlete callback)",
  },

  // ── Token ──────────────────────────────────────────────────
  {
    method: "POST",
    path: "/api/token",
    description: "OAuth token endpoint — exchange code, refresh token, or client credentials",
    body: "grant_type=authorization_code&code=...&redirect_uri=...&client_id=...&code_verifier=...",
  },
  {
    method: "POST",
    path: "/api/token/issue",
    description: "Token issue (Authlete callback)",
  },
  {
    method: "POST",
    path: "/api/token/fail",
    description: "Token fail (Authlete callback)",
  },
  {
    method: "POST",
    path: "/api/token/create",
    description: "Create a token via Authlete token management API",
    body: "grantType=CLIENT_CREDENTIALS&subject=...&scopes=openid",
  },
  {
    method: "DELETE",
    path: "/api/token/delete/:accessTokenIdentifier",
    description: "Delete a token by its identifier via token management",
  },
  {
    method: "GET",
    path: "/api/token/list",
    description: "List all tokens via Authlete token management",
  },
  {
    method: "PATCH",
    path: "/api/token/update",
    description: "Update token scopes/metadata",
    body: "accessToken=...&scopes=openid",
  },
  {
    method: "POST",
    path: "/api/token/revoke",
    description: "Revoke a token via token management",
    body: "accessTokenIdentifier=...",
  },
  {
    method: "POST",
    path: "/api/token/reissue",
    description: "Reissue an ID token for an existing session",
    body: "accessToken=...&refreshToken=...",
  },
  {
    method: "GET",
    path: "/api/token/createLocalToken",
    description: "Create a locally-signed JWT (no Authlete call)",
  },

  // ── Userinfo ───────────────────────────────────────────────
  {
    method: "GET",
    path: "/api/userinfo",
    description: "UserInfo endpoint — requires Bearer token (Authorization header)",
  },
  {
    method: "POST",
    path: "/api/userinfo",
    description: "UserInfo endpoint — token in form body or Authorization header",
    body: "access_token=...",
  },
  {
    method: "POST",
    path: "/api/userinfo/issue",
    description: "UserInfo issue (Authlete callback)",
  },

  // ── Introspection ──────────────────────────────────────────
  {
    method: "POST",
    path: "/api/introspection",
    description: "Authlete-specific introspection (non-standard response)",
    body: "token=...",
  },
  {
    method: "POST",
    path: "/api/introspection/standard",
    description: "RFC 7662 OAuth 2.0 Token Introspection",
    body: "token=...",
  },

  // ── Revocation ─────────────────────────────────────────────
  {
    method: "POST",
    path: "/api/revocation",
    description: "RFC 7009 OAuth 2.0 Token Revocation",
    body: "token=...",
  },

  // ── Session (interactive login / consent) ──────────────────
  {
    method: "GET",
    path: "/api/session/login",
    description: "Renders the login form (EJS)",
  },
  {
    method: "POST",
    path: "/api/session/login",
    description: "Submit username/password for login",
    body: "username=alice&password=password123",
  },
  {
    method: "GET",
    path: "/api/session/consent",
    description: "Renders the consent form (EJS)",
  },
  {
    method: "POST",
    path: "/api/session/consent",
    description: "Submit consent decision (approve/deny)",
    body: "decision=approve",
  },

  // ── Discovery / JWKS ───────────────────────────────────────
  {
    method: "GET",
    path: "/api/.well-known/openid-configuration",
    description: "OpenID Connect Discovery document (RFC 8414)",
  },
  {
    method: "GET",
    path: "/api/.well-known/jwks.json",
    description: "JSON Web Key Set (RFC 7517)",
  },

  // ── Logout ─────────────────────────────────────────────────
  {
    method: "GET",
    path: "/api/logout",
    description: "RP-initiated logout — requires ?client_id and ?post_logout_redirect_uri",
  },
  {
    method: "POST",
    path: "/api/backchannel_logout",
    description: "OP-initiated backchannel logout (Authlete callback)",
  },
];

// Serve static HTML view from src/views
router.get("/routes", (req, res) => {
  res.render("routes");
});

// Provide a JSON endpoint the client-side view can fetch
router.get("/routes.json", (req, res) => {
  const proto = req.protocol;
  const host = req.get("host") || "localhost";
  const base = `${proto}://${host}`;
  req.logger("routes base url", { base });
  res.json({ base, routes: ROUTES });
});

export default router;
