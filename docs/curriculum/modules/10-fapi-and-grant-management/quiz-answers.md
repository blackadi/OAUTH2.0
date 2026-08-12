# Module 10 — Answer Key

Every answer explains **why the wrong options are wrong**. Several of the distractors here are things
vendors say in writing.

---

## Tier 1 — Recall

### Q1 — **B) Authorization, authentication, session integrity**

FAPI 2.0 Attacker Model §5.2–§5.4. Stated as: *"no attacker can access protected resources other than their
own"*; *"no attacker is able to log in at a client under the identity of another user"*; and, for session
integrity, *"no attacker is able to force a user to be logged in under the identity of the attacker"* and
*"no attacker is able to force a user to use resources of the attacker."*

- **A** is the generic CIA triad — correct for information security in general, not what this document
  states. The distractor is there because people reach for it reflexively.
- **C** is Module 09b's property set (SD-JWT / credentials), not FAPI's.
- **D** lists mechanisms, not goals. Confusing the two is the exact error this module exists to fix: goals are
  what you must achieve, mechanisms are one way of achieving them.

### Q2 — **B) MTLS or `private_key_jwt`**

§5.3.2.1: *"shall authenticate clients using one of the following methods: MTLS as specified in Section 2 of
[RFC8705], or private_key_jwt as specified in Section 9 of [OIDC]."*

- **A** is exactly what most deployments do and what FAPI 2.0 forbids. Both send a shared secret that the AS
  must store and the client must protect at rest.
- **C** omits MTLS, which is permitted and is the FAPI 1.0 heritage option.
- **D** is the "supported ≠ required" error in its purest form — advertising a method is a *finding*, not a
  defence.

### Q3 — **B) of less than 600 seconds**

§5.3.2.2: *"shall issue pushed authorization requests `request_uri` with `expires_in` values of less than 600
seconds."*

- **A** is the trap, and the deployment in the lab falls into it: it issues exactly 600, which is not less
  than 600. `<` is not `<=`.
- **C** confuses this with the 60-second bound on **authorization codes** (§5.3.2.1).
- **D** — the client does not choose; the AS issues.

### Q4 — **B) MTLS or DPoP**

§5.3.2.1: *"shall use one of the following methods for sender-constrained access tokens: MTLS as described in
[RFC8705], DPoP as described in [RFC9449]."*

- **A** — `at_hash` is an OIDC ID-token claim binding the ID token to the access token (Module 08). It
  constrains nothing about the presenter.
- **C** is FAPI 1.0 Advanced. §5.5 records the change and the reason: *"DPoP can be easier to deploy in some
  scenarios."*
- **D** — PKCE protects the authorization code, not the access token. Different artefact, different phase.

### Q5 — **A) MUST revoke refresh tokens; should revoke access tokens**

§6.5: *"The AS MUST revoke the grant and all refresh tokens issued based on that particular grant, it should
revoke all access tokens issued based on that particular grant."*

You verified both halves in Lab 6: the refresh token was gone (`[A053305]`), the access token was still
`active: true` with 24 hours to run. **B** is what most people assume and what the feature's name implies —
which is precisely why the asymmetry is worth memorising.

---

## Tier 2 — Applied reasoning

### Q6 — **B) `nonce`/signature checks can be skipped by clients, PKCE cannot; plus the privacy gain**

Quoted from §5.5, Table 1: *"no ID token in front-channel (privacy improvement); nonce/signature check can be
skipped by clients, PKCE cannot (security improvement)."*

The reasoning is about **failure visibility**, and it generalises far beyond FAPI. A client that never
validates `c_hash` looks completely healthy — flows complete, users log in, and the defect can sit in
production for years. A client that omits the `code_verifier` gets an immediate `invalid_grant`. Given two
mechanisms of comparable strength, prefer the one whose absence is loud.

