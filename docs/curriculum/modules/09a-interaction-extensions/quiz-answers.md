# Module 09a — Answers

Every wrong option is explained, because the point is to find the misconception, not to score.

---

## Tier 1 — Recall

**Q1 — B) `iss`, `aud`, `exp`.**

Quoted from JARM: `iss` is *"the issuer URL of the authorization server that created the response"*, `aud` is
*"the client_id of the client the response is intended for"*, `exp` is *"expiration of the JWT. A maximum JWT
lifetime of 10 minutes is RECOMMENDED"*.

- **A** substitutes `sub`. A JARM response is about a *response*, not a subject — there is no user identity
  claim in it. Reaching for `sub` is a sign of confusing it with an ID token.
- **C** substitutes `nonce`, which belongs to the ID token (Module 08).
- **D** drops `iss`, the claim that makes mix-up structurally impossible.

---

**Q2 — C) `authorization_signed_response_alg`.**

One of three JARM client metadata parameters, with `authorization_encrypted_response_alg` and
`authorization_encrypted_response_enc`. You saw this exact name in Lab 2a's error message.

- **A** is the ID token's algorithm (Module 08) — a different token, a different field.
- **B** is JAR's, for the request object (Module 05).
- **D** does not exist.

The naming pattern is worth internalising, because it generalises: `id_token_*` for the ID token,
`request_object_*` for the request, `authorization_*` for the authorization response, `userinfo_*` for UserInfo.
Four independently configurable signing surfaces.

---

**Q3 — C) `insufficient_user_authentication`.**

*"The authentication event associated with the access token presented with the request does not meet the
authentication requirements of the protected resource."*

- **A** `insufficient_scope` is RFC 6750 — the token lacks a *scope*, which is an authorization problem. Using
  it for an authentication problem is the mistake RFC 9470 exists to correct: the client cannot fix it by
  re-authenticating, because nothing told it to.
- **B** `invalid_token` means the token is bad. This token is fine; the authentication behind it is too weak.
- **D** `interaction_required` is OIDC Core §3.1.2.6, returned from the **authorization** endpoint, not from a
  resource server.

---

**Q4 — D) push.**

In push mode the AS POSTs the **tokens** to the client's notification endpoint. Ping also needs a reachable
endpoint but receives only a "ready" signal; poll needs nothing reachable.

The consequence is the point: a push notification endpoint receives bearer tokens unsolicited, so it needs the
same protection as the token endpoint — TLS, authentication of the AS, replay handling. Most teams do not build
it to that standard, which is why poll is the sane default.

---

**Q5 — A) `type`.**

*"An identifier for the authorization details type as a string. The value of the `type` field determines the
allowable contents of the object that contains it. … This field is REQUIRED."*

`locations`, `actions`, `datatypes`, `identifier`, and `privileges` are the five optional **common data
fields**. `type` is the schema selector — it decides what the rest of the object is allowed to contain, which
is why its absence (`[A249301]`) and its being unrecognised (`[A249302]`) are different errors with different
fixes.

---

## Tier 2 — Applied reasoning

**Q6 — Response integrity/non-repudiation, and response audience-restriction.**

1. **Integrity and authentication of the response.** PAR and JAR protect the *request*; `state` and PKCE protect
   the *session binding* and the *code*. Nothing signs the response. Without JARM a client cannot prove that
   `code`, `state`, `iss` and any error parameters arrived as the AS wrote them, or that the AS wrote them at
   all. **Closes:** response tampering, and mix-up in its strong form — `iss` inside a signature cannot be
   rewritten, whereas RFC 9207's query parameter can.
2. **Audience restriction of the response.** `aud` is the client the response is *for*, so a JARM response
   minted for a different client cannot be replayed at yours. **Closes:** cross-client response injection.

Credit for adding a third: with `exp` (≤10 minutes RECOMMENDED), the response becomes an expiring artefact
rather than a URL that works whenever replayed. And for noting that JARM does **not** replace `state` — `state`
is still what binds the response to this browser session; JARM only stops it being tampered with.

---

**Q7 — CIBA, poll mode; the risk is unsolicited prompts.**

**CIBA**, because there is no browser to redirect: the customer is on the phone, and the agent's terminal is a
different device from the customer's phone. That is exactly the consumption-device/authentication-device split
CIBA exists for. The device grant (Module 02) does not fit — it needs the customer to *see* a code on the
agent's screen, which is impossible over a phone line.

**Poll mode**, because a call-centre terminal is behind NAT, is not addressable from the internet, and has no
business receiving tokens on an inbound endpoint. Latency of one polling interval is irrelevant next to the
length of a phone call.

