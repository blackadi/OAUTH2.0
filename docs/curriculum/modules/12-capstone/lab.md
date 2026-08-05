# Module 12 — Capstone Lab

Two parts. **Do Part A completely before reading Part B.** Part B shows you defects, and once seen you cannot
design as if you had not seen them — which destroys the only measurement of your own blind spots you will get.

---

# Part A — Design

## The brief: Aurora

**Aurora** is a multi-tenant clinical data platform, sold to hospitals. You are the security architect and you
own the authorization design.

### Tenants and users

- **Tenants** are hospitals. Around 400 today, target 3,000. Each has 50–8,000 clinician accounts.
- **Users** are clinicians, administrators, and patients. Patients see only their own record; clinicians see
  patients within their ward; administrators manage users within their own tenant only.
- Hospitals insist on their own identity provider. Most run Entra ID or Okta; a few run something ancient.

### Clients

| Client | Notes |
|---|---|
| **Aurora Web** | First-party SPA, browser-based, used by clinicians all day |
| **Aurora Mobile** | First-party native app, iOS and Android, used at the bedside |
| **Partner integrations** | Third-party server-side systems — labs, imaging, billing. ~60 organisations, onboarding continuously |
| **Aurora Sync** | A background service that reconciles records nightly. No user present |

### APIs, by tier

| Tier | Examples | Notes |
|---|---|---|
| **Tier 1 — clinical** | Patient records, prescriptions | Highest value. Some operations (prescribing controlled drugs) need stronger authentication than a normal login |
| **Tier 2 — operational** | Scheduling, staffing, messaging | Moderate |
| **Tier 3 — reference** | Drug directory, ICD codes | Public within the platform; no patient data |

### Constraints, all non-negotiable

1. A regulator requires that **a patient can withdraw consent for a partner integration at any time, and
   access must demonstrably stop.** You will be asked for the guaranteed window.
2. **Every access to a Tier 1 record must be attributable** to a named human, including when a partner
   system made the call on their behalf.
3. Partner organisations must onboard **without a human at Aurora configuring anything per partner.**
4. Some hospitals operate on **intermittent connectivity** — ward tablets lose the network for minutes.
5. A national programme is piloting **clinician credentials issued by a medical council**, which Aurora must
   eventually accept from clinicians it has no prior relationship with.

### Your deliverable

