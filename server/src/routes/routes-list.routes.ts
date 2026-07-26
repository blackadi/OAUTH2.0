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

  // ── Device Flow (RFC 8628) ───────────────────────────────────────────
  {
    method: "POST",
    path: "/api/device/authorization",
    description: "RFC 8628 Device Authorization — initiates device flow, returns device_code + user_code + verification_uri. Supports public clients (no secret) and confidential clients.",
    body: JSON.stringify({ parameters: "client_id=your_client_id&scope=openid", clientId: "your_client_id" }),
  },
  {
    method: "POST",
    path: "/api/device/verification",
    description: "Device Flow — verify user code entered by end-user on their browser",
    body: JSON.stringify({ userCode: "ABCD-1234" }),
  },
  {
    method: "POST",
    path: "/api/device/complete",
    description: "Device Flow — complete with end-user decision (AUTHORIZED, ACCESS_DENIED, or TRANSACTION_FAILED). Requires subject.",
    body: JSON.stringify({ userCode: "ABCD-1234", result: "AUTHORIZED", subject: "admin" }),
  },
  {
    method: "GET",
    path: "/device",
    description: "Device Flow — browser verification page (user enters code here)",
  },

  // ── Native SSO (Shared Signals Framework) ────────────────────────────
  {
    method: "POST",
    path: "/api/nativesso",
    description: "Native SSO — process SSF (Shared Signals Framework) event for cross-device session management",
    body: JSON.stringify({ /* SSF event payload */ }),
  },
  {
    method: "POST",
    path: "/api/nativesso/logout",
    description: "Native SSO — process logout signal to terminate sessions for a subject",
    body: JSON.stringify({ /* SSF logout event payload */ }),
  },

  // ── JAR (RFC 9101 — JWT-Secured Authorization Request) ───────────────
  {
    method: "POST",
    path: "/api/jar/process",
    description: "RFC 9101 JAR — validate a JWT request object and extract OAuth parameters",
    body: JSON.stringify({ request: "eyJhbGciOiJSUz...", clientId: "your_client_id" }),
  },

  // ── Federation (OpenID Federation 1.0) ───────────────────────────────
  {
    method: "GET",
    path: "/api/federation/configuration",
    description: "OpenID Federation entity configuration — returns federation metadata for this entity",
  },
  {
    method: "POST",
    path: "/api/federation/registration",
    description: "OpenID Federation — handle entity registration request",
    body: JSON.stringify({ /* federation registration request */ }),
  },
  {
    method: "GET",
    path: "/.well-known/openid-federation",
    description: "OpenID Federation well-known endpoint (served at root for spec compliance)",
  },

  // ── VCI (Verifiable Credential Issuance — OID4VCI) ───────────────────
  {
    method: "GET",
    path: "/api/vci/metadata",
    description: "OID4VCI credential issuer metadata — returns VCI configuration (public endpoint)",
  },
  {
    method: "GET",
    path: "/api/vci/jwtissuer",
    description: "OID4VCI JWT issuer metadata — returns JWT issuer configuration (public endpoint)",
  },
  {
    method: "GET",
    path: "/api/vci/jwks",
    description: "OID4VCI JWKS — returns the JWK Set for VCI (public endpoint)",
  },
  {
    method: "GET",
    path: "/api/vci/well-known",
    description: "OID4VCI well-known metadata (alias for /vci/metadata)",
  },
  {
    method: "POST",
    path: "/api/vci/offer/create",
    description: "OID4VCI — create a credential offer (requires Basic auth)",
    body: JSON.stringify({ credentialConfigurationIds: ["my_credential"], subject: "user123" }),
  },
  {
    method: "POST",
    path: "/api/vci/offer/info",
    description: "OID4VCI — get credential offer info by identifier (requires Basic auth)",
    body: JSON.stringify({ identifier: "offer_id" }),
  },
  {
    method: "POST",
    path: "/api/vci/credential/issue",
    description: "OID4VCI §8 — issue a single verifiable credential (requires Bearer token)",
    body: JSON.stringify({ accessToken: "access_token_from_pre_auth_code_flow" }),
  },
  {
    method: "POST",
    path: "/api/vci/credential/batch",
    description: "OID4VCI §10 — issue multiple verifiable credentials in a single request (requires Bearer token)",
    body: JSON.stringify({ accessToken: "access_token", orders: [] }),
  },
  {
    method: "POST",
    path: "/api/vci/deferred/issue",
    description: "OID4VCI §9 — issue a deferred verifiable credential (requires Bearer token)",
    body: JSON.stringify({ order: {} }),
  },
  {
    method: "GET",
    path: "/.well-known/openid-credential-issuer",
    description: "OID4VCI well-known credential issuer metadata (served at root for spec compliance)",
  },

  // ── Client Management ────────────────────────────────────────────────
  {
    method: "GET",
    path: "/api/client/list",
    description: "List all clients — requires Basic auth. Supports pagination with start/end query params.",
  },
  {
    method: "GET",
    path: "/api/client/get/:clientId",
    description: "Get client details by ID — requires Basic auth",
  },
  {
    method: "POST",
    path: "/api/client/create",
    description: "Create a new client — requires Basic auth",
    body: JSON.stringify({ client: { clientName: "My App", clientType: "CONFIDENTIAL", applicationType: "WEB", grantTypes: ["AUTHORIZATION_CODE"], responseTypes: ["CODE"], redirectUris: ["http://localhost:3000/callback"], tokenAuthMethod: "CLIENT_SECRET_BASIC" } }),
  },
  {
    method: "PATCH",
    path: "/api/client/update/:clientId",
    description: "Update client properties — requires Basic auth",
  },
  {
    method: "DELETE",
    path: "/api/client/delete/:clientId",
    description: "Delete a client — requires Basic auth",
  },
  {
    method: "PATCH",
    path: "/api/client/flag/:clientIdentifier",
    description: "Update client lock flag (prevent/allow credential refresh) — requires Basic auth",
    body: JSON.stringify({ clientLocked: true }),
  },
  {
    method: "POST",
    path: "/api/client/secret/refresh/:clientIdentifier",
    description: "Generate a new client secret — requires Basic auth",
  },
  {
    method: "PUT",
    path: "/api/client/secret/update/:clientIdentifier",
    description: "Set a known client secret value — requires Basic auth",
    body: JSON.stringify({ clientSecret: "your_known_secret" }),
  },
  {
    method: "GET",
    path: "/api/client/auth/list/:subject",
    description: "List all client authorizations for a subject — requires Basic auth",
  },
  {
    method: "POST",
    path: "/api/client/auth/update/:clientId",
    description: "Update client authorization for a user — requires Basic auth",
    body: JSON.stringify({ subject: "user123", scopes: ["openid", "profile"] }),
  },
  {
    method: "DELETE",
    path: "/api/client/auth/delete/:clientId/:subject",
    description: "Delete client authorization for a user — requires Basic auth",
  },
  {
    method: "GET",
    path: "/api/client/scopes/granted/:clientId/:subject",
    description: "Get granted scopes for a client+user — requires Basic auth",
  },
  {
    method: "DELETE",
    path: "/api/client/scopes/granted/:clientId/:subject",
    description: "Delete all granted scopes for a client+user — requires Basic auth",
  },
  {
    method: "GET",
    path: "/api/client/scopes/requestable/:clientId",
    description: "Get requestable scopes for a client — requires Basic auth",
  },
  {
    method: "PUT",
    path: "/api/client/scopes/requestable/:clientId",
    description: "Set requestable scopes for a client — requires Basic auth",
    body: JSON.stringify({ requestableScopes: ["openid", "profile", "email"] }),
  },
  {
    method: "DELETE",
    path: "/api/client/scopes/requestable/:clientId",
    description: "Delete all requestable scopes for a client — requires Basic auth",
  },

  // ── FAPI 2.0 ──────────────────────────────────────────────────
  {
    method: "GET",
    path: "/api/fapi/config",
    description: "FAPI 2.0 configuration — returns FAPI mode, DPoP status, CIMD support, and compliance info",
  },
  {
    method: "GET",
    path: "/api/fapi/status",
    description: "FAPI 2.0 status — returns Authlete service config including fapiModes, DPoP, and CIMD (clientIdMetadataDocumentSupported) settings",
  },

  // ── MCP (Model Context Protocol) ────────────────────────────
  {
    method: "GET",
    path: "/.well-known/oauth-authorization-server",
    description: "RFC 8414 Authorization Server Metadata — MCP spec requires this for AS discovery (serves same content as openid-configuration)",
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
