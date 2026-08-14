# Final Exam — Answer Key and Self-Grading Rubric

Several items have more than one correct answer. What is marked is the **reasoning**: whether you named a
threat, named what you rejected, and named what your answer does not cover.

---

## Section 1 — Explain it (25)

### F1 (8) — explain OAuth in 400 words

Not a model answer — a checklist. Award marks for what is present:

| Element | Pts |
|---|---|
| **The problem**: a third party needs to act on your behalf against a service you use | 2 |
| **The obvious wrong solution**: give it your password — and *why* it is wrong, with at least two structural harms (unbounded, unrevocable, unattributable, blocks MFA) | 3 |
| **The structural idea**: the user authenticates *only* at the service, which issues the third party a **narrow, expiring, revocable, attributable** credential instead. The client never sees the password | 2 |
| **Clarity**: no undefined jargon; an engineer who has not used OAuth could follow it | 1 |

**Deduct** if the answer describes the *flow* (redirects, codes, tokens) before the *problem*. That is the
most common failure and it is why so much OAuth documentation is unreadable: mechanism before motivation.

### F2 (9) — the pattern, five times → *Modules 02, 03, 05, 08, 09b*

| # | Occurrence | Committed | Proved | Gap |
|---|---|---|---|---|
| 1 | **Code vs. token** (Module 02) | An authorization code in the browser — worthless alone | Client authentication at the token endpoint | Same request |
| 2 | **PKCE** (Module 03) | `code_challenge` = SHA-256(verifier), at the authorization endpoint, front channel | `code_verifier`, at the token endpoint, back channel | Same flow |
| 3 | **DPoP** (Module 05) | Public key thumbprint `cnf.jkt`, recorded by the AS at token issuance | A per-request signed proof (`htm`/`htu`/`ath`/`jti`) | Same session |
| 4 | **`at_hash` / `c_hash` / `s_hash`** (Module 08) | A hash of the access token / code / `state`, inside the signed ID token | Possession of the matching artifact, checked by the **client** | Same response |
| 5 | **SD-JWT key binding** (Module 09b) | Holder public key in `cnf`, signed by the issuer at issuance | A KB-JWT at presentation (`aud`/`nonce`/`sd_hash`) | **Years** |

**1.2 per occurrence (6), plus 3 for the general property:** it converts a **bearer** artifact into one that
requires a **secret the bearer must still hold** — so possessing the intercepted value is not enough. It
splits a credential across two channels (or two moments), such that an attacker must compromise both.

**What grows (part of the 3):** the interval between commitment and proof — same request, same flow, same
session, same response, then an arbitrary period. **Why the last needs `nonce` and `aud`:** the issuer is
offline at presentation time and the commitment may be years old, so freshness and audience cannot come from
the committing party. The verifier has to supply both per presentation. In the first four the committing
party is still in the conversation and can do it itself.

Accept mTLS certificate binding as an alternative to (3). Accept an answer that omits (1) or (4) and names
the other four **if** the candidate says why they excluded it — (1) is a split across channels rather than a
cryptographic commitment, and (4) is checked by the client rather than the issuer, so both are defensible
edge cases. Full marks require the *why*, not just the list.

### F3 (8) — 2 each

**(a)** A token says what the bearer **may do**, not **who is present**. It has no binding to this client
(`aud`) and no binding to this login (`nonce`), so a token obtained anywhere, for anything, satisfies a
"logged in" check. That is token substitution.

**(b)** The token is issued **before the request exists**, scopes are **type-level**, and object ownership is
**application data the AS does not have**. So the check can only happen in the application, against the data,
at request time.

**(c)** Because rotation's benefit is **theft detection**, and with confidential clients plus
sender-constrained tokens that threat is already eliminated. Zero benefit, real cost (lockouts). A control
with no benefit and real cost is a defect, not a neutral extra. **The exception (required for full marks):**
§5.3.2.1 says *shall not … "except in extraordinary circumstances"* — e.g. infrastructure migration — and
where it is invoked the profile expects a time-limited retry window with the old refresh token. An answer
asserting an absolute ban is incomplete.

**(d)** `403` confirms the object **exists**, turning error handling into an enumeration oracle. `404`
collapses "not yours" and "not there" into one answer — the same anti-oracle reasoning as RFC 7662 §2.2.

---

## Section 2 — Diagnose it (25)

### F4 (7) → *Module 05*

