# Rich Authorization Requests (RAR) — RFC 9396

A comprehensive guide to RAR: what it is, how RFC 9396 works, how Authlete implements it, and how to test it with this server and client.

---

## Table of Contents

- [Part 1: Introduction & Motivation](#part-1-introduction--motivation)
- [Part 2: How RAR Works](#part-2-how-rar-works)
- [Part 3: Authlete RAR Configuration](#part-3-authlete-rar-configuration)
- [Part 4: Step-by-Step RAR Flow](#part-4-step-by-step-rar-flow)
- [Part 5: RAR + PAR (Large Payloads)](#part-5-rar--par-large-payloads)
- [Part 6: Token & Introspection with RAR](#part-6-token--introspection-with-rar)
- [Part 7: SPA Testing Tool Walkthrough](#part-7-spa-testing-tool-walkthrough)
- [Part 8: Common RAR Types](#part-8-common-rar-types)
- [Part 9: RAR + DPoP (FAPI 2.0)](#part-9-rar--dpop-fapi-20)
- [Part 10: Troubleshooting](#part-10-troubleshooting)

---

## Part 1: Introduction & Motivation

### What is RAR?

Rich Authorization Requests (RAR), defined in [RFC 9396](https://www.rfc-editor.org/rfc/rfc9396.html), extend OAuth 2.0 authorization requests with a structured `authorization_details` parameter. Instead of relying solely on coarse-grained scopes (`scope=read write`), RAR lets the client describe *exactly* what it wants to do, on *which* resources, and under *what* constraints — all as a JSON array of typed authorization detail objects.

### Why was RAR created?

Traditional OAuth scopes are flat strings with no structure:

```
scope=payment
```

This tells the authorization server very little. Is the client initiating a payment? Reading transaction history? Both? RAR solves this with structured JSON:

```json
[{
  "type": "payment_initiation",
  "actions": ["initiate", "status"],
  "locations": ["https://bank.example.com/payments"],
  "datatypes": ["payment", "transaction"]
}]
```

| Limitation of Scopes | How RAR Fixes It |
|----------------------|------------------|
| **No structure** — Scopes are flat strings like `read`, `write`, `payment` with no way to specify what resource they apply to | RAR uses typed JSON objects with `locations`, `actions`, `datatypes`, and `identifier` fields |
| **No granularity** — A scope like `payment` is either all-or-nothing; you cannot request only "initiate" without "cancel" | RAR allows listing specific `actions` the client needs (e.g., only `initiate`, not `cancel` or `refund`) |
| **No resource targeting** — Scopes cannot specify which account, document, or resource they apply to | RAR includes `locations` (URIs) and `identifier` fields to target specific resources |
| **No type safety** — Every client and resource server must agree on what a scope string means | RAR's `type` field provides a well-defined namespace, and Authlete validates it against `authorizationDetailsTypes` client metadata |
| **Difficult to audit** — Logging "scope=payment" tells you nothing about what was actually permitted | RAR provides machine-readable structured detail for audit trails |

### When should you use RAR?

- **Payment initiation** (PSD2 / Open Banking) — Describe the payment amount, currency, beneficiary, and account
- **Account information** — Request read access to specific account types (balance, transactions, standing orders)
- **Document access** — Request access to specific document types (medical records, tax documents, contracts)
- **ID card verification** — Request specific identity attributes from a verified ID document
- **Any fine-grained permission model** — Whenever "scope + claim" is not expressive enough for what the client needs

---

## Part 2: How RAR Works

### Architecture

```
┌──────────┐                    ┌──────────────────┐               ┌──────────┐
│          │  1. Auth request   │                  │               │          │
│  Client  │  +authorization    │  Authorization   │  (Authlete    │  Authlete│
│  (SPA)   │  _details (JSON)   │  Server (Express)│   backend)    │   API    │
│          │ ─────────────────→ │                  │ ────────────→ │          │
│          │                    │  (No feature flag│               │          │
│          │  2. Redirect to    │   — RAR is       │               │          │
│  Browser │  login + consent   │   enabled by     │               │          │
│  ───────→│  (shows RAR        │   default)       │               │          │
│  (User   │   details to user) │                  │               │          │
│   Agent) │                    │                  │               │          │
│          │  3. Consent →      │  authorization   │               │          │
│          │  authorization     │  _details passed │               │          │
│          │  code + tokens     │  through to      │               │          │
│          │ ←───────────────── │  token response  │               │          │
│          │                    │  + introspection │               │          │
└──────────┘                    └──────────────────┘               └──────────┘
```

### The authorization_details structure

The `authorization_details` parameter is a JSON array of objects. Each object MUST have a `type` field and MAY include any of these optional fields:

```json
[{
  "type": "example_type",
  "locations": ["https://rs.example.com/resource"],
  "actions": ["read", "write"],
  "datatypes": ["data_type_a", "data_type_b"],
  "identifier": "resource-123",
  "privileges": ["admin"]
}]
```

| Field | Required | Description |
|-------|----------|-------------|
| `type` | **Yes** | Identifies the type of authorization detail (e.g., `payment_initiation`, `account_information`). Validated against the client's `authorizationDetailsTypes` metadata. |
| `locations` | No | Array of URIs identifying the resource servers the request applies to. |
| `actions` | No | Array of strings describing the desired actions (e.g., `read`, `write`, `initiate`, `cancel`). |
| `datatypes` | No | Array of strings identifying the data types being requested (e.g., `balance`, `transactions`, `payment`). |
| `identifier` | No | A string identifying a specific resource. |
| `privileges` | No | Array of strings describing the privileges required (e.g., `admin`, `viewer`). |

### What the user sees

When RAR is used, the consent page displays authorization_details as structured permission cards — each card shows the type badge and its associated locations, actions, data types, identifier, and privileges. This gives the end-user visibility into exactly what they are approving, unlike scopes alone.

---

## Part 3: Authlete RAR Configuration

RAR does NOT require any service-level feature flag in Authlete — it is **enabled by default**. However, you must configure which `type` values your clients are allowed to use.

### Client-level configuration

Set the `authorizationDetailsTypes` field on your client to restrict which RAR types are accepted:

**Authlete Console** (Web UI):
1. Navigate to your client's configuration page
2. Find the `authorizationDetailsTypes` field
3. Enter the allowed types (e.g., `payment_initiation account_information`)

**DCR (Dynamic Client Registration)** — include `authorization_details_types` in the registration metadata:

```json
{
  "client_name": "My Payment App",
  "grant_types": ["authorization_code"],
  "redirect_uris": ["http://localhost:3001/callback"],
  "token_endpoint_auth_method": "client_secret_basic",
  "authorization_details_types": ["payment_initiation", "account_information"]
}
```

**Admin Client Management API** — via the SPA Token Management section, or using curl:

```bash
curl -X POST http://localhost:3000/api/client/create \
  -H "Content-Type: application/json" \
  -d '{
    "clientName": "RAR Test Client",
    "clientType": "CONFIDENTIAL",
    "grantTypes": "AUTHORIZATION_CODE",
    "responseTypes": "code",
    "redirectUris": "http://localhost:3001/callback",
    "tokenAuthMethod": "CLIENT_SECRET_BASIC",
    "authorizationDetailsTypes": "payment_initiation account_information document_access"
  }'
```

### Service-level configuration

Authlete's service configuration has a `supportedAuthorizationDetailsTypes` field that lists all types the service supports. New types can be added in the Authlete Console under Service → Authorization Details Types.

If a client requests a `type` that is not in the client's `authorizationDetailsTypes`, Authlete rejects the request. If the client has no `authorizationDetailsTypes` set, ALL service-supported types are allowed.

---

## Part 4: Step-by-Step RAR Flow

### Prerequisites

1. A client configured with `authorizationDetailsTypes` containing the RAR types you want to test
2. The authorization server running on `http://localhost:3000`
3. The SPA running on `http://localhost:3001`

### Step 1: Construct the authorization_details JSON

For a payment initiation flow:

```json
[{
  "type": "payment_initiation",
  "actions": ["initiate", "status"],
  "locations": ["https://bank.example.com/payments"],
  "datatypes": ["payment", "transaction"],
  "identifier": "PMT-2026-001"
}]
```

For account information access:

```json
[{
  "type": "account_information",
  "actions": ["read"],
  "locations": ["https://bank.example.com/accounts"],
  "datatypes": ["balance", "transactions"]
}]
```

### Step 2: Send the authorization request

**Via the SPA Tool:** Navigate to RAR → paste authorization_details JSON → click "Authorize with RAR".

**Via curl** (directly, without PAR):

```bash
# URL-encode the authorization_details JSON first
AUTH_DETAILS=$(python3 -c "import urllib.parse, json; print(urllib.parse.quote(json.dumps([{'type':'payment_initiation','actions':['initiate','status'],'locations':['https://bank.example.com/payments'],'datatypes':['payment','transaction']}])))")

# Construct the authorization URL
AUTH_URL="http://localhost:3000/api/authorization?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3001/callback&scope=openid&state=test_state&authorization_details=${AUTH_DETAILS}"

echo "Open in browser: $AUTH_URL"
```

**Via curl** (with PAR, better for large RAR):

```bash
# URL-encode the authorization_details into the full parameters string
PARAMS=$(python3 -c "
import urllib.parse, json
params = urllib.parse.urlencode({
    'response_type': 'code',
    'client_id': 'YOUR_CLIENT_ID',
    'redirect_uri': 'http://localhost:3001/callback',
    'scope': 'openid',
    'state': 'test_state',
    'authorization_details': json.dumps([{'type':'payment_initiation','actions':['initiate','status'],'locations':['https://bank.example.com/payments'],'datatypes':['payment','transaction']}])
})
print(params)
")

# Push to PAR endpoint
curl -s -X POST http://localhost:3000/api/par \
  -H "Content-Type: application/json" \
  -d "{\"parameters\": \"$PARAMS\", \"clientId\": \"YOUR_CLIENT_ID\", \"clientSecret\": \"YOUR_CLIENT_SECRET\"}"
```

The PAR response contains a `requestUri`:

```json
{
  "action": "CREATED",
  "requestUri": "urn:ietf:params:oauth:request_uri:abc123...",
  "expiresIn": 600
}
```

### Step 3: Open the authorization URL in your browser

```
http://localhost:3000/api/authorization?client_id=YOUR_CLIENT_ID&request_uri=urn:ietf:params:oauth:request_uri:abc123...
```

Or without PAR:

```
http://localhost:3000/api/authorization?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3001/callback&scope=openid&state=test_state&authorization_details=[...]
```

### Step 4: Log in and review consent

Log in as `admin` / `password`. The consent page shows:

1. **Standard scopes** — Always displayed (e.g., `openid`, `profile`)
2. **Authorization Details** — Each RAR element rendered as a structured card showing:
   - The `type` badge (e.g., `payment_initiation`)
   - Locations (linked resource servers)
   - Actions (what the client will do)
   - Data types (what data it accesses)
   - Identifier (specific resource ID)
   - Privileges (access level)

### Step 5: Approve and get tokens

Click "Approve". The authorization code is returned to your callback URL. Exchange it for tokens using the standard token endpoint.

The token response includes `authorization_details`:

```json
{
  "access_token": "at-...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "rt-...",
  "authorization_details": [{
    "type": "payment_initiation",
    "actions": ["initiate", "status"],
    "locations": ["https://bank.example.com/payments"],
    "datatypes": ["payment", "transaction"],
    "identifier": "PMT-2026-001"
  }]
}
```

---

## Part 5: RAR + PAR (Large Payloads)

RAR authorization_details JSON arrays can become large — especially when requesting access to many resource types or complex payment structures. The browser URL length limit (~8KB for most browsers) makes direct redirect impractical for large payloads.

### Why PAR solves the RAR size problem

| Approach | Max Payload | Issue |
|----------|-------------|-------|
| Direct redirect (`GET /authorize?authorization_details=...`) | ~8KB (browser URL limit) | Large RAR payloads are silently truncated or cause errors |
| PAR (`POST /api/par` then redirect with `request_uri`) | No practical limit | Full payload stored server-side; browser only sees `request_uri` |

### Using PAR with RAR

```bash
# Construct parameters including authorization_details
PARAMS=$(python3 -c "
import urllib.parse, json
rar = json.dumps([{'type':'payment_initiation','actions':['initiate','status']}])
params = urllib.parse.urlencode({
    'response_type': 'code',
    'client_id': 'YOUR_CLIENT_ID',
    'redirect_uri': 'http://localhost:3001/callback',
    'scope': 'openid',
    'state': 'test_state',
    'authorization_details': rar
})
print(params)
")

# Push to PAR endpoint (no URL length issue)
curl -s -X POST http://localhost:3000/api/par \
  -H "Content-Type: application/json" \
  -d "{\"parameters\": \"$PARAMS\"}"
```

**In the SPA Testing Tool:** Check "Use PAR (recommended for large authorization_details payloads)" before clicking "Authorize with RAR".

---

## Part 6: Token & Introspection with RAR

### Token endpoint

When you exchange the authorization code for tokens, Authlete automatically includes `authorization_details` in the token response if they were part of the original authorization request:

```bash
curl -s -X POST http://localhost:3000/api/token \
  -H "Authorization: Basic $(echo -n 'YOUR_CLIENT_ID:YOUR_CLIENT_SECRET' | base64)" \
  -d "grant_type=authorization_code&code=AUTH_CODE&redirect_uri=http://localhost:3001/callback"
```

Response:

```json
{
  "access_token": "at-abc123",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "rt-xyz789",
  "authorization_details": [{
    "type": "payment_initiation",
    "actions": ["initiate", "status"],
    "locations": ["https://bank.example.com/payments"],
    "datatypes": ["payment", "transaction"]
  }]
}
```

### Introspection

Introspecting the token also returns `authorization_details`:

```bash
curl -s -X POST http://localhost:3000/api/introspection \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d "token=YOUR_ACCESS_TOKEN"
```

Response includes:

```json
{
  "active": true,
  "sub": "admin",
  "client_id": 12345,
  "scopes": ["openid"],
  "authorization_details": [{
    "type": "payment_initiation",
    "actions": ["initiate", "status"],
    "locations": ["https://bank.example.com/payments"],
    "datatypes": ["payment", "transaction"]
  }]
}
```

This allows the resource server to enforce fine-grained authorization decisions based on the RAR details rather than just scopes.

---

## Part 7: SPA Testing Tool Walkthrough

The SPA includes a dedicated RAR section for testing authorization_details:

### Opening the RAR Tool

1. Navigate to http://localhost:3001
2. In the sidebar, under "OIDC & Extensions", click "RAR"
3. The tool shows:
   - A JSON textarea pre-filled with an example `payment_initiation` authorization_details array
   - Input fields for Redirect URI, Client ID, Scope, and Client Secret
   - PKCE + State generation button
   - PAR and DPoP toggle checkboxes
   - Authorize button

### Testing a Payment Initiation Flow

1. Leave the default JSON in the textarea:

```json
[{
  "type": "payment_initiation",
  "locations": ["https://bank.example.com/payments"],
  "actions": ["initiate", "status"],
  "datatypes": ["payment", "transaction"],
  "identifier": "PMT-2026-001"
}]
```

2. Enter your Client ID (must have `authorization_details_types` including `payment_initiation`)
3. Click "Generate PKCE + State" to create a secure code challenge
4. Click "Authorize with RAR"
5. Log in as `admin` / `password`
6. Review the consent page — you should see a `payment_initiation` permission card with the locations, actions, and datatypes listed
7. Click "Approve"
8. The callback page exchanges the code for tokens — the token response includes `authorization_details`

### Testing Account Information Access

Replace the RAR JSON with:

```json
[{
  "type": "account_information",
  "actions": ["read"],
  "locations": ["https://bank.example.com/accounts"],
  "datatypes": ["balance", "transactions"]
}]
```

### Previewing RAR in the Consent Page

The RAR section shows a live preview of how the authorization_details will render on the consent page — each type gets its own card with badge and field breakdown. This lets you verify the structure before sending the authorization request.

---

## Part 8: Common RAR Types

### payment_initiation (PSD2 / Open Banking)

```json
[{
  "type": "payment_initiation",
  "actions": ["initiate", "status", "cancel"],
  "locations": ["https://bank.example.com/payments"],
  "datatypes": ["payment", "transaction"],
  "identifier": "PMT-2026-001"
}]
```

Used by payment service providers to initiate payments on behalf of users. The `actions` field controls whether the client can initiate new payments, check status, or cancel pending payments.

### account_information (PSD2 / Open Banking)

```json
[{
  "type": "account_information",
  "actions": ["read", "list"],
  "locations": ["https://bank.example.com/accounts"],
  "datatypes": ["balance", "transactions", "standing_orders"],
  "identifier": "ACC-12345"
}]
```

Used by account information service providers (AISPs) to read account data. The `datatypes` field controls what specific data can be accessed — balance only, or full transaction history.

### document_access (Health / Enterprise)

```json
[{
  "type": "document_access",
  "actions": ["read", "download"],
  "locations": ["https://health.example.com/records"],
  "datatypes": ["lab_results", "medication_history", "radiology"],
  "identifier": "PAT-67890"
}]
```

Used by healthcare applications to access patient records. The `datatypes` field provides fine-grained control over which types of medical documents are accessible.

### id_card_verification (Identity / KYC)

```json
[{
  "type": "id_card_verification",
  "actions": ["verify"],
  "datatypes": ["given_name", "family_name", "birthdate", "nationality"]
}]
```

Used by identity verification services. The `datatypes` field specifies which identity attributes the client can read from the verified identity document.

### Combined RAR (multiple types)

You can request multiple RAR types in a single authorization request:

```json
[
  {
    "type": "account_information",
    "actions": ["read"],
    "locations": ["https://bank.example.com/accounts"],
    "datatypes": ["balance"]
  },
  {
    "type": "payment_initiation",
    "actions": ["initiate"],
    "locations": ["https://bank.example.com/payments"],
    "datatypes": ["payment"]
  }
]
```

---

## Part 9: RAR + DPoP (FAPI 2.0)

RAR works naturally with DPoP (sender-constrained tokens) for FAPI 2.0 compliance. When using PAR + DPoP with RAR:

1. The DPoP proof is sent with the PAR request (as the `DPoP` HTTP header)
2. The PAR response includes a `DPoP-Nonce` header if nonces are required
3. The authorization request stored by PAR includes the `authorization_details`
4. The token request uses DPoP proof for sender-constrained token binding
5. The token response includes both the DPoP-bound access token and `authorization_details`

In the SPA RAR tool, check both "Use PAR" and "Use DPoP" to test this combination.

### Curl example with PAR + DPoP + RAR

```bash
# Generate DPoP key and proof (simplified — use the SPA tool for the full flow)
DPOP_PROOF="eyJ0eXAiOiJkcG9wK2p3dCIsImFsZyI6IkVTMjU2IiwiandrIjp7Imt0eSI6IkVDIiwieCI6Ii4uLiIsInkiOiIuLi4ifX0..."

curl -s -X POST http://localhost:3000/api/par \
  -H "Content-Type: application/json" \
  -H "DPoP: $DPOP_PROOF" \
  -d '{
    "parameters": "response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3001/callback&scope=openid&authorization_details=[{\"type\":\"payment_initiation\",\"actions\":[\"initiate\"]}]",
    "clientId": "YOUR_CLIENT_ID"
  }'
```

---

## Part 10: Troubleshooting

### "The authorization details type is not allowed."

Authlete rejects requests with RAR types not in the client's `authorizationDetailsTypes`.

**Fix:** Update the client's `authorizationDetailsTypes` in the Authlete Console or via the SPA Client Management section to include the requested type.

### "Missing required parameter: authorization_details"

You sent `authorization_details` but Authlete could not parse it.

**Fix:** Ensure the value is a valid JSON array string. In URL-encoded parameters, it must be properly URL-encoded. The JSON array must be valid — check for trailing commas, missing quotes, etc.

### RAR details not showing on consent page

The consent page does not render authorization_details.

**Fix (this server):** The `session.controller.ts` `showConsent` handler must pass `authorizationDetails` from the session to the template. Verify the variable is being extracted:

```typescript
const { clientName = "", redirectUri = "", authorizationIssueRequest: { scopes = [], authorizationDetails } = {} } =
  req.session.authorization || {};
res.render("consent", { clientName, scopes, redirectUri, authorizationDetails });
```

### Token response missing authorization_details

If the token response does not include `authorization_details`, one of these may be the issue:

1. The original authorization request did not include `authorization_details` — verify it was present in the parameters
2. The client does not have the RAR type in its `authorizationDetailsTypes` — Authlete may have silently dropped it
3. You are using the refresh token grant — `authorization_details` are preserved from the original grant but may not appear if the client is not configured correctly

### authorization_details is too large for browser URL

RAR payloads exceeding ~8KB will fail in a direct browser redirect.

**Fix:** Use PAR to push the authorization request (including `authorization_details`) via POST, then redirect using only `request_uri`. In the SPA RAR tool, enable "Use PAR".

### "The DPoP header did not include a public key in JWK format."

When using DPoP with PAR + RAR, the DPoP proof JWT header must include the `jwk` member with the public key. The `kid` alone is not sufficient.

**Fix:** Ensure your DPoP proof generation includes the full JWK in the JOSE header, not just a key ID.

---

## References

- [RFC 9396: Rich Authorization Requests](https://www.rfc-editor.org/rfc/rfc9396.html)
- [Authlete KB: Rich Authorization Requests](https://kb.authlete.com/en/s/oauth-and-openid-connect/a/rich-authorization-requests)
- [OAuth.net: Rich Authorization Requests](https://oauth.net/2/rich-authorization-requests/)
- [RFC 9126: Pushed Authorization Requests](https://www.rfc-editor.org/rfc/rfc9126.html)
- [RFC 9449: OAuth 2.0 DPoP](https://www.rfc-editor.org/rfc/rfc9449.html)
- [FAPI 2.0 Security Profile](https://openid.net/specs/fapi-2_0-security-profile.html)
- [PAR Tutorial](./PAR-TUTORIAL.md)
- [FAPI Tutorial](./FAPI-TUTORIAL.md)
