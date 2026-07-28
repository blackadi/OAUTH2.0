# Module 12 — Capstone Answer Key

Read this only after both deliverables are written.

---

# Part 1 — The complete defect inventory

**25 planted defects.** Severity is **strength × reachability** (Module 07), not the modal verb of the spec
being broken.

## §1 Overview

| # | Defect | Module | Severity |
|---|---|---|---|
| 1 | **The FAPI 2.0 compliance claim is false.** PAR, PKCE and DPoP are *supported*; every FAPI 2.0 `shall` in §5.3.2 is about what the AS **rejects**. With implicit, ROPC, bearer tokens and optional PKCE, the platform fails a dozen requirements. | 10 | **High** — not itself exploitable, but it is the reason nobody re-examines items 2–25. A false assurance claim suppresses the review that would find everything else. |
| 2 | **Two trusted issuers, no issuer validation described.** Clients accept tokens "from either issuer" and nothing says they check which AS answered. A partner-operated AS is attacker **A1a** by definition. | 05 | **High** — a malicious or compromised partner AS mounts a mix-up attack. The `iss` parameter is *emitted*; the defect is that no client is said to *validate* it. |

## §2 Clients and grants

| # | Defect | Module | Severity |
|---|---|---|---|
| 3 | **Implicit flow for the SPA.** Access token in the URL fragment — browser history, referrers, extensions, and no client authentication at issuance. RFC 9700 §2.1.2 says it MUST NOT be used. | 02, 07 | **Critical** — trivially reachable by A1/A3a. |
| 4 | **Resource owner password credentials for mobile.** RFC 9700 §2.4: *"The resource owner password credentials grant MUST NOT be used."* The app handles the clinician's actual password — the password anti-pattern, restored. | 01, 07 | **Critical** — defeats federated login (constraint: hospitals use their own IdP), makes MFA and step-up impossible, and puts credentials in a client. |
| 5 | **Wildcard redirect URI** `https://*.meridian-health.com/callback`. RFC 9700 §4.1 requires exact string matching. One XSS or one abandoned subdomain (`preview-2019.meridian-health.com`) is a token-exfiltration endpoint. | 02, 07 | **Critical** — combines with #3 to hand the token straight to an attacker. |

## §3 PKCE

| # | Defect | Module | Severity |
|---|---|---|---|
| 6 | **PKCE is optional and `plain` is accepted.** The justification is wrong twice: PKCE protects the *code*, not the client, so `private_key_jwt` is irrelevant to it; and "our public clients are first-party" is not a security property — the attacker does not care who wrote the app. `plain` offers no protection against an attacker who can read the request (A3a). | 03 | **High** |

## §4 Tokens

| # | Defect | Module | Severity |
|---|---|---|---|
| 7 | **24-hour offline-validated tokens with a nightly blocklist sync** — a revocation lag of up to ~24 hours, and in the worst case ~48. Directly violates brief constraint 1. | 04 | **Critical** — this is the regulator-facing failure. |
| 8 | **No audience restriction; one token for all three tiers.** A token leaked from the Tier 3 drug directory opens patient records. RFC 8707 exists for exactly this. | 04 | **High** |
| 9 | **90-day refresh tokens issued to a public SPA**, neither rotated-and-bound in a way that helps nor sender-constrained. RFC 9700 §2.2.2 requires refresh tokens for public clients to be sender-constrained **or** use rotation. | 03 | **High** |
| 10 | **Refresh-token rotation retained** while claiming FAPI 2.0, which forbids it (§5.3.2.1). Also see #14 — the stated reason is self-contradictory. | 10 | **Low** severity, **high** diagnostic value: it shows the team applies controls by reputation rather than by threat. |
| 11 | **Bearer tokens; "TLS is enough."** FAPI 2.0 requires sender-constrained tokens. TLS protects the wire and nothing else: attacker **A5** reads tokens from resource-server proxy logs after termination, which is precisely why sender-constraining exists. | 05, 10 | **Critical** — and note DPoP is already implemented, so the fix is configuration. |

## §5 ID tokens and login

| # | Defect | Module | Severity |
|---|---|---|---|
| 12 | **ID tokens HS256-signed with the client secret.** The verification key *is* the forging key. Any of 60+ partners — or anyone who obtains one secret — mints an ID token for any user, including `tenant_admin`. | 08 | **Critical** |
| 13 | **The session is established from an access token via UserInfo.** `session.user = profile.sub` — the token substitution attack. An access token obtained for *any* purpose, from any client, logs its bearer in as that user. Combined with #3 (token in the fragment), a stolen token is a full account takeover. | 08 | **Critical** — the single worst defect in the document. |
| 14 | **The ID token is validated for signature and expiry only.** No `iss`, no `aud`, no `nonce` — OIDC Core §3.1.3.7 steps 3 and 11. Without `aud`, a token minted for a different client is accepted; without `nonce`, it can be replayed. | 08 | **High** |