**Diagnosis (3):** the UserInfo endpoint strips only the literal prefix `"Bearer "` from the `Authorization`
header. RFC 9449 §7.1 **requires** the `DPoP` scheme for DPoP-bound tokens, so `Authorization: DPoP <token>`
passes the whole string `"DPoP <token>"` to the validator, which correctly reports no such token. The token
endpoint issues tokens the resource endpoint cannot accept. *(This was a real defect in this repo,
`userinfo.service.ts:21`, **fixed 2026-08-04**. The question stands as written — diagnose it from the symptom;
you can no longer reproduce it against the running server. Module 05's lab now demonstrates the fixed behaviour
and the §7.2 rejection instead.)*

**Fix (1):** strip either scheme, case-insensitively.

**Full marks for spotting what the one-line fix leaves behind (bonus).** The real repair was larger, because the
same function had three more defects — the worst being that it spread the request body into the upstream call,
letting a client supply the `htu` its own proof was validated against. A proof minted for another endpoint then
verified fine. **A candidate who says "and I would check what else that function trusts from the request" has
the instinct the question is really testing:** the reported symptom is rarely the whole defect.

**The inverse (3):** a resource server that accepts **`Bearer`** for a **DPoP-bound** token — i.e. ignores the
scheme and never checks the proof. **That one is far more dangerous.** F4's version *fails closed*: it is an
availability bug, loud, and someone files a ticket on day one. The inverse *fails open* and is silent: the
binding still appears in the token's `cnf`, every dashboard says "DPoP enabled", and a stolen token works
anywhere. **A security control that is silently not applied is worse than one that is visibly broken.**

RFC 9449 §7.2 names this exactly — a protected resource *"MUST reject a DPoP-bound access token received as a
bearer token"* — and Module 05's lab now has the learner run it: `Authorization: Bearer <bound token>` →
`401 [A089311] Expected a DPoP header but none was provided.`

### F5 (6) → *Module 07*

**Order (3):** start with the cheapest and least trustworthy, finish with the authoritative.
1. **Advertised** — read `revocation_endpoint_auth_methods_supported` in the discovery document.
2. **Configured** — read the service/client configuration directly.
3. **Observed** — send three requests: no credentials, `client_id` only, full credentials. Record each
   status and error.

**Observation wins (1)** where they disagree: it is the only source that reflects what an attacker will
actually meet. Configuration explains *why*; advertised metadata is a claim about the deployment, and a
divergence there is itself a finding.

**Writing it (2):** report **two** findings, not one. (i) the substantive behaviour, with the observed
transcript as evidence; and (ii) **the divergence itself** — *"the metadata misdescribes the revocation
endpoint's authentication requirement"* — because clients configure themselves from metadata, so a wrong
document breaks integrations regardless of which behaviour is correct.

### F6 (6) → *Module 09b*

**The bug:** the verifier **decodes each disclosure and re-serializes it before hashing**, instead of hashing
the base64url string exactly as received. RFC 9901 §4.2.3: the digest is computed *"over the US-ASCII bytes of
the base64url-encoded value that is the Disclosure"* — explicitly *"not the bytes encoded by the base64url
string."*

Its own credentials work because it produced and consumed them with the same JSON serializer, so the
round-trip is byte-identical. Partner issuers use a different one — `["a", "b"]` versus `["a","b"]` is the
same JSON and a different string, hence a different digest, hence "not referenced".

**The rule:** treat a disclosure as an **opaque string** from the moment you receive it. Decode it to read
the value; never to re-encode it.

### F7 (6) → *Module 10*

**What happened (3):** the implementation wired "Disconnect" to **RFC 7009 token revocation**. That discarded
one credential — hence the immediate failure the user saw — but Grant Management §6.5 is explicit that *"token
revocation is not required to cause the revocation of the underlying grant."* The **consent record survived**,
so the next time the app started an authorization request the AS had nothing to ask and approved it silently.
The user saw no prompt because, as far as the AS was concerned, they had never withdrawn anything.

**What it should have done (3):** call the **grant management** API — `DELETE` on the grant resource URL with
a `grant_management_revoke`-scoped token — and report success only on `204`. That kills refresh tokens (a
**MUST**) and removes the consent, so a later authorization request prompts the user again. Additionally,
keep access-token lifetimes short, because §6.5 only makes access-token revocation a **should** and that is
tolerable only if they are short-lived.

---

## Section 3 — Decide it (25)

Graded on reasoning. Each item: **half the marks are for what you rejected and why.**

### F8 (9) — the CLI tool

**Expected shape:** **authorization code + PKCE (S256)**, public client, using the **loopback redirect**
strategy from RFC 8252 §7.3 — the CLI opens the system browser to `http://127.0.0.1:<random port>/callback`
and listens. For **headless agents** the browser is unavailable, so use either the **device authorization
grant** (RFC 8628 — display a code, user authorises on another device) or, for true CI, **workload
credentials via `private_key_jwt` / an assertion grant**, which is a *different principal* — the build agent,
not the user.

