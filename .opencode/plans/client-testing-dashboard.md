# Client Testing Dashboard — Implementation Plan

## Goal

Transform the client app from a single-flow demo into a comprehensive GUI testing dashboard that exercises every server endpoint across all OAuth 2.0 grant types, OIDC flows, token management admin ops, and supporting endpoints.

---

## Files to Create

### `client/src/context/TokenContext.tsx`

Global token state via React Context + sessionStorage persistence.

- `TokenSet` interface: `{ access_token?, refresh_token?, id_token?, token_type?, expires_in?, scope? }`
- `TokenProvider` component wrapping the app
- `useToken()` hook exposing: `tokenSet`, `setTokenSet(tokens)`, `clearTokens()`, `getAccessToken()`
- Initializes from `sessionStorage.getItem("token_response")`

### `client/src/components/TokenVault.tsx`

Persistent display of all held tokens at the top of the dashboard.

- Three cards: **Access Token**, **Refresh Token**, **ID Token**
- Each shows truncated value + **Copy** button (`navigator.clipboard.writeText`) + **Decode** button (for ID token: `jwtDecode` from `jwt-decode`, show decoded JSON in a modal/inline block)
- **Clear All** button calls `clearTokens()`
- Grayed-out placeholder cards when no tokens stored

### `client/src/components/AuthFlowsSection.tsx`

Single collapsible card with a radio selector for 4 grant types. Dynamic form below the radio.

#### Authorization Code (PKCE) — redirect-based
- Existing flow from `HomePage.tsx`: generate PKCE, store verifier/state, redirect to `/api/authorization`
- **Note:** This is redirect-based, so the user leaves the SPA. The callback page (`/callback`) restores token into context on return.
- Button: **Start Authorization Code Flow**

#### Client Credentials
- Form fields: `client_id` (text), `client_secret` (password), `scope` (text, default `openid profile email`)
- Calls `POST /api/token` with `grant_type=client_credentials`
- On success: stores tokens via `setTokenSet()`, shows JSON response

#### Password (ROPC)
- Form fields: `username`, `password`, `client_id`, `client_secret`, `scope`
- Calls `POST /api/token` with `grant_type=password`
- On success: stores tokens via `setTokenSet()`, shows JSON response

#### Refresh Token
- Form fields: `refresh_token` (pre-populated from token vault), `client_id`, `client_secret`
- Calls `POST /api/token` with `grant_type=refresh_token`
- On success: stores tokens via `setTokenSet()`, shows JSON response

### `client/src/components/TokenOpsSection.tsx`

Operations that use a Bearer token from the vault.

- Button: **UserInfo** → `GET /api/userinfo` with `Authorization: Bearer <access_token>`
- Button: **Introspect (Authlete)** → `POST /api/introspection` with `token=<access_token>`
- Button: **Introspect (RFC 7662)** → `POST /api/introspection/standard` with `token=<access_token>`
- Button: **Revoke** → `POST /api/revocation` with `token=<access_token>`, `client_id`, `client_secret` form fields
- All buttons show loading state and JSON result below
- Disabled if no access token in vault

### `client/src/components/AdminSection.tsx`

Token management operations protected by Basic Auth.

- **Admin Auth fields** at the top: `client_id` (text), `client_secret` (password) — stored in component state, sent as `Authorization: Basic <base64>` header
- All buttons disabled until admin auth is filled

#### Sub-ops:

| Op | Method | Endpoint | Body / Params |
|---|---|---|---|
| **Create** | POST | `/api/token/create` | `grantType`, `clientId` (from admin auth), `subject`, `scopes`, `accessTokenDuration` |
| **List** | GET | `/api/token/list` | none |
| **Update** | PATCH | `/api/token/update` | `accessToken`, `scopes`, `accessTokenExpiresAt` |
| **Revoke** | POST | `/api/token/revoke` | `accessTokenIdentifier` |
| **Delete** | DELETE | `/api/token/delete/:id` | URL param `accessTokenIdentifier` |
| **Reissue** | POST | `/api/token/reissue` | `accessToken`, `refreshToken` |
| **Local JWT** | GET | `/api/token/createLocalToken` | query: `iss`, `sub`, `aud` |

- Each sub-op has a **form** (expandable inline) with its specific fields
- JSON response displayed below

### `client/src/components/LogoutSection.tsx`

RP-Initiated Logout test.

