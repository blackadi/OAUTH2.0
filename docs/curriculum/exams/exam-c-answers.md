# Exam C — Answer Key

---

## Section 1 — OIDC Core and logout (25)

### C1 (8) → *Module 08*

**Class (2):** authentication bypass by **token substitution**. The app treats *authorization* (a bearer
token) as *authentication* (proof of who is present).

**Concrete attack (3):** the user authorizes a low-value third-party app, which legitimately receives an
access token for `scope=profile`. That app — or anyone who obtains the token from a log, a proxy, a URL
fragment, a crash dump — presents it to this application's UserInfo call. The token is valid, UserInfo
returns the victim's `sub`, and the app sets `session.user` to it. **The attacker is logged in as the
victim.** Nothing was forged; the token was used exactly as designed, for a purpose it never established.

**Fix (2):** authenticate with the **ID token**, validated fully — critically `aud` (minted for *this* client)
and `nonce` (belongs to *this* login). UserInfo is for fetching claims *after* authentication.

**The principle (1):** *an access token says what the bearer may do, not who the bearer is* — it carries no
statement about **who is present at this client, right now**, and it has no audience binding to this client.

### C2 (9) → *Module 08, OIDC Core §3.1.3.7*

Order matters; roughly 1.5 per correctly-attributed defence.

| Step | Defeats |
|---|---|
| `iss` equals the expected issuer | **Substitution** — a token from another OP |
| **`aud` contains this client's ID** (and reject unexpected `azp`) | **Substitution** — a token minted for a *different client* at the same OP. The single most important step |
| `alg` matches what was **registered/expected**, before verifying | **Algorithm confusion** — `none`, or HS256-with-the-public-key |
| Signature verifies against the OP's key for that `alg`/`kid` | **Forgery** |
| `exp` in the future, `iat` recent | **Replay** of an old token |
| **`nonce` matches the value this client sent** | **Injection/replay** — a token from a different login, or one the attacker obtained elsewhere |
| `acr` / `auth_time` against policy, if required | Stale authentication |

Full marks require the mapping, not just the list. The two people most often omit are `aud` and `nonce`, and
they are the two that defeat substitution and injection respectively.

### C3 (4) → *Module 08*

**The asymmetry (2):** **`nonce` is inside the signature; `state` is not.** `nonce` is a claim in the ID
token, covered by the OP's signature; `state` is a bare query parameter with nothing protecting it.

**What follows (2):** `state` can be tampered with by anyone who can modify the front channel, and is checked
by the *client* against its own session — it protects against CSRF on the redirect. `nonce` cannot be altered
without breaking the signature, so it cryptographically binds the *token* to *this authentication request* —
it protects against token injection and replay. Different party, different protection, and neither substitutes
for the other. (FAPI adds `s_hash` precisely because `state` is otherwise unprotected.)

### C4 (4) → *Module 08*

| Spec | Cannot reach |
|---|---|
| **RP-Initiated Logout** | Anything the user did not initiate; only the RP that started it drives the flow |
| **Front-Channel Logout** | Any RP whose iframe fails to load — blocked third-party cookies, an offline RP, a closed browser. Silent partial failure |
| **Back-Channel Logout** | The **browser session itself** — it is a server-to-server POST, so cookies in the user's browser are untouched |
| **Session Management** | Anything after the polling iframe is gone; requires an open browser and cooperating RPs |

1 each. The instructive pair is front vs back channel: one reaches the browser but fails silently, the other
is reliable but cannot clear a cookie.

---

## Section 2 — Extensions (20)

### C5 (6) → *Module 09a*

| Assumption | Lifted by |
|---|---|
| The **response** is trustworthy (only the request needed protecting) | **JARM** |
| There **is a browser** to redirect | **CIBA** |
| **One authentication** covers the whole session | **RFC 9470 step-up** |
| **Scopes** describe authority well enough | **RAR** |

1.5 each. (Accept Native SSO / "one app per device" as a fifth.)

### C6 (7) → *Module 09a*

**Three mandatory claims (3):** `iss`, `aud`, `exp`.

**Over `state` (2):** `state` is unprotected — an attacker who can modify the front channel can alter the rest
of the response and leave `state` intact. JARM signs the **entire response**, so every parameter is covered.

**Over PAR/JAR (1):** PAR and JAR protect the **request**. Neither says anything about the **response**. JARM
completes the triangle — request confidentiality (PAR), request integrity (JAR), response integrity (JARM).

**Why `iss` inside a signature is stronger (1):** as a query parameter, `iss` is *detectable* tampering — the
client compares it and may notice. Inside the signature it is **structurally impossible** to forge without the
AS's key, so mix-up stops being something you detect and becomes something that cannot be constructed.

### C7 (7) → *Module 09a*