- **A** — size is not the issue.
- **C** — hybrid and PAR are not incompatible.
- **D** is false and backwards: suitability for formal analysis is one of the *reasons* for the redesign
  (§5.5, row 3), not a gap in the old flow's provenance.

### Q7 — **B) with only a code in the response, and PKCE making a stolen code useless, there is nothing left worth protecting**

§5.5: *"the authorization response is reduced to only contain the authorization code, obsoleting the need for
integrity protection."*

This is the module's cleanest example of a **design** decision beating a **mechanism**: rather than protecting
a valuable response, remove the value from the response.

- **A** — JARM is not insecure, and FAPI 2.0 Message Signing reintroduces it where non-repudiation is needed.
- **C** — JARM has no mTLS dependency.
- **D** is invented.

### Q8 — **B) an attacker simply does not use PAR**

Every FAPI `shall` in §5.3.2.2 is phrased in terms of what the AS **rejects**, because that is the only thing
an attacker cannot route around. If non-PAR requests are accepted, the parameters travel through the browser
and attacker **A3a** — who *"can also read the authorization request sent in the front channel"* — reads them.

- **A** is the seductive one, and it is wrong for a structural reason: security properties come from what the
  server *refuses*, not from what well-behaved clients happen to do. First-party client discipline is not a
  control an attacker respects.
- **C** inverts the flag's meaning.
- **D** is unrelated.

### Q9 — **B) the threat is already eliminated, so rotation adds cost without benefit**

§5.3.2.1 NOTE 1: *"The use of refresh token rotation does not provide security benefits when used with
confidential clients and sender-constrained access tokens. This specification prohibits the use of refresh
token rotation for security reasons as it causes user experience degradation and operational issues whenever
the client fails to store or receive the new refresh token and has no option to retry."*

Note *"for security reasons"* — the prohibition is not a usability concession. Lockouts push operators toward
longer token lifetimes and aggressive retry logic, both of which are worse than the theft-detection rotation
provided.

- **A** — rotation is not weak; it is *redundant here*.
- **C**, **D** are invented.

### Q10 — **B) FAPI 2.0 requires the token endpoint from an authoritative source, eliminating the attacker**

§7.6: *"Since the FAPI 2.0 Security Profile mandates that the token endpoint address is obtained from an
authoritative source and via a protected channel, i.e., through OAuth metadata obtained from the honest
authorization server, this attacker is not relevant in FAPI 2.0. The description here is kept for informative
purposes only."*

The instructive part is that the document keeps A4 rather than deleting it — a record of an attacker the
design *removed*, not merely mitigated. **A** is wrong (it was realistic in FAPI 1.0 — that is why it is
there). **C** is wrong: A2 is a network attacker; A4 is a misconfiguration model. **D** is invented.

---

## Tier 3 — Trace and diagnose

### Q11

**Defect: a service default has been recorded as a pass.** `authorizationCodeDuration: 0` does not mean "zero
seconds" and does not mean "60 seconds" — it means *use the service default*, and the field therefore
evidences nothing about the actual lifetime.

**It should say `NOT EVIDENCED`**, with a note: *"`authorizationCodeDuration: 0` selects the service default;
the effective value is not observable from configuration. Requires an empirical test (issue a code, wait 61
seconds, attempt redemption) or vendor documentation."*

**Why this matters more than it looks.** A false PASS is worse than a FAIL, because a FAIL gets remediated
and a PASS gets trusted. An auditor's willingness to write "I could not determine this" is the main thing
separating a report that is useful from one that is decorative. The same discipline applies to any
`0`/`null`/`default` value in a configuration audit.

### Q12

Three defects:

