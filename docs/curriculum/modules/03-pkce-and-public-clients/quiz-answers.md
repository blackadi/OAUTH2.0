# Module 03 — Quiz Answers

Each answer explains **why the right answer is right and why the tempting wrong ones are wrong.**

---

## Tier 1 — Recall

**Q1 — B.** RFC 7636 §4.1: 43–128 characters from the unreserved set, ABNF `code-verifier = 43*128unreserved`.
**C is the near-miss:** 43 base64url characters is what you get from 32 random bytes and is a perfectly good
verifier, but it is one valid choice, not the definition. A confuses encoding with the spec's character
restriction (hex is a subset of the unreserved set, so it is legal, but the bound is on characters, not bytes).

**Q2 — B.** `BASE64URL-ENCODE(SHA256(ASCII(code_verifier)))`. **A is the trap** — it omits the base64url
encoding, so it produces raw bytes that cannot travel in a URL. C invents a client secret, which public
clients do not have and which would defeat the purpose. D is `plain` with extra steps.

**Q3 — A) `plain`.** §4.3: it *"defaults to 'plain' if not present."* This is why you always send
`code_challenge_method=S256` explicitly — the insecure option is the silent one.

**Q4 — C) `invalid_grant`.** §4.6 requires *"an error response indicating `invalid_grant` as described in
Section 5.2 of [RFC6749]."* **A is the trap:** `invalid_client` is about client authentication, and there is
no client authentication here — that is the whole premise of the module.

**Q5 — B.** *OAuth 2.0 for Native Apps*, BCP 212, October 2017. C is RFC 7636, D is RFC 9700 (BCP 240), A is a
different (draft) document.

## Tier 2 — Applied reasoning

**Q6 — B.** Anyone who loads the page can read the bundle, and the "secret" is identical for every
installation — so it authenticates nothing while making the team believe the token endpoint is protected.
**A is the shallow trap:** minification is not encryption, and HTTPS protects transit, not the recipient, who
is by definition the user. C is wrong and is the other common overcorrection — SPAs should absolutely use the
code flow, as a *public* client with PKCE. D treats an unfixable design error as an operational chore.

**Q7 — C) PKCE.** Redemption requires the verifier, which existed only in the legitimate client's process.
**A is the single most common wrong answer:** `state` is checked by the *client* on its own callback, so it
is irrelevant to an attacker who is redeeming the code directly at the token endpoint and never touches the
client. B confuses transit protection with endpoint exposure — the code leaked *from the endpoint* (history),
where TLS has no reach. D identifies the issuer (mix-up defense, Module 05) and does not gate redemption.

