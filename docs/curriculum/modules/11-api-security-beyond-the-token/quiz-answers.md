# Module 11 — Answer Key

---

## Tier 1 — Recall

### Q1 — **B) Broken Object Level Authorization**

API1:2023. It is first because it is both the most common and the most damaging API vulnerability. **A** is
API2 — the one OAuth solves, and the only one of the ten this curriculum spent eleven modules on. **C** is
API8, **D** is API5.

### Q2 — **B) API1, API3, API5**

Object level, object *property* level, and function level. Three of the top five. **A** includes API2, which
is authentication — the distinction the whole module rests on.

### Q3 — **C) BOLA** — the attacker changed the **object identifier**. Wrong row.

### Q4 — **B) BOPLA** — the attacker changed neither object nor endpoint; they wrote a **field** they should
not control. Wrong column. This is mass assignment, and note it needs no BOLA: the user escalates privilege
on **their own** record.

### Q5 — **C) 404**

`403` confirms the object exists, turning the endpoint into an enumeration oracle. Same anti-oracle reasoning
as RFC 7662 §2.2 in Module 04: do not let an error response distinguish "not yours" from "not there".
`401` is wrong because the caller *is* authenticated.

---

## Tier 2 — Applied reasoning

### Q6 — **B) issued before the request exists; scopes are type-level; ownership is application data**

Reconstruct the argument: (1) at issuance the AS knows subject, client and scopes — not which object IDs will
be named later; (2) `accounts:read` is type-level and instance-level scopes do not scale; (3) only your
database knows who owns account 91847; therefore (4) the check must happen in the application, against the
data, at request time.

- **A** is about a different threat (theft), which sender-constraining already addresses.
- **C** — claim capacity is not the constraint; the AS not knowing your data is.
- **D** is the misconception under test. Instance-level scopes mean one scope per object in a space-delimited
  URL parameter.

### Q7 — **B) the header is caller-controllable unless the gateway strips inbound copies**

A gateway that *adds* `X-Tenant-Id` must also **remove** any inbound header of the same name, or the caller
supplies their own and the "scoped" query silently reads another tenant. Even with stripping correct, the
service now depends on a gateway behaviour it cannot verify — and any path that bypasses the gateway (an
internal call, a debug port, a service mesh sidecar misconfiguration) is a cross-tenant breach. Take tenancy
from the validated token.

**A** is the trap: "the gateway is trusted" is a statement about intent, not about the request that actually
arrives. **C** is a valid defence-in-depth measure but does not fix the bug.

### Q8 — **C) ReBAC**

The rule is defined by **relationships** — ownership of a containing folder, and transitive sharing. RBAC
cannot express "their own" at all; ABAC could encode one hop as an attribute but degenerates badly on
transitive closure. This is precisely the case ReBAC exists for.

### Q9 — **C) scope-per-route and rate limits**

A gateway sees the token and the request; it does not have your data. **A** and **D** require knowing who owns
a row; **B** requires knowing which fields are sensitive. The split: **the gateway does the token and the
verb; the service does the row and the column.**

### Q10 — **B) API6 — every individual request is authorized; the aggregate is the attack**

Unrestricted Access to Sensitive Business Flows. No per-request authorization decision can detect it, because
every request *is* authorized — correctly. The controls are behavioural: per-principal baselining, flow-level
quotas, anomaly detection. **C** is close and worth acknowledging — rate limiting helps — but a month-long
slow scrape stays under any per-minute limit, which is why the framing matters.

---

## Tier 3 — Trace and diagnose

### Q11

**Defect 1 — BOLA (API1).** `requireScope('invoices:read')` gates the *endpoint*; nothing gates the *row*.
Any caller with that scope reads any invoice. Fix: make the query carry the constraint —
`db.invoices.findOne({ id: req.params.id, ownerId: req.user.sub })`, then 404 if absent.

**Defect 2 — BOPLA (API3).** `res.json(invoice)` serialises the whole record, so any column added to the
table later — `internal_notes`, `risk_score`, `cost_basis` — is published automatically, and the change that
leaks it will look like a schema migration, not a security change. Fix: an explicit projection or output
schema.

The second defect is the one reviewers miss, and the more insidious: **defect 1 is a bug you have today,
defect 2 is a bug someone else will introduce for you next quarter.**

### Q12

**Still vulnerable because `tenantId` comes from a request header**, which the caller controls unless the
gateway strips inbound copies. Change `X-Tenant-Id` and read another tenant's reports.

**Why it is more dangerous than no scoping at all:** it *pattern-matches as the fixed version*. It has the
owner-scoped query, the `findOne` with two conditions, and the 404 — every visual marker of correct code from
this module. A reviewer skimming for "is the query scoped?" ticks the box. Unscoped code at least looks
wrong; this looks right and is not. **The most dangerous defects are the ones wearing the costume of the
fix.**

Fix: `tenantId: req.user.tenant_id`, from the validated token. Additionally assert at startup that the
service never reads tenancy from headers, and have the gateway strip the inbound header — belt and braces,
because the service should not depend on the gateway for correctness.