**The biggest risk: the terminal can make any customer's phone buzz.** A prompt appears on the customer's device
that the customer did not initiate, carrying a description the client supplied. A rogue or compromised agent —
or anyone who can drive the terminal — can trigger authorization prompts for arbitrary customers and hope one
approves. Mitigations: `binding_message` so the agent must read out a code that matches what the customer sees
(which also gives the customer a reason to refuse when it does not match), `user_code`, per-agent rate limiting,
and treating a spike in declined CIBA requests as a security signal rather than a UX problem.

---

**Q8 — The client can do essentially nothing; the header should have carried `acr_values` and/or `max_age`.**

It knows its token's authentication is insufficient. It does not know *what would suffice*, so it cannot
construct a request that would succeed. Its realistic options are all bad: give up and show a generic error, or
guess — re-authorize with `prompt=login` and hope, which may produce the same `acr` and the same 401, in a loop.

Correct:

```
WWW-Authenticate: Bearer error="insufficient_user_authentication",
  error_description="A stronger authentication is required for transfers over €1000",
  acr_values="urn:example:mfa", max_age="300"
```

**This is the most common RFC 9470 implementation mistake**, and the reason is structural: the error code is the
memorable part of the spec and the parameters are the useful part. An implementer who reads only far enough to
find the error string ships a dead end. The whole value of RFC 9470 over a plain 403 is the parameters.

---

**Q9 — (a) scopes; (b) RAR; (c) scopes; (d) RAR.**

- **(a) scopes.** No parameters. `scope=email` says everything there is to say. RAR would add a schema for
  nothing.
- **(b) RAR.** The authority has parameters — amount, currency, destination, one-shot — and the user must see
  them on the consent screen, and the RS must enforce them exactly. Encoding these into a scope string produces
  something unparseable and unbounded, in a URL.
- **(c) scopes.** Coarse by nature. `scope=tenant:admin` is honest about being a blanket grant; dressing it up
  in RAR structure implies precision that does not exist.
- **(d) RAR.** Parameterised by resource (`encounter 4471`) and time-bounded, and in a regulated setting the
  granted structure has to be auditable.

The test that generalises: **does the authority have parameters the user should see and the RS must enforce?**
Yes → RAR. No → scopes. "It feels more modern" is not a reason.

---

**Q10 — The `acr` is unaccountable, and that is the finding.**

`supportedAcrs` empty means the AS has declared no authentication context classes — so no client may *request*
one (`[A021303]`) and no ACR value has an agreed meaning on this service. Yet ID tokens carry `acr: "pwd"`,
because the login handler writes it and Authlete passes it through.

So the value is not *wrong* — a password login did happen — but it is **unaccountable**: there is no registered
definition of `pwd`, no way for a client to ask for it, and no mechanism that would prevent the login handler
writing `mfa` tomorrow with no change in what the user actually did.

**A resource server relying on that `acr` is trusting the login handler's source code**, not a declared
authentication policy. It reads like a security control and behaves like a comment. That is why holding both
facts together — empty `supportedAcrs`, live `acr` claim — is the finding, and why RFC 9470's whole mechanism
depends on ACR values being a *contract* between AS and RS rather than a string one side happens to emit.

---

## Tier 3 — Trace and diagnose

**Q11 — Missing: signature verification, `iss`, `aud`, and `exp`. And it is worse than not using JARM.**

`atob` on the payload segment is a decode. Nothing is verified. Specifically absent:

- **Signature** — the entire point. Any attacker can craft a `response` JWT with arbitrary `code` and `state`,
  since the client will believe anything base64-encoded.
- **`iss`** — no check which AS produced it, so mix-up is wide open despite JARM being the strongest available
  defence against it.
- **`aud`** — a response minted for another client is accepted.
- **`exp`** — an old response replays indefinitely.

(Also: `atob` mishandles base64url — `-` and `_` — and pads incorrectly, so this may not even decode reliably.
A correctness bug sitting on top of the security bug.)

**Worse than not using JARM at all**, for two reasons. First, the *technical* one: with plain `response_mode`,
`state` and PKCE are still doing their jobs, and there is no signed structure inviting anyone to assume more.
Here the same protections exist and a *new* trust assumption has been added without the check that would earn
it. Second, and more important in practice: **the presence of a signature changes how everyone reads the code.**
A reviewer sees a JWT and a `state` comparison and moves on; an architecture document says "authorization
responses are signed (JARM)"; a compliance answer says the same. The mechanism now provides assurance in
documentation that it does not provide in fact. Module 00's decode-≠-verify rule, at its most expensive.

