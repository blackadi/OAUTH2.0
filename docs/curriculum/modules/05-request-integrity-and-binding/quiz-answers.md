# Module 05 — Quiz Answers

Each answer explains **why the right answer is right and why the tempting wrong ones are wrong.**

---

## Tier 1 — Recall

**Q1 — B) 201 Created.** RFC 9126 §2.2: *"the server MUST generate a request URI and provide it in the
response with a '201' HTTP status code."* **A is the trap** — nearly every other OAuth endpoint returns 200,
and PAR is the exception because it *creates* a resource.

**Q2 — B) `typ`, `alg`, `jwk`.** §4.2: *"The JOSE Header of a DPoP JWT MUST contain at least the following
parameters: typ, alg, and jwk."* **A is the trap and a real bug** — `kid` looks like the natural way to
identify a key, but the AS has never seen this ephemeral key, so a reference is useless. It needs the key
inline (Break 2 in the lab).

**Q3 — C) `x5t#S256`.** RFC 8705 §3. **A is DPoP's** member (`jkt`, RFC 9449 §6.1) — the two are easy to
swap. B (`cnf`) is the *container* both live inside, not the member. D (`x5c`) is a JOSE header for a
certificate chain, not a confirmation method.

**Q4 — A) including error responses.** §2: *"In authorization responses to the client, including error
responses, an authorization server supporting this specification MUST indicate its identity by including the
iss parameter."* Errors matter because a mix-up can be staged around a failure just as easily as a success —
and you verified this on a live error redirect in the lab.

**Q5 — B) `DPoP`.** §7.1: *"The scheme name is DPoP."* **D is the dangerous answer** and the subject of Q14:
an RS that accepts either scheme for a DPoP-bound token has silently discarded the binding.

## Tier 2 — Applied reasoning

**Q6 — B.** PAR gives confidentiality and integrity by keeping the request off the front channel, but the AS
learns only that *someone who could authenticate as this client* pushed it. JAR's signature is attributable
and non-repudiable — the client cannot later deny authoring it, and an auditor can verify it independently.
That is why regulated profiles use both. **A is the shallow trap:** they overlap on integrity, so it is easy
to conclude they are redundant. C is invented. D is wrong — JAR *may* be signed-then-encrypted (RFC 9101
§10.1), but signing is the requirement; PAR needs no encryption because the parameters never traverse the
browser.

**Q7 — B.** The URL carries `client_id` and an opaque `request_uri`. **C is the near-miss worth
understanding:** the browser is still very much in the flow — it makes the authorization request and receives
the redirect — but it no longer carries the request *contents*. A describes a plain authorization request.

**Q8 — C) checking `iss`.** Mix-up is about *which AS answered*, and only `iss` conveys that. **A is the
most tempting wrong answer:** PKCE binds the code to the client instance, but in a mix-up the legitimate
client *is* the one redeeming — at the wrong authorization server, where it also happily sends its verifier.
B (`state`) proves the response belongs to this session, not who issued it. D is enforced per-AS and says
nothing about which AS you are talking to.

**Q9 — B) DPoP.** Client certificates in browsers require OS/browser certificate stores, produce awful UX,
and cannot be provisioned per-session; DPoP needs only a `crypto.subtle` key pair the SPA generates and keeps
in memory. **A is the trap** — mTLS *is* stronger in the abstract, and irrelevant if it cannot be deployed.
C gives up on a mechanism that works. D ignores a decisive practical difference.

**Q10 — C) `htu` (with `htm`).** They bind the proof to one method and one target URI. **D is the near-miss:**
`ath` binds the proof to a specific *token*, not to an endpoint — so a captured proof with the right `ath`
would still be replayable elsewhere without `htu`. `jti` (A) enables replay *detection* at the same endpoint;
`iat` (B) bounds the window. All four matter; only `htu`/`htm` answer this question.

## Tier 3 — Trace and diagnose

**Q11.** **Defect:** Node's `crypto.sign` defaults to **DER** encoding for ECDSA. **Requirement:** JWS ES256
signatures are a raw 64-byte `R‖S` concatenation (IEEE P1363), which is what RFC 9449 proofs must carry. The
DER form is ~70–72 bytes with ASN.1 framing, so the verifier reads tag bytes where it expects `R`. **Why the
error misleads:** "Invalid signature" sends people to check the key, the claims, and clock skew — none of
which are wrong. The tell is the signature *length*: decode the third segment and count bytes. **Fix:**
`crypto.sign("sha256", input, { key: privateKey, dsaEncoding: "ieee-p1363" })`. Note that WebCrypto's
`crypto.subtle.sign` already returns raw `R‖S`, which is why the browser implementation in
`client/src/services/dpop.service.ts` needs no conversion — and why this bug appears almost exclusively in
Node or OpenSSL-based clients.

