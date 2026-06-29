import { Router, Request, Response } from "express";

const router = Router();

const spec: Record<string, unknown> = {
  openapi: "3.0.3",
  info: {
    title: "Authlete Node Authorization Server API",
    version: "1.0.0",
    description:
      "OAuth 2.0 / OpenID Connect authorization server built on Authlete. Supports authorization code, client credentials, ROPG, refresh token, CIBA, Device Flow, PAR, Token Exchange, JWT Bearer, and more.",
  },
  servers: [{ url: "/api", description: "API prefix" }],
  paths: {
    "/authorization": {
      get: {
        summary: "OAuth authorization endpoint",
        description:
          "Initiates an OAuth 2.0 / OIDC authorization request. Redirects to login or consent pages for interactive flows.",
        parameters: [
          {
            name: "response_type",
            in: "query",
            required: true,
            schema: { type: "string", enum: ["code"] },
          },
          {
            name: "client_id",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "redirect_uri",
            in: "query",
            required: true,
            schema: { type: "string", format: "uri" },
          },
          {
            name: "scope",
            in: "query",
            schema: { type: "string" },
          },
          {
            name: "state",
            in: "query",
            schema: { type: "string" },
          },
          {
            name: "code_challenge",
            in: "query",
            schema: { type: "string" },
            description: "PKCE code challenge (RFC 7636)",
          },
          {
            name: "code_challenge_method",
            in: "query",
            schema: { type: "string", enum: ["S256", "plain"] },
          },
          {
            name: "claims",
            in: "query",
            schema: { type: "string" },
            description: "JSON object specifying requested claims (OIDC Core §5.5)",
          },
          {
            name: "request",
            in: "query",
            schema: { type: "string" },
            description: "JWT-secured authorization request (OIDC Core §6)",
          },
          {
            name: "request_uri",
            in: "query",
            schema: { type: "string", format: "uri" },
            description: "URI of JWT-secured authorization request (OIDC Core §6)",
          },
          {
            name: "resource",
            in: "query",
            schema: { type: "string", format: "uri" },
            description: "Resource indicator (RFC 8707)",
          },
          {
            name: "prompt",
            in: "query",
            schema: { type: "string", enum: ["none", "login", "consent"] },
          },
        ],
        responses: {
          "302": { description: "Redirect to login or consent page" },
          "400": { description: "Bad request (missing or invalid parameters)" },
        },
      },
    },
    "/token": {
      post: {
        summary: "OAuth token endpoint",
        description:
          "Exchanges authorization codes, refresh tokens, client credentials, or other grant types for access tokens.",
        requestBody: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                properties: {
                  grant_type: {
                    type: "string",
                    enum: [
                      "authorization_code",
                      "client_credentials",
                      "password",
                      "refresh_token",
                      "urn:ietf:params:oauth:grant-type:token-exchange",
                      "urn:ietf:params:oauth:grant-type:jwt-bearer",
                      "urn:openid:params:grant-type:ciba",
                      "urn:ietf:params:oauth:grant-type:device_code",
                    ],
                  },
                  code: { type: "string" },
                  redirect_uri: { type: "string", format: "uri" },
                  client_id: { type: "string" },
                  client_secret: { type: "string" },
                  code_verifier: { type: "string" },
                  refresh_token: { type: "string" },
                  username: { type: "string" },
                  password: { type: "string" },
                  subject_token: { type: "string" },
                  subject_token_type: { type: "string" },
                  assertion: { type: "string" },
                  resource: { type: "string", format: "uri" },
                  auth_req_id: { type: "string" },
                  device_code: { type: "string" },
                },
                required: ["grant_type"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Token issued successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    access_token: { type: "string" },
                    token_type: { type: "string", enum: ["Bearer"] },
                    expires_in: { type: "integer" },
                    refresh_token: { type: "string" },
                    id_token: { type: "string" },
                    scope: { type: "string" },
                  },
                },
              },
            },
          },
          "400": { description: "Bad request (invalid grant, missing params)" },
          "401": { description: "Unauthorized (invalid client credentials)" },
        },
      },
    },
    "/userinfo": {
      get: {
        summary: "UserInfo endpoint",
        description: "Returns claims about the authenticated end-user. Requires a valid Bearer token.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "User claims",
            content: { "application/json": { schema: { type: "object" } } },
          },
          "401": { description: "Unauthorized" },
        },
      },
      post: {
        summary: "UserInfo endpoint (POST)",
        description: "Returns claims about the authenticated end-user. Token may be in form body or Authorization header.",
        requestBody: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                properties: { access_token: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": { description: "User claims" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/introspection": {
      post: {
        summary: "Authlete-specific token introspection",
        description: "Non-standard token introspection returning Authlete's raw response.",
        requestBody: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                properties: { token: { type: "string" } },
                required: ["token"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Introspection result" },
        },
      },
    },
    "/introspection/standard": {
      post: {
        summary: "RFC 7662 token introspection",
        description: "Standard OAuth 2.0 token introspection as defined in RFC 7662.",
        requestBody: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                properties: { token: { type: "string" } },
                required: ["token"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Introspection result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    active: { type: "boolean" },
                    sub: { type: "string" },
                    scope: { type: "string" },
                    client_id: { type: "string" },
                    token_type: { type: "string" },
                    exp: { type: "integer" },
                    iat: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/revocation": {
      post: {
        summary: "RFC 7009 token revocation",
        description: "Revokes an access or refresh token.",
        requestBody: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                properties: {
                  token: { type: "string" },
                  client_id: { type: "string" },
                  client_secret: { type: "string" },
                },
                required: ["token"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Token revoked" },
        },
      },
    },
    "/session/login": {
      get: {
        summary: "Login form",
        description: "Renders the login page (EJS template).",
        responses: {
          "200": { description: "HTML login form" },
        },
      },
      post: {
        summary: "Submit login",
        description: "Validates username/password and initiates the OAuth session.",
        requestBody: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                properties: {
                  username: { type: "string" },
                  password: { type: "string" },
                  _csrf: { type: "string" },
                },
                required: ["username", "password"],
              },
            },
          },
        },
        responses: {
          "302": { description: "Redirect to consent page or back to client" },
          "401": { description: "Invalid credentials" },
          "429": { description: "Too many login attempts (rate limited)" },
        },
      },
    },
    "/session/consent": {
      get: {
        summary: "Consent form",
        description: "Renders the consent page (EJS template).",
        responses: {
          "200": { description: "HTML consent form" },
        },
      },
      post: {
        summary: "Submit consent decision",
        description: "Approves or denies the OAuth authorization request.",
        requestBody: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                properties: {
                  decision: { type: "string", enum: ["approve", "deny"] },
                  _csrf: { type: "string" },
                },
                required: ["decision"],
              },
            },
          },
        },
        responses: {
          "302": { description: "Redirect with authorization code or error" },
        },
      },
    },
    "/.well-known/openid-configuration": {
      get: {
        summary: "OpenID Connect Discovery",
        description: "Returns the OIDC Discovery document (RFC 8414).",
        responses: {
          "200": {
            description: "Discovery document",
            content: { "application/json": { schema: { type: "object" } } },
          },
        },
      },
    },
    "/.well-known/jwks.json": {
      get: {
        summary: "JWKS endpoint",
        description: "Returns the JSON Web Key Set (RFC 7517).",
        responses: {
          "200": {
            description: "JWK Set",
            content: { "application/json": { schema: { type: "object" } } },
          },
        },
      },
    },
    "/client/dcr/register": {
      post: {
        summary: "Dynamic Client Registration",
        description: "Registers a new OAuth client (RFC 7591). Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        requestBody: {
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          "201": { description: "Client created" },
          "400": { description: "Bad request" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/client/dcr/get": {
      post: {
        summary: "Get registered client",
        description: "Retrieves a client by registration access token (RFC 7592).",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  token: { type: "string" },
                  clientId: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Client details" },
        },
      },
    },
    "/client/dcr/update": {
      post: {
        summary: "Update registered client",
        description: "Updates a client's registration (RFC 7592).",
        requestBody: {
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          "200": { description: "Client updated" },
        },
      },
    },
    "/client/dcr/delete": {
      post: {
        summary: "Delete registered client",
        description: "Deletes a client's registration (RFC 7592).",
        requestBody: {
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          "204": { description: "Client deleted" },
        },
      },
    },
    "/ciba/authentication": {
      post: {
        summary: "CIBA backchannel authentication",
        description:
          "Starts a CIBA authentication request (Client-Initiated Backchannel Authentication).",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  parameters: { type: "string" },
                  clientId: { type: "string" },
                  clientSecret: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Authentication request accepted" },
          "400": { description: "Bad request" },
        },
      },
    },
    "/ciba/issue": {
      post: {
        summary: "Issue CIBA auth_req_id",
        description: "Issues an auth_req_id for a validated CIBA ticket.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { ticket: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": { description: "auth_req_id issued" },
        },
      },
    },
    "/ciba/fail": {
      post: {
        summary: "Fail CIBA request",
        description: "Marks a CIBA authentication request as failed.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ticket: { type: "string" },
                  reason: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "403": { description: "Access denied" },
          "400": { description: "Bad request" },
        },
      },
    },
    "/ciba/complete": {
      post: {
        summary: "Complete CIBA request",
        description: "Completes a CIBA authentication request with end-user result.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ticket: { type: "string" },
                  result: {
                    type: "string",
                    enum: ["AUTHORIZED", "ACCESS_DENIED", "TRANSACTION_FAILED"],
                  },
                  subject: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "CIBA request completed" },
        },
      },
    },
    "/par": {
      post: {
        summary: "Pushed Authorization Request",
        description:
          "Pushes authorization request parameters to a PAR endpoint (RFC 9126). Returns a request_uri for use in /authorization.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  parameters: { type: "string" },
                  clientId: { type: "string" },
                  clientSecret: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "PAR created with request_uri" },
          "400": { description: "Bad request" },
        },
      },
    },
    "/gm/{grantId}": {
      get: {
        summary: "Query grant status",
        description: "Returns the status of a granted authorization (Grant Management API).",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "grantId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Grant details" },
          "404": { description: "Grant not found" },
        },
      },
      delete: {
        summary: "Revoke grant",
        description: "Revokes a granted authorization (Grant Management API).",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "grantId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "204": { description: "Grant revoked" },
          "404": { description: "Grant not found" },
        },
      },
    },
    "/logout": {
      get: {
        summary: "RP-initiated logout",
        description:
          "Initiates RP-initiated logout (OIDC Session Management). Requires client_id and post_logout_redirect_uri.",
        parameters: [
          {
            name: "client_id",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "post_logout_redirect_uri",
            in: "query",
            schema: { type: "string", format: "uri" },
          },
          {
            name: "id_token_hint",
            in: "query",
            schema: { type: "string" },
          },
          {
            name: "backchannel",
            in: "query",
            schema: { type: "string", enum: ["true"] },
            description: "Trigger backchannel logout delivery",
          },
          {
            name: "state",
            in: "query",
            schema: { type: "string" },
          },
        ],
        responses: {
          "302": { description: "Redirect to post_logout_redirect_uri" },
        },
      },
    },
    "/backchannel_logout": {
      post: {
        summary: "Backchannel logout receiver",
        description:
          "Receives incoming backchannel logout tokens from other OPs (OpenID Provider).",
        requestBody: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                properties: {
                  logout_token: { type: "string" },
                },
                required: ["logout_token"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Logout token processed" },
          "400": { description: "Invalid logout token" },
        },
      },
    },
    "/backchannel_logout/issue": {
      post: {
        summary: "Issue backchannel logout token",
        description:
          "Creates a signed logout token for a client. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  clientIdentifier: { type: "string" },
                  subject: { type: "string" },
                  sessionId: { type: "string" },
                },
                required: ["clientIdentifier", "subject"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Logout token issued" },
          "400": { description: "Bad request" },
        },
      },
    },
    "/backchannel_logout/deliver": {
      post: {
        summary: "Issue and deliver logout token",
        description:
          "Issues a logout token and delivers it to a specific client. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  clientIdentifier: { type: "string" },
                  subject: { type: "string" },
                },
                required: ["clientIdentifier", "subject"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Logout token delivered" },
        },
      },
    },
    "/backchannel_logout/deliver-all": {
      post: {
        summary: "Issue and deliver logout tokens to all clients",
        description:
          "Issues and delivers backchannel logout tokens to every client with a backchannel_logout_uri configured. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  subject: { type: "string" },
                },
                required: ["subject"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Logout tokens delivered" },
        },
      },
    },
    "/token/list": {
      get: {
        summary: "List tokens",
        description: "Lists all tokens via Authlete token management. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        responses: {
          "200": {
            description: "Token list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { totalCount: { type: "integer" } },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/token/create": {
      post: {
        summary: "Create token programmatically",
        description: "Creates a new token via Authlete token management. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        requestBody: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                properties: {
                  grantType: { type: "string" },
                  subject: { type: "string" },
                  clientId: { type: "string" },
                  scopes: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Token created" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/token/delete/{accessTokenIdentifier}": {
      delete: {
        summary: "Delete token",
        description: "Deletes a token by its identifier. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        parameters: [
          {
            name: "accessTokenIdentifier",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "204": { description: "Token deleted" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/token/update": {
      patch: {
        summary: "Update token scopes",
        description: "Updates a token's scopes or metadata. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        requestBody: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                properties: {
                  accessToken: { type: "string" },
                  scopes: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Token updated" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/token/revoke": {
      post: {
        summary: "Revoke token via management API",
        description: "Revokes a token using the token management API. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        requestBody: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                properties: { accessTokenIdentifier: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": { description: "Token revoked" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/token/reissue": {
      post: {
        summary: "Reissue ID token",
        description: "Reissues an ID token for an existing session. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  accessToken: { type: "string" },
                  refreshToken: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "ID token reissued" },
          "400": { description: "Bad request" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/token/createLocalToken": {
      get: {
        summary: "Create local JWT",
        description:
          "Creates a locally-signed JWT (development only, no Authlete call).",
        parameters: [
          {
            name: "sub",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "aud",
            in: "query",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Local JWT created" },
          "404": { description: "Not available in production mode" },
        },
      },
    },
    "/metrics": {
      get: {
        summary: "Prometheus metrics",
        description:
          "Returns runtime and HTTP metrics in Prometheus text format.",
        responses: {
          "200": {
            description: "Metrics in text format",
            content: { "text/plain": { schema: { type: "string" } } },
          },
        },
      },
    },
    "/health": {
      get: {
        summary: "Server health",
        description: "Returns basic server health status.",
        responses: {
          "200": {
            description: "Health status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string" },
                    uptime: { type: "number" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/health/all": {
      get: {
        summary: "Aggregate health check",
        description: "Returns combined health status of all dependencies (server, Redis, Authlete).",
        responses: {
          "200": {
            description: "All healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string" },
                    uptime: { type: "number" },
                    timestamp: { type: "string", format: "date-time" },
                    checks: {
                      type: "object",
                      properties: {
                        redis: {
                          type: "object",
                          properties: {
                            healthy: { type: "boolean" },
                            connected: { type: "boolean" },
                            configured: { type: "boolean" },
                          },
                        },
                        authlete: {
                          type: "object",
                          properties: { healthy: { type: "boolean" } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "503": { description: "Degraded (one or more dependencies unhealthy)" },
        },
      },
    },
    "/health/authlete": {
      get: {
        summary: "Authlete connectivity check",
        description:
          "Checks connectivity to Authlete's API. Add ?extended=true for a detailed check.",
        parameters: [
          {
            name: "extended",
            in: "query",
            schema: { type: "string", enum: ["true"] },
          },
        ],
        responses: {
          "200": { description: "Authlete reachable" },
          "502": { description: "Authlete unreachable" },
        },
      },
    },
    "/client/list": {
      get: {
        summary: "List all clients",
        description: "Lists all OAuth clients. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        responses: {
          "200": { description: "Client list" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/client/create": {
      post: {
        summary: "Create client",
        description: "Creates a new OAuth client. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  client: { type: "object" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Client created" },
          "400": { description: "Bad request" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/client/get/{clientId}": {
      get: {
        summary: "Get client",
        description: "Retrieves an OAuth client by ID. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        parameters: [
          {
            name: "clientId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Client details" },
          "401": { description: "Unauthorized" },
          "404": { description: "Client not found" },
        },
      },
    },
    "/client/update/{clientId}": {
      patch: {
        summary: "Update client",
        description: "Updates an OAuth client. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        parameters: [
          {
            name: "clientId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          content: {
            "application/json": { schema: { type: "object" } },
          },
        },
        responses: {
          "200": { description: "Client updated" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/client/delete/{clientId}": {
      delete: {
        summary: "Delete client",
        description: "Deletes an OAuth client. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        parameters: [
          {
            name: "clientId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "204": { description: "Client deleted" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/client/secret/refresh/{clientId}": {
      post: {
        summary: "Refresh client secret",
        description: "Generates a new client secret. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        parameters: [
          {
            name: "clientId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "New client secret" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/client/secret/update/{clientId}": {
      put: {
        summary: "Update client secret",
        description: "Sets a known client secret value. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        parameters: [
          {
            name: "clientId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { clientSecret: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": { description: "Client secret updated" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/device/authorization": {
      post: {
        summary: "Device authorization",
        description: "Initiates the Device Authorization Flow (RFC 8628).",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  parameters: { type: "string" },
                  clientId: { type: "string" },
                  clientSecret: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Device code issued",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    deviceCode: { type: "string" },
                    userCode: { type: "string" },
                    verificationUri: { type: "string" },
                    expiresIn: { type: "integer" },
                    interval: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/device/verification": {
      post: {
        summary: "Verify device user code",
        description: "Verifies a user code from the Device Flow.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { userCode: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": { description: "User code valid" },
          "404": { description: "User code not found" },
        },
      },
    },
    "/device/complete": {
      post: {
        summary: "Complete device authentication",
        description: "Completes device authentication with end-user approval or denial.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  userCode: { type: "string" },
                  decision: { type: "string", enum: ["approve", "deny"] },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Authentication completed" },
          "403": { description: "Access denied" },
          "404": { description: "User code not found" },
        },
      },
    },
    "/vci/metadata": {
      get: {
        summary: "VCI metadata",
        description: "Retrieves Verifiable Credential Issuer metadata. Public endpoint.",
        parameters: [
          {
            name: "pretty",
            in: "query",
            schema: { type: "boolean" },
          },
        ],
        responses: {
          "200": { description: "VCI metadata (parsed responseContent JSON)" },
          "404": { description: "Not found" },
        },
      },
    },
    "/vci/jwtissuer": {
      get: {
        summary: "VCI JWT issuer metadata",
        description: "Retrieves the JWT issuer configuration for VCI. Public endpoint.",
        parameters: [
          {
            name: "pretty",
            in: "query",
            schema: { type: "boolean" },
          },
        ],
        responses: {
          "200": { description: "JWT issuer metadata" },
          "404": { description: "Not found" },
        },
      },
    },
    "/vci/jwks": {
      get: {
        summary: "VCI JWKS",
        description: "Retrieves the JWK Set for VCI. Public endpoint.",
        parameters: [
          {
            name: "pretty",
            in: "query",
            schema: { type: "boolean" },
          },
        ],
        responses: {
          "200": { description: "JWK Set" },
          "404": { description: "Not found" },
        },
      },
    },
    "/vci/offer/create": {
      post: {
        summary: "Create credential offer",
        description: "Creates a credential offer. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  credentialConfigurationIds: {
                    type: "array",
                    items: { type: "string" },
                  },
                  subject: { type: "string" },
                  duration: { type: "number" },
                  acr: { type: "string" },
                  txCode: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Offer created" },
          "400": { description: "Caller error" },
          "403": { description: "Forbidden" },
          "500": { description: "Authlete error" },
        },
      },
    },
    "/vci/offer/info": {
      post: {
        summary: "Get offer information",
        description: "Retrieves information about a credential offer. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  identifier: { type: "string" },
                },
                required: ["identifier"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Offer info" },
          "400": { description: "Caller error" },
          "403": { description: "Forbidden" },
          "404": { description: "Not found" },
          "500": { description: "Authlete error" },
        },
      },
    },
    "/vci/credential/issue": {
      post: {
        summary: "Issue single credential",
        description: "Issues a single credential. Returns 202 for deferred issuance.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  accessToken: { type: "string" },
                  order: { type: "object" },
                },
                required: ["accessToken"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Credential issued" },
          "202": { description: "Accepted (deferred)" },
          "400": { description: "Caller error" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "500": { description: "Internal server error" },
        },
      },
    },
    "/vci/deferred/issue": {
      post: {
        summary: "Issue deferred credential",
        description: "Issues a deferred credential.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  order: { type: "object" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Deferred credential issued" },
          "400": { description: "Caller error" },
          "403": { description: "Forbidden" },
          "500": { description: "Internal server error" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Access token obtained from the token endpoint",
      },
      basicAuth: {
        type: "http",
        scheme: "basic",
        description: "Basic authentication using MGMT_CLIENT_ID / MGMT_CLIENT_SECRET",
      },
    },
  },
};

router.get("/openapi.json", (_req: Request, res: Response) => {
  res.json(spec);
});

export default router;