1. **HTTP 200 with an error body.** Any monitor checking status codes reports this endpoint as healthy,
   permanently. This is the one that matters most to an operator: it does not merely fail, it fails
   *invisibly*, and it will never appear on a dashboard or trigger an alert.

   > **Fixed 2026-08-11**, and the fix is part of the answer. The cause was not the SDK and not FAPI: the
   > global error handler derived the HTTP status from the thrown error, and `AuthleteError` subclasses
   > carry the status of the response they were *reading* — `200`, for a body that failed validation. One
   > clause (trust an error-supplied status only inside 400–599) fixed it across all 57 SDK call sites.
   > The endpoints still return 500, because the enum gap that makes them *fail* is a different defect.
   > Full marks now require separating the two.
2. **A stack trace returned to the caller**, including absolute filesystem paths and internal module
   structure. On an unauthenticated endpoint this is information disclosure.
3. **An upstream/internal failure reported as `"Bad Request"`** — blaming the caller for a server-side
   problem. Same class as Module 06's token exchange, Module 08's back-channel logout, and Module 09b's
   federation endpoint. Fourth instance in this curriculum.

There is also a **consequence** worth naming separately: because both FAPI endpoints behave this way, the
deployment **cannot report its own FAPI posture**. In the lab you had to read the Authlete service
configuration directly to learn anything — the observability layer for the security profile is entirely
dark.

### Q13

**What the user believes:** the bank's access to their data has ended.

**What actually happened:** one refresh token was discarded. §6.5 is explicit that *"token revocation … is
not required to cause the revocation of the underlying grant. It is at the discretion of the AS to retain a
grant in case of token revocation."* So the grant — the record of consent — is intact, and any access tokens
already issued remain valid until they expire.

**What the user observes next time:** they open the app, it starts an authorization request, and they are
returned to the app **immediately with no consent prompt**, because the grant still exists and the AS has
nothing to ask. To the user this looks like the disconnect silently failed — or worse, like the bank
reconnected itself.

**Fix:** call the grant management API — `DELETE` on the grant resource URL with a token carrying
`grant_management_revoke` — and only report success on a 204. Additionally, keep access-token lifetimes short
enough that the §6.5 `should` clause is not load-bearing.

### Q14

**Error 1 — "supported" is being used to mean "required."** PAR, PKCE and DPoP being *supported* satisfies no
FAPI requirement. §5.3.2.2 requires the AS to **reject** requests sent without PAR and to **require** PKCE
with S256. A deployment that supports all three and mandates none is not partially compliant; on those
requirements it is simply non-compliant, because an attacker chooses the weakest permitted option.

**Error 2 — the formal verification is being attributed to the deployment.** The proof concerns the
*specification*. Attacker Model §8.5 states that *"Real-world implementations, of course, sometimes deviate
from the specified and formally analyzed behavior and contain security vulnerabilties on various levels."*
Nothing about the profile's proof implies anything about this deployment's code.

The two errors are independent, and each alone invalidates the sentence.

### Q15

**The argument is wrong, and the way it is wrong is instructive.**

It is right on one narrow point: not following a `should` is not a violation of a MUST, and the report should
not claim it is. Precision about modal verbs is a virtue and the team is exercising it.

But it draws the wrong conclusion, for two reasons.

**First, Module 07's rule:** a SHOULD without a written rationale is a finding; a SHOULD with one is a
decision. The team has produced no rationale for retaining valid access tokens after consent withdrawal —
they have produced a reason not to *call* it a violation, which is a different thing.

**Second, and decisively: severity comes from the interaction, not the modal verb.** The `should` is
tolerable in the specification's own terms only because access tokens are assumed short-lived. At
`accessTokenDuration: 86400` that assumption is false, and the two individually defensible settings combine
into: *a customer who withdraws consent remains exposed for up to 24 hours, with no indication.* In a
regulated context that is a compliance failure regardless of which modal verb the specification used.

**The correct report entry:** raise it as a finding, cite the `should`, state plainly that it is not a MUST
violation, and argue severity from the interaction with the token lifetime. Then note that the cheapest
remediation is not to implement access-token revocation at all — it is to shorten the lifetime, which fixes
this and reduces stolen-token value at the same time.

---

## Tier 4 — Adversarial and design

