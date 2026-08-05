# Exam A — Answer Key

Each answer names the module to return to. **That pointer is the output of the exam**, not the score.

---

## Section 1 — Wire level (25)

### A1 (12) — the flow → *Module 02 §"RFC 6749 §4.1 parameter by parameter", Module 03*

**Leg 1 — authorization request. Browser (front channel), GET.**
```
GET /authorize?response_type=code&client_id=…&redirect_uri=…&scope=…&state=…
   &code_challenge=…&code_challenge_method=S256
```
**Leg 2 — authentication + consent.** Between user and AS only; the client never sees credentials.

**Leg 3 — authorization response. Browser (front channel), 302.**
```
302 Location: https://client.example/cb?code=…&state=…&iss=…
```
**Leg 4 — token request. Direct (back channel), POST.**
```
POST /token
grant_type=authorization_code&code=…&redirect_uri=…&client_id=…&code_verifier=…
```
**Leg 5 — token response. Direct.** `access_token`, `token_type`, `expires_in`, `scope`, often `refresh_token`.

**Marking (12):** 5 legs correct and complete (5); front/back channel correctly assigned (2); "the user agent
can read *and modify* everything on legs 1 and 3, and sees nothing of 4 and 5" (2).

**The one parameter (3):** `state`. Its removal still yields tokens; it defends against CSRF on the redirect
(RFC 6749 §10.12) — an attacker causing the victim's browser to deliver the *attacker's* code, binding the
victim's session to the attacker's account. **Accept `iss` as an alternative** with the mix-up justification.
Do **not** accept `code_challenge` — removing it breaks security *and* the whole point of the question.

### A2 (8) — one mark per parameter → *Modules 02, 03, 05*

| Parameter | Does | Without it |
|---|---|---|
| `state` | Binds the response to the client's session | CSRF / session fixation on the redirect |
| `code_challenge` | Commits to a secret the client will later prove | Code interception succeeds |
| `code_challenge_method` | Names the transform (`S256`) | Defaults to `plain` (§4.3) — the challenge *is* the verifier |
| `code_verifier` | Proves possession at redemption | Nothing binds the code to the requester |
| `redirect_uri` **at the token endpoint** | Must match the one used at authorization | A code obtained for one redirect is redeemable against another |
| `scope` | Requested authority | AS applies a default; you get more or less than intended |
| `client_id` | Identifies the client | AS cannot resolve registration, redirect URIs or policy |
| `iss` | Identifies which AS answered | Mix-up: the client sends the code to the wrong AS |

Half marks for "does" without "breaks without it".

### A3 (5) — where a front-channel value leaks → *Module 00*

Any three of: **browser history**; the **`Referer` header** to a third party if the callback page loads
external resources; **server access logs** and any TLS-terminating proxy; **browser extensions** with tab
access; **shared/sync'd history**; the URL being **copy-pasted or screenshotted**; on mobile, another app
that **registered the same URL scheme**.

---

## Section 2 — JOSE and trust (20)

### A4 (6) — two marks each → *Module 00 §"decode ≠ verify"*

1. **They pasted a live credential into a third party.** The token is now in someone else's logs. Decoding is
   an offline operation; there is no reason to send it anywhere.
2. **Decoding is not verifying.** base64url is an encoding, not a signature check. A tampered token decodes
   perfectly.
3. **"Correctly" is not a property decoding has.** It says nothing about issuer, audience, expiry, or whether
   the signature matches a key you trust.

### A5 (8) → *Module 00 Break 2, Module 08 step 7*

**(a) 3 pts — nothing.** `alg: none` means the signature is absent; the verifier has confirmed the payload is
well-formed base64url JSON and no more. Every claim is attacker-controlled.

**(b) 2 pts —** reject any algorithm not on an **expected list decided in advance** by the verifier. The
check must not read `alg` from the token to decide how to verify; the token does not get a vote.

**(c) 3 pts —** `HS256` where `RS256` was expected is **algorithm confusion**: the verifier is tricked into
using the *public* key as an HMAC secret. The public key is public, so anyone can forge. Same shape as
`alg: none` — **the attacker chose the verification procedure** — but it fails a naive "is there a signature?"
check, which is why it is more dangerous.

