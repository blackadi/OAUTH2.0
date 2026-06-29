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
  // ── Token ──────────────────────────────────────────────────
  {
    method: "POST",
    path: "/api/token",
    description: "OAuth token endpoint — exchange code, refresh token, or client credentials",
    body: "grant_type=authorization_code&code=...&redirect_uri=...&client_id=...&code_verifier=...",
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
    body: "username=admin&password=password",
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

  // ── Dynamic Client Registration (RFC 7591/7592) ──────────────────────
  {
    method: "POST",
    path: "/api/client/dcr/register",
    description: "RFC 7591 Dynamic Client Registration — requires Basic auth (MGMT_CLIENT_ID/MGMT_CLIENT_SECRET)",
    body: JSON.stringify({ json: '{ "client_name": "My App", "redirect_uris": ["http://localhost:3000/callback"], "grant_types": ["AUTHORIZATION_CODE"] }' }),
  },
  {
    method: "POST",
    path: "/api/client/dcr/get",
    description: "RFC 7592 Dynamic Client Registration Management — get client (requires registration_access_token in body, no admin auth)",
    body: JSON.stringify({ token: "registration_access_token", clientId: "client_id" }),
  },
  {
    method: "POST",
    path: "/api/client/dcr/update",
    description: "RFC 7592 Dynamic Client Registration Management — update client (requires registration_access_token in body, no admin auth)",
    body: JSON.stringify({ json: '{ "client_name": "Updated Name" }', token: "registration_access_token", clientId: "client_id" }),
  },
  {
    method: "POST",
    path: "/api/client/dcr/delete",
    description: "RFC 7592 Dynamic Client Registration Management — delete client (requires registration_access_token in body, no admin auth)",
    body: JSON.stringify({ token: "registration_access_token", clientId: "client_id" }),
  },

  // ── CIBA (Client-Initiated Backchannel Authentication) ────────────────
  {
    method: "POST",
    path: "/api/ciba/authentication",
    description: "CIBA backchannel authentication — process auth request from client (requires parameters, clientId, clientSecret)",
    body: JSON.stringify({ parameters: "login_hint=admin&scope=openid", clientId: "your_client_id", clientSecret: "your_client_secret" }),
  },
  {
    method: "POST",
    path: "/api/ciba/issue",
    description: "Issue auth_req_id for a validated backchannel authentication ticket",
    body: JSON.stringify({ ticket: "ticket_from_authentication_response" }),
  },
  {
    method: "POST",
    path: "/api/ciba/fail",
    description: "Fail a backchannel authentication request with a reason",
    body: JSON.stringify({ ticket: "ticket_from_authentication_response", reason: "ACCESS_DENIED" }),
  },
  {
    method: "POST",
    path: "/api/ciba/complete",
    description: "Complete backchannel authentication with end-user result (AUTHORIZED, ACCESS_DENIED, or TRANSACTION_FAILED)",
    body: JSON.stringify({ ticket: "ticket_from_authentication_response", result: "AUTHORIZED", subject: "admin" }),
  },

  // ── PAR (RFC 9126 — Pushed Authorization Requests) ────────────────────────────
  {
    method: "POST",
    path: "/api/par",
    description: "RFC 9126 Pushed Authorization Request — client sends full OAuth params via PAR, gets back a request_uri, then uses it in /authorize?request_uri=<uri> (no admin auth; clientId/clientSecret in body)",
    body: JSON.stringify({ parameters: "response_type=code&client_id=your_client_id&redirect_uri=http://localhost:3000&scope=openid&state=par_state&code_challenge_method=S256&code_challenge=...", clientId: "your_client_id", clientSecret: "your_client_secret" }),
  },
  // ── Grant Management ─────────────────────────────────────────────────
  {
    method: "GET",
    path: "/api/gm/:grantId",
    description: "Grant Management for OAuth 2.0 — query grant status (requires Bearer token with grant_management_query scope)",
  },
  {
    method: "DELETE",
    path: "/api/gm/:grantId",
    description: "Grant Management for OAuth 2.0 — revoke a grant (requires Bearer token with grant_management_revoke scope)",
  },

  // ── Logout ─────────────────────────────────────────────────
  {
    method: "GET",
    path: "/api/logout",
    description: "RP-initiated logout — requires ?client_id and ?post_logout_redirect_uri (add &backchannel=true to deliver backchannel logout tokens to all clients)",
  },
  {
    method: "POST",
    path: "/api/backchannel_logout",
    description: "OP-initiated backchannel logout (receiving endpoint — handles incoming logout tokens from other OPs)",
  },

  // ── Backchannel Logout Issuing ──────────────────────────────
  {
    method: "POST",
    path: "/api/backchannel_logout/issue",
    description: "Issue a backchannel logout token (requires Basic auth with MGMT_CLIENT_ID/MGMT_CLIENT_SECRET)",
    body: JSON.stringify({ clientIdentifier: "your_client_id", subject: "user_subject", sessionId: "optional_session_id" }),
  },
  {
    method: "POST",
    path: "/api/backchannel_logout/deliver",
    description: "Issue and deliver a backchannel logout token to one client (requires Basic auth)",
    body: JSON.stringify({ clientIdentifier: "your_client_id", subject: "user_subject" }),
  },
  {
    method: "POST",
    path: "/api/backchannel_logout/deliver-all",
    description: "Issue and deliver backchannel logout tokens to ALL clients with a backchannelLogoutUri configured (requires Basic auth)",
    body: JSON.stringify({ subject: "user_subject" }),
  },

  // ── Hardware Security Keys ───────────────────────────────────────────
  {
    method: "POST",
    path: "/api/hsk/create",
    description: "Create a hardware security key — requires Basic auth (MGMT_CLIENT_ID/MGMT_CLIENT_SECRET)",
    body: JSON.stringify({ kty: "EC", use: "sig", kid: "my-key", hsmName: "google", alg: "ES256" }),
  },
  {
    method: "GET",
    path: "/api/hsk/get/:handle",
    description: "Get a hardware security key by handle — requires Basic auth",
  },
  {
    method: "DELETE",
    path: "/api/hsk/delete/:handle",
    description: "Delete a hardware security key by handle — requires Basic auth",
  },
  {
    method: "GET",
    path: "/api/hsk/list",
    description: "List all hardware security keys — requires Basic auth",
  },

  // ── Metrics ──────────────────────────────────────────────────
  {
    method: "GET",
    path: "/api/metrics",
    description: "Prometheus metrics endpoint — returns runtime and HTTP metrics in text format (no auth required)",
  },
  // ── Health ──────────────────────────────────────────────────
  {
    method: "GET",
    path: "/api/health",
    description: "Server health check — returns status, uptime, and timestamp (no auth required)",
  },
  {
    method: "GET",
    path: "/api/health/all",
    description: "Aggregate health check — returns Redis, Authlete, and server status (no auth required)",
  },
  {
    method: "GET",
    path: "/api/health/authlete",
    description: "Authlete connectivity health check — proxies to Authlete's /api/lifecycle/healthcheck (no auth required, add ?extended=true for DB check)",
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