### Q13

**Failure mode: fail-open.** When configuration is absent, the middleware returns *allow*. One unset
environment variable disables authentication across every route it protects.

**OWASP items:** **API5** (Broken Function Level Authorization) — unauthenticated callers reach admin
functions — caused by **API8** (Security Misconfiguration). If those functions expose per-object data
(another subject's authorizations, a specific client's secret) it produces **API1** as well.

**Fix:** fail closed. Refuse the request, and better, refuse to **start**: validate required security
configuration at boot and exit non-zero if it is missing. A security control that silently disables itself is
worse than no control, because the architecture diagram still shows it.

**Why it is harder to catch than a missing check:** every grep for the control **succeeds**. `requireBasicAuth`
is imported, wired into all sixteen controllers, and called on every path — a reviewer checking "is auth
applied?" gets a clean yes. The defect is one line *inside* the helper, and it has no runtime symptom:
nothing logs, nothing errors, tests pass, and the endpoint behaves exactly as if it were working. You find it
by reading the control's implementation, or by testing the negative case — which is why "does an
unauthenticated request get rejected?" belongs in CI as an actual assertion.

### Q14

**What is wrong: the attribution outruns the evidence.** Observing the behaviour through the application
shows only that *the chain as a whole* fails to check ownership. The application might be dropping an error,
misreading a response field, calling the wrong operation, or omitting a parameter the API expects.

**To state it correctly you would need to:** (1) read the application's upstream call and confirm what it
sends; (2) reproduce the behaviour with a **direct call to the vendor API**, bypassing the application; (3)
search service- and client-level configuration for any setting governing ownership, and report the search as
part of the evidence; (4) check the vendor's documentation for whether the check is the caller's
responsibility.

Then write the *behaviour* as confirmed and the *attribution* as unverified: "a direct call reproduces
`action: OK`; no configuration governing grant ownership was found; whether this is a product defect or a
missing setting is unverified and should be raised with the vendor." That version survives contact with the
vendor's engineers. The original gets dismissed, and with it the real finding.

### Q15

**Missing: the control assertion, plus the write path.** As written, the test passes trivially if the fix
broke the endpoint for *everyone* — if `GET` now returns 404 for Alice's own resource too, the assertion is
still satisfied and the feature is dead.

Complete it:

```
assert alice's token GET alice's resource → 200      # control — the feature still works
assert bob's   token GET alice's resource → 404
assert bob's   token DELETE alice's resource → 404   # the write path
assert alice's token DELETE alice's resource → 204   # control on the write path
```

**The bug that slips through:** a fix applied only to the read handler. `DELETE` still permits cross-user
access — which, as Exercise 2 demonstrated live, is the more damaging half. **Every negative test needs a
positive control, and every verb needs its own test.**

---

## Tier 4 — Adversarial and design

### Q16 — Multi-tenant SaaS review

**(a) The most serious structural problem: the services trust `X-User-Id` and `X-Tenant-Id` headers rather
than a token.** Identity is asserted by a hop, not proven by a credential. Concretely: any party that can
reach a service directly — a compromised sidecar, a misconfigured ingress, a developer with cluster access, a
second service with an SSRF bug, a debug port — sets those two headers to any value and reads or writes any
tenant's data. There is no cryptographic check anywhere behind the gateway, so the blast radius of *any*
foothold inside the perimeter is the entire dataset. It is a classic hard-shell/soft-centre design, and in a
multi-tenant system the soft centre is every customer at once.

Worth adding as a second finding: with 40 services and no token behind the gateway, there is also no useful
audit trail — every service sees the same header, so a cross-tenant read is indistinguishable from
legitimate traffic after the fact.

**(b) Why the gateway cannot fix it.** The gateway can strip inbound headers and re-add trusted ones, which
closes the *external* path — necessary, and probably the immediate mitigation. But it cannot make the
internal path safe, because the vulnerability is that services accept an unauthenticated assertion. Anything
that reaches a service without traversing the gateway bypasses the control entirely, and the gateway has no
visibility into that by construction. It also cannot do object-level authorization for any of the 40 services,
since it holds none of their data.