### A6 (6) → *Module 00, SPEC-INVENTORY §1*

| | |
|---|---|
| Signature envelope | **RFC 7515** JWS |
| Key format / JWK Set | **RFC 7517** JWK |
| `ES256` identifier | **RFC 7518** JWA |
| Registered claim `exp` | **RFC 7519** JWT |
| Canonical hash of a public key | **RFC 7638** JWK Thumbprint |

Accept RFC 7516 (JWE) mentioned for encryption. One mark each, plus one for a correct extra.

---

## Section 3 — Delegation (15)

### A7 (9) — five harms → *Module 01*

Roughly 1 pt per harm + 0.8 per correct mechanism:

| Harm | Mechanism |
|---|---|
| **Unbounded scope** — the credential grants everything the user can do | `scope`; consent |
| **No revocation granularity** — revoking means a password change, breaking every other client | Per-token/per-grant revocation (RFC 7009, grant management) |
| **No attribution** — the RS cannot tell the client from the user | `client_id` bound into the token; `act` for delegation |
| **Credential replication** — the secret exists in N places, so N breach surfaces | The client never sees the credential |
| **No expiry** — a password is valid until changed | `exp`, short-lived tokens, refresh |
| **Blocks stronger authentication** — MFA, passkeys, federation cannot work if a client replays a password | Redirect to the AS, which owns authentication |

Any five. The last is the one most people miss and is worth flagging in review.

### A8 (6) → *Module 01*

**The four (3 pts):** resource owner, client, authorization server, resource server.

**The two extras (3 pts):**
- **The user agent** — appears in RFC 6749 §1.2's protocol flow but is not a §1.1 role. It matters because it
  is *untrusted and unavoidable*: it relays the front channel and can read and modify everything on it.
- **The policy engine** — no spec role at all; a deployment fact (Authlete here). It matters because most
  behaviour you will debug is decided *there*, not in the server's own code, which is why "the spec says X"
  and "this deployment does X" are different claims.

---

## Section 4 — PKCE (20)

### A9 (10) — the derivation → *Module 03*

Expected chain (2 pts each for the five moves):

1. A public client cannot authenticate at the token endpoint, so **possession of the code is the only thing
   the AS can check** — and the code travelled through the browser.
2. Therefore the client needs to prove it is the same party that *started* the flow: a secret created per
   request, committed to at the authorization endpoint, revealed at the token endpoint.
3. The commitment travels the **front channel**, so it must be useless to anyone who reads it. **Hence a
   one-way transform**: send `SHA-256(verifier)`, not the verifier. `plain` fails exactly here — an attacker
   who reads the request gets the verifier itself.
4. The proof must travel the **back channel**, where the attacker cannot see it — hence `code_verifier` at
   the token endpoint. Sending it at the authorization endpoint would put both halves on the same visible
   channel and prove nothing.
5. The AS must **bind the challenge to the code at issuance** and reject a mismatch — otherwise the check is
   optional in practice.

Full marks require both the "why hashed" and "why at the token endpoint" reasons explicitly.

### A10 (5) → *Module 03 §"state vs PKCE"*

- **`state`** stops **CSRF on the redirect**: an attacker's code delivered to the victim's browser, logging
  the victim into the attacker's account.
- **PKCE** stops **code interception**: the attacker steals a legitimate code and redeems it.

**Not substitutable (2 pts):** `state` is checked by the **client** and proves the response belongs to a flow
this client started — it says nothing about who redeems the code. PKCE is checked by the **AS** and proves the
redeemer started the flow — it says nothing about which browser session the response landed in. Different
party checks it, different property.

### A11 (5) → *Module 03, RFC 9700 §4.8*

**PKCE downgrade.** Rule, **both directions** (2.5 each):

1. If a `code_challenge` was present at authorization, the AS **MUST** require a matching `code_verifier` at
   the token endpoint.