**Q12.** **Violates RFC 9101 §6.3** (*Request Parameter Assembly and Validation*): *"The authorization server
MUST only use the parameters in the Request Object, even if the same parameter is provided in the query
parameter."* This code spreads the query parameters *and* the object into one
bag. **Attack:** the object wins on collisions here, but any parameter the client did **not** put in the
signed object can be injected by whoever controls the URL — the browser, a malicious extension, or a crafted
link. So an attacker adds `resource=`, or `scope=` if the object omitted it, or a `claims` parameter, and
those unsigned additions are honoured as though the client had signed them. The signature covers what it
covers; merging silently extends trust to everything else. **Fix:** when a request object is present, use
*only* its parameters and ignore the query string entirely (barring the ones the spec requires outside, such
as `client_id`).

**Q13.** **Missing check 1 — the `ath` claim.** RFC 9449 §7 requires the proof to *"include the ath claim with
a valid hash of the associated access token."* Without it, a proof minted for *any* token from this client
works with *this* token — so an attacker who captures one valid proof (from a log, say) can pair it with a
different stolen token. **Missing check 2 — the binding itself: `cnf.jkt`.** Nothing compares the thumbprint
of the proof's `jwk` against the `jkt` recorded on the introspected token. That is the entire point of DPoP:
as written, an attacker with a stolen token simply generates *their own* key pair, mints a perfectly valid
proof with it, and is accepted — the proof verifies against its own embedded key, and nobody asks whether
that key is the right one. **Fix:** assert `base64url(SHA-256(canonical(proof.header.jwk))) === claims.cnf.jkt`
(RFC 7638 thumbprint) and assert `proof.ath === base64url(SHA-256(token))`. Also track `jti` for replay.

**Q14.** **Flaw:** the `Bearer` path is unchanged, so a DPoP-bound token presented as `Bearer <token>` is
accepted with no proof, no `ath`, and no `cnf` check. The binding is optional in practice — which means it
provides no security at all, because an attacker who steals the token simply chooses the `Bearer` path.
**Why it is worse than a hard failure:** a hard failure is loud. Legitimate clients break, someone
investigates, it gets fixed in an afternoon. This fails *open* and silently: every dashboard is green, every
legitimate client works, the tokens genuinely carry `cnf.jkt`, and an audit that checks "do we issue
sender-constrained tokens?" answers yes. The control is entirely notional and nothing will reveal that until
someone steals a token. **Fix:** when the introspected token carries a `cnf` claim, the request **MUST** use
the DPoP scheme and pass full proof validation — reject `Bearer` presentation of any bound token. Keep
`Bearer` only for tokens with no `cnf`, and plan to retire it.

**Q15.** **Most likely cause: the `request_uri` is being used twice** — RFC 9126 §4 makes it single-use, and
this deployment enforces it with exactly this error. The "every second attempt" pattern is the signature of a
double submission: a client that pushes once and then follows a redirect twice, a browser prefetching the
authorization URL, a retry on a slow first response, or a load-balanced client where two instances share a
cached handle. Development hides it because there is no prefetching proxy, no retry layer, and a single
instance. **What to check:** count PAR pushes against authorization requests in the logs — if they are 1:2,
you have your answer. **Fix:** ensure exactly one authorization request per pushed handle, push immediately
before redirecting, and never cache or share the handle. (Secondary candidates worth ruling out: the handle
expiring under a slow user — but 600 seconds and "every second attempt" both argue against it — or two AS
nodes not sharing PAR state, which would fail ~50% of the time in a two-node cluster and is worth checking if
the request counts come back 1:1.)

## Tier 4 — Adversarial and design

**Q16 — model answer.**

*Setup.* The client supports AS-H (honest) and AS-A (attacker-controlled) — an aggregator, a
"choose your provider" login, or a multi-tenant SaaS. The client has a registered `redirect_uri` at both.
The attacker controls AS-A completely: its metadata, its endpoints, and what it returns.