**Q8 — B) claimed `https` scheme.** RFC 8252 §7.2. Ownership is proven against the domain, so a hostile app
cannot register the same target. **A is workable but weaker** (§7.1 — any app can claim a private-use scheme,
which is exactly Q16's scenario). C is forbidden by §8.12. D is wrong for mobile: loopback (§7.3) is the
desktop/CLI answer.

**Q9 — D.** RFC 9700 §2.2.2 permits exactly two treatments: sender-constrained, or rotated. **A, C, and D are
all variations of the same trap** — they improve *storage* or shorten *lifetime*, which are worth doing but
are not either of the two required controls. The threat is a token that, once copied, can be spent by the
copier; only binding it to a key or invalidating it on use addresses that.

**Q10 — B.** The authorization URL is exposed at the user agent regardless of TLS, and with `plain` that URL
literally contains the verifier. C is factually wrong — `plain` applies no hash at all, which is worse than a
weak one. A is false (it is registered and widely supported, which is the problem). D is invented.

## Tier 3 — Trace and diagnose

**Q11.** **Defect:** the client sent the **verifier itself** as `code_challenge` while declaring the method as
`S256`. **Requirement:** RFC 7636 §4.2 — with `S256` the challenge must be
`BASE64URL-ENCODE(SHA256(ASCII(verifier)))`. **Why it fails:** the AS stores the raw verifier as the
challenge, then at redemption computes `SHA256(verifier)` and compares it against the stored *unhashed*
value. They never match, so §4.6 mandates `invalid_grant` — every single time, which is the tell: a
consistent, 100% failure rate points at a construction bug, not an attack. **If they had written
`plain` instead:** it would have *worked*, silently — because with `plain` the challenge is defined to equal
the verifier. That is the dangerous outcome: a green test suite and a scheme that publishes its own secret in
the front channel. **Fix:** hash the verifier when building the challenge, and keep `S256`.

**Q12.** **Unmet requirement:** RFC 9700 §4.8 — *"The authorization server MUST ensure that if there was no
`code_challenge` in the authorization request, a request to the token endpoint containing a `code_verifier`
is rejected."* This code enforces PKCE only when a challenge happens to be stored, and silently proceeds when
one is not. **Attack:** the attacker strips `code_challenge` and `code_challenge_method` from the
authorization request as it passes through the browser (a malicious extension, a rogue app handling the
redirect, a MITM on a non-TLS hop, or simply a crafted link). The AS issues a code with no challenge attached;
the client then presents its verifier, which this server ignores; the exchange succeeds. From every log's
point of view the flow looked normal, so the downgrade is invisible. **Fix:** reject a token request carrying
a `code_verifier` when no challenge was stored, *and* set `pkceRequired` so the authorization endpoint refuses
challenge-less requests up front rather than issuing a code that depends on redemption-time checks.

**Q13.** **Defect:** `Math.random()` is not a cryptographically secure PRNG. Its output is predictable from
observed values in typical engine implementations, and it is seeded from a small state. **Consequence:** an
attacker who steals the code can *predict or reconstruct the verifier* and complete the exchange — PKCE is
fully defeated while appearing to be present, which is worse than not having it, because it stops anyone
looking harder. **How this differs from the `client/src/pkce.ts` note:** that file uses
`crypto.getRandomValues` (a CSPRNG) and only suffers a *modulo bias* from `% 66` — a non-uniformity worth
roughly 0.005 bits per character, leaving a 64-character verifier with ~386 bits instead of ~387. One is a
total break; the other is a rounding error. Being able to tell those apart — and not reporting the second as
a vulnerability — is the actual skill. **Fix:** `crypto.getRandomValues` (or `crypto.randomBytes`) and
base64url the bytes directly, which sidesteps the alphabet mapping entirely.

**Q14.** Three defects: **(1) Embedded `WebView`** — RFC 8252 §8.12: *"native apps MUST NOT use embedded
user-agents to perform authorization requests."* The app can read the credential out of the DOM (destroying
Module 01's credential boundary) and the user cannot inspect the address bar to detect a spoofed login page.
Fix: Custom Tabs / `ASWebAuthenticationSession`. **(2) Private-use URI scheme** — RFC 8252 §7.1: any other app
on the device can register `com.example.app` and receive the redirect. Fix: a claimed `https` scheme (§7.2).
**(3) No PKCE** — RFC 9700 §2.1.1 (*"Public clients MUST use PKCE"*), and it is the control that would have
made defect 2 survivable. Fix: `S256`, plus `pkceRequired` server-side. Note the compounding: defect 2 hands
the attacker the code and defect 3 makes the code sufficient.

**Q15.** **Problem 1 — reuse across flows.** A verifier must be fresh per authorization request (RFC 7636 §4.1
calls for a new high-entropy random string). Reusing one means a verifier disclosed once retroactively unlocks
every code issued under it, and it removes the per-request binding that makes PKCE a proof of *this* flow.
It also breaks concurrent flows in two tabs: the second overwrites nothing, so the first tab's exchange fails
or, worse, both share one secret. **Problem 2 — `localStorage`.** It persists beyond the tab and the flow, so
the verifier outlives its usefulness on disk, is readable by any script in the origin (XSS), and is shared
across tabs. `sessionStorage` is the better default, and deleting the value immediately after redemption is
better still. **Fix:** generate per request, key by `state` if concurrent flows are possible, store in
`sessionStorage` or memory, and delete on use.

## Tier 4 — Adversarial and design

**Q16 — model answer.**

**(a) No PKCE.** The OS hands your app the redirect. You now hold a valid authorization code, and the
`client_id` is public (readable from the target's manifest or its own traffic), and the `redirect_uri` is the
scheme you just intercepted. You POST to the token endpoint with those three values and receive an access
token — and typically a refresh token, which converts a one-shot interception into indefinite access. Total
account compromise, and the victim sees only a login that "didn't quite work." This is exactly Break 3 in the
lab.

**(b) PKCE with S256.** You still receive the code, and you can also read the `code_challenge` if you observed
the outbound authorization request. Neither helps: redemption requires the verifier, which never left the
target app's process, and deriving it from the challenge means inverting SHA-256. The token endpoint returns
`invalid_grant` (`[A050312]` if you send nothing, `[A050315]` if you guess). Your best remaining move is a
downgrade — strip `code_challenge` from the outbound request so the AS issues an unprotected code — which
fails against an AS that implements RFC 9700 §4.8 and is impossible against one with `pkceRequired` set.

**What PKCE actually protects against here, and what it does not.** PKCE protects against **interception of
the authorization response** — an attacker positioned on the *channel*, who obtains the code but not the
client's process memory. It does **not** protect against an attacker positioned *inside the client's trust
boundary*. Realistic on-device capabilities that defeat it entirely: a rooted/jailbroken device or a malicious
app with the ability to read the target's private storage or memory (where the verifier lives between the two
legs); an accessibility-service or screen-recording abuse that captures the credential during login; a
compromised or repackaged build of the target app itself; or a debugger attached to the process. In each case
the attacker gets the verifier — or simply the tokens — and PKCE is irrelevant.

**Correct defenses for that residual class:** claimed `https` redirects (§7.2) so the redirect cannot be
intercepted in the first place; platform key storage with hardware backing (Secure Enclave / StrongBox) plus
**sender-constrained tokens** (DPoP or mTLS, Module 05) so a lifted token is useless without the key; app
attestation (Play Integrity / App Attest) so the AS can distinguish a genuine build; refresh-token rotation
with reuse detection so a stolen refresh token surfaces as an anomaly; and short access-token lifetimes.
Full credit notes the framing: PKCE fixes a *protocol* gap, not a *device compromise* — and no OAuth
extension does.

**Q17 — model answer.**

**Recommendation: (b), the backend-for-frontend, for a first-party SPA talking to a first-party API.**

*The XSS threat model is the deciding factor.* In proposal (a), PKCE guarantees that a code observed in the
URL cannot be redeemed by an outsider — a real and worthwhile property. But an attacker who achieves script
execution in the SPA's origin is not an outsider. They can read tokens straight out of memory (in-memory
storage is not a defense against same-origin script, only against persistence across reloads); they can call
the API directly from the victim's browser with the victim's tokens; and they can silently initiate a *new*
authorization flow, because the AS session cookie is present and the attacker *is* the legitimate client
instance as far as the AS can tell — PKCE included, since the attacker generates the verifier. So under XSS,
proposal (a) offers essentially no residual protection.

