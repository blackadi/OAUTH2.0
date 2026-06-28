# Component Reference

- [Server Services](#server-services)
- [Server Controllers](#server-controllers)
- [Server Middleware](#server-middleware)
- [React Component Tree](#react-component-tree)
- [React Hooks](#react-hooks)
- [React Services](#react-services)
- [EJS Views](#ejs-views)

---

## Server Services

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#e2e8f0', 'primaryBorderColor': '#475569', 'lineColor': '#475569', 'secondaryColor': '#0f172a', 'tertiaryColor': '#334155', 'fontFamily': 'Inter'}}}%%
flowchart TB
    subgraph OAuth["OAuth Services"]
        AUTH["authorization.service.ts<br/>/auth/authorization + issue + fail"]
        TOKEN["token.service.ts<br/>/auth/token + issue + fail"]
        REVOKE["revocation.service.ts<br/>/auth/revocation"]
        INTRO["introspection.service.ts<br/>/auth/introspection"]
        USERINFO["userinfo.service.ts<br/>/auth/userinfo + issue"]
        LOGIN["login.service.ts<br/>validateUser() against AUTH_USERS"]
    end
    
    subgraph Extension["Extension Services"]
        CIBA_SVC["ciba.service.ts<br/>/ciba/*"]
        DEVICE_SVC["device.service.ts<br/>/device/authorization + verification + complete"]
        DCR_SVC["dcr.service.ts<br/>/dynamicClientRegistration/*"]
        PAR_SVC["par.service.ts<br/>/pushedAuthorization/*"]
        GM_SVC["grant-management.service.ts<br/>/grantManagement/*"]
        JWT_VER["jwt-verification.service.ts<br/>JWT bearer assertion"]
    end
    
    subgraph Admin["Admin Services"]
        CLIENT_MGMT["client.management.service.ts<br/>/client/* CRUD"]
        TOKEN_OPS["token.operations.service.ts<br/>/token/create, list, delete, update"]
        BCL_SVC["backchannel-logout.service.ts<br/>Logout token issue + deliver"]
        TOKEN_SVC["token.service.ts<br/>Also used for issue/fail"]
    end
    
    subgraph Infrastructure["Infrastructure Services"]
        AUTHLETE["authlete.service.ts<br/>SDK wrapper singleton"]
        HEALTH["health.service.ts<br/>Authlete + Redis health checks"]
        METRICS["metrics.service.ts<br/>Prometheus register/collect"]
        DISCOVERY["discovery.service.ts<br/>OIDC discovery document"]
        JWKS["jwks.service.ts<br/>JWKS endpoint (proxy)"]
        CONSENT["consent-store.service.ts<br/>In-memory 24h TTL consent cache"]
        LOGOUT["logout.service.ts<br/>RP-initiated logout"]
    end
    
    TOKEN_OPS --> AUTHLETE
    CLIENT_MGMT --> AUTHLETE
    CIBA_SVC --> AUTHLETE
    DEVICE_SVC --> AUTHLETE
    DCR_SVC --> AUTHLETE
    PAR_SVC --> AUTHLETE
    GM_SVC --> AUTHLETE
    AUTH --> AUTHLETE
    TOKEN --> AUTHLETE
    REVOKE --> AUTHLETE
    INTRO --> AUTHLETE
    USERINFO --> AUTHLETE
    BCL_SVC -->|"fetch()"| AUTHCLOUD["Authlete (raw)"]
    HEALTH -->|"fetch()"| AUTHCLOUD
    JWKS --> AUTHLETE
    
    style AUTHLETE fill:#8b5cf6,color:#fff,stroke:#7c3aed
    style AUTHCLOUD fill:#a78bfa,color:#fff,stroke:#8b5cf6
```

### Service Relationships

| Service | Depends On | Config |
|---------|-----------|--------|
| `authlete.service.ts` | SDK | `AUTHLETE_BEARER_TOKEN`, `AUTHLETE_BASE_URL`, `AUTHLETE_SERVICE_ID` |
| `login.service.ts` | — | `AUTH_USERS` env var (default: `admin:password`) |
| `consent-store.service.ts` | — | In-memory, no config needed |
| `health.service.ts` | `fetch()` | `authleteConfig` (optional constructor param) |
| `backchannel-logout.service.ts` | `fetch()` | `authleteConfig` (optional constructor param) |
| `metrics.service.ts` | `prom-client` | — |
| All others | `authlete.service.ts` | — |

### Constructor Injection Pattern

16 Authlete-dependent services accept `authleteApi` as an optional constructor parameter (defaults to the real SDK singleton). This enables:

```typescript
// Production — uses real SDK
const service = new TokenService();

// Test — inject mock
const mockApi = createMockAuthleteApi();
const service = new TokenService(mockApi);
```

3 services using raw `fetch()` (`health`, `backchannel-logout`, `metrics`) accept their config as an optional constructor parameter.

---

## Server Controllers

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#e2e8f0', 'primaryBorderColor': '#475569', 'lineColor': '#475569', 'secondaryColor': '#0f172a', 'tertiaryColor': '#334155', 'fontFamily': 'Inter'}}}%%
flowchart LR
    subgraph Auth["OAuth"]
        AC["authorization.controller.ts"]
        TC["token.controller.ts"]
        UI["userinfo.controller.ts"]
        IS["introspection.controller.ts"]
        IS_STD["introspection-standard.controller.ts"]
        RC["revocation.controller.ts"]
    end
    
    subgraph Session["Session"]
        SC["session.controller.ts"]
        LC["logout.controller.ts"]
    end
    
    subgraph Extension["Extensions"]
        CIBA["ciba.controller.ts"]
        DC["device.controller.ts"]
        DSC["device-session.controller.ts"]
        DCR["dcr.controller.ts"]
        PC["par.controller.ts"]
        GMC["grant-management.controller.ts"]
    end
    
    subgraph Admin["Admin"]
        CMC["client.management.controller.ts"]
        TMC["token.management.controller.ts"]
        BCLC["backchannel-logout.controller.ts"]
    end
    
    subgraph Infra["Infrastructure"]
        HC["health.controller.ts"]
        DSCV["discovery.controller.ts"]
        JK["jwks.controller.ts"]
        MC["metrics.controller.ts"]-->|"via"| MET["metrics.service.ts"]
        DEF["default.controller.ts"]
    end
    
    subgraph Handlers["Response Handlers"]
        AF["authorization-fail-response.handler.ts"]
        AI["authorization-response.handler.ts"]
        TI["token-issue-response.handler.ts"]
        TF["token-fail-response.handler.ts"]
        TE["token-exchange-response.handler.ts"]
        UII["userinfo-issue-response.handler.ts"]
    end
```

| Controller | Route(s) | Key Logic |
|-----------|----------|-----------|
| `authorization` | `GET/POST /api/authorize` | Action dispatch: LOCATION, FORM, INTERACTION, NO_INTERACTION |
| `token` | `POST /api/token` | Action dispatch: OK, PASSWORD, JWT_BEARER, TOKEN_EXCHANGE, ID_TOKEN_REISSUABLE |
| `session` | `GET/POST /api/session/login`, `GET/POST /api/session/consent` | Login validation, brute-force protection, consent persistence |
| `token.management` | `/api/token/*` | CRUD for tokens via Authlete management API |
| `backchannel-logout` | `/api/backchannel_logout/{issue,deliver,deliver-all}` | Admin Basic auth, raw `fetch()` to Authlete |
| `device` | `/api/device/*` | Device authorization, verification, completion |
| `device-session` | `GET/POST /device` | Browser-based user code entry and consent |
| `health` | `/api/health`, `/api/health/all`, `/api/health/authlete` | Server liveness, aggregate, Authlete-specific |

---

## Server Middleware

| Middleware | File | Purpose |
|-----------|------|---------|
| Security Headers | `app.ts` (inline) | X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS (prod only) |
| CORS | `app.ts` (inline) | Restricts origins to `ALLOWED_ORIGINS` env var |
| Request ID | `app.ts` (inline) | UUID v1 on `req.id` |
| Request Logger | `app.ts` (inline) | Winston child logger on `req.logger` |
| Morgan | `app.ts` (inline) | HTTP access logs via Winston stream |
| Metrics | `src/middleware/metrics.ts` | Prometheus duration histogram + request counter |
| Audit Log | `src/middleware/audit-log.ts` | Winston daily-rotate-file at `logs/audit-*.log`, 90-day retention |
| Body Parsers | `app.ts` (inline) | `urlencoded({ extended: true })` + `json()`, captures `req.rawBody` |
| Cookie Parser | `app.ts` (inline) | `cookie-parser` |
| Session | `src/middleware/session.ts` | `express-session`, 30-min expiry, in-memory or Redis |
| CSRF | `src/middleware/csrf.ts` | 32-byte hex token on GET, validated on POST/PUT/PATCH/DELETE |
| Request Timeout | `src/middleware/request-timeout.ts` | 30s abort on `/api/*` routes |
| Rate Limiting | `src/middleware/rate-limit.ts` | Token (20/min), Auth (60/min), Login (5/min), General (60/min) |
| Error Handler | `src/middleware/errorHandler.ts` | Global catch-all, 500 for unhandled errors |
| `requireBasicAuth` | Inline in controllers | Checks `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` for admin routes |

---

## React Component Tree

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#e2e8f0', 'primaryBorderColor': '#475569', 'lineColor': '#475569', 'secondaryColor': '#0f172a', 'tertiaryColor': '#334155', 'fontFamily': 'Inter'}}}%%
flowchart TB
    APP["App.tsx<br/>Router + TokenProvider"] --> LAYOUT["AppLayout<br/>Header + Sidebar + Content"]
    APP --> ERROR_BOUNDARY["ErrorBoundary"]
    
    LAYOUT --> HEADER["Header (48px)<br/>Logo / Title / Server Status Badge"]
    LAYOUT --> SIDEBAR["Sidebar (56px)<br/>3 Groups, Lucide Icons"]
    LAYOUT --> CONTENT["Section Content Area"]
    LAYOUT --> TOKEN_VAULT["TokenVault<br/>sidebar token display"]
    
    CONTENT --> SECTION_PANEL["SectionPanel<br/>Icon + Header + Body"]
    
    SECTION_PANEL --> OPERATION_DESC["OperationDescription<br/>What this section does"]
    SECTION_PANEL --> FLOW_DIAGRAM["FlowDiagram<br/>Step-by-step progress"]
    SECTION_PANEL --> SPLIT_PANE["SplitPane<br/>Config left / Response right"]
    SECTION_PANEL --> REQUEST_BUILDER["RequestBuilder<br/>HTTP display + cURL copy"]
    SECTION_PANEL --> JSON_BLOCK["JsonBlock<br/>Formatted JSON display"]
    SECTION_PANEL --> HELP_POPOVER["HelpPopover<br/>Contextual help tooltips"]
    
    SECTION_PANEL --- AUTH_SECTION["AuthFlowsSection<br/>All grant types"]
    SECTION_PANEL --- OIDC_SECTIONS["8 OIDC Sections<br/>DCR, CIBA, PAR, Device,<br/>Logout, Discovery,<br/>Backchannel, TokenOps"]
    SECTION_PANEL --- ADMIN_SECTIONS["4 Admin Sections<br/>Token Mgmt, Client Mgmt,<br/>Grant Mgmt, Health"]
    
    subgraph UI_Components["UI Primitives"]
        BTN["Button"]
        INPUT["Input"]
        SELECT["Select"]
        TEXTAREA["Textarea"]
        BADGE["Badge"]
        CARD["Card"]
        TAB_BAR["TabBar"]
        SPINNER["Spinner"]
        SKELETON["Skeleton"]
    end
```

### Component Groups

#### Layout Components (`components/layout/`)
| Component | Purpose |
|-----------|---------|
| `AppLayout.tsx` | Header, sidebar, content area layout with backdrop blur |
| `Sidebar.tsx` | 3-group navigation with lucide icons and active-state shadow |
| `SectionPanel.tsx` | Consistent section wrapper with icon slot |
| `ErrorBoundary.tsx` | React error boundary with retry |
| `AdminAuth.tsx` | Admin authentication wrapper |

#### Auth Components (`components/auth/`)
| Component | Purpose |
|-----------|---------|
| `AuthFlowsSection.tsx` | Interactive OAuth grant flow tester with flow diagram, split pane, and request builder |

#### OIDC Components (`components/oidc/`)
| Component | Section |
|-----------|---------|
| `DcrSection.tsx` | Dynamic Client Registration |
| `CibaSection.tsx` | CIBA Backchannel Authentication |
| `ParSection.tsx` | Pushed Authorization Requests |
| `DeviceSection.tsx` | Device Authorization Flow |
| `LogoutSection.tsx` | RP-Initiated Logout |
| `DiscoverySection.tsx` | OIDC Discovery |
| `BackchannelLogoutSection.tsx` | Backchannel Logout |
| `TokenOpsSection.tsx` | Token Operations |

#### Admin Components (`components/admin/`)
| Component | Section |
|-----------|---------|
| `AdminSection.tsx` | Token Management |
| `ClientManagementSection.tsx` | Client Management |
| `GrantManagementSection.tsx` | Grant Management |
| `HealthSection.tsx` | Health Check |

#### UI Components (`components/ui/`)
| Component | Purpose |
|-----------|---------|
| `Button.tsx` | Styled button with variants |
| `Input.tsx` | Themed text input |
| `Select.tsx` | Styled dropdown |
| `Textarea.tsx` | Themed textarea |
| `Badge.tsx` | Status indicator badge |
| `Card.tsx` | Content card container |
| `TabBar.tsx` | Tab navigation |
| `Spinner.tsx` | Loading spinner |
| `Skeleton.tsx` | Skeleton loader |
| `FlowDiagram.tsx` | Step-by-step numbered progress with arrows |
| `SplitPane.tsx` | Responsive 2-column layout |
| `RequestBuilder.tsx` | HTTP request display with cURL copy |
| `TokenVault.tsx` | Token preview/decode/copy/clear |
| `JsonBlock.tsx` | Formatted JSON panel |
| `HelpPopover.tsx` | Contextual help popup |
| `OperationDescription.tsx` | Section description text block |

---

## React Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useApi` | `hooks/useApi.ts` | Generic API call with loading/error/data states |
| `useAsyncCall` | `hooks/useAsyncCall.ts` | Async function wrapper with state |
| `useClipboard` | `hooks/useClipboard.ts` | Copy-to-clipboard with feedback |
| `useLocalStorage` | `hooks/useLocalStorage.ts` | Persistent state in localStorage |
| `useServerStatus` | `hooks/useServerStatus.ts` | Polls `/api/health` every 30s, returns `{ status, uptime, lastCheck }` |

---

## React Services

All exported from `services/index.ts`:

| Service | File | Endpoints |
|---------|------|-----------|
| `tokenService` | `token.service.ts` | Token requests |
| `adminService` | `admin.service.ts` | Token management admin routes |
| `clientService` | `client.service.ts` | Client CRUD |
| `dcrService` | `dcr.service.ts` | Dynamic client registration |
| `cibaService` | `ciba.service.ts` | CIBA operations |
| `parService` | `par.service.ts` | Pushed authorization requests |
| `deviceService` | `device.service.ts` | Device flow |
| `grantService` | `grant.service.ts` | Grant management |
| `backchannelLogoutService` | `backchannel-logout.service.ts` | Backchannel logout |
| `healthService` | `health.service.ts` | Health checks |

Shared HTTP utilities in `services/http.ts`.

---

## EJS Views

Location: `server/src/views/`

```
src/views/
├── consent.ejs              # OAuth consent form (scopes, client name, client logo)
├── device-verification.ejs  # Device flow user code entry page
├── error.ejs                # Generic error page (status, message, description)
├── index.ejs                # Landing / documentation page
├── login.ejs                # Login form (username, password)
├── logout.ejs               # RP-initiated logout confirmation
├── routes.ejs               # Route documentation table
└── partials/
    ├── footer.ejs           # Common page footer
    ├── head.ejs             # HTML <head> with CSRF meta tag, styles
    ├── routes-table.ejs     # Shared route listing partial
    └── scope-list.ejs       # Shared scope display partial
```

Templates receive `res.locals.csrfToken` (set by CSRF middleware) and render it via `<input type="hidden" name="_csrf" value="<%= csrfToken %>">`.