## §6 Introspection

| # | Defect | Module | Severity |
|---|---|---|---|
| 15 | **Unauthenticated introspection endpoint.** RFC 7662 §2.1: *"the endpoint MUST also require some form of authorization to access this endpoint."* "Reachable only from inside the VPC" is network-perimeter reasoning — the same assumption #16 relies on, and one SSRF (API7) makes it a token-scanning oracle. | 04 | **Medium** |

## §7 Authorization model

| # | Defect | Module | Severity |
|---|---|---|---|
| 16 | **Gateway-injected identity headers, trusted by services.** Identity is asserted by a hop, not proven by a credential. Anything reaching a service directly — SSRF, a sidecar, a debug port, a second service — sets `X-User-Id` and `X-Tenant-Id` freely. | 11 | **Critical** — the blast radius of any foothold is every tenant. |
| 17 | **RBAC only: no object-level authorization.** The brief says clinicians see patients *in their own ward*; a `clinician` role check passes for every patient in the tenant. Pure RBAC cannot express "their own" — a BOLA by construction (API1:2023). | 11 | **Critical** |

## §8 Service-to-service

| # | Defect | Module | Severity |
|---|---|---|---|
| 18 | **Token exchange produces impersonation, not delegation.** No `actor_token`, so no `act` claim: the downstream service and the audit log cannot distinguish the clinician acting directly from a partner acting on their behalf. RFC 8693 §1.1 defines impersonation as being *"indistinguishable"* — which is exactly the property brief constraint 2 forbids. | 06 | **High** — a compliance failure as much as a security one. |
| 19 | **Static shared API key for Meridian Sync**, full cross-tenant read, rotated annually. A single long-lived secret in an environment variable is the highest-value credential on the platform, and a year is a long exposure window. | 06, 11 | **High** |

## §9 Step-up

| # | Defect | Module | Severity |
|---|---|---|---|
| 20 | **The challenge omits `acr_values` and `max_age`.** RFC 9470 defines both so the client learns what *would* succeed. Without them the client knows only that it failed — a recoverable state turned into a dead end, and in practice a prescribing workflow that cannot complete. | 09a | **Medium** — availability and usability, not confidentiality. |

## §10 Clinician credentials

| # | Defect | Module | Severity |
|---|---|---|---|
| 21 | **Disclosures are merged without recomputing digests.** The loop decodes each disclosure and trusts its contents. RFC 9901 §7.1/5: *"If any Disclosure was not referenced by digest value in the Issuer-signed JWT … the SD-JWT MUST be rejected."* An attacker appends `[salt,"role","consultant"]` and it is believed. The issuer's signature still verifies — it covers digests, not disclosures. | 09b | **Critical** |
| 22 | **Key binding is checked only if a KB-JWT is present** (`if (kb !== '')`). RFC 9901 §7.3/1: the decision *"MUST NOT be based on whether or not a Key Binding JWT is provided by the Holder"*; §9.5 names the attack — strip the KB-JWT and the credential becomes a bearer token. | 09b | **High** |

## §11 Consent lifecycle

| # | Defect | Module | Severity |
|---|---|---|---|
| 23 | **Withdrawal is wired to RFC 7009 token revocation, not grant revocation.** The consent record survives, so the partner's next authorization request is approved with no prompt, and the UI says "Access withdrawn." Compounds with #7: even the discarded token's siblings stay valid for up to 24 hours. | 10 | **Critical** — the second regulator-facing failure, and the UI actively misinforms the patient. |

## §12 Keys and monitoring