Free-response. These are strong answers, not the only ones.

### Q16 — FAPI 1.0 Advanced vs 2.0

**(a) What is different, and why 2.0 is smaller.** They are products of two different *methods*. FAPI 1.0
enumerated threats and added a countermeasure to each, accreting mechanisms. FAPI 2.0 starts from an explicit
attacker model and derives the minimum set of requirements that provably achieves three stated goals. The
result is fewer moving parts: JAR → PAR, JARM → plain `code`, `s_hash` → PKCE, `code id_token` → `code`,
MTLS-only → MTLS or DPoP. "Battle-tested" is a fair point about *deployment maturity*, but it is being used
here as if it were an argument about *design quality*, and on that axis 2.0 is the later and better-founded
document.

**(b) Does "more mechanisms" mean "more secure"? No — and the hybrid flow is the counter-example.** FAPI 1.0
Advanced used the ID token in the front channel as a detached signature. That mechanism *can be silently
skipped by a client* and everything still appears to work. FAPI 2.0 removed it in favour of PKCE, which
cannot be skipped without an immediate `invalid_grant`. **A mechanism whose absence is invisible is worse
than no mechanism, because it produces false confidence.** More surface also means more to implement wrongly
— and Attacker Model §8.5 puts implementation errors outside the proof entirely, so each additional mechanism
adds risk the formal analysis does not cover.

**(c) What I need to know about their client population before choosing mTLS or DPoP.** Are the clients
server-side services under the ecosystem's control, or third-party and heterogeneous? Is there existing PKI
and certificate lifecycle management, and who runs it? Do TLS-terminating proxies or CDNs sit in front of the
resource servers (mTLS breaks or requires certificate pass-through — the thread from Module 05)? Are there
browser-based or mobile clients, where client certificates are impractical and DPoP is the only workable
option? Roughly: **mTLS where there is already a PKI and controlled infrastructure; DPoP where clients are
diverse or browser-resident.** FAPI 2.0 permits either, so this is an operational decision, not a security
one.

**(d) When I would genuinely recommend FAPI 1.0 Advanced.** When the ecosystem they must interoperate with
*already mandates it* — UK Open Banking and several national schemes are on 1.0 Advanced, and conformance is
contractual. Interoperability with a mandated profile beats abstract design quality every time. A second,
narrower case: an existing 1.0 Advanced deployment where migration cost is real and the threat model has not
changed — in which case the right answer is a migration plan, not a rewrite. What I would not accept is
choosing 1.0 for a *new* ecosystem on the grounds that it has more mechanisms.

### Q17 — Attacker-by-attacker analysis

Deployment: no mandatory PAR, no mandatory PKCE, `client_secret_basic`, 24-hour bearer tokens, open redirect
on logout, `iss` returned.