**The threat (3):** the prompt is **unsolicited**. In CIBA the user did not just tap "log in" — an
authentication request arrives on their device initiated by someone else. An attacker who knows a `login_hint`
(an email address, a phone number) can trigger prompts at will, and the user has no context to judge them.
This is push-notification fatigue: send enough prompts, or send one at a plausible moment, and someone
approves.

**No redirect analogue (2):** in a redirect flow the user *started* it and is looking at the browser they
started it in. Timing and context are self-authenticating. CIBA severs the initiating action from the
approving device, so nothing about the prompt's arrival tells the user it is theirs.

**`binding_message` (2):** it displays a short string on **both** the consumption device and the
authentication device, so a user who can see both can confirm they match — good against a *concurrent*
attacker racing a legitimate transaction. It does **not** help when the user cannot see the consumption
device, which is precisely the attacker-initiated case: the attacker supplies a plausible binding message and
the user has nothing to compare it against. People routinely believe it solves the unsolicited-prompt problem.
It does not.

---

## Section 3 — Credentials (20)

### C8 (8) → *Module 09b, RFC 9901*

Requirements, then the construction (2 per move):

1. The issuer signs **once**, not knowing which claims will later be shown; the holder must remove claims
   **without invalidating that signature**. So the signature cannot cover the values — it must cover
   **stand-ins** for them.
2. Use a **digest** of each claim. The issuer signs the digests; revealing a claim means handing over the
   preimage. Removing a claim leaves its digest in place and the signature intact.
3. But claim values come from **small, predictable sets** — `over_18` has two values, `nationality` ~200. An
   unsalted digest is brute-forceable in microseconds, so the verifier could recover exactly what the holder
   withheld, making selective disclosure decorative.
4. Hence the **salt**: ≥128 bits of fresh randomness per claim, so identical values give different digests and
   the preimage cannot be enumerated. RFC 9901 §9.3: a new salt **MUST** be chosen for each claim
   independently.

Full marks require step 3 explicitly — the salt is not "extra randomness for good measure", it is what makes
the scheme work at all.

### C9 (6) → *Module 09b*

**Defect 1 — disclosures merged without recomputing digests.** RFC 9901 §7.1/5 requires rejecting any
disclosure not referenced by a digest in the issuer-signed JWT. An attacker appends a self-made disclosure and
it is believed; the issuer signature still verifies because it covers the digests, not the disclosures.

**Defect 2 — key binding checked only if a KB-JWT is present.** §7.3/1: the decision **MUST NOT** be based on
whether the holder provided one. §9.5: otherwise an attacker strips the KB-JWT and the credential becomes a
bearer credential.

**Which is worse (2): defect 1.** Stripping key binding lets an attacker **replay a real credential they
obtained**. Forging disclosures lets them **manufacture claims that were never issued** — inventing a
qualification rather than borrowing one. Forgery beats theft.

### C10 (6) → *Module 09b, RFC 9901 §10.1*

**The property (2):** **Issuer/Verifier unlinkability against a careless, colluding, compromised or coerced
verifier.**

**Why not (2):** the issued credential carries the **issuer's signature** and is presented directly to the
verifier, who can simply forward it to the issuer. That is inherent to salted-hash selective disclosure, not
an implementation gap — §10.1 says it *"cannot be achieved"*.

**Verifier-to-verifier (2):** it fails by default too, because the **issuer-signed JWT is byte-identical
across presentations** (as is `cnf.jwk`), so two colluding verifiers link trivially even having seen disjoint
claims. The mitigation is **batch issuance** — many single-use credentials, each with its own holder key and
salts — at the cost of issuance volume, wallet pool management, a refill channel that itself must not become
a tracking vector, and harder revocation.

---

## Section 4 — FAPI and API security (25)

### C11 (7) → *Module 10*

**The six (4, roughly 0.7 each):**

| | |
|---|---|
| **A1** Web attacker | Controls endpoints on the internet, participates as a normal user, sends links to victims. Cannot intercept others' messages |
| **A1a** Web attacker as AS | A1, and can also participate **as an authorization server** in the ecosystem |
| **A2** Network attacker | Controls the whole network; intercepts, blocks and tampers. Cannot break crypto |
| **A3a** Read authorization request | A1, and can **read the authorization request** in the front channel |
| **A4** Read/tamper token requests | Makes the client use a token endpoint that is not the honest AS's — **declared irrelevant in FAPI 2.0**, because metadata comes from an authoritative source |
| **A5** Read resource requests | A1, and can **read requests to the resource server** after processing (e.g. proxy logs) |

**Out of scope (2), any three:** TLS is assumed unbroken; JWKS distribution works; browsers and endpoints are
uncompromised; identity proofing and end-user authentication; weak randomness; **implementation errors**
(§8.5); new vulnerabilities over time.

**Why exclusions strengthen the claim (1):** a claim that covers everything is unfalsifiable and therefore
worthless. Stating the boundary makes the *inside* provable and tells a reviewer exactly where to look —
§8.5 in particular is why "formally verified" says nothing about your code.