| # | Defect | Module | Severity |
|---|---|---|---|
| 24 | **A single signing key, never rotated, with no `kid` mentioned.** No rotation has been practised, so the first rotation will be during an incident, and without `kid` verifiers cannot select among overlapping keys — meaning rotation requires a flag day. | 11 | **Medium** now, **critical** the day the key leaks. |
| 25 | **Full request headers logged on 4xx/5xx**, which captures `Authorization` — and with 24-hour bearer tokens (#7, #11) the log platform becomes a store of live credentials, readable by everyone with log access. This is attacker **A5** made trivial. | 05, 11 | **High** |

---

## What Meridian got right — the false-positive traps

Deducting marks for these is the point of the "no false positives" criterion:

- **Authorization code + PAR + `private_key_jwt` for partners.** Genuinely strong, and the correct answer for
  that client class.
- **DCR with a JWKS URI at registration.** A sound solution to brief constraint 3 — self-service onboarding
  with asymmetric client authentication and no shared secret.
- **`typ: at+jwt`, RS256, published JWKS.** RFC 9068-conformant.
- **The handler's tenant-scoped query.** The *constraint is in the query*, which is the pattern Module 11
  recommends. The tenant's **source** is wrong (#16); the query shape is right.
- **404 rather than 403.** Explicitly avoids the enumeration oracle.
- **An explicit response projection** rather than `res.json(patient)` — avoids BOPLA.
- **Verifying the SD-JWT issuer signature against a known council key.** Correct as far as it goes.

**Meridian is not incompetent, and that is the lesson.** A document can contain sophisticated, correct work
and still be comprehensively insecure, because security is not an average.

---

## A defended remediation order

Not spec order, not severity order, not hardest-first. Ordered by **exposure removed per unit of effort**,
with dependencies respected.

1. **#13 — stop deriving the session from an access token.** Single worst defect, small code change, and it
   is a full account takeover today. Use the ID token, validated properly (fixes #14 alongside).
2. **#3 + #5 — move the SPA to authorization code + PKCE and register exact redirect URIs.** One change of
   client configuration removes two critical defects and most of #6's reachability.
3. **#4 — remove ROPC.** Same migration as (2), and it is what unblocks federated login and MFA, so it has
   product value as well.
4. **#12 — move ID tokens to RS256/ES256.** Removes a forgery capability held by 60+ third parties. Keys are
   already published for access tokens, so the infrastructure exists.
5. **#16 — propagate and validate the token in services.** Largest engineering effort here, but it is what
   makes every later authorization fix meaningful; #17 cannot be fixed properly before it.
6. **#17 — object-level authorization at the data layer**, as owner/ward-scoped queries.
7. **#7 + #23 — shorten access-token lifetime and wire withdrawal to grant revocation.** Together these are
   the regulator answer; do them as one piece of work because the guarantee is the product of both.
8. **#11 — require DPoP.** Already implemented; this is configuration. Disarms A2 and A5 at once, and
   substantially reduces #25's impact.
9. **#21 + #22 — fix the SD-JWT verifier** before the pilot ships. Cheap now, expensive later.
10. **#25, #15, #19, #8, #9, #24, #2, #20, #18, #6, #10** — the remainder, roughly in that order.

Two points a strong answer makes explicitly: **#1 belongs nowhere in the list because it is not a fix, it is
a retraction** — the compliance claim must be withdrawn immediately and independently of the engineering
work. And **#5 before #3 is defensible too** — the wildcard is a one-line change while the flow migration
takes weeks, so shipping it first buys real risk reduction on day one.

---

# Part 2 — Quiz answers

## Tier 1

**Q1 — B.** Every FAPI 2.0 `shall` in §5.3.2 is expressed as what the AS **rejects**. Supporting a mechanism
an attacker can decline to use defends nothing. **A** is wrong — §5.3.2.1 permits MTLS *or* DPoP. **C** — JARM
belongs to FAPI 1.0 Advanced and Message Signing, not the base 2.0 profile. **D** is invented, though FAPI 2.0
does require *only* confidential clients — which Meridian also violates.

**Q2 — B) MUST NOT.** RFC 9700 §2.4, quoted in Module 01: *"The resource owner password credentials grant
[RFC6749] MUST NOT be used."* Not SHOULD NOT, and there is no first-party exemption — **C** is the excuse
Meridian actually makes.

**Q3 — B) exact string matching.** RFC 9700 §4.1. Everything else on the list is a way of being approximately
right, which is the failure mode.

**Q4 — B.** With a symmetric algorithm the verification key and the signing key are the same value, so every
holder of the client secret can mint tokens as well as check them. Module 08's lab demonstrated this live:
`sub` changed to another user, re-signed with the client secret, and all thirteen validation steps passed.

**Q5 — B.** Grant Management §6.5: *"token revocation is not required to cause the revocation of the
underlying grant."* The consent record survives, so the next authorization request completes silently.

## Tier 2

**Q6 — B.** The constraint is real and the conclusion does not follow. Offline validation gives you
availability during a network blip; it is the **24-hour lifetime plus nightly sync** that produces the
revocation lag, and those are independent choices. Five-to-fifteen-minute access tokens with a refresh on
reconnect tolerate a minutes-long outage while bounding revocation to minutes. **This is the general shape of
a bad justification: a true premise, a real constraint, and a conclusion that smuggles in a second decision
nobody examined.**