**Must reject explicitly (marks here):** ROPC (RFC 9700 §2.4 MUST NOT — and it defeats federation and MFA);
a shipped client secret (a public client that pretends otherwise); a long-lived personal access token pasted
into an env var.

**Refresh tokens:** yes, but the token is now a file on a laptop. Bind or rotate it (RFC 9700 §2.2.2 requires
one of the two for public clients), scope it narrowly, and store it in the OS keychain rather than
`~/.config`.

**Credential-harvesting vector:** the CLI must **never** render a login form. It opens the *system* browser —
same reasoning as RFC 8252 §8.12's prohibition on embedded user-agents. A CLI that prompts for a password in
the terminal is the password anti-pattern with a nicer prompt.

### F9 (8) — sender-constraining per client class

| Class | Choice | Reason |
|---|---|---|
| **Browser SPA** | **DPoP** | Client certificates are impractical in a browser; DPoP uses an ephemeral non-extractable `CryptoKey` the SPA generates |
| **iOS app** | **DPoP** | Keys in the Secure Enclave. mTLS on mobile means provisioning and rotating client certs to every install |
| **200 partners** | **Split it.** mTLS where the partner controls their own TLS termination; **DPoP for the ones behind CDNs you do not control** | mTLS requires the client certificate to survive to your server |

**The silent breaker (marks here):** **TLS termination you do not control.** For mTLS, a CDN or load balancer
that terminates TLS and does not forward the client certificate (as `x-amzn-mtls-clientcert`,
`X-Client-Cert`, or similar) breaks binding — and depending on your code, it either fails loudly or
**silently downgrades to an unbound token**. For DPoP the analogue is `htu`: a proxy that rewrites `Host` or
drops the port makes the server compute a different URI than the client signed, and it fails only in
production, only behind the proxy. *(This repo hit exactly that: the server derived
`http://localhost/api/par`, without the port.)*

Accept "mTLS everywhere" only if the answer confronts the CDN problem. Accept "DPoP everywhere" readily —
it is the simpler operational story and FAPI 2.0 permits either.

### F10 (8) — third-party SSO

**Design (3):** OIDC with authorization code + PKCE; **exact** redirect-URI matching; per-client registration
(DCR with a JWKS URI if you need self-service); ID tokens signed **asymmetrically** with a published JWKS and
`kid`; refresh tokens sender-constrained or rotated; scopes that mean something to a user on the consent
screen.

**Three insecure integrations and controls (5) — at least one control must not be documentation:**

1. **They authenticate the user from the access token via UserInfo** (`session.user = profile.sub`). *Control:*
   do not return `sub` from UserInfo without an `openid`-scoped token, publish a certified client library
   that does it correctly, and — the non-documentation control — **make the ID token the only artifact
   carrying a stable subject identifier**, so the wrong path does not work.
2. **They skip `aud` and `nonce` validation on the ID token.** *Control:* **pairwise subject identifiers**, so
   a token minted for a different client carries a different `sub` and is useless even if accepted; plus a
   conformance check at onboarding that replays a token minted for another client and requires rejection.
3. **They register a wildcard or `http://` redirect URI, or leak the code via `Referer`.** *Control:* reject
   wildcards and non-TLS redirects **at registration** — a validation rule, not a guideline. Fail the
   registration call.

The marking point: controls that **make the insecure integration impossible** beat controls that ask
integrators to read something. Documentation-only answers cap at half marks.

---

## Section 4 — Judge it (25)

### F11 (12) — ranking

There is no single right order, but there is a right *kind* of justification. Full marks require ordering by
**exposure removed per unit of effort**, with dependencies and reachability named — and "by severity" is
explicitly disallowed because it hides the reasoning.

**A defensible order:**

1. **(1) The open redirect.** Exploitable by the model's *weakest* attacker (A1 — send a link), reachable
   unauthenticated, and a **one-line fix** (exact comparison against a registered set). Best ratio on the
   list by a wide margin; also feeds phishing and, combined with a front-channel flow, token exfiltration.
   *(As the question states, these findings are ranked **as they stood**. This one was remediated on
   2026-08-12 — and instructively, the "one-line fix" took **three** versions before it implemented the rule
   rather than just blocking the payloads that had been demonstrated. Module 10's Exercise 6 carries the
   history. That does not change the ranking, which is the answer being marked.)*