- Form fields: `id_token_hint` (pre-populated from token vault's `id_token`), `post_logout_redirect_uri` (default `http://localhost:3001`), `state` (auto-generated UUID)
- Button: **RP-Initiated Logout** → navigates to `/api/logout?<params>`
- Note: this navigates away from the SPA. On return, tokens are cleared from context.
- The redirect comes back to the client app, so the callback page should handle it or we just rely on the user navigating back manually.

### `client/src/components/DiscoverySection.tsx`

- Button: **Fetch OpenID Configuration** → `GET /api/.well-known/openid-configuration`
- Button: **Fetch JWKS** → `GET /api/.well-known/jwks.json`
- JSON result displayed below each button

### `client/src/pages/Dashboard.tsx`

Main single-page dashboard that assembles all sections:

```
┌────────────────────────────────────────────┐
│ TokenVault                                   │
├────────────────────────────────────────────┤
│ AuthFlowsSection   [▼]                      │
│ TokenOpsSection    [▼]                      │
│ AdminSection       [▼]                      │
│ LogoutSection      [▼]                      │
│ DiscoverySection   [▼]                      │
└────────────────────────────────────────────┘
```

- Each section is a `<details>`/`<summary>` HTML element for native collapsible behavior (no JS needed)
- `TokenVault` is always visible (not collapsible)

---

## Files to Modify

### `client/src/config.ts` — Add endpoint URLs

Append to existing exports:

```typescript
export const USERINFO_ENDPOINT = `${API_BASE_URL}/api/userinfo`;
export const INTROSPECTION_ENDPOINT = `${API_BASE_URL}/api/introspection`;
export const INTROSPECTION_STANDARD_ENDPOINT = `${API_BASE_URL}/api/introspection/standard`;
export const REVOCATION_ENDPOINT = `${API_BASE_URL}/api/revocation`;
export const LOGOUT_ENDPOINT = `${API_BASE_URL}/api/logout`;
export const DISCOVERY_ENDPOINT = `${API_BASE_URL}/api/.well-known/openid-configuration`;

// Admin / token management
export const TOKEN_CREATE_ENDPOINT = `${API_BASE_URL}/api/token/create`;
export const TOKEN_LIST_ENDPOINT = `${API_BASE_URL}/api/token/list`;
export const TOKEN_UPDATE_ENDPOINT = `${API_BASE_URL}/api/token/update`;
export const TOKEN_REVOKE_ENDPOINT = `${API_BASE_URL}/api/token/revoke`;
export const TOKEN_REISSUE_ENDPOINT = `${API_BASE_URL}/api/token/reissue`;
export const TOKEN_LOCAL_ENDPOINT = `${API_BASE_URL}/api/token/createLocalToken`;
// TOKEN_DELETE uses dynamic :accessTokenIdentifier param
```

### `client/src/services/api.ts` — Add all API methods

Add methods for each endpoint group:

```typescript
class ApiService {
  // Existing:
  async exchangeCodeForToken(tokenRequest): Promise<TokenResponse>

  // New:
  async clientCredentials(clientId, clientSecret, scope): Promise<TokenResponse>
  async passwordGrant(username, password, clientId, clientSecret, scope): Promise<TokenResponse>
  async refreshToken(refreshToken, clientId, clientSecret): Promise<TokenResponse>

  async userInfo(accessToken): Promise<any>
  async introspection(token, accessToken?): Promise<any>
  async introspectionStandard(token): Promise<any>
  async revocation(token, clientId?, clientSecret?): Promise<any>

  async adminCreate(body, auth): Promise<any>
  async adminList(auth): Promise<any>
  async adminUpdate(body, auth): Promise<any>
  async adminRevoke(body, auth): Promise<any>
  async adminDelete(accessTokenIdentifier, auth): Promise<void>
  async adminReissue(body, auth): Promise<any>
  async adminLocalToken(params): Promise<any>

  async logout(params): Promise<void>  // navigates away

  async discovery(): Promise<any>
  async getJwks(): Promise<JwksResponse>  // existing, keep
}
```

Each method:
- Sets `Content-Type: application/x-www-form-urlencoded` for token endpoints
- Sets `Authorization: Basic <base64>` for admin endpoints
- Parses JSON response
- Throws on non-ok status with response text as error message

### `client/src/App.tsx` — Rewrite for dashboard layout

Replace the 2-route SPA:

```tsx
import { TokenProvider } from './context/TokenContext';
import Dashboard from './pages/Dashboard';
import CallbackPage from './pages/CallbackPage';
import { Routes, Route } from 'react-router-dom';

function App() {
  return (
    <TokenProvider>
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header-title">OAuth2/OIDC Testing Dashboard</div>
          <nav>
            <Link to="/">Dashboard</Link>
          </nav>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/callback" element={<CallbackPage />} />
          </Routes>
        </main>
      </div>
    </TokenProvider>
  );
}
```

### `client/src/pages/CallbackPage.tsx` — Update to use TokenContext

Change from local state to `useToken().setTokenSet()`:

- After successful token exchange, call `setTokenSet(body)` instead of `sessionStorage.setItem`
- Show a **Return to Dashboard** link after success
- Keep existing PKCE/state validation logic, error display

### `client/src/pages/HomePage.tsx` — Delete

No longer needed; its functionality is now in `AuthFlowsSection`.

---

## Dependency Graph

```
TokenContext ──┐
               ├── TokenVault
               ├── AuthFlowsSection (writes tokens)
               ├── TokenOpsSection (reads tokens)
               ├── LogoutSection (reads id_token)
               │
config ────────┼── api.ts ──┬── AuthFlowsSection
               │            ├── TokenOpsSection
               │            ├── AdminSection
               │            ├── DiscoverySection
               │            └── CallbackPage
               │
styles.css ────┴── All components
```

## Implementation Order

| Step | File(s) | Reason |
|---|---|---|
| 1 | `TokenContext.tsx` | Foundation — all components depend on it |
| 2 | `config.ts` | Endpoint URLs needed by API service |
| 3 | `api.ts` | All components call API methods |
| 4 | `Dashboard.tsx` + `App.tsx` | Shell layout first |
| 5 | `TokenVault.tsx` | Visible at top of dashboard |
| 6 | `AuthFlowsSection.tsx` | Core testing functionality |
| 7 | `CallbackPage.tsx` | Update to use TokenContext |
| 8 | `TokenOpsSection.tsx` | Uses tokens from vault |
| 9 | `AdminSection.tsx` | Self-contained admin ops |
| 10 | `LogoutSection.tsx` | RP-Initiated Logout test |
| 11 | `DiscoverySection.tsx` | Read-only fetchers |
| 12 | `styles.css` | All new component styles |
| 13 | Delete `HomePage.tsx` | Replaced by AuthFlowsSection |

## Verification

1. `npm --prefix client run build` — TypeScript + Vite build passes
2. `npm --prefix client run dev` — Vite dev server starts on `:3001`
3. Manual test each section in the dashboard
