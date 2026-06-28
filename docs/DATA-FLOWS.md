# Data Flows

- [Authorization Code Flow](#authorization-code-flow)
- [Token Request Variations](#token-request-variations)
- [Logout Flow](#logout-flow)
- [CIBA Flow](#ciba-flow)
- [Device Flow](#device-flow)
- [Backchannel Logout](#backchannel-logout)
- [Grant Management](#grant-management)
- [Dynamic Client Registration](#dynamic-client-registration)
- [Pushed Authorization Requests (PAR)](#pushed-authorization-requests)
- [Token Exchange](#token-exchange)

---

## Authorization Code Flow

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#e2e8f0', 'primaryBorderColor': '#475569', 'lineColor': '#6366f1', 'secondaryColor': '#0f172a', 'tertiaryColor': '#334155', 'fontFamily': 'Inter'}}}%%
sequenceDiagram
    participant U as User (Browser)
    participant AS as Authorization Server
    participant LOGIN as Login Page (EJS)
    participant CONSENT as Consent Page (EJS)
    participant AL as Authlete Cloud
    
    Note over U,AL: Step 1 — Authorization Request
    U->>AS: GET /api/authorization?response_type=code&client_id=...&scope=...
    AS->>AL: /auth/authorization API (SDK)
    AL-->>AS: action=INTERACTION, client info, scopes
    AS->>U: Redirect to /api/session/login (302)
    
    Note over U,AL: Step 2 — Authentication
    U->>LOGIN: GET /api/session/login (CSRF token generated)
    LOGIN-->>U: Login form (EJS) with _csrf hidden input
    U->>LOGIN: POST /api/session/login (username, password, _csrf)
    LOGIN->>AS: Validate credentials (AUTH_USERS / default admin:password)
    AS->>U: Set session user, redirect to consent
    
    Note over U,AL: Step 3 — Consent
    U->>CONSENT: GET /api/session/consent (CSRF token generated)
    CONSENT-->>U: Consent form showing scopes, client name
    U->>CONSENT: POST /api/session/consent (approve/deny, _csrf)
    AS->>AL: /auth/authorization/issue API (SDK)
    AL-->>AS: action=LOCATION, authorization code in redirect_uri
    AS->>U: 302 Redirect with ?code=abc123
    
    Note over U,AL: Step 4 — Token Exchange
    U->>AS: POST /api/token (grant_type=authorization_code, code, redirect_uri)
    AS->>AL: /auth/token API (SDK)
    AL-->>AS: action=OK, access_token, refresh_token, id_token
    AS-->>U: 200 { access_token, refresh_token, id_token, expires_in }
```

### Key Behaviors

| Aspect | Detail |
|--------|--------|
| Authorization entry | Accepts `GET` with query params |
| Authentication | Server-side form against `AUTH_USERS` env var (defaults to `admin:password`) |
| Session storage | Authorization context saved in `req.session.authorization` between redirects |
| Consent persistence | `consent-store.service.ts` stores `{clientId}:{subject}` → scopes with 24h TTL |
| `prompt=none` | Auto-issues if user has valid session + persistent consent covers requested scopes; otherwise returns `CONSENT_REQUIRED` error |
| `prompt=consent` | Always shows consent form, bypassing stored consent |
| Fail responses | Various error reasons mapped via `sendAuthorizationFailResponse` |

---

## Token Request Variations

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#e2e8f0', 'primaryBorderColor': '#475569', 'lineColor': '#475569', 'secondaryColor': '#0f172a', 'tertiaryColor': '#334155', 'fontFamily': 'Inter'}}}%%
flowchart TD
    REQ["Token Request"] --> VALIDATE["Validate params"]
    VALIDATE -->|Invalid| 400["400 invalid_request"]
    VALIDATE -->|Valid| SDK["Authlete /auth/token API"]
    
    SDK -->|action: OK| OK["200 - access_token in responseContent"]
    SDK -->|action: BAD_REQUEST| BAD["400 - responseContent"]
    SDK -->|action: INVALID_CLIENT| IC{"Basic auth in request?"}
    IC -->|Yes| 401["401 + WWW-Authenticate"]
    IC -->|No| 400B["400 - responseContent"]
    SDK -->|action: PASSWORD| PW["ROPC flow"]
    SDK -->|action: JWT_BEARER| JWT["JWT assertion flow"]
    SDK -->|action: TOKEN_EXCHANGE| TE["Token exchange flow"]
    SDK -->|action: ID_TOKEN_REISSUABLE| IDT["ID token reissuance"]
    SDK -->|action: INTERNAL_SERVER_ERROR| ISE["500"]
    
    PW --> VAL["Validate user creds"]
    VAL -->|Success| ISSUE["/auth/token/issue"]
    VAL -->|Fail| FAIL["/auth/token/fail"]
    
    IDT --> IDT_ISSUE["/auth/token/issue with ticket + subject"]
    
    style REQ fill:#3b82f6,color:#fff
    style OK fill:#10b981,color:#fff
    style BAD fill:#f59e0b,color:#fff
    style 401 fill:#ef4444,color:#fff
    style 400B fill:#f59e0b,color:#fff
    style ISE fill:#ef4444,color:#fff
```

### Supported Grant Types

| Grant Type | Route | Behavior |
|-----------|-------|----------|
| `authorization_code` | `/api/token` | Standard auth code exchange |
| `client_credentials` | `/api/token` | Client auth only, no user |
| `refresh_token` | `/api/token` | Refresh access token (no rotation, idempotent) |
| `password` | `/api/token` | ROPC — validates locally then calls `/issue` or `/fail` |
| `urn:ietf:params:oauth:grant-type:token-exchange` | `/api/token` | Token exchange delegation |
| `urn:openid:params:grant-type:ciba` | `/api/token` | CIBA polling (Authlete native) |
| `urn:ietf:params:oauth:grant-type:device_code` | `/api/token` | Device code polling (Authlete native) |
| `urn:ietf:params:oauth:grant-type:jwt-bearer` | `/api/token` | JWT bearer assertion grant |

### ROPC Flow Detail

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#e2e8f0', 'primaryBorderColor': '#475569', 'lineColor': '#6366f1', 'secondaryColor': '#0f172a', 'tertiaryColor': '#334155', 'fontFamily': 'Inter'}}}%%
sequenceDiagram
    participant C as Client
    participant AS as Auth Server
    participant AL as Authlete
    
    C->>AS: POST /api/token (grant_type=password, username, password)
    AS->>AL: /auth/token API
    AL-->>AS: action=PASSWORD, ticket, username, password
    
    AS->>AS: loginService.validateUser(username, password)
    alt Valid credentials
        AS->>AL: /auth/token/issue (ticket, subject)
        AL-->>AS: access_token, refresh_token, etc.
        AS-->>C: 200 OK
    else Invalid credentials
        AS->>AL: /auth/token/fail (ticket, reason=INVALID_RESOURCE_OWNER_CREDENTIALS)
        AL-->>AS: fail response
        AS-->>C: Error response
    end
```

---

## Logout Flow

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#e2e8f0', 'primaryBorderColor': '#475569', 'lineColor': '#6366f1', 'secondaryColor': '#0f172a', 'tertiaryColor': '#334155', 'fontFamily': 'Inter'}}}%%
sequenceDiagram
    participant U as User
    participant AS as Auth Server
    participant AL as Authlete
    
    U->>AS: GET /api/logout?post_logout_redirect_uri=...&id_token_hint=...&client_id=...&state=...&backchannel=...
    AS->>AS: Validate post_logout_redirect_uri against ALLOWED_ORIGINS, LOGOUT_REDIRECT_URI, and localhost
    
    alt Valid redirect
        AS->>U: Show logout confirmation page (EJS)
        U->>AS: POST /api/logout (confirmed)
        AS->>AS: Destroy session
        AS->>U: 302 Redirect to post_logout_redirect_uri
    else Invalid redirect
        AS-->>U: 400 "Invalid post_logout_redirect_uri"
    end
```

### Backchannel Logout (Receiving)

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#e2e8f0', 'primaryBorderColor': '#475569', 'lineColor': '#6366f1', 'secondaryColor': '#0f172a', 'tertiaryColor': '#334155', 'fontFamily': 'Inter'}}}%%
sequenceDiagram
    participant OP as Other OP
    participant AS as Auth Server
    
    OP->>AS: POST /api/backchannel_logout (logout_token)
    AS->>AS: Decode JWT (no verify yet)
    AS->>AS: Check for backchannel-logout event claim
    AS->>AS: Fetch JWKS from configured JWKS_URI
    AS->>AS: Verify JWT signature (RS256/ES256)
    
    alt Valid token
        AS->>AS: Destroy session for subject (payload.sub)
        AS-->>OP: 200 OK
    else Invalid token
        AS-->>OP: 400 "Invalid logout token"
    end
```

---

## CIBA Flow

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#e2e8f0', 'primaryBorderColor': '#475569', 'lineColor': '#6366f1', 'secondaryColor': '#0f172a', 'tertiaryColor': '#334155', 'fontFamily': 'Inter'}}}%%
sequenceDiagram
    participant C as Client
    participant AS as Auth Server
    participant AL as Authlete
    participant U as User Device
    
    Note over C,AL: Authentication Request
    C->>AS: POST /api/ciba/authentication (parameters, clientId, clientSecret)
    AS->>AL: /ciba/backchannel-authentication (SDK)
    AL-->>AS: action=USER_IDENTIFICATION
    AS-->>C: 200 { ticket, hintType, hint, deliveryMode }
    
    Note over C,AL: User Authentication (out-of-band)
    C->>U: Custom method (polling, push, or ping)
    U-->>C: User authenticates on their device
    
    Note over C,AL: Token Issuance
    C->>AS: POST /api/ciba/issue (ticket)
    AS->>AL: /ciba/issue (SDK)
    AL-->>AS: action=OK
    AS-->>C: 200 { authReqId, expiresIn, interval }
    
    Note over C,AL: Polling (Client retrieves token)
    C->>AS: POST /api/token (grant_type=urn:openid:params:grant-type:ciba)
```

| Endpoint | Purpose |
|----------|---------|
| `POST /api/ciba/authentication` | Initiate CIBA authentication; returns ticket |
| `POST /api/ciba/issue` | Issue token after user authentication |
| `POST /api/ciba/fail` | Fail authentication (ticket + reason) |
| `POST /api/ciba/complete` | Complete auth (ticket + result + subject) |
| `POST /api/token` | Poll for token (Authlete native support) |

---

## Device Flow

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#e2e8f0', 'primaryBorderColor': '#475569', 'lineColor': '#6366f1', 'secondaryColor': '#0f172a', 'tertiaryColor': '#334155', 'fontFamily': 'Inter'}}}%%
sequenceDiagram
    participant D as Device (Client)
    participant AS as Auth Server
    participant U as User (Browser)
    participant AL as Authlete
    
    Note over D,AL: Device Authorization
    D->>AS: POST /api/device/authorization (parameters, clientId, clientSecret)
    AS->>AL: /device/authorization (SDK)
    AL-->>AS: device_code, user_code, verification_uri, expires_in, interval
    AS-->>D: 200 { device_code, user_code, verification_uri, ... }
    
    Note over D,AL: User Verification (browser)
    U->>U: Opens verification_uri in browser
    U->>AS: GET /device (shows form)
    U->>AS: POST /api/device/verification (user_code)
    AS->>AL: /device/verification (SDK)
    AL-->>AS: action=VALID, client info, scopes
    AS->>U: Consent form (if needed)
    
    Note over D,AL: Token Completion
    U->>AS: POST /device/consent (approve)
    AS->>AL: /device/complete (SDK)
    AL-->>AS: action=SUCCESS
    
    Note over D,AL: Device Polls for Token
    loop Every `interval` seconds
        D->>AS: POST /api/token (grant_type=device_code, code=device_code)
    end
    
    AS->>AL: /auth/token API
    AL-->>AS: OK (or BAD_REQUEST if pending)
    AS-->>D: 200 { access_token } or 400 { authorization_pending }
```

| Endpoint | Purpose |
|----------|---------|
| `POST /api/device/authorization` | Start device flow; returns device_code, user_code |
| `POST /api/device/verification` | Verify user_code entered by user |
| `POST /api/device/complete` | Complete verification (approve/deny) |
| `GET /device` | Browser form for user_code entry |
| `POST /device/consent` | Browser-based consent after code entry |
| `POST /api/token` | Poll for token (Authlete native) |

---

## Backchannel Logout (Server-Initiated)

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#e2e8f0', 'primaryBorderColor': '#475569', 'lineColor': '#6366f1', 'secondaryColor': '#0f172a', 'tertiaryColor': '#334155', 'fontFamily': 'Inter'}}}%%
sequenceDiagram
    participant Admin as Admin Client
    participant AS as Auth Server
    participant AL as Authlete
    participant RP as Relying Party
    
    Note over Admin,RP: Issue Logout Token
    Admin->>AS: POST /api/backchannel_logout/issue (Basic auth, clientIdentifier, subject)
    AS->>AL: Create logout token (via Authlete)
    AS-->>Admin: 200 { expiresIn, logoutToken }
    
    Note over Admin,RP: Deliver to Specific Client
    Admin->>AS: POST /api/backchannel_logout/deliver (Basic auth, clientIdentifier, subject)
    AS->>AS: Issue token + HTTP POST to client's backchannel_logout_uri
    AS-->>Admin: 200 { success: true }
    
    Note over Admin,RP: Deliver to All Clients
    Admin->>AS: POST /api/backchannel_logout/deliver-all (Basic auth, subject)
    AS->>AS: Deliver to all registered clients' backchannel_logout_uri
    AS-->>Admin: 200 [{ clientId, success, ... }, ...]
```

All three endpoints require admin Basic auth (`MGMT_CLIENT_ID` / `MGMT_CLIENT_SECRET`). The `issue` endpoint creates a logout token (calls Authlete's backchannel logout API). The `deliver` endpoint creates and delivers. The `deliver-all` endpoint broadcasts to all clients with a `backchannel_logout_uri` configured.

---

## Grant Management

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#e2e8f0', 'primaryBorderColor': '#475569', 'lineColor': '#6366f1', 'secondaryColor': '#0f172a', 'tertiaryColor': '#334155', 'fontFamily': 'Inter'}}}%%
sequenceDiagram
    participant C as Client
    participant AS as Auth Server
    participant AL as Authlete
    
    Note over C,AL: Query Grant
    C->>AS: GET /api/gm/:grantId (Authorization: Bearer token)
    AS->>AL: /grantManagement/process (SDK)
    AL-->>AS: Grant details (client, scopes, subject, etc.)
    AS-->>C: 200 { grant details }
    
    Note over C,AL: Revoke Grant
    C->>AS: DELETE /api/gm/:grantId (Authorization: Bearer token)
    AS->>AL: /grantManagement/process (SDK)
    AL-->>AS: Revocation confirmation
    AS-->>C: 204 No Content
```

---

## Dynamic Client Registration

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#e2e8f0', 'primaryBorderColor': '#475569', 'lineColor': '#6366f1', 'secondaryColor': '#0f172a', 'tertiaryColor': '#334155', 'fontFamily': 'Inter'}}}%%
sequenceDiagram
    participant C as Client Application
    participant AS as Auth Server
    participant AL as Authlete
    
    Note over C,AL: Register Client
    C->>AS: POST /api/client/dcr/register (Basic auth, client metadata)
    AS->>AL: /dynamicClientRegistration/register (SDK)
    AL-->>AS: action=CREATED, client_id, client_secret
    AS-->>C: 201 { client_id, client_secret, ... }
    
    Note over C,AL: Get Client
    C->>AS: POST /api/client/dcr/get (registration_access_token in body)
    AS->>AL: /dynamicClientRegistration/get (SDK)
    AL-->>AS: action=OK, client details
    AS-->>C: 200 { client metadata }
    
    Note over C,AL: Update Client
    C->>AS: POST /api/client/dcr/update (registration_access_token, new metadata)
    AS->>AL: /dynamicClientRegistration/update (SDK)
    AL-->>AS: action=UPDATED, updated client
    AS-->>C: 200 { updated client }
    
    Note over C,AL: Delete Client
    C->>AS: POST /api/client/dcr/delete (registration_access_token)
    AS->>AL: /dynamicClientRegistration/delete (SDK)
    AL-->>AS: action=DELETED
    AS-->>C: 204 No Content
```

### Action → HTTP Status Mapping

| Authlete Action | HTTP Status |
|----------------|-------------|
| `CREATED` | 201 |
| `OK` / `UPDATED` | 200 |
| `DELETED` | 204 |
| `BAD_REQUEST` | 400 |
| `UNAUTHORIZED` | 401 |
| `INTERNAL_SERVER_ERROR` | 500 |

- `register` requires admin Basic auth (`MGMT_CLIENT_ID` / `MGMT_CLIENT_SECRET`)
- `get` / `update` / `delete` use the registration access token from the request body

---

## Pushed Authorization Requests

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#e2e8f0', 'primaryBorderColor': '#475569', 'lineColor': '#6366f1', 'secondaryColor': '#0f172a', 'tertiaryColor': '#334155', 'fontFamily': 'Inter'}}}%%
sequenceDiagram
    participant C as Client
    participant AS as Auth Server
    participant AL as Authlete
    
    Note over C,AL: Push Authorization Request
    C->>AS: POST /api/par (parameters, clientId, clientSecret)
    AS->>AL: pushedAuthorization.create (SDK)
    AL-->>AS: action=CREATED, request_uri, expires_in
    
    Note over C,AL: Use Request URI
    AS-->>C: 201 { request_uri, expires_in }
    C->>C: Construct authorize URL with request_uri
    C->>AS: GET /api/authorize?client_id=...&request_uri=...
```

PAR accepts `parameters` (URL-encoded OAuth params), `clientId`, `clientSecret` in JSON body. No admin auth required — client authentication is via the body fields. The `request_uri` is a one-time use reference to the pushed authorization payload stored by Authlete.

---

## Token Exchange

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#e2e8f0', 'primaryBorderColor': '#475569', 'lineColor': '#6366f1', 'secondaryColor': '#0f172a', 'tertiaryColor': '#334155', 'fontFamily': 'Inter'}}}%%
sequenceDiagram
    participant C as Client
    participant AS as Auth Server
    participant TM as Token Management API
    participant AL as Authlete
    
    C->>AS: POST /api/token (grant_type=token-exchange, subject_token, ...)
    AS->>AL: /auth/token API
    AL-->>AS: action=TOKEN_EXCHANGE
    
    Note over AS,TM: Create Exchanged Token
    AS->>TM: Token management API
    
    alt Success
        AS-->>C: 200 { access_token, issued_token_type, ... }
    else Failure
        AS-->>C: Error response
    end
```