2. **(4) The BOLA.** Highest impact — every report readable by every user — and the fix is a scoped query on
   one endpoint. Ranked second only because it needs an authenticated account, so reachability is slightly
   lower than (1).
3. **(2) 24-hour tokens with a 15-minute blocklist.** The real bound is the **token lifetime**, not 15
   minutes, because a service that misses a push is stale. Shortening the lifetime is a configuration change
   that also shrinks the value of every other compromise on this list — including (4) — which is why it comes
   before (3) despite being less spec-flagrant.
4. **(3) Unauthenticated introspection.** A genuine RFC 7662 §2.1 violation, but it is a token-scanning
   oracle rather than direct access, and its value to an attacker drops sharply once (2) is fixed.
   *(Fixed on this deployment 2026-08-12 — both introspection endpoints now require admin Basic auth and are
   rate-limited, and the gate runs before any Authlete call. The ranking argument is unaffected: it is about
   how these findings relate to each other, not about which are open.)*

**Marks:** 4 for a coherent order; 8 for the justifications. Award full marks for a different order that
argues reachability and effort explicitly — for instance putting (4) first on impact grounds is entirely
defensible. Award **zero** for a list ordered by CVSS-like severity with no effort or dependency reasoning.

### F12 (13) — the limitations section

**This is the most heavily weighted item on the exam**, because it is the one that distinguishes someone who
has learned mechanisms from someone who can be trusted with a design.

Award **2 points per distinct limitation**, up to 10, requiring them to span **different categories**. A
strong answer includes items such as:

- **Compromised endpoints.** A malicious browser extension, a rooted device, or malware on the client sees
  everything the user sees. DPoP does not help: the attacker is *inside* the client and can sign proofs.
- **Implementation errors.** Nothing here is proven about the code. FAPI 2.0's own attacker model excludes
  them (§8.5), and every real finding in this curriculum lived there.
- **The authorization layer.** Object-level checks at the data layer catch BOLA in the paths that use the
  helper; a batch job, a GraphQL resolver or an admin console that queries the table directly does not.
- **Insider and operator access.** Anyone who can read the database, the log platform, or the AS's signing key
  bypasses the protocol entirely. Grant management does not constrain a DBA.
- **Business-flow abuse (API6).** Every request individually authorized, the aggregate the attack. No
  per-request control sees it.
- **Availability.** Introspection makes the AS a hard dependency for every request; fail-closed means an AS
  outage is a full outage. That is a *chosen* trade, and it belongs in a limitations section.
- **Key compromise.** Detection and rotation are operational, not cryptographic. Overlap windows bound the
  damage; nothing prevents it.
- **Social engineering / consent fatigue.** A user who approves a prompt defeats the entire chain, legitimately.

**The single most damaging false assumption (3).** Accept any well-argued answer; the strongest is **"the
endpoints and browsers are not compromised"**, because it is assumed by every mechanism in the design
simultaneously — PKCE, DPoP, key binding, and consent all collapse if the client is hostile, and unlike the
others there is no compensating control inside the architecture. Also strong: *"TLS is unbroken"*, or *"the
signing key has not leaked."*

**Deduct heavily** for: fewer than five items; items that are all one category (e.g. five variations on key
compromise); or — the failure this item exists to catch — a "limitations" section that is really a list of
*future improvements*. "We should add mTLS later" is a roadmap, not a limitation. A limitation is something
your design **does not and will not** protect against.

---

## Self-grading rubric

Score the free-response items against these, **before** totalling:

| Question to ask yourself | If no… |
|---|---|
| Did I name a **specific attacker and capability**, not just "it's less secure"? | Half marks at most |
| Did I name **what I rejected** and why? | Half marks on any Section 3 item |
| Did I state what my answer **does not cover**? | No full marks on F12 |
| Did I give a **number** where the question implies one (windows, lifetimes)? | Deduct |
| Are my spec citations right — identifier, status, and no draft cited as normative? | Deduct per error |
| Did I claim something I could not evidence? | Deduct per claim |

**The two inflation risks**, and they are the same two the capstone rubric names: being generous to yourself
on *rejected alternatives* and on *limitations*. If you find yourself thinking "well, I sort of implied it" —
you did not. Mark it down.

| Score | Reading |
|---|---|
| **85+** | Go do the capstone. You are ready. |
| **70–84** | Do the capstone, but read the answer key for your misses first. |
| **55–69** | Retake after re-reading. The capstone assumes these. |
| **< 55** | Work back through the modules your misses point at, with the labs. |

**Whatever the score, keep the list of misses.** Each one names a module, and that list is worth more than
the number.