| Attacker | Defeats the authorization goal? | Route |
|---|---|---|
| **A1** — web attacker | **Yes** | Sends a link to the open redirect (Module 08's `startsWith` bug). Because PKCE is not required, a code obtained through any redirect-based manipulation is redeemable with only `client_id` — Module 03 proved a bare replay yields a live token. Needs no special capability at all. |
| **A1a** — web attacker as AS | **Yes, but narrowly** | The classic mix-up route is closed: `iss` **is** returned and this is a genuine PASS. A1a retains A1's capabilities, so it still wins via the open redirect — but not *as an AS*. Worth stating precisely: the control that addresses this attacker works. |
| **A2** — network attacker | **Yes** | Sender-constraining is absent, so any observed access token is fully usable for 24 hours. TLS means A2 must first defeat transport, but the point is that FAPI's defence-in-depth against this attacker — binding the token to a key — is simply not deployed. |
| **A3a** — read authorization request | **Yes** | No mandatory PAR, so the full request traverses the front channel and lands in browser history, referrers and proxy logs. No mandatory PKCE, so a captured code is redeemable. This is the pair of failures FAPI 2.0 is most directly designed to prevent. |
| **A5** — read resource requests | **Yes** | Reads a bearer token out of resource-server proxy logs and replays it for up to 24 hours. Under DPoP or mTLS the logged token would be useless without the key. |

**Cheapest fixes ranked by attackers disarmed:**

1. **Set `fapiModes`** (one console setting). Makes PAR and PKCE mandatory and restricts client auth and
   response types in one move — disarms **A3a** directly and removes A1's easiest code-theft path. Best
   ratio by a wide margin.
2. **Fix the open redirect** (one line, exact-match comparison). Disarms the only route available to
   **A1** and closes A1a's non-AS route. Cheapest absolutely.
3. **Require DPoP** (already proven working here in Module 05). Disarms **A2** and **A5** together, because
   both depend on a stolen token being usable by its holder.
4. **Shorten `accessTokenDuration`.** Disarms nobody outright but reduces the value of every successful
   attack, and repairs the grant-revocation gap as a side effect.

Note that (1) and (2) are both essentially free, and between them they address four of the five attackers.
That ratio is the argument to put in front of a budget holder — not the length of the failure list.

### Q18 — "Withdraw consent and access must cease"

**Mechanism, and why RFC 7009 is insufficient.** Use the **grant management API**: `DELETE` on the grant
resource URL with a token carrying `grant_management_revoke`, and treat only a 204 as success. RFC 7009 is
insufficient because it discards a *credential*, not the *authority* — §6.5 states that token revocation *"is
not required to cause the revocation of the underlying grant."* The user's consent record survives, so the
next authorization request completes with no prompt. A "disconnect" button on RFC 7009 is a lie in the UI.

**The guaranteed window, and what determines it.** Grant revocation gives an immediate MUST on refresh
tokens, so **no new tokens can be minted** from the moment of the call. Existing access tokens are only a
`should`. Therefore:

- If access tokens are **self-contained** (RFC 9068 JWTs validated offline), the worst-case window equals the
  **access-token lifetime**. At 86400 that is 24 hours — not defensible to a regulator.
- If access tokens are **opaque and introspected per request** (Module 04), cessation is effectively
  immediate, bounded by any introspection cache TTL.

So the honest guarantee is: **max(remaining access-token lifetime) if validated offline; introspection cache
TTL if validated online.** Say which one you are, and state the number.

**My design and its trade-off.** Opaque access tokens with mandatory introspection at the resource server, a
short cache TTL (≤60 s), and an access-token lifetime of 5–10 minutes as a second bound. Guaranteed
cessation window: **≤60 seconds.** The cost is exactly the trade-off Module 04 framed: every resource request
now depends on the AS being reachable, adding latency and making the AS a hard availability dependency for
the whole estate. That is a real price and I would state it in the design document rather than bury it —
mitigated with introspection caching, AS redundancy, and a documented, deliberately-chosen fail-closed
behaviour when the AS is unreachable.

**How I would prove it works.** This is the part most answers skip, and Attacker Model §8.5 is exactly why it
cannot be skipped: the profile's formal proof says nothing about my implementation. So the evidence has to be
empirical and continuous:

1. **An automated end-to-end test in CI:** create a grant → obtain tokens → revoke the grant → assert that
   the refresh token fails, and that a resource request with the access token fails **within the stated
   window**. That test *is* the regulatory claim, expressed executably.
2. **A negative test that would catch regression:** assert that RFC 7009 revocation alone does **not** leave
   the grant queryable — pinning the distinction the design depends on.
3. **Production evidence:** audit-log the revocation event and the first subsequent rejected request, so the
   actual window is measurable in the field rather than only asserted in a test environment.
4. **Third-party conformance testing** against the profile, with the honest caveat that it validates protocol
   behaviour and not this control.

The general principle worth stating to the regulator explicitly: **a specification's proof covers the design;
only your tests cover your code.** Offering the test suite as the evidence is a stronger position than
offering the certification.