2. If a `code_verifier` arrives for a code issued **without** a challenge, the AS **MUST** reject it —
   otherwise an attacker strips the challenge on the way in and the client never notices.

---

## Section 5 — Integrative (20)

### A12 (8) → *Module 03 (RFC 8252) + Module 01*

**The team is wrong (2).** **RFC 8252, "OAuth 2.0 for Native Apps", a published RFC and BCP 212 (Oct 2017)
(2)** requires an **external user-agent** and §8.12 prohibits embedded user-agents.

**What PKCE does and does not do (4).** PKCE protects the **authorization code** in transit and at
redemption. It does **nothing** about an embedded webview, because the webview is the *attacker* in that
model: the host app can read the credentials the user types, read cookies, and read the entire response —
it does not need to steal a code when it can take the password. That is **the password anti-pattern
reintroduced** (Module 01) behind an OAuth-shaped façade. Secondary loss: no SSO with the system browser, and
the AS cannot use platform authenticators.

### A13 (6) → *Modules 02–03, framing from 07*

**What is wrong (2):** "supported" is being recorded as if it were a security property. Advertising a
mechanism defends nothing, because the attacker chooses which to use; and advertising **`plain`** is itself
the finding — `plain` offers no protection against anyone who can read the authorization request.

**Correct finding (2):** *"`plain` is advertised as an accepted `code_challenge_method`. RFC 9700 §2.1.1
recommends S256. A client — or an attacker downgrading the request — may use `plain`, under which the
challenge is the verifier and PKCE provides no protection against an attacker who can read the front channel."*

**Evidence (2):** the `code_challenge_methods_supported` value from the discovery document, **plus** an
observed request: a live flow completed with `code_challenge_method=plain`, or with no PKCE at all. Advertised
metadata alone is one source; Module 07 will call this triangulation, and the second source is what turns a
suspicion into a finding.

### A14 (6) `[lab]` → *Module 03*

```bash
node -e 'const c=require("crypto");process.stdout.write(
  c.createHash("sha256").update(process.argv[1],"ascii").digest("base64url"))' \
  -- 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
```
```
E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
```
**4 pts** for the correct value with working shown — `base64url(SHA-256(ASCII(verifier)))`, unpadded. This is
RFC 7636's own worked example from **Appendix B**, so it is checkable against the RFC. Deduct for padding left on, or for hashing the
base64url-decoded bytes rather than the ASCII string.

**2 pts:** §4.1 constrains **length — 43 to 128 characters** — from the `unreserved` set of RFC 3986. The
lower bound exists because the verifier must carry enough entropy that it cannot be guessed or brute-forced
from the challenge; 43 base64url characters is ~256 bits.

---

## Bonus — A15

Unscored. Two strong answers:

- **Make PKCE with S256 mandatory** (reject requests without it, in both directions). One configuration flag,
  closes the highest-frequency real-world attack, breaks almost nothing.
- **Exact redirect-URI matching.** Also one setting, and it removes the open-redirect and
  wildcard-subdomain class entirely.

What is being marked, if you were marking: whether the reasoning names an **attacker and a cost**, not just a
mechanism. "Enable DPoP" is a weaker answer here despite being a stronger mechanism, because the effort is
much higher and it defends a rarer attack than the two above.

---

## Score

| | |
|---|---|
| **85+** | Move on to Module 04. |
| **70–84** | Move on, but re-read the modules behind your misses — 04 and 05 build directly on 02 and 03. |
| **55–69** | Redo Module 03's lab, especially Break 3, before continuing. |
| **< 55** | Work back through 00–03 with the labs. Reading them again without running them will not fix it. |

**Where your misses point:**

| Missed | Return to |
|---|---|
| A1, A2, A3 | Module 02 — the flow and its parameters |
| A4, A5, A6 | Module 00 — JOSE and decode ≠ verify |
| A7, A8 | Module 01 — the delegation problem |
| A9, A10, A11, A14 | Module 03 — PKCE |
| A12 | Module 03's RFC 8252 section |
| A13 | Module 02's threat framing; the method is formalised in Module 07 |