---

**Q12 — Ask the authorization server for the raw action.**

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "$AS_API/auth/authorization" -d '{"parameters":"…response_mode=form_post.jwt…"}'
```

…and read `action` and `responseContent`.

- **If `action` is `FORM`** and the application still sent a 302, the bug is the **application's**: it mishandled
  a `FORM` action, which means "return this HTML with 200," and redirected instead.
- **If `action` is `LOCATION`** with `responseContent` starting `<html>`, the bug is the **authorization
  server's**: it labelled an HTML document as a redirect target. The application then did exactly what
  `LOCATION` instructs, faithfully.

On this deployment it is the second (Lab 2b) — `action: LOCATION`, `resultCode: A012305`, content beginning
`<html>`. So it is vendor behaviour on the `form_post.jwt` error path.

Two disciplines this illustrates. **One request settles a whole class of "whose bug is it" arguments**, because
the application is a thin layer over the policy engine and you can interrogate the layer beneath it directly.
And the honest write-up scopes the claim to what was observed: the *error* path. Whether the success path does
the same is unknown until JARM is enabled, and saying so is what makes the rest of the report trustworthy.

---

**Q13 — Two problems: the vendor envelope, and doubly-encoded JSON.**

1. **The response is the authorization server's internal object, not an API response.** `resultCode`,
   `resultMessage`, `action`, and `clientId` are implementation detail of the layer *behind* this endpoint. A
   client integrating against a CIBA endpoint expects RFC 6749 §5.2 shape: `error` and `error_description` at
   the top level. Leaking `action` and `resultCode` also tells a caller more about internals than it needs.
2. **The actual OAuth error is a JSON string nested inside JSON.** To read `error`, a client must extract
   `responseContent` and parse it a second time. Nothing in any specification suggests that, so every client
   integrating with it writes the same bespoke unwrapping.

**`responseContent` should have been the entire response body**, with the envelope discarded and its `action`
used only to select the HTTP status. That is exactly what the token endpoint does — same deployment, correct
contract — which makes this an inconsistency as well as a defect.

---

**Q14 — `complete` returning 500 is most clearly wrong.**

A nonexistent ticket is a **client** error: the caller supplied a value that does not identify anything. That is
400 (or 404). A 500 asserts that the *server* failed, which is untrue and has consequences beyond aesthetics:

- **It pages someone.** 5xx rates drive alerting, error budgets, and SLOs. A client passing bad input now
  degrades the server's published reliability and wakes an on-call engineer for a caller's typo.
- **It hides real failures.** Once bad tickets produce 500s routinely, the 5xx signal stops meaning "something
  is broken," and a genuine outage is buried in noise.
- **It misdirects the caller.** 5xx conventionally means "retry, it may be transient." Retrying a nonexistent
  ticket will never work, so a well-behaved client retries with backoff to no purpose.

Also worth flagging, though less severe: `fail` returns 403 with a `resultMessage` reading *"Successfully
generated an error response"* — the vendor describing its own success at producing your failure. Correct from
its side, confusing in a response body.

The root cause is common to both: **forwarding a vendor's action-to-status mapping without asking whether those
statuses mean the same thing to your callers.**

---

**Q15 — They are wrong, and they should have used the `claims` parameter with `"essential": true`.**

`acr_values` is a **preference**, in order of preference. OIDC Core lets the AS return a different `acr` if it
cannot or does not satisfy the request — the client asked, the AS declined, and the ID token honestly reports
what actually happened (`pwd`). The AS behaved correctly, and the ID token told the truth. The bug is in the
client's expectation.

To make it a **requirement**:

```json
{"id_token": {"acr": {"essential": true, "values": ["mfa"]}}}
```

Now the AS must satisfy `mfa` or **fail the authorization** rather than downgrade. This repo implements exactly
that: `ACR_NOT_SATISFIED` when `acrEssential` is set and the satisfied ACR does not match.

**And here is the security point**, which is the real reason this question exists: a client that sends
`acr_values` and then *assumes* it got what it asked for has no step-up protection at all. The token says `pwd`;
the client believes `mfa` happened. **Either request it as essential, or check the resulting `acr` before acting
on it.** Preferably both.

---

## Tier 4 — Adversarial and design

Graded on reasoning. Strong answers commit to specifics and say what they are unsure about.

---

**Q16 — CIBA prompt-bombing.**

**What I send.** Repeated `POST /backchannel/authentication` with `login_hint=<the customer>`, my own client
credentials, and a `binding_message` and scope of my choosing — say `scope=payments` and a message that reads
like a routine confirmation. Each request is cheap, authenticated, entirely well-formed, and indistinguishable
at the protocol level from legitimate traffic.

**What the customer sees.** A push notification **from their bank's app**, with the bank's branding, asking
them to approve something. No link they had to click, no page they had to be lured to — the bank contacted
them. Every instinct we train users to have ("check the URL", "don't click links in emails") is inapplicable.

**Why the branding helps me.** Phishing normally requires impersonating a trusted party, which is where
attackers get caught. Here I do not impersonate the bank — **I make the bank contact the customer on my
behalf.** The channel is genuine, the app is genuine, the notification is genuine. Only the *reason* is
fabricated, and the reason is the one part the customer cannot verify.

**What I gain if they approve.** An `auth_req_id` I poll into an access token with whatever scope I requested,
carrying that user's `sub`. Full account access at the scope I chose, with an audit trail showing the customer
approving.

**Ranked mitigations:**

1. **Client permissioning** — by far the strongest. If my client cannot use CIBA, none of this exists. Everything
   else assumes I am already inside the trust boundary and is therefore damage limitation.
2. **`user_code`** — genuinely raises the bar: I need a secret the user holds, so a `login_hint` alone is no
   longer sufficient. It converts "I know a username" into "I have compromised the user," which is a different
   attack.
3. **`binding_message`** — weakest of the three, and the one most often cited. It only works if the user *knows
   what value to expect*, which requires a legitimate out-of-band channel (an agent reading it aloud). Against
   an unsolicited prompt, a plausible-looking `binding_message` is as convincing as a real one. It defends
   against a *substituted* request during a genuine interaction, not against a fabricated one.

**What none of them fixes: the prompt is unsolicited.** Structurally, CIBA asks users to make security decisions
about interactions they did not initiate and cannot independently verify. Rate limiting, anomaly detection on
decline rates, and per-client scope ceilings all reduce the blast radius; none removes the shape. Answers that
name this as an irreducible property of the pattern, not a bug to be fixed, deserve full credit.

---

**Q17 — Step-up round trip for a €1,000 threshold.**

**1. The RS's challenge:**

```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="insufficient_user_authentication",
  error_description="Transfers over EUR 1000 require multi-factor authentication within the last 5 minutes",
  acr_values="urn:example:mfa", max_age="300"
