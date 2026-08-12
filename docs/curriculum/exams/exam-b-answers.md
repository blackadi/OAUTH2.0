# Exam B — Answer Key

---

## Section 1 — Token lifecycle (25)

### B1 (8) → *Module 04*

| Dimension | Self-contained (JWT) | Reference (opaque) |
|---|---|---|
| **Latency** | No network call; validate locally | An introspection round trip per request (cacheable) |
| **Revocation** | Stale until `exp` — the revocation lag | Effectively immediate |
| **Availability** | RS keeps working if the AS is down | RS hard-depends on the AS |
| **Confidentiality** | Claims readable by anyone holding the token | Opaque; contents only via an authenticated call |

**The deciding question (3 pts):** *"What revocation latency can you tolerate?"* Everything else is a
consequence. If the answer is "seconds", you need introspection (or tokens short enough that the lifetime
*is* your latency). If the answer is "minutes to an hour is fine", self-contained wins on cost and
availability.

Accept an equally-well-argued alternative framing on availability ("can the RS tolerate the AS being down?"),
provided the candidate explains why it dominates.

### B2 (7) → *Module 04, RFC 7662*

1. **The endpoint must be protected.** §2.1: *"To prevent token scanning attacks, the endpoint MUST also
   require some form of authorization to access this endpoint."* Without it, anyone can submit guesses and
   ask the AS to confirm which strings are live tokens. (**This repo fails it** — Module 04's finding.)
2. **A non-active token gets `{"active": false}` and nothing else.** §2.2. No error, no distinction between
   "expired", "revoked", "never existed", "belongs to another client". Otherwise the response itself becomes
   an oracle that leaks token state and existence.

3.5 each. Full marks need both the requirement and the attack.

### B3 (5) → *Module 04, RFC 7009 §2.2*

**200 (3 pts).** RFC 7009 requires the AS to respond 200 for an invalid token, because the goal state —
"this token cannot be used" — is already true.

**What the honest answer would enable (2 pts):** a distinguishable response (404, or an error) tells the
caller *this string was never a token* versus *this was a token and is now revoked*, which is a token-scanning
oracle. Same reasoning as B2.2.

### B4 (5) → *Module 04, RFC 8707*

`resource` is a **request** parameter naming the API the token is for; the AS reflects it into the token's
**`aud`** claim. Absolute URI, no fragment; may appear multiple times. **RFC 8707, Resource Indicators for
OAuth 2.0.**

**What most RSs do not do (2 pts):** actually **check that they are in `aud`, and reject if not.** Without
that check, audience restriction is decoration: a token minted for the low-value reporting API is accepted by
the payments API. Requesting `aud` costs nothing if nobody verifies it.

---

## Section 2 — Request integrity and binding (25)

### B5 (8) → *Module 05 (+ Module 10 for the last part)*

- **PAR** protects **confidentiality and integrity of the request in transit through the browser**: the
  parameters never traverse the front channel at all, only an opaque, single-use, short-lived `request_uri`.
- **JAR** protects **integrity and authenticity of the request's contents**: the parameters are inside a JWS
  the client signed.

**JAR only (2):** **non-repudiation** — a signed request object proves *which client authored these exact
parameters*, verifiable later by a third party. PAR authenticates the push but leaves no signed artifact
about the contents.

**PAR only (2):** the parameters are **never exposed to the browser**. A signed request object is still
readable by anyone who sees it — JAR gives integrity, not confidentiality. PAR also removes URL-length limits.

**FAPI 2.0 chose PAR (2):** §5.5 — *"integrity protection and compatibility improvements for authorization
requests."* Fewer moving parts for the same goal; JAR returns in FAPI 2.0 Message Signing where
non-repudiation is genuinely required.

### B6 (9) → *Module 05, RFC 9207*

**Setup (2):** the client supports AS-Honest and AS-Attacker. The attacker controls, or has compromised, the
second AS — FAPI 2.0's attacker **A1a**.

**Steps (4):**
1. The victim begins a login and selects AS-Attacker (or the attacker induces that choice).
2. The client starts a flow with AS-Attacker and records "this session is with AS-Attacker".
3. AS-Attacker does **not** authenticate anyone. It redirects the victim's browser to **AS-Honest**'s
   authorization endpoint, replaying the client's own parameters.
4. The victim authenticates at AS-Honest — which looks entirely legitimate, because it is.
5. AS-Honest issues a code to the client's registered redirect URI.
6. The client receives a code, believes it belongs to the AS-Attacker session, and **sends the code — and its
   client credentials — to AS-Attacker's token endpoint.**

**What the attacker holds (1):** a valid authorization code issued by **AS-Honest**, plus the client's
credentials for the honest AS. They redeem it and obtain the victim's tokens.

**Where `iss` breaks it (1):** the authorization response from AS-Honest carries `iss=AS-Honest`. The client
compares it with the AS it *thinks* it is talking to, sees a mismatch, and aborts before sending anything.

**Why PKCE does not stop it (1):** PKCE binds the code to the *client* — and the legitimate client is the one
redeeming it. The client holds the verifier and will happily send it, to the wrong endpoint. PKCE answers "is
the redeemer the party that started the flow?"; mix-up is about **which AS answered**, a question PKCE never
asks.

### B7 (8) — two marks each → *Module 05, AGENTS.md's DPoP notes*

Any four; at least two must be decoder-invisible:

| Cause | Check |
|---|---|
| **DER-encoded ES256 signature** instead of raw P1363 R‖S | Signature length — must be exactly 64 bytes for P-256. *Looks fine in a decoder.* |
| **`kid` in the header instead of `jwk`** | RFC 9449 §4.2 requires the public key as a `jwk` member in the JOSE header. *Looks fine in a decoder.* |
| **`sub` used instead of `ath`** when the proof accompanies an access token | §4.3 — `ath` is base64url(SHA-256(access token)). *Looks fine in a decoder.* |
| **`htu` mismatch** | The URI the server derives from its own `Host` header may omit the port or differ behind a proxy |
| **`htm` mismatch** | Method must match, uppercase |
| **`iat` outside the acceptance window**, or a replayed `jti` | Clock skew; nonce/`jti` cache |
| **Missing or stale `DPoP-Nonce`** | Retry with the nonce from the 401 response |

The first three are the ones this repo's own `AGENTS.md` documents as the real-world traps, and all three
survive casual inspection — which is the point of the "decoder-invisible" requirement.

---

## Section 3 — Machine and delegated grants (20)

### B8 (6) → *Module 06*

**Why the absence is the semantics (4):** in the client-credentials grant there **is no resource owner**. The
client acts as itself, on its own authority, granted at registration. A `sub` would have to name a user, and
naming one would be a lie. So the missing claim is not an omission — it is the grant saying *"nobody delegated
this."*

**The bug (2):** an RS that does `const user = token.sub` and uses it for authorization, logging, or
attribution. With a client-credentials token `sub` is `undefined`, so you get a crash, or — worse — a lookup
against `undefined` that matches a row, or an audit log recording an empty actor. This repo has a related
real defect: `token-exchange-response.handler.ts` falls back to `result.subject || subjectToken`, writing a
**live access token** into the `sub` field when Authlete resolves no subject.

### B9 (8) → *Module 06, RFC 7523*

**Job 1 — §2.1: the JWT as an authorization grant.** `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`
with an `assertion`. The JWT *is* the authorization: it asserts something about a **subject**, and the AS
issues a token for that subject.

**Job 2 — §2.2: the JWT as client authentication.** `client_assertion_type=…:jwt-bearer` with a
`client_assertion` — this is `private_key_jwt`. The JWT proves **which client** is calling, and carries no
authorization at all.

**Why conflating them inverts the properties (4):** they have different subjects, different trust anchors,
and different consequences.
- In §2.1 the assertion says *"this user authorized this"*, and the trust anchor is the **issuer's** key. If
  you accept an assertion from an issuer permitted to assert *any* subject, that issuer can mint access for
  any user — which Module 06 demonstrated live: changing one field to `sub: alice` produced a token
  introspecting as `alice`, for a user who never authenticated.
- In §2.2 the assertion says *"I am client X"*, and the trust anchor is the **client's** key. It grants
  nothing.

Someone who thinks "we use RFC 7523" has said nothing about their security posture until they say **which
section**. Treating a §2.1 assertion with §2.2's threat model is how you get an AS that mints tokens for
arbitrary users.

### B10 (6) → *Module 06, RFC 8693*

**The parameter: `actor_token`** (with `actor_token_type`) (2). **The claim: `act`** (2), which nests to
record a chain.

**What is lost (2):** the audit trail. RFC 8693 §1.1 defines **impersonation** as the case where the
downstream is *"indistinguishable"* from the subject acting directly — so without `actor_token`, a delegation
request is answered with an impersonation token and the downstream service cannot tell whether the clinician
called it or a partner system called it on their behalf. Impersonation is delegation with the audit trail
deleted, and it is the **default** if you omit one optional parameter.

---

## Section 4 — The audit method (15)

### B11 (7) → *Module 07*

**The three sources (3):**
1. **Advertised** — discovery metadata. Fails by being *aspirational*: it says what is supported, and
   supported is not required.
2. **Configured** — the service/client configuration. Fails by being *invisible to clients* and often
   contradicting what is advertised.
3. **Observed** — what actually happens when you send a request. Fails by being *incomplete*: you only see
   the paths you tried.

**Example of a divergence (4):** any real one. The strongest from this curriculum: the discovery document
advertises an **empty** `revocation_endpoint_auth_methods_supported`, while an observed request shows
revocation **requires** client credentials — so the metadata misdescribes the endpoint, and only
advertised-versus-observed catches it. *(Until 2026-08-12 the sibling case was sharper still: introspection
advertised an empty array and required **nothing**, so the two endpoints diverged in opposite directions. It
now requires the deployment's admin credentials — RFC 7662 §2.1 — and its empty array stayed empty, since no
**client** authentication method is supported there. Accept either version; the second is the better answer,
because it shows metadata can be accurate about a capability and silent about a control. See Module 07
Exercise 5a.)* Another: metadata says
`require_pushed_authorization_requests: false`, configuration says `fapiModes` is unset, and observation
confirms a non-PAR request succeeds — three sources agreeing is also a result worth recording.

### B12 (4) → *Module 07*

**The rule (2):** *a SHOULD without a written rationale is a finding; a SHOULD with one is a decision.*

**The distinction (2):** a SHOULD is a requirement the spec expects you to meet unless you have understood
the trade-off and chosen otherwise. So the reviewer is not asking "did you comply?" but "did you *decide*?"
An unmet SHOULD nobody has thought about is a gap; an unmet SHOULD with a documented reason and a compensating
control is an engineering choice, and reporting it as a violation wastes everyone's time.

### B13 (4) → *Module 07*

**Status (1):** an **active Internet-Draft** (`draft-ietf-oauth-v2-1`). **Not** a published RFC, and must
never be cited as normative.

**What it does (2):** consolidates RFC 6749, 6750, 7636, 8252 and others into one document; **requires** PKCE
for authorization-code flows; **omits** the implicit and password grants; **restricts** bearer tokens in query
strings and requires exact redirect-URI matching.

**The common false claim (1):** that OAuth 2.1 *prohibits* the implicit grant. It does not prohibit it — **it
does not specify it.** The distinction matters: a deployment supporting implicit is not violating OAuth 2.1,
it is outside it. (RFC 9700 §2.1.2 is where the normative discouragement lives.)

---

## Section 5 — Integrative (15)

### B14 (8) → *Modules 03, 04, 05, 07*

**Supportable from the document alone (4):**

1. **`none` is an advertised token-endpoint auth method.** An attacker picks the weakest permitted option, so
   the effective client-authentication strength of the deployment is "none" unless enforced per client.
   Evidence: the metadata value itself.
2. **PAR is not required.** `require_pushed_authorization_requests: false` — authorization parameters traverse
   the front channel, readable by attacker A3a.
3. **A PASS worth recording:** only `S256` is advertised for PKCE — no `plain` downgrade — and
   `authorization_response_iss_parameter_supported: true`, so mix-up detection is available. A report that
   only lists failures is less useful than one that says what is already right.

**What you would need to observe (4):**

- For (1): whether any *real* client is registered with `none`, and whether a token request using `none`
  actually succeeds. The metadata is service-wide; per-client configuration may pin something stronger — this
  repo's `[A157357]` behaviour is exactly that.
- For (2): a completed authorization-code flow with no `request_uri`, yielding a token.
- **Not stated but critical:** whether PKCE is *required*. `code_challenge_methods_supported` lists what is
  supported; nothing in the document says a request without `code_challenge` is rejected. That is a
  suspicion, and it needs an observed flow to become a finding.

The marking point is the **separation itself**: full marks require the candidate to distinguish what metadata
can and cannot evidence, not just to list problems.

### B15 (7) → *Module 04, Module 10*

**Worst case (3):** the blocklist push closes the gap to ~15 minutes **only for services that received it**.
The true worst case is the **full 24-hour token lifetime**, because: a service that is partitioned, restarting,
scaled up after the push, or simply missed one has a stale list; and an attacker who can prevent one service
from receiving the push (or who compromised it) holds valid access for the remaining lifetime. Distributed
state that must reach every node is a *best-effort* control, so it cannot be the basis of a guarantee. Full
marks require naming the token lifetime as the real bound, not 15 minutes.

**Two reducing designs (2 each):**

- **Shorten the access token to 5–10 minutes**, keeping offline validation and refresh on expiry. Window ≤ 10
  minutes, derived from the lifetime alone with no distributed state. Cost: refresh traffic; the AS is
  needed every few minutes rather than daily.
- **Opaque tokens with introspection and a short cache TTL.** Window = cache TTL, seconds. Cost: a hard
  availability and latency dependency on the AS for every request, which is precisely the trade-off
  the original design was avoiding.

**Which for a regulator (choice must be justified):** the **first**, in most cases. It gives a bound that is
a single number you can state and test — *"access stops within 10 minutes, worst case"* — with no dependency
on a push reaching every node. The second gives a better number and buys it with an availability dependency
that becomes an outage story. Either is defensible; **an answer that gives no number is not.**

---

## Score

| | |
|---|---|
| **85+** | Proceed to Module 08. |
| **70–84** | Proceed; re-read what you missed. Module 10 leans hard on Sections 2 and 4. |
| **55–69** | Redo Modules 05 and 07 with their labs before continuing. |
| **< 55** | Modules 04–07 again, labs included. |

| Missed | Return to |
|---|---|
| B1–B4 | Module 04 |
| B5–B7 | Module 05 |
| B8–B10 | Module 06 |
| B11–B13 | Module 07 |
| B14, B15 | Integrative — reread 04 and 07 together |