**Q7 — B.** Identity is asserted by a hop rather than proven by a credential, so the security boundary is the
network. Any path that does not traverse the gateway — SSRF, a compromised sidecar, a debug port, another
service — yields full impersonation across all tenants. **C** is a real availability concern and not the
security answer.

**Q8 — B) constraint 2, attributability.** RFC 8693 §1.1 defines impersonation as the downstream being unable
to distinguish the actor from the subject — *"indistinguishable"* is the spec's own word. The brief requires
every Tier 1 access to be attributable to a named human *including when a partner made the call*, which is
precisely the delegation case `act` exists for.

**Q9 — B.** RFC 9470 defines `acr_values` and `max_age` in the challenge so the client learns what would
satisfy the requirement. Omitting them leaves the client able to detect failure and unable to remedy it.

**Q10 — B.** This is the reviewer's instinct worth building: **attack the weakest permitted path, not the
most interesting one.** Meridian's partner path is genuinely strong; the SPA and mobile paths are implicit
flow, password grant and optional PKCE. An attacker never engages the strong control. It is also why
"we use `private_key_jwt`" appears in the document as a justification for weakening PKCE (#6) — the team is
reasoning about their best path rather than their worst.

## Tier 3

**Q11.** **Authentication bypass by token substitution** (Module 08). The application treats *authorization*
(a bearer token) as *authentication* (proof of who is present).

*Concretely:* a clinician uses a low-value third-party app that legitimately obtains an access token for
`scope=profile` on their behalf. That app — or anyone who obtains the token, which with #3 means anyone who
reads a URL fragment, a browser history, or a referrer — presents it to Meridian Web's UserInfo call. The
token is valid, UserInfo returns the clinician's `sub`, and the SPA sets `session.user` to it. **The attacker
is now logged in as the clinician.** No forgery, no cryptography broken; the token was used exactly as
designed, for a purpose it never established.

*Fix:* authenticate with the **ID token**, validated through all thirteen OIDC Core §3.1.3.7 steps —
critically `aud` (this token was minted for *this* client) and `nonce` (it belongs to *this* login). UserInfo
is for fetching claims after authentication, never for establishing it.

**Q12.** Two defects.

1. **Disclosures merged without recomputing digests.** §7.1/5: *"If any Disclosure was not referenced by
   digest value in the Issuer-signed JWT … the SD-JWT MUST be rejected."* The loop parses each disclosure and
   trusts it; an attacker appends `["<salt>","role","consultant"]` and it is merged. The issuer's signature
   still verifies, because it covers the digests in `_sd`, not the disclosures.
2. **Key binding checked only when present.** §7.3/1: the decision *"MUST NOT be based on whether or not a Key
   Binding JWT is provided by the Holder"*; §9.5 spells out that otherwise *"an attacker could strip the
   KB-JWT."*

**Which is worse: #1.** Stripping key binding lets an attacker *replay a real credential they obtained*.
Forging disclosures lets them **manufacture claims that were never issued** — inventing a prescribing
qualification rather than borrowing one. Forgery beats theft.

**Q13.** **Correct (three):** the ownership constraint is *inside the query* rather than a check after the
fetch, so the insecure version is hard to write; it returns **404**, not 403, so the endpoint is not an
enumeration oracle; and the response is an **explicit projection**, not `res.json(patient)`, so a future
column cannot leak (no BOPLA).

**Wrong (two):** the tenant comes from a **caller-influenceable header** rather than a validated token
(#16) — which makes the scoped query worthless and is *more* dangerous than no scoping, because it
pattern-matches as the fixed version; and there is **no ward-level or ownership check** (#17), so any
clinician in the tenant reads any patient, which is the brief's actual rule unimplemented.

This snippet is the most instructive in the document: **the shape of the fix is right and the inputs are
wrong.**

**Q14.** (a) **Their sender-constraining does not exist** — §4 states tokens are bearer tokens and DPoP is
optional, so the premise of the sentence is false. (b) **Even if it were true, the conclusion is backwards**:
FAPI 2.0 §5.3.2.1 does not merely make rotation unnecessary in that situation, it **prohibits** it, because a
control with no benefit and real operational cost (lockouts when a client fails to store the new token) is a
defect rather than a neutral extra. The sentence is a good example of a team that knows the vocabulary and
not the argument.

**Q15.** **The finding is wrong, and marking it costs you.** DCR with a JWKS URI is Meridian's answer to
constraint 3, and self-registration does **not** grant access to anything: a registered client still needs a
user to complete an authorization flow and consent. Registration establishes *who a client is*, not *what it
may see*.

There is a legitimate adjacent concern worth raising *correctly*: unrestricted DCR is a spam and inventory
problem (OWASP API9), and RFC 7591 supports an initial access token for gating it. That is a
low-severity operational finding, phrased as such. Reporting it as "anyone can read patient data" is the
error the rubric penalises — and in a real engagement it is the finding that costs you the room, because the
first thing the vendor's engineers will do is disprove it and then discount everything else you wrote.

## Tier 4

**Q16 — attack your own design.** Graded on honesty, not on surviving. Strong answers share three features:
at least one attacker **succeeds** or partially succeeds (a design nothing defeats has an unexamined
assumption); the "single change I did not make" is named with its actual reason — cost, deadline, an
operational dependency — rather than an omission; and A1a is not skipped, since a second AS in the ecosystem
is the capability people forget they have granted. If every attacker fails against your design, re-read
Attacker Model §8: the limitations section exists because no design defeats everything.

**Q17 — the revocation window.** A complete answer states a **number**, shows the derivation, and names the
cost.

Two defensible architectures:

- **Opaque tokens, introspected per request, ≤60 s cache.** Window = **cache TTL, ≤60 s**. Cost: every
  request depends on the AS; latency; the AS becomes an availability dependency — and constraint 4 forces you
  to state the offline behaviour explicitly and choose **fail-closed**, accepting that a disconnected ward
  tablet stops working.
- **Short self-contained tokens (5 min) plus grant revocation.** Window = **remaining access-token lifetime,
  ≤5 min**, because grant revocation kills refresh tokens immediately (Grant Management §6.5 MUST) so no new
  tokens can be minted. Cost: a 5-minute residual, and refresh traffic every five minutes.

Either is fine. Answers that say "revocation is immediate" without distinguishing offline from online
validation have missed the module. Answers that pick offline validation and *do not* state the residual
window have missed constraint 1.

**Proving it to a regulator** — and Module 10 §8.5 is why a certificate will not do it: an automated,
continuously-run end-to-end test that creates a grant, obtains tokens, revokes the grant, and asserts that
both the refresh token fails and a resource request fails **within the stated window**. Plus a negative test
that RFC 7009 revocation alone does *not* leave the grant standing, pinning the distinction the design rests
on. Plus production evidence: audit-log the withdrawal and the first subsequent rejected request, so the
window is measured in the field rather than asserted. **Offer the test suite, not the certification.**

**Q18 — how does a document like this happen?** The most valuable question in the curriculum, so the answer
should not be "they were careless."

**What produces it:**

- **Mechanism-shopping instead of threat modelling.** Every control in the document is real and named; none
  is traced to an attacker. That is how you get DPoP implemented but optional, PAR used for the strongest
  client and not the weakest, and rotation retained for a threat that does not exist. **There is no attacker
  model in the document at all**, which is the root cause of most of the 25.
- **Incremental accretion with no re-review.** "v4.2" — the implicit flow was probably fine in v1 when the
  SPA read a public directory. Nothing forces a re-examination of an old decision when the data it guards
  changes.
- **Local optimisation against real constraints.** Every bad decision has a *true* premise: bedside redirects
  really are disorienting, tablets really do lose connectivity, key distribution to 60 partners really is a
  burden. Each was solved in isolation by the team that felt the pain, and nobody owned the composition.
- **Compliance as a claim rather than a test.** §1 asserts FAPI 2.0 conformance. If anyone had *run* the
  conformance suite, twelve defects would have surfaced in an afternoon.

**Two changes, with the defects each catches:**

1. **Require a written attacker model, with an explicit out-of-scope section, as a merge-blocking artifact
   for any change touching authentication or authorization.** Forcing "which attacker capability does this
   defeat?" next to every control catches **#1, #2, #3, #4, #6, #10, #11, #18, #20** immediately — every
   defect whose justification is a plausible sentence that names no adversary. The out-of-scope section is
   what catches #16 and #25, because "we assume the internal network is trusted" is a sentence nobody will
   write down once they have to sign it.
2. **An automated cross-account/cross-tenant test suite, with a coverage gate: any new route taking an object
   identifier fails the build without a corresponding negative test.** Catches **#16, #17** directly, and
   #13, #21 and #22 fall out of the same discipline applied to authentication and credential verification.
   This is the change that keeps working after the people who understood the risk have moved on — which the
   first change, on its own, does not.

The pairing matters and a strong answer says so: **the first change prevents bad decisions, the second
prevents good decisions from decaying.** A team with only the first writes an excellent v1 and a v4.2 that
looks like this one.