**(c) Minimum change: propagate the access token to every service and have each validate it locally** —
signature, `iss`, `aud`, `exp` — taking `sub` and `tenant_id **from the validated token only**. Then scope
every data query by the token's `tenant_id`. Where a service calls another on the user's behalf, use token
exchange (Module 06) so the downstream token is audience-restricted and carries the delegation (`act`) rather
than reusing a broad token.

*Migration risk, stated honestly:* 40 services, each needing JWKS fetching, caching and rotation handling
(Module 11's key-rotation note), and each acquiring a hard dependency on the AS's availability. Do it
incrementally: dual-accept (header **or** token) behind a per-service flag, migrate service by service with
the header path logged as deprecated, then remove header support. The dangerous phase is the dual-accept
window — a service that prefers the header when both are present has not migrated at all, so make the token
authoritative from day one and treat header-only requests as an alertable event.

**(d) What it gets right and I would keep:** centralised token validation and scope-per-route at the gateway.
That genuinely handles API2 and much of API5 consistently, which is hard to achieve across 40 teams
individually. The mistake is not having a gateway — it is believing the gateway finished the job. Keep it,
and document loudly what it does *not* do.

### Q17 — Hospital authorization

| Rule | Model | Enforced where |
|---|---|---|
| Doctors read records of patients **on their own ward** | **ReBAC** (or ABAC if ward is a simple attribute on both sides) | Data layer: query joins the doctor's ward assignment to the patient's current ward |
| **Emergency override**: any doctor, any record, flagged | **ABAC** on an environment attribute (`emergency_declared`) plus mandatory audit | Policy layer, with a **synchronous, non-bypassable** write to an audit store |
| Patients read **their own** record | Ownership check — the simplest ReBAC edge | Data layer: `patientId == token.sub` |
| Researchers read **de-identified** records | **BOPLA control**, not a BOLA control | Output layer: a separate projection/view that cannot express identifiers |

**Rationale for the split.** Rules 1 and 3 are relationship rules — "their ward", "their own" — and RBAC
cannot state them; a `doctor` role passes for every patient in the hospital. Rule 2 is genuinely
attribute-based and time-bounded. Rule 4 is not an access-control rule at all in the BOLA sense: the
researcher *may* read the row, but only some columns — wrong column, not wrong row, so it belongs in the
projection.

**Hardest rule to implement safely: the emergency override**, and it is not close. It is a deliberate,
designed bypass of every other control — sometimes called break-glass — and it has three failure modes: it
gets used routinely because it is easier than the correct path; the flag gets left on after the emergency; and
the audit trail is written best-effort, so the accesses that matter most are the ones least likely to be
recorded.

**Mitigations:** make the audit write **synchronous and fail-closed** — if the flag cannot be recorded, the
read does not happen, because an unlogged break-glass access is worse than a denied one. Auto-expire the
emergency state on a short timer requiring active renewal, rather than a manual off switch. Require a reason
code at use. Route every flagged access to human review within a fixed window, and — the control that
actually changes behaviour — report per-clinician override rates to their department. Break-glass is
ultimately governed socially; the technical controls exist to make the social control possible.

**Rule 4 caveat:** de-identification is not a boolean. Ward, admission date and diagnosis can re-identify a
patient in a small population, so the researcher projection needs review as a *dataset*, not per-field —
which is the same lesson as Module 09b's unlinkability discussion.

### Q18 — 200 endpoints, two engineers, six weeks

**Finding the vulnerable endpoints without auditing all 200 by hand.**

Do not audit by hand — build the oracle first. Roughly week 1:

1. **Enumerate the object-taking endpoints mechanically.** Any route with a path parameter or an object ID in
   the body is a BOLA candidate; the rest are lower priority. From an OpenAPI spec if one exists, from the
   router otherwise. This typically cuts 200 down to 40–60.
2. **Write a differential test harness, not a checklist.** Two test accounts in different tenants, each
   seeded with its own objects. For every candidate endpoint, replay account A's request with account B's
   token and assert 404. This is a few hundred lines and it *is* the audit — it turns a six-week manual
   review into an overnight run, and it becomes the CI suite in step 4.
3. **Grep for the anti-patterns** as a second signal: `findById(req.params`, `req.headers['x-`, whole-object
   `res.json(record)`, and any authorization helper that can return "allow" on a missing input.

**What I would fix first, and why.** Rank by *reachability × blast radius*, not by endpoint count:
write endpoints before read (a cross-tenant `DELETE` is unrecoverable; a read is a breach you can at least
measure); then cross-**tenant** before cross-**user** (a tenancy break is every customer at once); then
anything returning credentials or tokens; then bulk/list endpoints, which turn one BOLA into a full export.
A single unauthenticated admin route outranks all of it — that is Exercise 1's lesson.

**What goes in CI so the class cannot return.** The harness from step 2, running on every PR, with a rule
that **a new route with a path parameter and no corresponding cross-account test fails the build**. That last
part is what makes it durable: it is a coverage gate, not a test suite, so the protection extends to
endpoints nobody has written yet. Alongside it, refactor toward owner-scoped query helpers so the insecure
version is harder to write than the secure one, and add a startup assertion that required security
configuration is present (fail closed).

**What I would tell leadership at six weeks.** Plainly, and with numbers: how many endpoints were in scope,
how many were tested, how many defects were found and fixed, and — the important part — **what remains
untested and why**. Six weeks and two engineers will not cover 200 endpoints' business logic; it will cover
the mechanical object-ownership class well and the "should this user do this *action*" class barely. I would
state the residual risk in those terms, note that the CI gate prevents *regression* rather than proving
absence, and put a number on the next tranche. Reporting "BOLA is fixed" would be the actual failure of the
engagement — the honest version buys the next six weeks.
