# Module 06 — Answers

Every wrong option is explained, because the point is to find the misconception, not to score.

---

## Tier 1 — Recall

**Q1 — B) confidential clients.**

RFC 6749 §4.4: *"The client credentials grant type MUST only be used by confidential clients."* The reason is
not arbitrary. The grant's entire security argument is "the client authenticated, therefore the token
represents that client's authority." A public client cannot authenticate, so there is nothing to represent.
You verified this in Lab 1e: `unauthorized_client`, `[A052301]`.

- **A** inverts the rule. A public client using this grant would issue tokens to anyone who knows a
  `client_id` — a value that is public by construction.
- **C** confuses client *type* with client *platform*. Native apps are public clients (RFC 8252, Module 03),
  which is why they are excluded — but "native app" is not the category the spec uses.
- **D** ignores the MUST.

---

**Q2 — B) `assertion` / `client_assertion`.**

The §2.1 grant puts the JWT in `assertion` and the URN in `grant_type`. The §2.2 client authentication puts
the JWT in `client_assertion` and the URN
`urn:ietf:params:oauth:client-assertion-type:jwt-bearer` in `client_assertion_type`.

- **A** is the answer reversed — the single most common version of this mistake, and worth noticing that
  getting it backwards means you have the *security properties* backwards too: §2.2 is a straight upgrade over
  a client secret, while §2.1 is a trust delegation with a much larger blast radius.
- **C** invents parameters.
- **D** is wrong in a specific and important way: they are not distinguished by `grant_type`, because §2.2
  composes with *any* grant type. You can use `client_assertion` with `grant_type=authorization_code`,
  `client_credentials`, or `refresh_token`. They are orthogonal, which is why they need separate parameters.

---

**Q3 — A) `iss`, `sub`, `aud`, `exp`.**

Quoted in the lesson from RFC 7523 §3: each of those four is a MUST. `nbf`, `iat`, and `jti` are all MAY.

- **B** adds `jti`. It is a MAY — recommended for replay protection (RFC 7521 §8.2 pairs it with the time
  claims) but not required.
- **C** drops `sub`, which is the whole point of an assertion, and promotes `nbf`.
- **D** drops `iss`, the claim that identifies whose trust is being invoked.

---

**Q4 — C) `actor_token`.**

There is no explicit mode flag. Send `subject_token` alone → impersonation. Add `actor_token` (and its
REQUIRED `actor_token_type`) → delegation, and the result should carry `act`.

- **A** `requested_token_type` selects the *format* of the returned token, not the delegation semantics.
- **B** `resource` sets the audience.
- **D** `subject_token_type` is REQUIRED on every exchange; it types the subject token so the AS never has to
  sniff. It says nothing about delegation.

---

**Q5 — B) `access_token`, `token_type`, `issued_token_type`.**

RFC 8693 §2.2.1. `expires_in` is RECOMMENDED, `scope` is conditionally required, `refresh_token` is optional
and the spec notes it "will typically not be issued" for an exchange.

- **A** promotes two non-required parameters and omits the one implementations most often drop.
- **C** makes `refresh_token` required — the opposite of the spec's guidance.
- **D** is the assumption behind the bug you found in Lab 6c.

---

## Tier 2 — Applied reasoning

**Q6 — B) Client credentials; constrain scope and lifetime.**

There is no resource owner. The job acts as itself, on data it is entitled to under an arrangement made out of
band — exactly RFC 6749 §4.4's *"protected resources under its control, or those of another resource owner
that have been previously arranged with the authorization server."* The risk is not the grant; it is that
these tokens are typically over-scoped and long-lived. You saw `expires_in: 86400` in the lab. A daemon that
runs for four minutes at 02:00 does not need a token that is valid until 02:00 tomorrow.

- **A** invents a fake human. Service-account-as-user is a real anti-pattern: it needs a stored password or a
  never-expiring refresh token, and it makes every audit log lie about who acted.
- **C** is the dangerous one, and it is dangerous *because it works*. You demonstrated it in Lab 3c. It gives
  the batch job the ability to mint a token for any subject, which is a far larger capability than "read all
  invoices." If you catch yourself reaching for it, what you actually want is a scope that means "read all
  invoices."
- **D** requires a human's token to exist, which defeats the point of a nightly job, and makes the job's
  authority depend on whichever admin last logged in.

