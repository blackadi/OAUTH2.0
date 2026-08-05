# Module 04 — Quiz Answers

Each answer explains **why the right answer is right and why the tempting wrong ones are wrong.**

---

## Tier 1 — Recall

**Q1 — A) `active`.** Everything else in RFC 7662 §2.2 — `scope`, `client_id`, `username`, `token_type`,
`exp`, `iat`, `nbf`, `sub`, `aud`, `iss`, `jti` — is OPTIONAL. This matters in practice: a resource server
that *depends* on `aud` or `scope` being present is depending on optional fields, and must fail closed when
they are absent rather than treating absence as "no restriction."

**Q2 — C) `at+jwt`.** RFC 9068 §2.1. The media type is `application/at+jwt`; the `typ` header value is
`at+jwt`. **A is the trap** — `typ: JWT` is the generic value and is exactly what makes token confusion
possible, because an ID token carries it too.

**Q3 — D) `nonce`.** The seven REQUIRED claims (§2.2) are `iss`, `exp`, `aud`, `sub`, `client_id`, `iat`,
`jti`. `nonce` belongs to ID tokens (OIDC Core) — and reaching for it here is the tell that someone is
conflating the two token types, which is precisely the confusion `typ: at+jwt` exists to prevent.

**Q4 — B.** *"Its value MUST be an absolute URI… The URI MUST NOT include a fragment component."* **C is
wrong** in an interesting way: §2 explicitly permits multiple occurrences — *"Multiple 'resource' parameters
MAY be used to indicate that the requested token is intended to be used at multiple resources."* D confuses
audience restriction with redirect-URI matching; they are unrelated checks.

**Q5 — C.** `/.well-known/oauth-protected-resource`, RFC 9728 §3. A is the AS metadata document (RFC 8414),
B is OIDC Discovery. Three different documents — see Q9.

## Tier 2 — Applied reasoning

**Q6 — B.** At 20k req/s across 40 pods, introspecting every request adds a network hop to every call and
makes the AS a hard availability dependency for the entire estate. JWTs verified locally against the JWKS
avoid both. The honest part of the answer is that "promptly" is **not** a property you get for free — it
equals the token lifetime you choose, so you pick a lifetime that satisfies the requirement (minutes, not
hours) and optionally introspect only for high-value operations. **A is the trap for the security-minded
reader:** it gives the strongest revocation story and ignores the stated latency and scale constraints, and
it couples 40 pods' availability to one service. **C** is the same idea with a lifetime that makes revocation
meaningless. **D** is the worst of both — the freshness of a JWT with the round trip of introspection, and a
cache that outlives revocation by an unbounded amount.

**Q7 — B.** That is nearly the spec's own wording: issued by this AS, not revoked, within its validity
window. **A, C, and D are all the same mistake** in three costumes — treating a *validity* statement as an
*authorization* decision. C is especially tempting because it feels like it should be implied; it is not,
which is why `aud` exists and why Exercise 2 in the lab shows a token with no `aud` at all.

**Q8 — B.** RFC 7009 §2.2 requires 200 for a successfully revoked token *or* an invalid one, because
*"invalid tokens do not cause an error response since the client cannot handle such an error in a reasonable
way."* The security consequence — no oracle — is the reason that ergonomic argument was accepted. A is wrong
(it is deliberate). C is invented. D is true but trivial, and misses the point.

**Q9 — C) protected resource metadata (RFC 9728).** The client is standing in front of an API and does not yet
know which AS protects it. **A and B are the trap:** they answer "what can *this AS* do" — useful only once
you already know which AS to ask. That bootstrapping gap is exactly why RFC 9728 was published, and why a
resource server may point at its own metadata from a `WWW-Authenticate` challenge on a bare 401.

**Q10 — B.** RFC 7592: the `registration_access_token` authorizes read/update/delete on *that one
registration*, at the `registration_client_uri`. It is a capability scoped to a single object — a clean
example of the principle Module 11 generalises. A and C confuse it with an access token or client credentials;
D invents a permission it does not carry.

## Tier 3 — Trace and diagnose

**Q11.** **Defect:** the RS checks `active` and nothing else — no `aud` check, and no `scope` check either.
**Requirement:** audience restriction (RFC 8707 §2; `aud` per RFC 7662 §2.2 / RFC 9068 §2.2), plus scope
enforcement. **Attack:** any token from this issuer is accepted here, so an attacker who obtains a token for
the *least* sensitive service in the estate — one with a lax consent screen, broad scopes, or a client whose
secret leaked — can replay it against this service and be treated as its legitimate caller. The token was
never intended for this RS and the user never consented to this RS's data; nothing in the flow objected,
because nobody asked. This is the confused deputy at token scale. **Fix:** the client requests
`resource=<this API's identifier>`, the AS audience-restricts accordingly, and this RS rejects any token whose
`aud` does not contain its own identifier — **failing closed if `aud` is absent**, since it is an optional
member. Then check `scope` for the specific operation.