*What PKCE does and does not do for (a).* Does: prevents code interception and injection (RFC 9700 §4.5,
§4.8), which matters against shared machines, extensions reading history, and `Referer` leakage. Does not:
protect tokens after issuance, protect against same-origin script, or make a browser a safe place to hold a
refresh token.

*Why (b) is better here.* Tokens never enter the browser, so the XSS blast radius collapses from "steal
long-lived credentials and use them from anywhere, indefinitely" to "make authenticated requests from the
victim's browser while the session is alive" — still bad, but bounded, revocable by killing one session, and
observable. The BFF is a confidential client, so it gets real client authentication and can hold a refresh
token safely, sender-constrain, and enforce audience restriction. Cookies get `HttpOnly`, `Secure`,
`SameSite`, so script cannot read the session either.

*What (b) costs.* A stateful server component to build, deploy, scale, and secure; session and CSRF handling
you would not otherwise need (`SameSite` is a mitigation, not a complete answer); an extra network hop and
latency; a harder story for multiple independent frontends or third-party clients; and the BFF itself becomes
a high-value target holding many users' refresh tokens.

*When I would change the recommendation.* If the SPA is **not** first-party to the API (a third-party
integration where a shared BFF has no natural home); if the deployment already sender-constrains browser
tokens with DPoP and keeps access-token lifetimes very short, narrowing the theft window; if the team cannot
operate a server component reliably, since a badly-run BFF is worse than a well-run public client; or if the
API is genuinely low-sensitivity and the operational cost is not justified. In all of those, (a) with
`S256`, in-memory tokens, rotation with reuse detection, and a strict CSP is a defensible answer — the
non-negotiable being that **eliminating XSS is a prerequisite either way**.

