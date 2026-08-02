# Module 02 — Quiz Answers

Each answer explains **why the right answer is right and why the tempting wrong ones are wrong.**

---

## Tier 1 — Recall

**Q1 — D) §4.1.** §3.1 is the authorization *endpoint*, §4.3 is ROPC, §6 is refreshing an access token.

**Q2 — C) `state`.** RFC 6749 §10.12, "Cross-Site Request Forgery." **A is the trap:** `nonce` also binds
something to a request, but it binds the **ID token** to the authentication request (OIDC Core) — a different
artifact and a different attack. B (`code_challenge`) binds the *code* to the client instance (PKCE, Module
03). Confusing these three is the single most common vocabulary failure in OAuth, and Modules 03 and 08 both
come back to it.

**Q3 — B) `urn:ietf:params:oauth:grant-type:device_code`.** A is the *parameter* name, not the grant type.

**Q4 — B.** Those six are §5.2's token-endpoint codes. **A is the trap** — those are §4.1.2.1's *redirect*
error codes, delivered through the browser. C is RFC 6750 §3.1 (bearer token errors). D is RFC 8628 §3.5
(device polling). Four different error vocabularies, four different channels.

**Q5 — B.** *Best Current Practice for OAuth 2.0 Security*, BCP 240, January 2025. **A is the trap** — it was
a long-running draft (`draft-ietf-oauth-security-topics`) and plenty of material still calls it one; it is a
published BCP. D describes RFC 6819 (Informational, January 2013), which RFC 9700 supersedes in practice.

## Tier 2 — Applied reasoning

**Q6 — C) `client_credentials`.** No human, no delegation: the client acts as itself, and it is confidential
(it runs on your infrastructure and can hold a secret). **A is the shallow trap** — inventing a "service
account user" to fit the code flow is a widespread anti-pattern: it fabricates a resource owner who cannot
consent, cannot be authenticated, and cannot be revoked meaningfully. B is forbidden (RFC 9700 §2.4). D
mistakes a refresh token for a grant type you can bootstrap out of nothing.