### C12 (5) → *Module 10, FAPI 2.0 §5.3.2.1 NOTE 1*

1. Rotation exists to **detect** refresh-token theft: a replayed old token reveals a compromise.
2. FAPI 2.0 already requires **confidential clients** and **sender-constrained tokens**, so a stolen refresh
   token is useless without the client's key. The threat rotation detects is already eliminated.
3. Rotation therefore contributes **zero** benefit and **non-zero** harm: a client that fails between
   receiving and persisting a new refresh token is permanently locked out with no retry.
4. A control with no benefit and real cost is **not neutral — it is a defect**. And the spec says the
   prohibition is *"for security reasons"*, because lockouts push operators toward long-lived tokens and
   aggressive retry, both worse than the original threat.

### C13 (6) → *Module 11*

| ID | Title | Attacker changes |
|---|---|---|
| **API1:2023** | Broken Object Level Authorization | The **object identifier** — wrong row |
| **API3:2023** | Broken Object Property Level Authorization | Neither — reads extra **fields**, or writes fields they shouldn't (mass assignment) — wrong column |
| **API5:2023** | Broken Function Level Authorization | The **endpoint or method** — wrong verb |

2 each. Deduct for API2 (Broken Authentication) — that is the part OAuth solves, and confusing it with the
authorization three is the error the item tests.

### C14 (7) → *Module 11*

**The structural argument (4):**
1. The token is issued **before the request exists** — at issuance the AS knows subject, client and scopes,
   not which object IDs will be named later.
2. Scopes are **type-level**. `accounts:read` cannot say "account 91847", and instance-level scopes do not
   scale — one scope per object, in a space-delimited URL parameter.
3. Object ownership is **application data**. The AS does not have your database.
4. Therefore the check must happen **in the application, at request time, against the data**. No token
   property and no configuration can outsource it. (RAR narrows *what was consented to*; the service must
   still match it against the request.)

**The pattern (3):**
```js
const account = await db.accounts.findOne({ id: req.params.id, ownerId: req.user.sub });
if (!account) return res.sendStatus(404);
```
**Why better than a correct check:** it makes the insecure version **hard to write**. A check can be
forgotten by the next developer adding an endpoint; a query helper that already carries the constraint gets
copied along with the constraint. Same instinct as FAPI 2.0 preferring PKCE over `c_hash` — prefer the
mechanism whose absence is loud. Note the **404** rather than 403: 403 confirms the object exists and turns
the endpoint into an enumeration oracle.

---

## Section 5 — Integrative (10)

### C15 (10) → *Modules 10 and 11 together*

**What certification and conformance genuinely evidence (2):** that the deployment's **protocol behaviour**
matches the profile — the right parameters are required, the right requests are rejected, the right claims
appear. That is real and worth having; it is also the half that is easiest to get right.

**The limiting section (2):** FAPI 2.0 **Attacker Model §8.5, Implementation errors** — *"Real-world
implementations, of course, sometimes deviate from the specified and formally analyzed behavior and contain
security vulnerabilties on various levels."* The formal analysis is about the **specification**. It makes no
claim about their code. (§8.4, system boundaries, is also acceptable.)

**Two classes that pass every conformance test (4, 2 each):**

1. **BOLA / BFLA / BOPLA — the whole authorization layer.** A conformance suite does not know what your
   objects are, so `GET /accounts/91848` returning someone else's data is invisible to it. Three of OWASP's
   top five are undetectable this way.
2. **Application logic and deployment defects** — an open redirect on a logout endpoint; a management API
   whose auth middleware fails open; a stack trace on a public endpoint; an admin route that returns a client
   secret. All are outside the protocol surface entirely. *(Also acceptable: business-flow abuse (API6), where
   every individual request is authorized and the aggregate is the attack.)*

**The question I would ask next (2):** *"Show me an endpoint that returns an object by ID, and the test that
proves user A cannot read user B's."* It goes straight to the layer certification cannot see, it is answerable
in minutes, and the answer is diagnostic either way: a team with that test has thought about it; a team
without one almost certainly has a BOLA.

*(Also strong: "What is your attacker model, and what does it leave out?" — the Module 10 question. Accept
either, but the answer must go after the **application** layer, not ask for more protocol evidence.)*

---

## Score

| | |
|---|---|
| **85+** | Take the Final, then the capstone. |
| **70–84** | Re-read your misses first; the capstone integrates all of this. |
| **55–69** | Redo the weak module's lab before the Final. |
| **< 55** | Modules 08–11 again with the labs. |

| Missed | Return to |
|---|---|
| C1–C4 | Module 08 |
| C5–C7 | Module 09a |
| C8–C10 | Module 09b |
| C11, C12 | Module 10 |
| C13, C14 | Module 11 |
| C15 | Modules 10 and 11 together — the boundary between protocol and application |