---

**Q7 — C) A subject was asserted or carried over rather than established by an authentication event.**

`auth_time` and `acr` are records of *an authentication having happened* — when, and how strongly. An
assertion grant or a token exchange produces a `sub` without either, because no authentication occurred at
this AS. You saw both shapes in the lab: Exercise 2's authorization-code token had `sub` + `auth_time` +
`acr`; Exercise 3c's assertion-grant token had `sub` alone.

This matters well beyond trivia. Module 05's step-up mechanism (RFC 9470) and Module 08's ID token validation
both key on `auth_time` and `acr`. A token that has a subject but no authentication evidence cannot satisfy a
step-up requirement, and should not be treated as if a user is present.

- **A** — an expired token introspects `active: false`. You would not be reading claims.
- **B** — a client-credentials token has **no** `sub` at all (Lab 1b). That is the distinguishing feature.
- **D** — nothing here suggests misconfiguration; this is the normal shape for a derived token.

---

**Q8 — C) Restricting which `sub` values that issuer is permitted to assert.**

A, B, and D are all explicit requirements in RFC 7521 §5.2 / RFC 7523 §3 — signature validity, expiry, and the
mandatory audience check (*"The authorization server MUST reject any assertion that does not contain its own
identity"*). C is the one with no standard mechanism at all.

The specs handle the threats where the attacker lacks the key: forgery, theft, replay, cross-AS reuse. They
cannot address an issuer that holds the key legitimately and names a subject it should not have named, because
from the protocol's perspective that assertion is perfectly valid. The control lives in your service
configuration — an allowlist, a namespace rule (`*@partner.example.com`), or a mapping table — and its default
in most products is "no restriction." That is why Lab 3c works.

---

**Q9 — Best to worst: 2, 3, 4, 1.**

- **2** is correct: least privilege (`read`), audience-restricted so a leak from analytics is useless
  elsewhere, and `act` preserves the audit trail. Everything RFC 8693 exists for.
- **3** is second: the scope and audience benefits survive, but the audit trail is gone. Analytics cannot
  distinguish "Alice queried her own data" from "the gateway queried on Alice's behalf," and neither can the
  incident responder six months later.
- **4** is third and often overlooked as an option. It is *safe* — no user token is exposed — but it is wrong
  for a different reason: the analytics service now sees only the gateway, so it cannot enforce per-user
  authorization at all. You have traded a delegation problem for a confused-deputy problem (Module 01), which
  is the right trade only if analytics genuinely needs no user context.
- **1 is worst.** Forwarding grants analytics a credential with `write` and `admin`, valid for the original
  lifetime, replayable at every service that accepts it. A read-only analytics service is now able to perform
  administrative writes, and a compromise there escalates to full account takeover. Least privilege is
  violated in every dimension at once — scope, audience, lifetime — and worse, the violation is *invisible*,
  because nothing in the analytics service's logs indicates it was ever handed more authority than it needed.

Credit for noting that 2 requires the AS to actually implement `act` — which, as Lab 6d showed, is not
something to assume.

---

**Q10 — The principle: silence must mean "you got exactly what you asked for."**

Any divergence between request and response must be stated explicitly, because a client cannot detect a
difference it was never told about. This is why `scope` flips from OPTIONAL to REQUIRED the moment it
diverges, and why `issued_token_type` is unconditionally REQUIRED — the request has `requested_token_type` and
the AS may ignore it, so the response must always say what was actually issued.

Same principle, three appearances in this module:

- **Applied correctly:** RFC 6749 §3.3 — *"If the issued access token scope is different from the one
  requested by the client, the authorization server MUST include the 'scope' response parameter to inform the
  client of the actual scope granted."* Lab 1d: you asked for `openid profile`, got `scope: "profile"`, and
  the response was conformant precisely because it said so.
- **Violated:** Lab 6c — `issued_token_type` absent, so a client that asked for an ID token cannot tell it
  received an access token.
- **Violated, worse:** Lab 6d — `actor_token`, `resource`, and `audience` accepted and discarded with no
  indication whatsoever. Here the response is not merely uninformative; it is *misleading*, because HTTP 200
  with no divergence reported means "you got what you asked for," and you did not.

---

## Tier 3 — Trace and diagnose

**Q11 — `claims.sub` is `undefined`; the query becomes an unfiltered match.**

A client-credentials token has no subject (Lab 1b), so `claims.sub` is `undefined`.

In MongoDB, `findOne({ owner: undefined })` is treated as `findOne({ owner: null })`, which matches documents
where `owner` is null **or absent** — and `findOne` happily returns the first one. So a legitimate internal
service, using a legitimate token, silently reads a record it has no relationship to. There is no error, no
log line, and the response looks entirely normal. In a relational store with `owner NOT NULL` and a bound
parameter, `WHERE owner = NULL` matches nothing and you get a benign empty result — the bug is still there but
it fails closed instead of open.

That difference is the real lesson: **the same defect is a non-event or a data breach depending on a property
of your data layer that has nothing to do with authorization.** Never rely on it.

The fix is to branch on the grant, not on the truthiness of a claim:

```js
if (!claims.sub) throw new Error("no subject: client-credentials token cannot access user-scoped data");
```

Better still, have the RS decide from `grant_type` or from a scope that only user-backed tokens can carry, so
that the check is about intent rather than about a field happening to be populated.

---

**Q12 — The key is resolved from the token, so the attacker supplies the key.**

`jku` and `kid` live in the JWS *protected header*, which is attacker-controlled input. This code fetches the
verification key from a URL the assertion itself names. That is not verification; it is asking the forger to
grade their own work.

**The two-request attack:**

1. Generate a key pair. Publish the public key as a JWK Set at `https://attacker.example/jwks.json`.
2. Mint an assertion with header `{"alg":"RS256","kid":"k1","jku":"https://attacker.example/jwks.json"}` and
   payload `{"iss":"https://partner.example.com","sub":"ceo@victim.com","aud":"<the AS>","exp":<+5min>}`.
   Sign it with the private key. POST it as `assertion`.

The AS fetches the attacker's JWKS, finds the attacker's key, verifies the attacker's signature successfully,
and issues an access token for `ceo@victim.com`. Every check passes. The signature is genuinely valid — it is
just valid over the wrong trust anchor.

**The fix** is to make `iss` select the key, never the header:

```js
const issuer = trustedIssuers.get(claims.iss);        // registration lookup; fails closed
if (!issuer) throw new Error("unknown assertion issuer");
const key = await issuer.jwks.get(header.kid);        // only keys this issuer registered
```

Note the ordering: you must parse the payload to read `iss`, select the key from *your* registry, and only
then verify — and you must not act on any other claim until verification succeeds. Also pin `alg` to what the
issuer registered; a header-driven `alg` is the sibling bug (Module 00's `alg: none`, and algorithm confusion
where an RS256 public key is used as an HS256 secret).

Related, and worth connecting: in Lab 3d you established that *this* deployment does not resolve `iss` against
a trust store at all — it verifies against the calling client's key. That is a different design, not this
bug. It is not vulnerable to `jku` injection. It is vulnerable to something else: whoever holds the client
credential can assert any subject.

---

**Q13 — Two defects.**

**Defect 1 — `result.subject || subjectToken` substitutes a credential for an identity.**

When the AS resolves no subject — which is *correct* for a client-credentials subject token, since there is no
user — the fallback writes the raw subject-token string into the subject field. You confirmed this in Lab 6e:
the exchanged token's `sub` equals the subject token, and that value is still `active`.

What an operator sees: subject values that look like random 43-character strings instead of usernames, showing
up in introspection responses, in any downstream JWT's `sub`, and in whatever telemetry records "who is this
token for." Nobody files a bug, because a subject identifier being opaque is normal. Meanwhile a live bearer
credential is being copied into fields whose whole contract is "safe to log."

Fix: fail closed. A missing subject is a missing subject.

**Defect 2 — the request is built from four fields, so everything else is discarded.**

`actor_token`, `resource`, `audience`, and `requested_token_type` never reach the downstream call. What an
operator sees: nothing. Every request returns HTTP 200. Downstream services receive tokens with no `aud`, so
audience checks either fail universally (if enforced) or — much more likely — were never implemented, because
the tokens never carried an audience in the first place. Delegation requests come back as impersonation.
Tickets get filed against the *client* teams for "not setting the resource parameter," which they are setting.

Fix: propagate every resolved field, and emit `issued_token_type` per RFC 8693 §2.2.1.

Credit for noticing these are one design error with two faces: **the handler treats the AS's rich response as
a source of four values rather than as the answer to a question.**

---

**Q14 — SDK response-schema mismatch; it lives below the protocol layer; staging passed because its tokens had no scopes.**

Authlete returns `subjectTokenInfo.scopes` as an array of objects (`{"name":"profile","defaultEntry":false}`).
The SDK's `TokenResponse` schema declares it as an array of strings. Zod rejects the response, the SDK throws
`ResponseValidationError`, and the Express error handler converts it into a generic 400 — which is why the
body is `{"error":"Bad Request","message":"Response validation failed"}` rather than any RFC 6749 §5.2 error
code. The controller never runs, so `action: TOKEN_EXCHANGE` is never handled.

The layer matters for the fix: nothing in the OAuth request or the Authlete configuration is wrong. Calling
Authlete directly with identical parameters returns `[A311001] … processed successfully` (Lab 6b). The defect
is in the client library between them.

Staging passed because a subject token with an **empty** scope list produces an empty array, which satisfies
`string[]` vacuously. Smoke tests that use a bare `client_credentials` token — the easiest token to obtain in
a test — hit exactly that case. This is a good example of a test that is passing for a reason unrelated to
what it claims to check.

The diagnostic worth internalising: **an error that is not an OAuth error means the failure is not in the
protocol.** `{"error":"Bad Request"}` is not one of the six §5.2 codes. That alone tells you to stop reading
the RFC and start reading the stack.

---

**Q15 — The chain, and the line.**

1. Someone exchanges a token whose subject the AS cannot resolve — a client-credentials token, or any token
   without a user.
2. The handler's `result.subject || subjectToken` substitutes the credential string for the missing subject.
3. The exchanged token is issued with `sub` = a live access token.
4. The service reads `sub` to attribute the call to a user, because that is what `sub` is for.
5. `sub` is classified as an identifier, not a secret, so it flows into logs, traces, metrics labels, and
   analytics events with no redaction — every scrubber in the pipeline is looking for `Authorization` headers
   and fields named `token`.
6. Retention keeps them for months. Anyone with log access has working credentials, and the tokens' 24-hour
   lifetime means a subset were live at any point during the window.

**The line:** `const subject = result.subject || subjectToken;`

Written as a hard failure, none of the rest happens:

```js
if (!result.subject) throw new Error("no subject resolved from subject_token");
```

Two things worth extracting. First, `||` is the mechanism — it converts "I don't have this" into "here's
something else," and in an identity context that is always wrong. Second, the *classification* did the real
damage: a value's sensitivity travelled with the field name rather than with the value. Any control that
depends on "secrets live in fields called `token`" fails the moment a secret is written somewhere else.

---

## Tier 4 — Adversarial and design

These are graded on reasoning, not on matching this text. A strong answer commits to specifics and says what
it is unsure about.

---

**Q16 — Compromised CI runner holding client credentials with the assertion grant enabled.**

**What you can mint.** Anything the client can. Client-credentials tokens as the client itself, and — because
§2.1 is enabled and the deployment verifies assertions against the client's own key — an access token for
**any subject you name**, with any scope the client is allowed. Three commands, as in Lab 3c: build the
assertion with `sub: <victim>`, sign with the client secret, POST it. No user interaction, no consent, nothing
in a user-facing audit trail that distinguishes it from a legitimate federation.

**What identity you can assume.** Any `sub` string the AS will accept — and it accepts all of them, because it
is not checking a user directory. If downstream services key authorization on `sub`, you are that user
everywhere. The practical ceiling is the client's scope set: `profile` and `invoices:read` here, so you read
any user's invoices, as them, from anywhere.

**What you cannot do.** Exceed the client's registered scopes — no `invoices:write`. Impersonate a *different
client*. Defeat sender-constraining, if the AS binds tokens with DPoP or mTLS (Module 05) — you would need
the key too, though on a CI runner that is often sitting next to the secret. And you cannot produce `act`
claims, because you are impersonating, not delegating.

**How to tell whether the AS stops you.** Empirically, in this order, cheapest first: (1) send an assertion
with `sub` equal to a subject that plainly is not yours; if you get a token, there is no subject restriction;
(2) change `iss` to a nonexistent issuer — acceptance proves `iss` is not resolved against a trust store, so
there is no per-issuer policy to violate; (3) request scopes beyond the client's registration to find the
ceiling; (4) introspect what you get and look for `aud`, `cnf`, `auth_time` — their absence tells you which
downstream defences are not in play.

**Three controls, by blast-radius reduction:**

1. **Restrict assertable subjects per issuer** (allowlist or namespace rule). Turns "any user" into "the
   users this issuer legitimately represents." Largest reduction, because it attacks the capability itself.
2. **Move to `private_key_jwt` with a non-exportable key**, and separate the assertion-grant client from every
   other client. Removes the shared secret, so the credential cannot be copied out of the runner at all, and
   contains the damage to one purpose-built client.
3. **Sender-constrain the issued tokens and shorten lifetimes.** Reduces the value of what you steal after the
   fact; does nothing about minting.

**Why the first one deployed is probably not the strongest.** Control 1 is the strongest and the slowest: it
needs a policy decision about which subjects each issuer owns, a place to store it, and an answer for what
happens when the answer is wrong — that is an org conversation, not a config change. Control 3 ships this
afternoon and buys real time. The honest sequencing is 3 → 2 → 1, while being clear with yourself that 3 is a
mitigation and 1 is the fix. Shipping 3 and calling it done is the failure mode worth naming out loud.

---

**Q17 — Ignored `actor_token` in a payments chain.**

**Both, and the correctness bug is what makes the security bug undetectable.** Correctness: the AS accepted a
parameter defined by RFC 8693 §2.1, did not honour it, and reported success — and it omits
`issued_token_type`, so the response carries no signal of what was actually issued. Security: the resulting
token is *indistinguishable* from a token Alice obtained herself, which is RFC 8693 §1.1's own definition of
impersonation. Every downstream authorization and audit decision is now made on a false premise. Arguing it is
"only" correctness misses that the security property is destroyed *by* the incorrectness; arguing it is "only"
security misses that a client did everything right and was told it succeeded.

**(a) The unresolvable incident.** A £40,000 transfer is disputed. The ledger's record says `sub: alice`,
authenticated, authorized, valid token. Alice says she never initiated it. The pricing service was found to
have an SSRF two weeks earlier. The question — did Alice click, or did a compromised service mint this on her
behalf? — is not answerable from any artifact the system produced, because both paths write byte-identical
records. You cannot scope the incident (which transfers were service-initiated?), cannot bound it, and cannot
prove innocence or guilt. Under most financial regulation, "our logs cannot distinguish these cases" is itself
the finding, independent of whether fraud occurred.

**(b) Why the ledger cannot detect it.** It sees `{"sub":"alice","active":true,"scope":"transfer"}`. There is
nothing absent that it can point to, because `act` is optional in every token it has ever seen, and absence of
an optional claim is not evidence. The gateway holds the only proof that delegation was requested — its
outbound HTTP request — and that proof lives on the wrong side of the boundary. This is the general shape:
**you cannot detect a silently-downgraded security property from the downgraded artifact alone.**

**(c) What the ledger should require.** Fail closed on identity provenance. For any state-changing operation:

- Require `act` on every token that did not come from a direct user authentication, and reject tokens that
  have neither `act` nor `auth_time`/`acr` — i.e. a subject with no evidence of how it was established.
- Require `aud` to name the ledger, and reject tokens without it (this alone would have caught the discarded
  `resource` too).
- Apply different limits by actor: a service-actor token gets a lower transfer ceiling and additional
  approval, regardless of `sub`.
- Log the full `act` chain, not just `sub`, and alert on tokens that lack one.

The design principle: the RS must state its requirements positively and reject anything that does not meet
them. "We accept whatever the AS sends and hope it is right" is how an AS bug becomes a payments incident.

**(d) The CI test.**

```js
test("delegation request yields a token carrying the actor", async () => {
  const subject = await userToken("alice");
  const actor   = await clientCredentialsToken("orders-service");
  const r = await exchange({
    subject_token: subject, subject_token_type: ACCESS_TOKEN,
    actor_token: actor,     actor_token_type: ACCESS_TOKEN,
    resource: "https://ledger.internal",
  });

  expect(r.issued_token_type).toBe(ACCESS_TOKEN);         // §2.2.1 REQUIRED

  const claims = await introspect(r.access_token);
  expect(claims.act?.sub).toBe("orders-service");          // delegation actually happened
  expect(claims.aud).toContain("https://ledger.internal"); // resource actually applied
});
```

The test asserts on **the token received**, not on the request sent or the status code — which is the entire
habit this module is trying to build. Note that it must use a *scoped* subject token, or it passes for the
wrong reason (Q14).

---

**Q18 — Four-service chain design.**

A strong answer is specific per hop and honest about what is policy versus specification. One defensible
design:

| Hop | Grant | Client auth | `sub` | `act` | `aud` | Scope | Lifetime |
|---|---|---|---|---|---|---|---|
| user → gateway | authorization code + PKCE, DPoP-bound | `private_key_jwt` | `alice` | — | gateway | `orders:write` | 10 min |
| gateway → orders | token exchange, `actor_token` = gateway CC token | `private_key_jwt` | `alice` | `gateway` | `https://orders.internal` | `orders:write` | 120 s |
| orders → pricing | token exchange, actor = orders | `private_key_jwt` | `alice` | `pricing ⊃ orders ⊃ gateway` | `https://pricing.internal` | `pricing:read` | 60 s |
| pricing → ledger | token exchange, actor = pricing | `private_key_jwt` | `alice` | `ledger chain, 3 deep` | `https://ledger.internal` | `ledger:transfer` | 30 s |

Scope narrows at every hop and never widens. Audience is exact per service. Lifetimes shrink toward the
sensitive end — the token that can move money lives 30 seconds. Every hop is delegation, never impersonation,
so the ledger sees the full chain. `may_act` on the user's token names the gateway as the only permitted first
actor.

**(i) `pricing` is compromised.** The attacker holds a `pricing:read` token for `https://pricing.internal`,
30–60 s of validity, DPoP-bound to a key on that host. They cannot call the ledger with it: wrong `aud`, wrong
scope. They *can* request an exchange for a ledger token — so the AS must enforce that `pricing` may only
request `ledger:transfer` when it presents a subject token that already carries the chain, and the ledger must
apply a service-actor transfer ceiling regardless of `sub`. The chain in `act` also means the ledger's records
show `pricing` as the acting party on every fraudulent transfer, so the incident is *bounded and attributable*
— which is the property Q17's design destroyed.

**(ii) Gateway client credentials obtained.** With `private_key_jwt` and a non-exportable key this is much
harder than lifting a secret, which is the point of choosing it. If the key is obtained, the attacker can
authenticate as the gateway and mint gateway-subject tokens — but **cannot mint tokens for `alice`**, because
the assertion grant is not enabled on any client in this design. That single decision is what separates this
from Q16's outcome. They would need a valid user subject token to start a chain, and `may_act` constrains who
may act for whom.

**(iii) Read access to all logs.** Tokens must not be there. Bind with DPoP or mTLS so a logged token is
useless without the key; log `sub` and the `act` chain but never token values; and — the lesson from Lab 6e —
ensure no code path can put a credential into an identifier field, because scrubbers keyed on field names will
not catch it.

**Specification versus local policy.** From specs: PKCE (RFC 7636), token exchange and `act`/`may_act`
(RFC 8693), `private_key_jwt` (RFC 7523 §2.2), audience restriction (RFC 8707), DPoP (RFC 9449),
`issued_token_type` (RFC 8693 §2.2.1). Local policy: the specific lifetimes, the scope narrowing ladder, which
service may request which downstream scope, the service-actor transfer ceiling, and the requirement that the
ledger reject tokens lacking `act`. **Roughly half the security of this design is policy the specs do not
give you** — worth stating plainly, because it is the half that gets skipped.

**Least confident.** Good answers name something real. Candidates: 30-second lifetimes may be unworkable under
clock skew and retry storms, and a system that fails closed on expiry during a partial transfer has its own
failure modes; a three-deep exchange per request puts the AS on the critical path for every payment, so its
availability becomes the platform's availability; and `may_act` is thinly implemented across AS products, so
the design may depend on a feature you cannot actually buy. Naming the operational cost of your own control is
a sign of a real design rather than a checklist.