**Q18 — model answer.**

*Why both are correct.* They apply to different branches of the same rule. RFC 9700 §2.2.2 gives an
**either/or**: a public client's refresh token must be sender-constrained **or** rotated. FAPI 2.0 takes the
first branch and makes sender-constraining mandatory everywhere (DPoP or mTLS); once a refresh token is bound
to a key the client proves possession of on every use, rotation adds no security — a stolen token is already
unusable without the key — while adding failure modes: lost updates on concurrent refreshes, spurious
reuse-detection revocations from network retries, and races in multi-instance clients. So FAPI 2.0 turns
rotation *off* (`refreshTokenKept = true`) precisely **because** it has satisfied the requirement the other
way. The contradiction is only apparent: rotation is the answer for deployments that cannot bind tokens to
keys, and binding is the answer for deployments that can. Choosing *neither* is the only wrong answer.

*(i) Consumer mobile app, no mTLS or DPoP support.* Sender-constraining is unavailable, so **rotation is
mandatory** — it is the only permitted branch. Policy: rotate on every use; invalidate the previous token
immediately; on presentation of an already-rotated token, treat the grant as compromised and revoke the entire
token family, not just the replayed token (you cannot tell which of the two holders is legitimate, and
failing closed is correct). Give refresh tokens a bounded absolute lifetime as well as an idle timeout, and
store them in platform-backed secure storage. Push for DPoP support as the real fix, and note that reuse
detection is inherently noisy on mobile — offline retries and app restarts produce false positives, so pair
revocation with a re-authentication path that is not a dead end for the user.
*Monitor:* refresh-reuse events per user and per app version (a spike after a release usually means a client
bug, not an attack); refreshes from a new IP/ASN or device fingerprint within a short window of a prior one;
refresh rate far above the access-token lifetime; and geographically impossible sequences on one grant.

*(ii) FAPI 2.0 open-banking, everything sender-constrained.* **Do not rotate** (`refreshTokenKept = true`),
per FAPI 2.0 §5.3.2.1 as recorded in `AGENTS.md`. The binding is the control: every refresh must present a
valid DPoP proof or client certificate whose thumbprint matches the token's `cnf` claim, so a copied token is
inert. Keep refresh lifetimes bounded by the grant's own lifetime and integrate with Grant Management
(Module 10) so a customer revoking consent kills the refresh token immediately. Also enable
`refreshTokenIdempotent` to make retries safe.
*Monitor:* refresh attempts whose `cnf` thumbprint does not match (that is a theft attempt hitting the
binding, and it should be loud); any successful refresh where the client certificate or DPoP key changed
mid-grant; refresh volume per client against its consented-user count; and grants still refreshing after a
consent revocation should have taken effect. The signal to alert on differs in kind between the two: in (i)
you are looking for *duplicate use*, in (ii) for *proof failures*.