*The flow.*
1. The victim starts a login at the client and selects **AS-A** (the attacker's provider, which may be
   perfectly legitimate-looking, or the attacker manipulates the selection).
2. The client begins a flow it believes is with AS-A, and stores per-session state accordingly.
3. The attacker causes the victim's browser to be sent to **AS-H's** authorization endpoint instead — with the
   *client's* `client_id` and `redirect_uri`, which are public. The victim sees AS-H's genuine login page, on
   AS-H's genuine domain, and authenticates: nothing looks wrong, because nothing *is* wrong from the victim's
   point of view.
4. AS-H issues a code and redirects to the client's real callback.
5. The client receives the code and — believing this flow belongs to AS-A — sends it to **AS-A's** token
   endpoint, along with its `client_id`, its `client_secret` if confidential, and its PKCE `code_verifier`.
6. **The attacker now holds a valid AS-H authorization code, the client's credentials for AS-A, and the PKCE
   verifier**, and redeems the code at AS-H for tokens belonging to the victim.

*Where `iss` breaks it.* At step 4 the response carries `iss=<AS-H's issuer>`. At step 5 the client, per
RFC 9207 §2.4, compares that against the issuer it expected for this session — AS-A — and *"MUST reject the
authorization response and MUST NOT proceed with the authorization grant."* The code is never sent to the
attacker. The check costs three lines and is the entire defence.

*Why PKCE does not stop it.* PKCE binds the code to the client instance that started the flow — and the
legitimate client *is* the one proceeding. It dutifully sends its own verifier to whichever token endpoint it
thinks it should use, which is the attacker's. PKCE answers "is the redeemer the party that requested this?"
and the answer is genuinely yes; mix-up exploits the client's confusion about *which server it is talking
to*, a question PKCE never asks. This is the cleanest illustration in the curriculum that mechanisms are not
interchangeable.

*Additional condition required.* The client must interact with **more than one authorization server** (or
more than one issuer/tenant behind one endpoint). A single-AS client has nothing to confuse — which is why
mix-up is often dismissed, and why it lands hard on aggregators, brokers, and federated deployments. Full
credit also notes a second enabling condition: the client uses the **same `redirect_uri`** across
authorization servers, so a response from either lands in the same handler with no distinguishing information.

**Q17 — model answer.**

*Criteria.* (1) Can the client hold and use a private key at all, on the platforms we ship? (2) What does the
ecosystem or regulator mandate? (3) What infrastructure exists — is there a PKI, and does anything terminate
TLS between the client and us? (4) Operational cost: certificate lifecycle versus per-request signing.
(5) Failure mode when the mechanism is misconfigured — does it fail loudly or silently?

*(a) Mobile app → **DPoP**.* Keys can be generated per install and held in the Secure Enclave / StrongBox,
which gives hardware-backed possession without any PKI. Client certificates on mobile mean provisioning and
rotating certs to every device — a lifecycle problem with no upside here.

*(b) Bank partner S2S → **mTLS**.* This is the ecosystem's native idiom: the partner almost certainly already
has certificates, open-banking profiles commonly require it, and a server-to-server hop has no browser to
complicate the handshake. It also authenticates the client and binds the token with one mechanism.

