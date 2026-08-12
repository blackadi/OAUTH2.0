# Rich Authorization Requests (RAR) — RFC 9396

> **The short version:** RAR replaces flat `scope` strings with structured JSON objects that describe exactly what the client wants to do, on which resources, with what data types — giving users and servers precise visibility into authorization requests.

---

## Table of Contents

- [Part 1: Why RAR Exists](#part-1-why-rar-exists)
- [Part 2: How RAR Works](#part-2-how-rar-works)
- [Part 3: Authlete Setup](#part-3-authlete-setup)
- [Part 4: Step-by-Step Flow](#part-4-step-by-step-flow)
- [Part 5: RAR + PAR](#part-5-rar--par)
- [Part 6: Token & Introspection](#part-6-token--introspection)
- [Part 7: Common RAR Types](#part-7-common-rar-types)
- [Part 8: Troubleshooting](#part-8-troubleshooting)

---

## Part 1: Why RAR Exists

### The Problem: Flat Scopes Aren't Enough

Traditional OAuth scopes are flat strings:

```
scope=payment
```

This tells the server very little. Is the client initiating a payment? Reading transaction history? Both?

```mermaid
%%{init: {'theme': 'dark'}}%%
flowchart LR
    subgraph Scopes["Traditional Scopes"]
        S1["payment"] 
        S2["read"]
        S3["write"]
    end
    subgraph Questions["Unanswered Questions"]
        Q1["Which payment?"]
        Q2["Which account?"]
        Q3["What actions?"]
        Q4["What data?"]
    end
    Scopes --> Questions
```

| Limitation | What Happens |
|-----------|-------------|
| **No structure** | `payment` could mean anything |
| **No granularity** | Either all-or-nothing access |
| **No resource targeting** | Can't specify which account/document |
| **No type safety** | Everyone interprets scope strings differently |
| **Hard to audit** | "scope=payment" tells you nothing |

### The Solution: Structured JSON

RAR replaces flat scopes with typed JSON objects:

```json
[{
  "type": "payment_initiation",
  "actions": ["initiate", "status"],
  "locations": ["https://bank.example.com/payments"],
  "datatypes": ["payment", "transaction"],
  "identifier": "PMT-2026-001"
}]
```

Now the server knows exactly:
- **What type:** Payment initiation
- **What actions:** Initiate and check status (not cancel or refund)
- **Where:** The payments endpoint
- **What data:** Payment and transaction data
- **Which resource:** Specific payment PMT-2026-001

### When to Use RAR

| Scenario | Use RAR? | Why |
|----------|:--------:|-----|
| Payment initiation (PSD2) | **Yes** | Need amount, currency, beneficiary |
| Account information | **Yes** | Need specific data types |
| Document access | **Yes** | Need document type control |
| ID verification (KYC) | **Yes** | Need specific attributes |
| Simple API access | **No** | Standard scopes are enough |

---

## Part 2: How RAR Works

### The authorization_details Structure

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
|-------|:--------:|-------------|
| `type` | ✅ | Type of authorization (e.g., `payment_initiation`) |
| `locations` | ❌ | URIs of target resource servers |
| `actions` | ❌ | Desired actions (e.g., `read`, `write`, `initiate`) |
| `datatypes` | ❌ | Data types being requested |
| `identifier` | ❌ | Specific resource identifier |
| `privileges` | ❌ | Required privileges |

### Complete Flow

```mermaid
%%{init: {'theme': 'dark'}}%%
sequenceDiagram
    participant Client as 🖥️ Client
    participant AuthServer as Auth Server
    participant Authlete
    participant User as 👤 User

    Client->>AuthServer: GET /authorize?<br/>authorization_details=[JSON]
    AuthServer->>Authlete: auth/authorization
    Authlete->>Authlete: Validate RAR types
    Authlete->>AuthServer: Login + consent page
    AuthServer->>User: Shows structured permission cards
    User->>AuthServer: Approve
    AuthServer->>Client: Redirect with code
    Client->>AuthServer: POST /token
    AuthServer->>Authlete: token.process()
    Authlete->>Client: { access_token, authorization_details }
```

### What the User Sees

The consent page renders authorization_details as structured permission cards:

```
┌─────────────────────────────────────────┐
│                                         │
│  ┌─────────────────────┐                │
│  │ payment_initiation  │                │
│  └─────────────────────┘                │
│                                         │
│  Locations:                             │
│  • https://bank.example.com/payments    │
│                                         │
│  Actions:                               │
│  • initiate                             │
│  • status                               │
│                                         │
│  Data Types:                            │
│  • payment                              │
│  • transaction                          │
│                                         │
│  Identifier: PMT-2026-001               │
│                                         │
│  [Approve]  [Deny]                      │
│                                         │
└─────────────────────────────────────────┘
```

---

## Part 3: Authlete Setup

### No Feature Flag Needed

RAR is **enabled by default** in Authlete. No service-level configuration required.

### Client-Level Configuration

Set `authorizationDetailsTypes` on your client to restrict which RAR types are accepted:

**Via Authlete Console:**
1. Navigate to client settings
2. Find `authorizationDetailsTypes` field
3. Enter allowed types (e.g., `payment_initiation account_information`)

**Via DCR:**
```json
{
  "client_name": "My Payment App",
  "grant_types": ["authorization_code"],
  "redirect_uris": ["http://localhost:3001/callback"],
  "authorization_details_types": ["payment_initiation", "account_information"]
}
```

### Validation Rules

| Scenario | Result |
|----------|--------|
| Client has `authorizationDetailsTypes` set | Only those types allowed |
| Client has no `authorizationDetailsTypes` | All service-supported types allowed |
| Requested type not in allowed list | Authlete rejects request |

---

## Part 4: Step-by-Step Flow

### Payment Initiation Example

**Step 1: Construct authorization_details**

```json
[{
  "type": "payment_initiation",
  "actions": ["initiate", "status"],
  "locations": ["https://bank.example.com/payments"],
  "datatypes": ["payment", "transaction"],
  "identifier": "PMT-2026-001"
}]
```

**Step 2: Send authorization request**

```bash
# URL-encode the JSON
AUTH_DETAILS=$(python3 -c "import urllib.parse, json; print(urllib.parse.quote(json.dumps([{'type':'payment_initiation','actions':['initiate','status'],'locations':['https://bank.example.com/payments'],'datatypes':['payment','transaction']}])))")

# Build the URL
AUTH_URL="http://localhost:3000/api/authorization?response_type=code&client_id=YOUR_CID&redirect_uri=http://localhost:3001/callback&scope=openid&state=test&authorization_details=${AUTH_DETAILS}"
```

**Step 3: Open in browser**

The consent page shows the structured permission card.

**Step 4: Approve and get tokens**

```bash
curl -X POST http://localhost:3000/api/token \
  -u "YOUR_CID:YOUR_SEC" \
  -d "grant_type=authorization_code&code=THE_CODE&redirect_uri=http://localhost:3001/callback"
```

**Response:**
```json
{
  "access_token": "at-...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "authorization_details": [{
    "type": "payment_initiation",
    "actions": ["initiate", "status"],
    "locations": ["https://bank.example.com/payments"],
    "datatypes": ["payment", "transaction"]
  }]
}
```

---

## Part 5: RAR + PAR

### The Size Problem

RAR JSON payloads can be large. Browser URLs have ~8KB limits.

| Approach | Max Payload | Issue |
|----------|-------------|-------|
| Direct redirect | ~8KB | Large RAR truncated |
| PAR | No limit | Full payload stored server-side |

### Using PAR with RAR

```bash
# Push large RAR payload via POST
curl -X POST http://localhost:3000/api/par \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": "response_type=code&client_id=YOUR_CID&redirect_uri=http://localhost:3001/callback&scope=openid&authorization_details=[{\"type\":\"payment_initiation\",\"actions\":[\"initiate\",\"status\"]}]",
    "clientId": "YOUR_CID",
    "clientSecret": "YOUR_SEC"
  }'
```

**Response:**
```json
{
  "action": "CREATED",
  "requestUri": "urn:ietf:params:oauth:request_uri:abc123..."
}
```

**Then redirect with just `request_uri`:**
```
http://localhost:3000/api/authorization?client_id=YOUR_CID&request_uri=urn:ietf:params:oauth:request_uri:abc123...
```

---

## Part 6: Token & Introspection

### Token Response

When you exchange the code, Authlete includes `authorization_details`:

```json
{
  "access_token": "at-abc123",
  "token_type": "Bearer",
  "expires_in": 3600,
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
curl -X POST http://localhost:3000/api/introspection \
  -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d "token=YOUR_ACCESS_TOKEN"
```

```json
{
  "active": true,
  "sub": "admin",
  "authorization_details": [{
    "type": "payment_initiation",
    "actions": ["initiate", "status"]
  }]
}
```

Resource servers can enforce fine-grained authorization based on RAR details.

---

## Part 7: Common RAR Types

### Payment Initiation (PSD2)

```json
[{
  "type": "payment_initiation",
  "actions": ["initiate", "status", "cancel"],
  "locations": ["https://bank.example.com/payments"],
  "datatypes": ["payment", "transaction"],
  "identifier": "PMT-2026-001"
}]
```

### Account Information (PSD2)

```json
[{
  "type": "account_information",
  "actions": ["read", "list"],
  "locations": ["https://bank.example.com/accounts"],
  "datatypes": ["balance", "transactions", "standing_orders"],
  "identifier": "ACC-12345"
}]
```

### Document Access (Healthcare)

```json
[{
  "type": "document_access",
  "actions": ["read", "download"],
  "locations": ["https://health.example.com/records"],
  "datatypes": ["lab_results", "medication_history"],
  "identifier": "PAT-67890"
}]
```

### ID Verification (KYC)

```json
[{
  "type": "id_card_verification",
  "actions": ["verify"],
  "datatypes": ["given_name", "family_name", "birthdate", "nationality"]
}]
```

### Combined RAR

You can request multiple types in one request:

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

## Part 8: Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| "Authorization details type not allowed" | Type not in client's `authorizationDetailsTypes` | Update client config in Authlete Console |
| "Missing required parameter: authorization_details" | Invalid JSON or encoding | Ensure valid JSON array, properly URL-encoded |
| RAR not showing on consent page | Session not passing `authorizationDetails` | Check session controller passes to template |
| Token response missing `authorization_details` | Original request didn't include it | Verify `authorization_details` was in authorization request |
| URL too large | RAR payload exceeds ~8KB | Use PAR to push via POST |
| DPoP header missing JWK | DPoP proof missing `jwk` in header | Include full JWK in JOSE header, not just `kid` |

---

## Summary

RAR is simple but powerful:

1. **Client** sends `authorization_details` JSON array
2. **Server** validates types against client config
3. **User** sees structured permission cards on consent page
4. **Tokens** include `authorization_details` for fine-grained access control

**Use RAR when:**
- Payment initiation (PSD2/Open Banking)
- Account information access
- Document access control
- Any fine-grained permission model

**Don't use RAR when:**
- Standard scopes are sufficient
- Simple API access control

---

## References

- [RFC 9396: Rich Authorization Requests](https://www.rfc-editor.org/rfc/rfc9396.html)
- [Authlete KB: RAR](https://kb.authlete.com/en/s/oauth-and-openid-connect/a/rich-authorization-requests)
- [OAuth.net: RAR](https://oauth.net/2/rich-authorization-requests/)