**Q12.** **Violates RFC 7662 §2.1:** *"To prevent token scanning attacks, the endpoint MUST also require some
form of authorization to access this endpoint, such as client authentication as described in OAuth 2.0
[RFC6749] or a separate OAuth 2.0 access token."* **Capability 1 — a validity oracle.** The attacker submits
any string and learns whether it is a live token. Anything harvested from a log, a `Referer` header, a proxy
trace, or browser history can be triaged for free, and the careful anti-oracle design of the *responses*
(Q8) is irrelevant because the attacker is asking about tokens that are real. **Capability 2 —
reconnaissance.** For every hit they get `sub`, `scope`, `client_id`, and `exp`: user identifiers, which
applications are deployed, what scopes exist, and how long tokens live. That is an enumeration primitive
independent of any single token. **Fix:** require client authentication or a bearer token on the endpoint.
Note what does *not* fix it: calling the endpoint "internal." Network position is not authorization, and it
fails the moment anything untrusted can route to the AS.

**Q13.** **Defect:** the check trusts the HTTP status code. The server's SPA catch-all returns `200` with
`text/html` for *every* unmatched path, so the probe passes against a server that has no PRM route at all —
a monitor that reports green for a capability that does not exist, which is worse than no monitor. **Two
checks that would not be fooled:** (1) assert the **content type** is `application/json`; (2) **parse the
body and assert on a required field** — RFC 9728's only REQUIRED member is `resource`, so
`jq -e '.resource'` is a real test. A third, and the most robust: (3) request a **control path you invented**
and assert the two responses differ; identical responses prove a catch-all. **Fix:** assert on parsed content,
never on status alone.

**Q14.** **Problem 1 — no `typ` check.** RFC 9068 §2.1 requires `typ: at+jwt`; without it this code accepts
*any* JWT this issuer signs that happens to carry `sub` and `scope`. **That is the "token from a completely
different flow":** an **ID token** is a signed JWT from the same issuer with a `sub`, and if the client can
be induced to send one here (or an attacker simply presents the ID token it was legitimately given), it is
accepted as an access token. **Problem 2 — no `aud` check.** Tokens minted for other resource servers are
honoured; see Q11. **Problem 3 — no `iss` check.** `verifyJwt(token, jwks)` validates against a key set, but
nothing asserts the issuer is the one expected; in a multi-tenant or multi-IdP deployment, or if the JWKS is
fetched dynamically, this permits cross-issuer confusion. A fourth if you spotted it: `scope` is treated as
sufficient for authorization with no object-level check (Module 11). **Fix:** verify signature with a pinned
algorithm, then assert `typ === "at+jwt"`, `iss` equals the expected issuer, `aud` contains this RS, `exp`/
`nbf` are satisfied — and only then read `scope`.

**Q15.** **They are probably not right, and the AS is probably not broken.** RFC 7009 §2.2 says that when a
refresh token is revoked, *"the authorization server SHOULD also invalidate all access tokens based on the
same authorization grant"* — **SHOULD**, not MUST, and only *"if the authorization server supports access
token revocation."* So cascade is permitted-and-encouraged behaviour, not a guarantee. **What actually
determines the observed behaviour** is the token format: if access tokens are **JWTs validated locally**, no
amount of AS-side revocation can reach a resource server that never calls the AS — the token remains
cryptographically valid until `exp`, and 50 minutes is simply the remainder of its lifetime. If access tokens
were **opaque and introspected**, the cascade would be observable on the next request. **The correct
diagnosis:** determine the token format first, then check whether the AS implements the SHOULD, then check
whether the RS caches introspection results. **The fix depends on the answer:** shorten JWT lifetimes,
introspect for sensitive operations, or (if opaque) enable cascading revocation and shorten any introspection
cache TTL.

## Tier 4 — Adversarial and design

**Q16 — model answer.**

**The attack — lateral movement by token replay.** With every API accepting any `active` token from the
issuer, the estate's effective security level is that of its weakest client. Escalation path: (1) Enumerate
clients and their consent screens; find the least-guarded one — an internal tool with open registration, a
demo client with a leaked secret in a repo, a public SPA with broad default scopes, or an integration whose
consent screen users click through reflexively. (2) Obtain a token through it by any legitimate-looking
route: phish a user into authorizing the low-value app, use a leaked client secret with
`client_credentials`, or compromise the low-value app itself. (3) Take that token and present it to the
*most* sensitive API. Because that API checks only `active`, it accepts. (4) Scope is the only residual
barrier, and in estates like this it is usually coarse and shared (`read`, `api`), so it rarely stops the
crossing. Note the properties: no cryptography is broken, no token is stolen in transit, and every request
looks legitimate in logs — the token really was issued by the real AS to a real client for a real user.

**Remediation plan, in order.**
1. **Assign identifiers.** Give each of the eleven APIs a canonical resource identifier (an absolute URI, no
   fragment). This is a naming exercise, and it blocks everything else, so it is first.
2. **Instrument before enforcing.** Have each RS log `aud` on every request *without* rejecting. Within days
   you know exactly which clients call which APIs and with what audiences — the real dependency graph, which
   nobody has written down accurately.