*(c) Internal admin SPA → **DPoP**, with reservations.* Browser client certificates are impractical, so DPoP
is the only real option. State the reservation plainly: DPoP in a browser stops *token replay from elsewhere*
but does nothing against an attacker executing script in the origin, who can mint proofs with the live key.
For an *admin* SPA I would pair DPoP with a backend-for-frontend that keeps tokens out of the browser
entirely (Module 03's Q17), and treat DPoP as defence in depth rather than the control.

*The deployment detail most likely to silently break either: **TLS-terminating infrastructure.*** For mTLS, a
load balancer or service mesh that terminates TLS must forward the client certificate faithfully — if it
does not, or forwards a header a downstream service trusts blindly, the binding is either lost or forgeable
(RFC 9700 §4.13). For DPoP, the same tier rewrites `Host`, scheme, or path, so the server computes an `htu`
that never matches what the client signed — you saw a small version of this in the lab, where the derived
`htu` dropped the port. Both failure modes are configuration, not code, and both can be missed by tests that
run without the proxy in the path. Test through the real ingress.

**Q18 — model answer.**

*(a) Bearer token.* **Full compromise until expiry or revocation.** The attacker copies it and uses it
directly; nothing distinguishes them from the legitimate client. This is the baseline the module exists to
change.

*(b) DPoP-bound token plus captured proofs.* **Essentially nothing.** The token alone fails because the RS
demands a proof whose `jwk` thumbprint matches `cnf.jkt`. The captured proofs do not help: each is bound to
one method and URI (`htm`/`htu`), one token (`ath`), and a narrow time window (`iat`), with `jti` enabling
replay detection. The realistic residue is a *narrow replay* — reusing a captured proof against the exact
same endpoint with the same token inside the acceptance window, if the server does not track `jti`. That is
the one case worth checking on your own server.

*(c) PAR `request_uri`.* **Little to nothing, in this order:** it is opaque (reveals no scopes, no PKCE
challenge, no `redirect_uri`), bound to its client, single-use, and short-lived. If it was captured *before*
the legitimate use and the attacker races to consume it first, they can drive an authorization request whose
contents they cannot see — and the code still lands at the client's registered `redirect_uri`, not theirs.
Contrast with logging a plain authorization URL, which exposes the entire request.

*(d) PKCE-protected authorization code.* **Nothing, if the code was already redeemed** (single-use) — and
nothing even if it was not, because redemption requires the verifier, which is not in the logs. The residual
risk is the *race*: a code logged and not yet redeemed could, in principle, be raced by an attacker who also
has the verifier — which they do not.

*What the attacker needs in addition to defeat DPoP:* **the private key** — from process memory, an unlocked
device, a key stored in `localStorage` instead of non-extractable `CryptoKey` form, or a compromised build.
Logs cannot contain it: the `jwk` in the proof header is the *public* key, and RFC 9449 §4.2 requires it
*"MUST NOT contain a private key."*

*What I would change about the logging.* Stop logging credentials at all: redact `Authorization` and `DPoP`
headers at the ingress, and strip `code`, `token`, `request_uri`, `code_verifier`, and `id_token_hint` from
logged URLs. Log a *hash prefix* if you need correlation. Note the ordering insight this exercise produces:
sender-constraining materially reduces the value of a log breach, but it is not a licence to keep logging
tokens — it converts a critical finding into a serious one.

**Q19 — model answer.**

*Which kind of bug.* **Primarily a correctness bug, with a real security consequence one step removed.**
Directly, it fails *closed*: a DPoP-bound token is rejected, nobody's data is exposed, and no attacker gains
anything. By itself, that is a functional defect — the endpoint does not implement RFC 9449 §7.1.

The security consequence is second-order but genuine: the endpoint is *unusable* with sender-constrained
tokens, so any team that needs UserInfo to work will make the problem go away — and the path of least
resistance is to stop using DPoP, or to issue bearer tokens alongside. A correctness bug that pressures
operators toward the insecure configuration is a security bug in slow motion. It is also a
conformance/interoperability defect: a spec-conformant client cannot use this server's resource endpoint.

*The inverse defect.* An RS that accepts `Authorization: Bearer <token>` for a token carrying `cnf.jkt`,
without demanding a proof. Everything works, all clients succeed, and the binding is silently void — an
attacker with a stolen token just uses the `Bearer` path.

*Which is more dangerous: the inverse, decisively.* Compare failure modes. This repo's bug is loud, blocking,
and self-reporting — you cannot ship a DPoP client against it without noticing within minutes. The inverse is
silent and *invisible to every positive test*: tokens really do carry `cnf`, DPoP requests really do succeed,
dashboards are green, and an audit asking "do we sender-constrain?" gets a truthful yes. The control is
notional, and the only thing that reveals it is an incident. Fail-closed bugs cost engineering time;
fail-open bugs cost you the breach you thought you had prevented.

*The CI test that catches the dangerous one.* A negative test, because positive tests cannot see this class of
defect:

> Obtain a DPoP-bound access token (assert the response has `token_type: DPoP` and that introspection reports
> a `cnf.jkt`). Then send it to a protected resource as **`Authorization: Bearer <token>` with no `DPoP`
> header** and **assert the response is 401** with `invalid_token`. Add a second case: present it with the
> `DPoP` scheme but a proof signed by a *different, freshly generated key* — assert 401, which catches an RS
> that validates the proof's own signature but never compares its thumbprint to `cnf.jkt` (Q13's second
> missing check).

The general principle worth taking away: **for any security control, write the test that fails when the
control is absent — not the test that passes when it is present.**