**Q7 — C) the device authorization grant (RFC 8628).** The defining constraint is that the device cannot
receive a redirect and the user cannot type comfortably. **A is the trap:** embedded webviews defeat the
credential boundary (the app can read the login page's DOM) and break the user's ability to verify the origin
— a Module 01 failure wearing a Module 03 costume. B is retired *and* still needs a redirect. D never obtains
user authorization at all.

**Q8 — C.** The value is that the code is **worthless to whoever reads it** — redemption requires client
authentication on the back channel, and the code is single-use. **A is factually wrong** (codes are not
encrypted; they are opaque references, and opacity is not confidentiality — Module 00). B is irrelevant. D
confuses an audit side effect with the security property.

**Q9 — B.** The AS re-verifies that the `redirect_uri` in the token request matches the one in the
authorization request. **A is the shallow trap** — the token is returned in the HTTP response to *this* POST;
nothing is redirected anywhere at that point. Believing A means believing the token endpoint is a redirecting
endpoint, which inverts the whole front/back-channel model.

**Q10 — B.** `state` is a CSRF defense (RFC 9700 §4.7): it stops an attacker who initiates their *own*
authorization flow and then feeds the resulting response into the victim's browser session, causing the
victim's client account to be linked to the attacker's identity or grant. TLS protects bytes in transit
between endpoints; it says nothing about which flow a response belongs to. (Module 00's exact point: encrypted
in transit, still attacker-influenceable at the endpoint.) C is wrong — `state` applies to any redirect-based
flow. D restates the misunderstanding with a version number.

## Tier 3 — Trace and diagnose

**Q11.** **Defect:** prefix matching on the redirect URI. **Violates:** RFC 9700 §4.1 — *"When comparing
client redirection URIs against pre-registered URIs, authorization servers MUST utilize exact string matching
except for port numbers in localhost redirection URIs of native apps."* **What it allows:** anything that
merely *starts with* the registered string is accepted — `https://app.example.com/../evil`, path traversal,
an open-redirect endpoint under that prefix (`https://app.example.com/redirect?to=https://attacker.example`),
or, if the registered value lacked the trailing slash, a hostile host like `https://app.example.com.evil.test`.
The attacker registers nothing and receives victims' authorization codes at a URL of their choosing.
**Fix:** exact string comparison against the full registered URI, with the sole permitted variance being the
port on native-app loopback URIs (`loopbackRedirectionUriVariable`, `AGENTS.md`).

**Q12.** **Defect:** `state` is generated and stored but never **compared**. Generating it is not the control;
comparing it is. **Affected requirement:** RFC 6749 §10.12 / RFC 9700 §4.7. **Attack:** the attacker begins
their own authorization flow, captures their own valid `code`, and then induces the victim's browser to hit
`/callback?code=<attacker's code>` (a link, an image tag, any CSRF vector). The client exchanges it and stores
**the attacker's** tokens in the victim's session — so the victim is now operating the attacker's account, or,
in a "link your account" flow, the victim's account gets bound to the attacker's external identity, giving the
attacker persistent access. **Fix:** read `req.query.state`, compare it with the value stored for this session
using a constant-time comparison, delete it after one use, and abort the flow on any mismatch or absence.

**Q13.** **Rule 1 broken:** an error was redirected to an **unvalidated, unregistered** `redirect_uri`. If the
AS cannot validate the redirect URI, it MUST NOT redirect — it must render the error itself. **Rule 2 broken:**
redirect-URI validation must precede any other parameter validation, because the AS decided the `scope` was
bad and reported it *to the attacker's URL*. **Capability gained:** the AS is now an **open redirector**
(RFC 9700 §4.11) — an attacker can send phishing links that genuinely originate from the trusted
authorization-server domain and bounce victims anywhere, laundering the AS's reputation and defeating "check
the link before you click." It also leaks the fact that a given `state`/session exists. **Fix:** validate
`client_id` and `redirect_uri` **first**; on failure, render the error locally and never redirect.

**Q14.** **Defect 1 — `slow_down` is ignored.** RFC 8628 §3.5 defines it as *"A variant of
'authorization_pending', the authorization request is still pending and polling should continue, but the
interval MUST be increased by 5 seconds."* This client keeps polling at the same rate, so it will be
rate-limited or have its device code invalidated. **Defect 2 — the server's `interval` is ignored entirely.**
The device authorization response (§3.2) returns an `interval`; hardcoding 1000 ms polls far faster than the
AS asked for, which is abusive and will trigger `slow_down` immediately. A third, if you spotted it: the loop
has no overall timeout, so it ignores `expires_in` and will spin until it happens to receive `expired_token`.
**Fix:** initialise the delay from the response's `interval`, add 5 s on every `slow_down`, and stop when
`expires_in` elapses or on `access_denied`/`expired_token`.

**Q15.** **Safeguard given up:** the cross-check that the party redeeming the code is the party the code was
issued to. By deriving `client_id` from the code, the AS removes an independent assertion it could have
verified against, weakening the binding between the authorization request and the token request and
eliminating a detection point for code injection/substitution. **Flag:** `missingClientIdAllowed` — `AGENTS.md`
recommends `false`, citing RFC 6749 §4.1.3, so the token request must carry `client_id` rather than have it
looked up from the authorization code. **Fix:** set it to `false` and reject token requests that omit
`client_id`. (For a *confidential* client this is somewhat moot because client authentication is required
anyway; the flag matters most for public clients, where there is no client authentication at all — which is
precisely Module 03's territory.)

## Tier 4 — Adversarial and design

**Q16 — model answer.**

**(a) Confidential server-side web client.** The attacker reads the callback URL and obtains `code` and
`state`. Redemption requires `POST /token` with **client authentication** — a secret held only on the client's
server. The attacker cannot produce it, so the exchange fails at RFC 6749 §4.1.3. Additional independent
barriers: the code is single-use (the legitimate client will normally have already redeemed it, and reuse
should trigger revocation of the tokens issued from it) and short-lived. **Result: blocked, and the blocking
step is client authentication at the token endpoint.** Residual value to the attacker: knowing a flow occurred,
plus the leaked `state`, which matters only if the client also fails to compare it.

**(b) Public SPA or mobile app.** There is no client secret — by definition, since the binary or bundle is in
the user's hands. Client authentication at step 9 authenticates *nobody*; `client_id` is public. So the
attacker replays the stolen `code` with the public `client_id` and the known `redirect_uri` and **receives a
genuine access token** (and possibly a refresh token) for the victim. Nothing in the base RFC 6749 flow stops
this. On mobile the interception is often even easier: a malicious app registering the same custom URL scheme
receives the redirect directly. **Result: full account compromise. This is authorization-code interception,
RFC 9700 §4.5.**

**What is missing and what a fix must do.** The missing capability is a way for the client to prove *"I am the
same party that started this authorization request"* **without a pre-shared, long-lived secret**. Any fix must
therefore: (1) be generated fresh per authorization request, so it is not extractable from the binary;
(2) have the value sent on the front channel be a **one-way transform** of the value sent on the back channel,
so reading the front-channel request does not yield the redemption secret; (3) be verified by the AS as a
precondition of redeeming the code; and (4) not be downgradable — the AS must not accept a weaker method than
the one the request used. That is exactly PKCE with `S256`, plus the downgrade protection of RFC 9700 §4.8 —
**Module 03**. Note also what a fix must *not* rely on: `state` fails requirement (2) — it is sent in the
clear on the front channel — which is the precise reason `state` cannot substitute for PKCE.

**Q17 — model answer.**

| Component | Grant | Client type | Client auth | Most dangerous attack |
|---|---|---|---|---|
| Browser SPA | `authorization_code` + PKCE (S256) | public | none | Code interception / XSS-driven token theft from browser storage (RFC 9700 §4.5, §4.17) |
| iOS app | `authorization_code` + PKCE (S256), system browser (`ASWebAuthenticationSession`) — **never** an embedded webview | public | none. *(Platform **app attestation** — App Attest, Play Integrity — can give the AS evidence that a genuine build is calling, but it is a platform service rather than an OAuth client-authentication method, and this curriculum does not cover it.)* | Redirect hijack by a malicious app claiming the same custom URL scheme → code interception; use HTTPS universal links |
| Nightly reporting job | `client_credentials` | confidential | `private_key_jwt` or mTLS in preference to a shared secret | Credential theft from the host/CI → silent, long-lived, machine-speed data exfiltration |
| Smart-TV app | device grant (RFC 8628) | public | none | `user_code` social engineering — the user authorizes an attacker's device because there is no origin or redirect to inspect |

**Weakest link under an attacker with code execution on the end user's device:** the **SPA**. Justification:
PKCE protects the *code* in transit, but it does nothing once the attacker is executing inside the same origin.
**cross-site scripting (XSS — an attacker running script in your own origin; Module 03 defines it)** or a
malicious extension reads the access token (and any refresh token) straight out of memory or storage
and can also silently drive a fresh authorization flow through an existing AS session, defeating PKCE
entirely because the attacker *is* the legitimate client instance. The iOS app is meaningfully better because
the OS enforces process and keychain isolation and the system browser keeps the AS session out of the app's
reach; the TV app holds little and is bounded by short-lived codes; the batch job is not on the user's device
at all. The mitigations for the SPA are therefore not more front-channel parameters but **sender-constrained
tokens (DPoP, Module 05), short lifetimes, refresh-token rotation policy, and a *backend-for-frontend* — a
server component that runs the flow as a confidential client and keeps tokens out of the browser entirely
(Module 03)** — with a hard prerequisite of eliminating XSS, since no OAuth mechanism survives script
execution in your own origin.

> **Marking note.** At this point you have not met DPoP, backend-for-frontends, or XSS as named concepts —
> Modules 03 and 05 introduce them. Full marks require the four-column table and the weakest-link argument;
> naming those specific mitigations is credit, not a requirement. They are named here so you recognise them
> when they arrive.

**Q18 — model answer.**

*What is wrong.* The access token is delivered in the URL fragment through the browser, so it leaks into
browser history (RFC 9700 §4.3) and, depending on the page, into `Referer` headers (§4.2); it is exposed to
every script and extension in the page at delivery time; it cannot be bound to the requesting client because
there is no back-channel leg to bind it on; it is vulnerable to access token injection (§4.6); and it cannot
be paired with a refresh token safely, forcing either very long token lifetimes or repeated top-level
redirects. RFC 9700 §2.1.2 states clients **SHOULD NOT** use the implicit grant or other response types
issuing access tokens in the authorization response, and OAuth 2.1 (active Internet-Draft) removes it.

*What the SPA gains.* The front-channel artifact becomes a single-use code that is useless without the PKCE
verifier; tokens arrive only in a direct response the browser history never sees; refresh tokens become
usable with a defensible rotation policy; the AS gains a per-redemption checkpoint where it can enforce PKCE,
detect replay, and revoke on code reuse; and the deployment becomes eligible for later hardening — DPoP,
audience restriction — none of which implicit can support.

*The new requirement it imposes.* Implicit needed no back-channel call from the browser; the code flow does.
That means the token endpoint must be reachable from the browser origin, which requires **CORS** on the token
endpoint (the historical reason implicit existed at all — cross-origin requests were not available when
OAuth 2.0 was written). It also requires the SPA to generate, store, and use a PKCE verifier across the
redirect, and to handle a redemption step that can fail. This is the honest cost, and it is small.

*Answering "it's simpler and it has worked for six years."* Absence of a known incident is not evidence of
safety for an attack whose entire signature is a token appearing in a log or a history file — you would not
detect it. The threat environment changed underneath the design: CORS removed implicit's only technical
justification, and browser extensions and third-party scripts made "the fragment is only visible to my page"
false in practice. Meanwhile the migration is bounded: the AS already supports the code flow, and the SPA
change is a few dozen lines. "It works" is an argument for careful cutover, not for keeping a grant the BCP
retired and the next framework version deletes.

*What to monitor during cutover.* Run both response types side by side behind a flag and watch: the ratio of
authorization requests using `code` vs `token`; token-endpoint error rates broken out by code
(`invalid_grant` spikes mean PKCE or `redirect_uri` mismatches); code-redemption latency and any
redemption-failure or code-reuse events (reuse should page someone); CORS preflight failures on the token
endpoint; and login-completion rate per client, so a silent drop-off surfaces immediately. Cut over one client
at a time, keep the rollback flag until the implicit path shows zero traffic for a full business cycle, then
disable `response_type=token` at the AS so it cannot be re-enabled by accident.
