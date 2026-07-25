import { Router, Request, Response } from "express";

const router = Router();

const spec: Record<string, unknown> = {
  openapi: "3.0.3",
  info: {
    title: "Authlete Node Authorization Server API",
    version: "1.0.0",
    description:
      "OAuth 2.0 / OpenID Connect authorization server built on Authlete. Supports authorization code, client credentials, password (ROPC), refresh token, CIBA, Device Flow, PAR, Token Exchange, JWT Bearer, and more.",
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
        description: "Non-standard token introspection returning Authlete's raw response. Supports RFC 9470 step-up authentication validation via acrValues and maxAge parameters.",
        requestBody: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                properties: {
                  token: { type: "string", description: "The access token to introspect." },
                  scopes: { type: "string", description: "Space-separated list of required scopes." },
                  subject: { type: "string", description: "Required subject (user) for the token." },
                  acrValues: { type: "string", description: "RFC 9470: Space-separated ACR values one of which the token must satisfy." },
                  maxAge: { type: "integer", description: "RFC 9470: Maximum authentication age in seconds." },
                  resources: { type: "string", description: "Space-separated resource indicators." },
                },
                required: ["token"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Introspection result with token metadata including acr, auth_time, and step-up validation." },
          "403": {
            description: "RFC 9470: Insufficient user authentication. Returns acr_values or max_age for the client to use in re-authorization.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string", example: "insufficient_user_authentication" },
                    error_description: { type: "string" },
                    acr_values: { type: "string", description: "Required ACR values for re-authorization." },
                    max_age: { type: "string", description: "Maximum authentication age for re-authorization." },
                    acr: { type: "string", description: "Current ACR of the token." },
                    auth_time: { type: "integer", description: "Current auth_time of the token." },
                  },
                },
              },
            },
          },
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
          "Starts a CIBA authentication request (Client-Initiated Backchannel Authentication, OIDC CIBA Core). The `parameters` field is a URL-encoded string containing the backchannel authentication request (login_hint, scope, client_notification_token, etc.). Client credentials are passed as `clientId`/`clientSecret` in the JSON body.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  parameters: { type: "string", description: "URL-encoded backchannel authentication request parameters" },
                  clientId: { type: "string", description: "Client identifier" },
                  clientSecret: { type: "string", description: "Client secret for authentication" },
                },
                required: ["parameters"],
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
        description: "Marks a CIBA authentication request as failed. The `reason` field describes why the request failed (e.g., TRANSACTION_FAILED, ACCESS_DENIED).",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ticket: { type: "string", description: "Ticket from the authentication endpoint" },
                  reason: { type: "string", description: "Failure reason (e.g. TRANSACTION_FAILED, ACCESS_DENIED)" },
                },
                required: ["ticket", "reason"],
              },
            },
          },
        },
        responses: {
          "403": { description: "Access denied" },
          "400": { description: "Bad request (invalid ticket)" },
          "500": { description: "Server error" },
        },
      },
    },
    "/ciba/complete": {
      post: {
        summary: "Complete CIBA request",
        description: "Completes a CIBA authentication request with end-user result. Requires `subject` to identify the authenticated user.",
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
                  subject: { type: "string", description: "Authenticated user subject" },
                  acr: { type: "string", description: "ACR satisfied during authentication" },
                  authTime: { type: "integer", description: "Authentication time (epoch seconds)" },
                  claims: { type: "string", description: "JSON string of additional claims" },
                },
                required: ["ticket", "result", "subject"],
              },
            },
          },
        },
        responses: {
          "200": { description: "CIBA request completed (poll or notification mode)" },
          "500": { description: "Server error" },
        },
      },
    },
    "/par": {
      post: {
        summary: "Pushed Authorization Request (RFC 9126)",
        description:
          "Pushes authorization request parameters to the PAR endpoint. Returns a `request_uri` for use in `/authorization`. For `CLIENT_SECRET_POST` clients, `client_id` and `client_secret` are merged into the `parameters` string (not sent as separate JSON fields).",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  parameters: { type: "string", description: "URL-encoded authorization request parameters" },
                  clientId: { type: "string", description: "Client ID (merged into parameters for CLIENT_SECRET_POST)" },
                  clientSecret: { type: "string", description: "Client secret (merged into parameters for CLIENT_SECRET_POST)" },
                },
                required: ["parameters"],
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
          "Issues and delivers backchannel logout tokens to every client with a backchannel_logout_uri configured. At least one of `subject` or `sessionId` is required. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  subject: { type: "string", description: "End-user subject to include in logout tokens" },
                  sessionId: { type: "string", description: "Session ID to include in logout tokens" },
                },
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
        description: "Lists all tokens via Authlete token management. Returns paginated results. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        responses: {
          "200": {
            description: "Token list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    totalCount: { type: "integer" },
                    tokens: { type: "array", items: { type: "object" } },
                  },
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
        description: "Creates a new token via Authlete token management. Requires admin Basic auth. The `grantType` uses Authlete enum format (e.g. AUTHORIZATION_CODE, CLIENT_CREDENTIALS).",
        security: [{ basicAuth: [] }],
        requestBody: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                properties: {
                  grantType: { type: "string", description: "Authlete grant type enum (AUTHORIZATION_CODE, CLIENT_CREDENTIALS, PASSWORD, REFRESH_TOKEN, etc.)" },
                  clientId: { type: "integer", description: "Numeric client ID" },
                  subject: { type: "string", description: "End-user subject identifier" },
                  scopes: { type: "string", description: "Space-separated scope values" },
                  accessTokenDuration: { type: "integer", description: "Access token duration in seconds" },
                  refreshTokenDuration: { type: "integer", description: "Refresh token duration in seconds" },
                  accessToken: { type: "string", description: "Pre-defined access token value" },
                  refreshToken: { type: "string", description: "Pre-defined refresh token value" },
                },
                required: ["grantType", "clientId"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Token created" },
          "400": { description: "Bad request (missing required fields)" },
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
        description: "Revokes a token using the Authlete token management API. Accepts multiple identifier fields — at least one is recommended. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        requestBody: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                properties: {
                  accessTokenIdentifier: { type: "string", description: "Access token identifier to revoke" },
                  refreshTokenIdentifier: { type: "string", description: "Refresh token identifier to revoke" },
                  clientIdentifier: { type: "string", description: "Client identifier to scope the revocation" },
                  subject: { type: "string", description: "Subject to scope the revocation" },
                },
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
        description: "Reissues an ID token for an existing session using Authlete's ID Token Reissue API. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  accessToken: { type: "string", description: "Current access token" },
                  refreshToken: { type: "string", description: "Current refresh token" },
                  sub: { type: "string", description: "Subject to override in the reissued ID token" },
                  claims: { type: "string", description: "JSON string of additional claims to embed" },
                  idtHeaderParams: { type: "string", description: "JSON string of additional JOSE header parameters" },
                  idTokenAudType: { type: "string", description: "Audience type for the reissued ID token (string or array)" },
                },
                required: ["accessToken", "refreshToken"],
              },
            },
          },
        },
        responses: {
          "200": { description: "ID token reissued" },
          "400": { description: "Bad request (missing required fields)" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/token/createLocalToken": {
      get: {
        summary: "Create local JWT",
        description:
          "Creates a locally-signed JWT (development only, no Authlete call). Returns the JWT and the public key for verification.",
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
          {
            name: "acr",
            in: "query",
            schema: { type: "string" },
            description: "ACR claim to embed in the JWT",
          },
          {
            name: "authTime",
            in: "query",
            schema: { type: "integer" },
            description: "Authentication time (epoch seconds) to embed as auth_time claim",
          },
        ],
        responses: {
          "200": { description: "Local JWT created with token and publicKey" },
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
        description: "Lists all OAuth clients registered in Authlete. Supports pagination via `start` and `end` query parameters. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        parameters: [
          { name: "start", in: "query", schema: { type: "integer", default: 0 }, description: "Start index for pagination" },
          { name: "end", in: "query", schema: { type: "integer", default: 20 }, description: "End index for pagination" },
          { name: "developer", in: "query", schema: { type: "string" }, description: "Filter by developer name" },
        ],
        responses: {
          "200": { description: "Client list with totalCount and clients array" },
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
    "/client/flag/{clientIdentifier}": {
      patch: {
        summary: "Update client lock flag",
        description: "Updates the lock flag on a client to prevent or allow credential refresh. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        parameters: [
          { name: "clientIdentifier", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { clientLocked: { type: "boolean" } },
                required: ["clientLocked"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Lock flag updated" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/client/secret/refresh/{clientIdentifier}": {
      post: {
        summary: "Refresh client secret",
        description: "Generates a new randomly-generated client secret and deactivates the old one. Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        parameters: [
          { name: "clientIdentifier", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "New client secret returned in responseContent" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/client/secret/update/{clientIdentifier}": {
      put: {
        summary: "Update client secret",
        description: "Sets a known client secret value (replaces the current secret). Requires admin Basic auth.",
        security: [{ basicAuth: [] }],
        parameters: [
          { name: "clientIdentifier", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { clientSecret: { type: "string" } },
                required: ["clientSecret"],
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
    "/client/auth/list/{subject}": {
      get: {
        summary: "List client authorizations for a subject",
        description: "Lists all authorizations granted by a specific end-user. Supports pagination.",
        security: [{ basicAuth: [] }],
        parameters: [
          { name: "subject", in: "path", required: true, schema: { type: "string" } },
          { name: "start", in: "query", schema: { type: "integer", default: 0 } },
          { name: "end", in: "query", schema: { type: "integer", default: 5 } },
          { name: "developer", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Authorization list" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/client/auth/update/{clientId}": {
      post: {
        summary: "Update client authorization",
        description: "Updates a client's authorization for a specific user (e.g., modify granted scopes).",
        security: [{ basicAuth: [] }],
        parameters: [
          { name: "clientId", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  subject: { type: "string" },
                  scopes: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Authorization updated" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/client/auth/delete/{clientId}/{subject}": {
      delete: {
        summary: "Delete client authorization",
        description: "Deletes a client's authorization for a specific user.",
        security: [{ basicAuth: [] }],
        parameters: [
          { name: "clientId", in: "path", required: true, schema: { type: "string" } },
          { name: "subject", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "204": { description: "Authorization deleted" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/client/scopes/granted/{clientId}/{subject}": {
      get: {
        summary: "Get granted scopes",
        description: "Returns the scopes that have been granted to a specific client for a specific user.",
        security: [{ basicAuth: [] }],
        parameters: [
          { name: "clientId", in: "path", required: true, schema: { type: "string" } },
          { name: "subject", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Granted scopes" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/client/scopes/requestable/{clientId}": {
      get: {
        summary: "Get requestable scopes",
        description: "Returns the scopes that a client is allowed to request.",
        security: [{ basicAuth: [] }],
        parameters: [
          { name: "clientId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Requestable scopes" },
          "401": { description: "Unauthorized" },
        },
      },
      put: {
        summary: "Update requestable scopes",
        description: "Sets the scopes that a client is allowed to request.",
        security: [{ basicAuth: [] }],
        parameters: [
          { name: "clientId", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  scopes: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Requestable scopes updated" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/device/authorization": {
      post: {
        summary: "Device authorization",
        description: "Initiates the Device Authorization Flow (RFC 8628). Requires `parameters` as a URL-encoded string containing the device authorization request parameters, plus optional `clientId` and `clientSecret` for client authentication.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  parameters: { type: "string", description: "URL-encoded device authorization request parameters (scope, client_id, etc.)" },
                  clientId: { type: "string" },
                  clientSecret: { type: "string" },
                },
                required: ["parameters"],
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
          "400": { description: "Bad request (missing parameters)" },
          "401": { description: "Unauthorized (invalid client credentials)" },
        },
      },
    },
    "/device/verification": {
      post: {
        summary: "Verify device user code",
        description: "Verifies a user code from the Device Flow. Returns VALID if the code exists and has not expired, NOT_EXIST if not found, EXPIRED if expired.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { userCode: { type: "string" } },
                required: ["userCode"],
              },
            },
          },
        },
        responses: {
          "200": { description: "User code valid" },
          "400": { description: "User code expired" },
          "404": { description: "User code not found" },
        },
      },
    },
    "/device/complete": {
      post: {
        summary: "Complete device authentication",
        description: "Completes device authentication with end-user approval or denial. Requires `subject` to identify the authenticated user.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  userCode: { type: "string" },
                  result: { type: "string", enum: ["SUCCESS", "ACCESS_DENIED", "TRANSACTION_FAILED"] },
                  subject: { type: "string", description: "Authenticated user subject" },
                  acr: { type: "string", description: "ACR satisfied during authentication" },
                  authTime: { type: "integer", description: "Authentication time (epoch seconds)" },
                  claims: { type: "string", description: "JSON string of additional claims" },
                },
                required: ["userCode", "result", "subject"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Authentication completed" },
          "400": { description: "Invalid request or user code expired" },
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
        description: "Creates a new OID4VCI credential offer. Requires admin Basic auth. The `credentialConfigurationIds` field must reference pre-configured credential configurations in Authlete.",
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
                    description: "IDs of credential configurations to offer",
                  },
                  subject: { type: "string", description: "Pre-determined subject for the credential" },
                  duration: { type: "number", description: "Offer duration in seconds" },
                  acr: { type: "string", description: "ACR value for the offer" },
                  txCode: { type: "string", description: "Pre-defined transaction code" },
                  txCodeInputMode: { type: "string", description: "Transaction code input mode (text or numeric)" },
                  txCodeDescription: { type: "string", description: "Description of the transaction code for the user" },
                  authorizationCodeGrantIncluded: { type: "boolean", description: "Include authorization code grant in the offer" },
                  issuerStateIncluded: { type: "boolean", description: "Include issuer state in the offer" },
                  preAuthorizedCodeGrantIncluded: { type: "boolean", description: "Include pre-authorized code grant in the offer" },
                  context: { type: "string", description: "Context string for the offer" },
                  properties: { type: "array", items: { type: "object" }, description: "Additional properties to include" },
                  jwtAtClaims: { type: "string", description: "JSON string of additional JWT access token claims" },
                  authTime: { type: "integer", description: "Authentication time (epoch seconds)" },
                },
                required: ["credentialConfigurationIds"],
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
        description: "Issues a single verifiable credential. Requires a Bearer access token (from the pre-authorized code flow) in the Authorization header, or `accessToken` in the request body. Returns 202 for deferred issuance.",
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
    "/vci/credential/batch": {
      post: {
        summary: "Issue batch credentials",
        description: "Issues multiple verifiable credentials in a single request (OID4VCI §10). Requires a Bearer access token in the Authorization header or `accessToken` in the body.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  accessToken: { type: "string", description: "Access token from pre-authorized code flow" },
                  orders: { type: "array", items: { type: "object" }, description: "Array of credential issuance orders" },
                },
                required: ["accessToken"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Batch credentials issued" },
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