An architecture document making and defending the **nine decisions** listed in the
[README](README.md#part-a--design). For each: what you chose, what you rejected, and which attacker
capability the choice defeats.

Three deliberate tensions are built into the brief. A strong answer names them and says how it resolved
each — a weaker one silently picks a side:

- **Constraint 4 (intermittent connectivity) versus constraint 1 (demonstrable revocation).** Offline
  validation and instant revocation are in direct opposition. Module 04 framed this exact trade-off.
- **Constraint 3 (self-service onboarding) versus strong client authentication.** Something has to establish
  trust in a partner you have never met.
- **Constraint 2 (attributability) versus the convenience of service accounts.** Module 06's
  impersonation-versus-delegation distinction is the whole answer.

Write it now. Do not read on until you have.

---
---

# Part B — Adversarial review

Below is a real-shaped architecture document for a competitor, **Meridian Health**, solving the same brief.
It was leaked to you, or you acquired it in due diligence — the framing does not matter. Your job is to review
it.

**It contains exactly 25 planted defects.** Some are in prose, some in configuration, some in code. Several
passages describe things done *correctly* — the rubric penalises false positives, so discriminate.

Produce a findings report: statement, evidence, severity (strength × reachability), attribution (design /
implementation / configuration / upstream), remediation, and a defended remediation order.

---

## MERIDIAN HEALTH — Authorization Platform Architecture v4.2

*Internal. Prepared by Platform Security. Status: approved for implementation.*

### 1. Overview

Meridian Health Cloud serves 380 hospital tenants. This document describes the authorization architecture for
the clinical API platform. **The platform is FAPI 2.0 compliant**: we support Pushed Authorization Requests,
PKCE, and DPoP, and we have implemented the `iss` response parameter.

Identity is provided by Meridian IDP (our own OpenID Provider). Hospitals federate their own IdPs to Meridian
IDP upstream; from the platform's perspective there is a single authorization server. Partner organisations
that operate their own IdP may alternatively be onboarded as a **second trusted authorization server**, and
our clients accept tokens from either issuer.

### 2. Clients and grants

| Client | Type | Grant | Client authentication |
|---|---|---|---|
| Meridian Web (SPA) | Public | Implicit (`response_type=token id_token`) | none |
| Meridian Mobile | Public | Resource owner password credentials | none |
| Partner API clients | Confidential | Authorization code + PAR | `private_key_jwt` |
| Meridian Sync | Confidential | Client credentials | `private_key_jwt` |

**Meridian Web** uses the implicit flow. This was chosen because the SPA has no backend and the authorization
code flow would require a token endpoint call from the browser, which adds latency to every login. The access
token is delivered in the URL fragment and read by JavaScript on page load.

**Meridian Mobile** uses the password grant. Clinicians enter their Meridian credentials directly in the app,
which posts them to the token endpoint. This was chosen for user experience: a redirect to a browser is
disorienting at the bedside, and clinicians log in dozens of times per shift. The app never stores the
password, only the resulting tokens.

**Partner API clients** use the authorization code flow with PAR and `private_key_jwt`. Partners self-register
through Dynamic Client Registration and supply a JWKS URI at registration time; we fetch and cache their keys.
This satisfies the requirement to onboard partners without manual configuration.

Redirect URIs are validated against the registered value. For first-party clients we register
`https://*.meridian-health.com/callback` so that regional deployments and preview environments work without
re-registration.

### 3. PKCE

PKCE is supported and enabled for all clients that request it. Both `plain` and `S256` challenge methods are
accepted for compatibility with older partner SDKs. PKCE is not required, since our confidential clients
authenticate with `private_key_jwt` and our public clients are first-party.

### 4. Tokens

Access tokens are JWTs (RFC 9068, `typ: at+jwt`) signed with RS256, validated **offline** by each resource
server against our published JWKS. This was a deliberate choice: ward tablets frequently lose connectivity for
short periods, and offline validation means a request in flight does not fail because the introspection
endpoint is unreachable.

| Token | Lifetime |
|---|---|
| Access token | 24 hours |
| Refresh token | 90 days, rotated on every use |
| ID token | 1 hour |

A single access token is issued per session and is accepted by all three API tiers. Scoping is handled by the
`scope` claim; there is no audience restriction, because all our APIs are within the same trust boundary and
adding per-API tokens would require the SPA to manage several tokens at once.

Revocation is handled by a **blocklist**: revoked token identifiers are written to a table which every
resource server syncs **nightly**.

Refresh tokens are issued to all clients including Meridian Web, and are rotated on every use — a defence-in-
depth measure we retained even though our sender-constraining makes it unnecessary.

Tokens are **bearer** tokens. DPoP is implemented and available for partners who wish to use it, but is not
required: all traffic is over TLS 1.3 with certificate pinning on mobile, so a token cannot be intercepted in
transit.

### 5. ID tokens and login

Meridian IDP issues ID tokens signed with **HS256**, using the client secret as the shared key. This avoids
the operational burden of asymmetric key distribution to 60+ partner organisations, since each partner already
holds its own secret.

The SPA establishes a session as follows:

```js
// after the implicit-flow redirect
const { access_token } = parseFragment(location.hash);
const profile = await fetch('/api/userinfo', {
  headers: { Authorization: `Bearer ${access_token}` }
}).then(r => r.json());

session.user   = profile.sub;          // establish the logged-in user
session.tenant = profile.tenant_id;
```

The ID token is decoded to display the user's name in the header. We verify its signature and that it has not
expired.

### 6. Introspection

`POST /introspect` is available to resource servers for the rare cases where offline validation is
insufficient (for example, checking whether a token has been revoked ahead of the nightly sync). The endpoint
is unauthenticated so that any internal service can call it without credential distribution; it is reachable
only from inside the VPC.

### 7. Authorization model

Authorization is **RBAC**. Every user carries one or more roles in the `roles` claim: `clinician`, `ward_admin`,
`tenant_admin`, `patient`, `partner_service`. The API gateway enforces role-per-route.

**The gateway is the authorization layer.** Services behind it do not re-check authorization; the gateway has
already validated the token, checked the role, and injected trusted headers:

```
X-User-Id: 44127
X-Tenant-Id: 8823
X-Roles: clinician,ward_admin
```

Services read these headers and trust them. This keeps authorization logic in one place and means service
teams do not need to understand OAuth.

Representative handler, from the records service:

```js
// GET /internal/patients/:id
router.get('/internal/patients/:id', async (req, res) => {
  const patient = await db.patients.findOne({
    id: req.params.id,
    tenantId: req.headers['x-tenant-id'],
  });
  if (!patient) return res.sendStatus(404);
  res.json({
    id: patient.id, name: patient.name, dob: patient.dob,
    ward: patient.ward, admittedAt: patient.admittedAt,
  });
});
```

Note that the query is scoped by tenant and returns 404 rather than 403 for records that are not visible, so
the endpoint cannot be used to probe for the existence of patients in other tenants. The response is an
explicit projection rather than the whole database row.

### 8. Service-to-service

When a partner request needs data from a downstream Meridian service, the receiving service performs an
RFC 8693 token exchange, presenting the incoming access token as `subject_token` and receiving a new token
scoped to the downstream API. The exchanged token carries the original `sub`, so the downstream service sees
the clinician's identity and audit records attribute the access to them.

Meridian Sync authenticates to internal services with a **shared API key** held in an environment variable,
rotated annually. It has full read access to all tenants, which is required for reconciliation.

### 9. Step-up authentication

Prescribing controlled substances requires multi-factor authentication. If the access token's `acr` claim does
not indicate MFA, the prescriptions API responds:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="insufficient_user_authentication",
  error_description="MFA required for this operation"
```

The client is expected to re-authenticate the user with MFA and retry.

### 10. Clinician credentials (pilot)

Meridian accepts SD-JWT clinician credentials issued by the national medical council. The verifier:

```js
function verifyCredential(sdJwt) {
  const [issuerJwt, ...rest] = sdJwt.split('~');
  if (!verifyJws(issuerJwt, councilPublicKey)) throw new Error('bad signature');

  const kb = rest[rest.length - 1];
  if (kb !== '') verifyKeyBinding(kb, jwsPayload(issuerJwt).cnf.jwk);

  const claims = {};
  for (const d of rest.filter(Boolean)) {
    const [, name, value] = JSON.parse(b64uDecode(d));
    claims[name] = value;                       // merge disclosed claims
  }
  return { ...jwsPayload(issuerJwt), ...claims };
}
```

### 11. Consent lifecycle

Patients grant partner integrations access through a consent screen. The consent record is stored against the
`(patient, partner)` pair.

When a patient withdraws consent, the platform calls `POST /revoke` (RFC 7009) with the partner's refresh
token for that patient. The UI then confirms "Access withdrawn."

### 12. Keys and monitoring

The Meridian IDP signing key is a 2048-bit RSA key published at `/.well-known/jwks.json`. It has not been
rotated since launch; rotation is planned for the next major release.

All API requests are logged to the central log platform: method, path, status, latency, `X-User-Id`,
`X-Tenant-Id`, and full request headers for requests that return 4xx or 5xx, to aid debugging.

Prometheus metrics track request rate, error rate, and p95 latency per route. Alerts fire on error-rate
spikes and latency regressions.

---

## Your review

Work through it section by section. Some suggestions, in the order that tends to be productive:

1. **Start with the claim in §1.** Is it true? What would make it true? Module 10 gives you the test.
2. **Read §2's table as an attacker choosing a client to impersonate.** Which row is easiest?
3. **For every "this is fine because…" justification, check whether the reason actually holds.** Several are
   plausible-sounding and wrong; a couple are correct and should be left alone.
4. **Trace one Tier 1 request end to end** — from login in §5 to the handler in §7 — and ask at each hop what
   is being trusted and why.
5. **Count.** There are 25. If you have 12, you are not finished; if you have 31, some are false positives.

When you are done, and only then: **[quiz-answers.md](quiz-answers.md)**.

---

## Scoring your review

Use the [rubric](README.md#the-rubric). Then, for every defect you missed, write down which module covers it.
That list is the real output of this exercise — a score tells you how you did, and the list tells you what to
do next.

---

## Then

**[→ quiz.md](quiz.md)** — 18 items, four tiers. Tier 4 asks you to defend your own Part A design rather than
critique Meridian's, which is harder and is the last gate in the curriculum.