3. **Client side: start sending `resource`.** Update clients to request `resource=<target API>` at both the
   authorization and token endpoints. Tokens now carry `aud`; nothing rejects yet, so nothing breaks.
4. **AS side:** confirm audience restriction is applied, and decide policy for requests that omit `resource`
   — ideally a default audience per client rather than an unrestricted token.
5. **RS side: enforce, one API at a time, most sensitive first.** Reject when `aud` does not contain this
   RS's identifier, **failing closed when `aud` is absent** once step 3's coverage is confirmed by the step-2
   telemetry. Roll out behind a per-API flag with a fast rollback.
6. **Tighten scopes** per API, since audience restriction limits *where* a token works and scope limits *what*
   it does; you want both.
7. **Guard the regression:** add a conformance test per RS that presents a token minted for a different
   audience and asserts rejection, wired into CI so the control cannot silently rot.

**Rollout safety:** the ordering matters more than any single step. Enforcing (5) before (3) breaks every
caller instantly; doing (3) before (2) means you are guessing at the dependency graph. The instrumentation
phase is what makes the change boring, and boring is the goal.

**Q17 — model answer.**

| Consumer | Format | Lifetime | Audience policy | Why |
|---|---|---|---|---|
| **Browser SPA** | Opaque + introspection (or a very short JWT) | 5–15 min access; rotate refresh | `resource` = this API only | Highest theft risk (XSS, extensions, shared machines) and the one place instant revocation genuinely matters — a user clicking "log out everywhere" must mean it. The SPA's traffic volume is per-user and low, so the introspection round trip is affordable. |
| **Partner S2S** | JWT | 15–60 min | `resource` = the specific API surface the contract covers, never a wildcard | High volume, latency-sensitive, no user to revoke on. The controls that matter here are a tight audience, narrow scopes, and `client_id` in the token for attribution and rate limiting. A partner breach is contained by audience, not by revocation speed. |
| **Internal batch** | JWT | Short, minted per run | `resource` = the exact target | No interactive user, predictable and bursty volume; introspection would add a round trip per item for no benefit. Bound the credential to the run rather than keeping a long-lived token warm. |

**Blast radius reasoning:** the SPA has the highest probability of token theft and the lowest cost of
introspection, so it gets the freshest checks. The partner has the highest *value* per token, so it gets the
tightest audience and scopes. The batch job has the most predictable behaviour, so anomalies are easiest to
alert on.

**The single circumstance that collapses all three onto one strategy:** a **regulatory or contractual
requirement for immediate, provable revocation across the estate** — for example a FAPI-style or open-banking
obligation that a customer's consent withdrawal takes effect on the next call, with an audit trail. That makes
revocation lag unacceptable at any lifetime, which forces reference tokens with introspection everywhere (or
sender-constrained tokens plus a real-time status check), and the latency cost stops being negotiable. A
weaker version: an incident-response requirement to kill all tokens instantly, which is the same argument.

**Q18 — model answer.**

| | Open **introspection** | Open **revocation** |
|---|---|---|
| **What the attacker gains** | A validity oracle plus reconnaissance: for any string, is it live; and if so, `sub`, `scope`, `client_id`, `exp` | The ability to destroy tokens — denial of service against users and integrations |
| **What they need first** | Candidate strings. Cheap to obtain in bulk from logs, `Referer` headers, proxy traces, browser history, or a partial breach | The **exact** token value. Anti-oracle design means blind guessing gets nothing, so they need a leak first |
| **Blast radius** | **Confidentiality** — silent, repeatable, scales with the attacker's string list, and enables the *next* attack | **Availability** — noisy, per-token, and self-limiting: a revoked token is a token the attacker also no longer has |
| **Detection in logs** | High-volume POSTs to the introspection endpoint, a low hit rate (mostly `active: false`), one source enumerating many distinct token values, unusual client/IP for that endpoint | Revocations arriving from an IP or client that is not the token's own `client_id`; a burst of revocations; users reporting sudden logouts that correlate with the burst |

**Fix introspection first.** Three reasons. **(1) It is a confidentiality breach and an enabler**: it converts
"I have a pile of suspicious strings" into "I have a list of live tokens plus the identities behind them,"
which feeds every subsequent attack — including choosing which tokens are worth using. Revocation only
destroys. **(2) It is silent.** Users notice being logged out; nobody notices being enumerated, so an open
introspection endpoint can be exploited for months while an open revocation endpoint generates support
tickets within hours. **(3) The precondition is far easier to meet.** Introspection needs guessable or
scavenged strings; revocation needs a real token the attacker already holds — and if they hold it, they would
rather *use* it than destroy it, which makes the revocation attack strategically unattractive for anyone
except a pure vandal.

The counter-argument worth acknowledging: if you are *currently* being hit by mass revocation and users
cannot log in, availability wins on the incident clock — you fix what is actively burning. But absent an
in-progress DoS, introspection is the higher-severity finding and should be first in the queue. In practice
both are the same one-line fix — require client authentication on the endpoint (RFC 7662 §2.1; RFC 7009 §2.1
already assumes client authentication) — so the ordering question usually resolves to "ship both in one
change."