```

Both parameters, because they express different requirements: *how* the user authenticated and *how recently*.

**2. The client** parses the challenge, keeps the pending operation, and starts a **new authorization request**
— it does not retry the API call, which would fail identically.

**3. The authorization request**, with the requirement expressed as *essential* rather than preferred:

```
?response_type=code&client_id=…&redirect_uri=…&scope=payments
&claims={"id_token":{"acr":{"essential":true,"values":["urn:example:mfa"]}}}
&max_age=300&state=…&nonce=…&code_challenge=…&code_challenge_method=S256
```

**4. If the AS cannot satisfy it**, it must **fail** — a redirect error, not a token with a weaker `acr`. That
is the whole difference between an essential claim and `acr_values`, and it is what makes the client's job
possible.

**5. The RS verifies the new token** rather than trusting the retry: introspect (or read the JWT claims) and
check `acr` is in its accepted set **and** `now - auth_time <= 300`. Only then perform the transfer.

**Two silent-degradation paths:**

- **The client sends `acr_values` instead of an essential claim**, gets a `pwd` token back, retries, and — if
  the RS does not re-check — the transfer proceeds on a password login. *Test:* an integration test that
  requests `acr_values=mfa` against an AS configured to satisfy only `pwd`, asserts the resulting `acr` is
  `pwd`, and asserts the RS **rejects** it. The test must assert on the RS's decision, not the AS's response.
- **The RS checks `acr` but not `auth_time`.** A token minted from a refresh grant, or an hour-old MFA session,
  carries the right `acr` with a stale `auth_time`. *Test:* mint a token with a valid `acr` and an `auth_time`
  older than `max_age`, assert 401. Note that refresh flows are the realistic source here, which makes this the
  more likely of the two to reach production.

Credit for observing that the RS must define its accepted ACR set as a *set*, not a string equality, and for
noting that `acr_values` in a challenge is *ordered by preference*.

---

**Q18 — The case against RAR, answered.**

**The skeptic's case.**

- *"Scopes are one string. You want me to design, register, document, and version a JSON schema per resource
  type — and the AS must validate it, the consent screen must render it, and every RS must parse it."*
- *"Versioning is a distributed-systems problem. When the payment schema gains a field, I have old clients
  sending old shapes and new RSs expecting new ones, and there is no `Accept-Version` header in an
  authorization request."*
- *"Consent rendering is now a template per type. Get it wrong and the user approves something other than what
  they were shown — which is worse than a coarse scope, because it *looks* precise."*
- *"An RS receiving an unrecognised `type` is a new failure mode I did not have before."*
- *"Nobody on my team has done this. Scopes are boring and everyone understands them."*

**The answer.**

- **The cost is real and it buys three things scopes cannot provide**: AS-side validation (five distinct failure
  classes under `invalid_authorization_details`, versus "matches a registered string or not"); a consent screen
  that can show the user the actual amount and destination; and RS-side enforcement by structural comparison
  rather than string parsing. For a payment, the alternative is not "scopes" — it is a scope string with the
  amount encoded in it, which has every cost the skeptic listed *and* no validation.
- **Versioning:** `type` **is** the version. `payment_initiation` and `payment_initiation_v2` are distinct
  types; register both, support both for a deprecation window, retire the old one. This is a familiar
  pattern — additive changes within a type, new type for breaking changes — and it is more tractable than
  scopes, where the only lever is minting new scope strings with no schema to diff.
- **Consent rendering** is a genuine obligation, and the honest answer is that it is *the point*: a coarse scope
  is easy to render precisely because it tells the user nothing. If you are not going to show the parameters,
  do not use RAR.
- **Unrecognised `type` at an RS: fail closed.** Reject the request. This is not a new failure mode so much as a
  newly *visible* one — with scope strings, an RS silently ignores tokens it does not understand.
- **The team objection is the strongest one**, and it is about sequencing, not architecture: adopt RAR for one
  API, with one type, and learn before expanding.

**When I would abandon RAR:** when the authority turns out not to have parameters the user should see or the RS
must enforce — i.e. when every `authorization_details` object in production reduces to a `type` and nothing
else. At that point the structure is carrying no information and a scope says the same thing more cheaply.
Deciding that after six months of data is a good outcome, not a failure.

---

**Q19 — What "four unset fields, zero code" implies for auditing.**

**Why a discovery-derived capability matrix is inadequate.** Discovery metadata describes what the *service*
supports. It does not describe what any *client* is configured to use, and it does not describe whether a
supported mechanism is *enforced*. This module produced a third state that a matrix cannot represent:

- **Supported and required** — enforced. Fine.
- **Supported but not required** (Module 07) — a *security* finding. PKCE exists and nothing insists on it.
- **Permitted but not configured** (this module) — an *availability* finding. The client's `responseModes`
  includes `JWT`; `authorizationSignAlg` is unset; JARM cannot run.
- **Not supported** — a gap needing code.

A matrix with ticks conflates the middle two with the first, and they call for opposite actions: one needs a
control turned on, one needs a feature turned on, and one is fine.

**What I would collect instead** — the three sources from Module 07, plus one addition:

1. Advertised (discovery), 2. configured (service **and per-client** records), 3. observed (send the request).
4. **The refusal text**, verbatim. This module's whole thesis is that a good error names its own cause — often
   in specification vocabulary (`authorization_signed_response_alg`) rather than vendor vocabulary. The refusal
   is the highest-density artefact in an audit and is almost never recorded in reports.

Per mechanism, the finding is a four-tuple: *requested → refused with → because field X is unset at scope Y →
therefore enabling it is a console change / a code change.* That last clause is what a team can act on.

**How I would present the two differently.** Separate sections, separate owners, separate urgency:

- **"Controls available but not enforced"** — security. Owner: whoever owns the risk. Each row carries an attack
  and a severity. *"PKCE supported, `pkceRequired: false`, verified by obtaining a token without a verifier."*
- **"Capabilities permitted but not configured"** — availability and roadmap. Owner: whoever owns the
  integration. Each row carries the field, the scope (service or client), and the exact verified refusal.
  *"JARM: client `responseModes` includes `JWT`; `authorizationSignAlg` unset; `[A012305]`. One client field. No
  code."*

The distinction matters because mixing them destroys the report's usefulness in both directions: a security
reviewer wading through unconfigured features stops reading, and an engineering team told that four
unconfigured extensions are "findings" alongside a live PKCE bypass learns to discount the whole document.
Credit for noting that "no code required" is the single most actionable sentence you can put in front of a team
— and for noting that it cuts the other way too: a control that is one field from being *off* is one field from
being off.
