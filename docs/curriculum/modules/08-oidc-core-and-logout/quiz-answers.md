# Module 08 — Answers

Every wrong option is explained, because the point is to find the misconception, not to score.

---

## Tier 1 — Recall

**Q1 — A) `iss`, `sub`, `aud`, `exp`, `iat`.**

OIDC Core §2 marks exactly these five REQUIRED. Everything else is conditional or optional.

- **B** adds `nonce`, which is *conditionally* required — required only if it was sent in the request. This is
  the most tempting wrong answer, and the distinction matters: if you did not send a `nonce`, its absence is
  correct behaviour and you simply have no replay protection.
- **C** promotes `auth_time`, required only with `max_age` or when requested as an Essential Claim, and drops
  `iat`.
- **D** drops `iss` — the claim step 2 checks — and promotes `acr`, which is optional.

---

**Q2 — B) the UTF-8 octets of the `client_secret`.**

Step 8: *"For MAC algorithms (HS256, HS384, HS512), use UTF-8 client_secret octets as validation key."*

- **A** is the asymmetric case (RS*/ES*/PS*), which is what you should be using.
- **C** invents a derivation.
- **D** is the algorithm-confusion bug: taking key selection from attacker-controlled header fields.

The consequence is the important part, and Lab B6 demonstrates it: with a symmetric algorithm the validation
key *is* the signing key, so anyone who can verify can forge.

---

**Q3 — C) a claim inside the ID token.**

That placement is the whole point, and it is what distinguishes `nonce` from `state`. Inside the signature,
`nonce` is integrity-protected; an attacker who rewrites the redirect cannot change it without breaking the
signature.

- **A** is `state`.
- **B** — the token response body carries the ID token, not a bare `nonce`.
- **D** is a bearer-token error channel (RFC 6750).

---

**Q4 — B) `c_hash`.**

OIDC Core §3.3.2.11 — *"the base64url encoding of the left-most half of the hash of the octets of the ASCII
representation of the code value."*

- **A** `at_hash` binds the access token, required when `response_type` includes `token`.
- **C** `s_hash` binds `state`, a FAPI-profile addition.
- **D** `azp` names the authorized party; it binds nothing.

The pattern to carry: when a value travels through an untrusted channel, put its hash somewhere signed. PKCE,
DPoP's `ath`, and all three of these hashes are the same idea.

---

**Q5 — B) a redirect carrying `error=login_required`.**

§3.1.2.6 defines `login_required` as *"The Authorization Server requires End-User authentication. This error
MAY be returned when the prompt parameter value in the Authentication Request is none."* It is delivered the
way all authorization-endpoint errors are: as a redirect to the already-validated `redirect_uri`.

- **A** — the authorization endpoint is a browser endpoint; a 401 would show the user a broken page.
- **C** and **D** are both what a *broken* implementation does. **D** is what this deployment actually does
  (Lab 5c), and the reason it is so damaging is that a client's error handler is matching on four specific
  strings and gets none of them.

---

## Tier 2 — Applied reasoning

**Q6 — The flaw: the access token has no audience for the login endpoint, so any access token for the victim will do.**

Their reasoning is about *provenance* ("it came from our flow") when the vulnerability is about
*verification* ("can we tell?"). Nothing in the token or in UserInfo's response distinguishes a token their
flow obtained from one any other application obtained for the same user at the same provider. UserInfo
answering with the victim's `sub` is not evidence about the requester — it is evidence about the token, and
the attacker supplied the token.

**Minimum change:** request the `openid` scope, and authenticate from the **ID token** after validating it —
critically including step 3, that `aud` contains your `client_id`. That is the check the access token can never
support, because an access token is not addressed to you.

The tell that this argument is wrong in general: "over TLS" and "we validated it" are both true of the
attacker's token too.

---

**Q7 — Steps 3 (`aud`) and 11 (`nonce`).**

- **Step 3** closes **token substitution / cross-RP replay.** A signature proves the provider issued the
  token. It does not prove the provider issued it *to you*. Without `aud`, a real ID token that a different RP
  legitimately received — or that an attacker obtained via their own registered client at the same provider —
  logs the victim into your application.
- **Step 11** closes **ID token replay/injection.** Without `nonce`, an ID token captured or obtained earlier
  can be presented to a fresh login attempt; nothing ties the token to *this* request in *this* browser.

Step 2 (`iss`) is close behind and worth mentioning for multi-provider RPs, where a token from a
provider-you-trust-less can otherwise satisfy a check meant for a provider-you-trust-more.

---

**Q8 — `sub` is unique only *within* an issuer, so two providers can collide.**

OIDC Core: *"Subject Identifier. A locally unique and never reassigned identifier within the Issuer."*
**Locally**. Provider A's `sub` of `12345` and provider B's `sub` of `12345` are different people, and a lookup
keyed on `sub` alone will merge them — an account takeover that requires no attack, just a registration.

**When it breaks:** at the moment the second provider is added, silently, for whichever users happen to
collide. Worse, it will pass every test written against a single provider.

**Why email is worse, not better:** email addresses are *reassignable* (corporate addresses get recycled to new
employees), *changeable* by the user, and often *unverified* — so an attacker who can set their profile email
to the victim's takes over the account. `sub` at least has a spec requirement never to be reassigned. Correct
key: `(iss, sub)`.

---

**Q9 — The SPA sees a navigation to a blank page, and its error handling does not fire.**

The iframe navigates to `Location: ` — an empty target, which resolves to the current document or simply
fails, depending on the browser. There is no `error` parameter to parse, so the SPA's handler — which is
matching `login_required` / `consent_required` / `interaction_required` / `account_selection_required` — finds
nothing it recognises. Most implementations then time out and treat it as an *unknown* failure.

**What the user sees** depends on the fallback: at best a redirect to a full login page they did not ask for;
at worst an infinite spinner, or a session that appears to expire at random while they are actively using the
app. Both look like "the app is flaky," so it gets triaged as a front-end bug rather than an AS defect.

The general lesson: **an error that is not one of the defined errors is worse than the worst defined error**,
because defined errors are handled and undefined ones fall through every branch.

---

**Q10 — Two attacks.**

1. **`alg: none`.** The header claims no signature; a validator that obeys it looks up no key and accepts
   arbitrary claims. Lab B2.
2. **Algorithm confusion (asymmetric → symmetric).** The token says `HS256`; the validator fetches "the key"
   — the provider's **public** key, which is published — and uses it as an HMAC secret. The attacker knows the
   public key too, so they can produce a valid MAC. A token signed by nobody verifies against a key everybody
   has.

**The rule: take the expected algorithm from your registered configuration, never from the token.** Treat the
header's `alg` as a claim to be checked against what you expect, not an instruction. That is step 7, and it is
the step whose absence produces almost every JWT CVE in this family.

---

## Tier 3 — Trace and diagnose

**Q11 — Missing: step 3 (`aud`), step 11 (`nonce`), step 10 (`iat` freshness).**

- **Step 3 — no `aud` check.** Any ID token from `ISSUER`, for any client, logs its subject in. An attacker
  registers their own client at the same provider, gets the victim to sign in to it, and replays the resulting
  ID token here. Signature valid, `iss` valid, unexpired. **This is the serious one.**
- **Step 11 — no `nonce` check.** An ID token obtained at any earlier time (or in another tab, or by an
  attacker who observed one) satisfies a fresh login attempt. Nothing binds the token to this request.
- **Step 10 — no `iat` freshness bound.** With the 24-hour `exp` this deployment issues, a day-old
  authentication event is accepted as a current login. Step 9 passes and tells you nothing useful.

Two more things are worth saying about this snippet even though they were not asked for, and noticing them is
a sign of a good reviewer: `decodeHeader(idToken).kid` reads an attacker-controlled value to select a key,
which is safe *only because* `algorithms: ["RS256"]` is pinned — that pin is doing more work than it appears
to. And the `iss` comparison happens *after* `jwt.verify`, which is the correct order.

---

**Q12 — The ID token is signed with `HS256`, so the attacker used the client secret.**

Every claim is correct because the attacker copied a real token and changed `sub`; the signature verifies
because HS256's validation key is the `client_secret`, which the attacker holds — from a leaked `.env`, a CI
variable, a container image layer, a git history, or simply from being an insider at the RP.

**The single configuration decision responsible: choosing a symmetric signature algorithm for the ID token.**
It collapses "can verify" and "can issue" into one capability. This is Lab B6, and it is a correct validator
losing to a decision made in a console months earlier.

The fix is `ES256`/`RS256` with a published JWKS, after which forgery requires the AS's private key. Note what
does *not* fix it: adding more validation steps. The validator was already right.

---

**Q13 — The client receives `HTTP 302` with `Location: ` empty.** *(This repo's behaviour until 2026-08-12;
see the note at the end of this answer.)*

`res.redirect(null ?? "")` sends an empty `Location` header. Not a success, not one of §3.1.2.6's four errors —
a dead redirect.

**Why the developer's `prompt=none` handling never runs:** it is inside `case "INTERACTION"`, but an
authorization server answers a `prompt=none` request with `NO_INTERACTION`, precisely *because* the whole point
of `prompt=none` is that no interaction may occur. The two branches are mutually exclusive, so the handling
written for `prompt=none` sits in the one branch that a `prompt=none` request can never reach. **Dead code that
looks like a feature** — and it will survive code review indefinitely, because a reviewer sees a
`prompt === "none"` check and concludes the case is handled.

**What the branch should do:** `NO_INTERACTION` arrives with a **ticket** and means *"decide without any UI."*
So: determine whether the current session satisfies the request (authenticated? consent already recorded?
`acr`/`max_age` met?); if yes, call the authorization-issue API with the ticket and redirect with the code; if
no, call the authorization-fail API with the reason that maps to the correct §3.1.2.6 error — `login_required`
when unauthenticated, `consent_required` when consent is missing, `account_selection_required` when the subject
is ambiguous, `interaction_required` otherwise.

**Award a bonus mark for spotting the trap**, because it is the more valuable half of this question and the
lab covers it. Routing `NO_INTERACTION` into the existing dead `prompt=none` block would not have been a fix:
that block **invented** the authentication context it was supposed to check —

```js
if (!req.session.stepUp) {
  req.session.stepUp = { acr: "pwd", authTime: Math.floor(Date.now() / 1000) };
}
```

— asserting `acr: "pwd"` with no evidence and `auth_time: now` for an event at an unknown earlier time, then
passing both to the AS to be stamped on the tokens, with no `max_age` or essential-`acr` check anywhere on
that path. A resource server enforcing step-up would then have accepted fabricated freshness: a security
control silently not applied, which is worse than the visible bug it was meant to repair. An answer that says
*"and check `acr`/`max_age` against what was actually recorded, refusing when nothing was"* has the whole
thing.

> **Both were fixed in this repo on 2026-08-12** (`utils/step-up.ts` plus a real `NO_INTERACTION` branch).
> The rule that landed: an authentication the OP did not observe is one it will not assert — an unknown `acr`
> does not satisfy an essential `acr` request, and an unknown `auth_time` does not satisfy a `max_age`.

---

**Q14 — Two URIs, and production does not help.**

- `https://app.example.com.evil.net/steal` — passes `startsWith("https://app.example.com")`. The registrable
  domain is `evil.net`; `app.example.com` is just a label prefix.
- `https://app.example.com@evil.net/steal` — everything before `@` is the URI's *userinfo* component. The host
  is `evil.net`. Browsers resolve this exactly as an attacker wants and most humans read it as `app.example.com`.

(A third: `https://app.example.com.evil.net` variants with paths, and anything where the allowed origin is a
prefix of a longer hostname.)

**Why `NODE_ENV=production` does not help:** it only removes the separate `startsWith("http://localhost:")`
development clause. The `allowedOrigins.some(o => uri.startsWith(o))` clause is unconditional, and it is the
one both examples exploit. Filing this as "dev-only" is the mistake — and it is a natural mistake, because the
`NODE_ENV` guard sitting right there invites you to assume it covers the whole check.

**The fix:** exact string comparison against a registered set of post-logout redirect URIs. RFC 9700 §2.1
applies the same logic to `redirect_uri`, and this server *does* get that one right — which makes this the
"enforced in one path" species of conformance theatre from Module 07.

---

**Q15 — Two independent defects.**

1. **`req.session` is the wrong session.** A back-channel logout is a server-to-server POST from the OP. It
   carries no browser cookie, so `req.session` is a fresh, empty session belonging to nobody. Destroying it
   accomplishes nothing; the user's actual session is untouched. To act on a logout token you need a session
   store queryable by `sub` and/or `sid`, and you must delete every matching session.
2. **Only the `events` claim is validated.** `jwt.verify(token, key, { algorithms })` with no `issuer` or
   `audience` option checks the signature and the standard time claims, and nothing else. OIDC Back-Channel
   Logout requires validating `iss`, `aud`, and `iat`, requires `sub` and/or `sid` to identify the session, and
   requires **rejecting** a token that contains a `nonce`. Without an `aud` check, a logout token that the OP
   legitimately minted for a *different* RP is accepted here.

Defect 1 explains the symptom; defect 2 is the one that matters once defect 1 is fixed — and fixing 1 without
2 turns a no-op into a cross-RP forced-logout primitive.

---

## Tier 4 — Adversarial and design

Graded on reasoning. Strong answers commit to specifics and state their uncertainty.

---

**Q16 — Token substitution, in full.**

**Setup.** The victim site accepts an access token at `POST /auth/social-login`, calls the provider's UserInfo
with it, and logs in whoever `sub` names. The attacker registers **their own** client at the same provider —
"Free Wallpapers" — with `openid profile` scope. Nothing about this registration is abnormal.

**Steps.**
1. The attacker gets the victim to authorize Free Wallpapers. This needs no deception about *the victim site* —
   the victim consents to an unrelated app, which is a thing people do dozens of times a year.
2. Free Wallpapers completes its own legitimate authorization-code flow and receives an access token for the
   victim's account, scoped to `openid profile`. Entirely above board.
3. The attacker POSTs that access token to the victim site's `/auth/social-login`.
4. The victim site calls UserInfo with it. The provider answers truthfully: `sub` is the victim's.
5. The victim site issues its own session cookie for the victim. **Full account takeover, with a real token,
   from a real provider, for the real user.**

**What the attacker controls:** an authenticated session as the victim on the victim site, obtained without
touching the victim's credentials, without a phishing page for the victim site, and with nothing anomalous in
the provider's logs.

**Where it breaks with ID tokens: step 3.** The attacker's ID token has `aud: ["free-wallpapers-client-id"]`.
The victim site requires `aud` to contain *its own* `client_id`. There is no way for the attacker to obtain a
token whose `aud` is the victim site's client — that would require the provider to have issued it to the victim
site's flow. Step 2 (`iss`) does not help; same provider. Step 11 (`nonce`) adds a second, independent barrier:
even a token somehow addressed to the right client will not carry the `nonce` this login attempt generated.

**Why controlling your own registered client makes it easier:** without it, the attacker must *steal* an
access token (Module 05's leak paths). With it, they can *legitimately obtain* one, at will, for any user
willing to click "allow" on an innocuous app — turning a token-theft prerequisite into a consent-phishing one,
which is far cheaper and leaves no evidence of compromise anywhere.

**What the provider could do:** issue **audience-restricted** access tokens (RFC 8707, Module 04) so a token
minted for Free Wallpapers is rejected by any resource server other than the one it names — including
UserInfo-consuming RPs that check `aud`. Also: emit `at+jwt` typed tokens (RFC 9068) so a resource server can
tell an access token from anything else, and document loudly that UserInfo is not an authentication endpoint.
Providers cannot make a broken RP correct, but audience restriction shrinks the blast radius from "every RP
that made this mistake" to "RPs that made this mistake *and* share an audience."

---

**Q17 — HS256 for ID tokens.**

**Both, and the distinction is worth defending.** It is a **configuration weakness** in the sense that the
software is behaving exactly as specified — OIDC Core §3.1.3.7 step 8 describes HS256 validation, and a
correct validator accepts a correctly-MACed token. Nothing is *broken*. It becomes a **vulnerability** the
moment you ask who holds the key, because the answer is "everyone who needs to verify," and verification and
forgery are the same operation. The useful framing for a report: **this is not a bug to be fixed but a trust
model to be replaced**, which changes who owns the remediation — it is a platform decision, not a patch.

**(a) Who can forge.** The client application itself; every deployment pipeline and secret store that injects
the secret; every engineer with access to those; anyone who has read the repo's history or an image layer where
it leaked; any process on the client host that can read its environment; and the AS. That is a large,
mostly-unaudited set — and none of them needs to compromise the authorization server.

**(b) Adding a public client.** It cannot participate at all. A public client has no secret, so it cannot
validate the token — and this is not a subtle failure: you get `[A406301] The algorithm is symmetric (HS256),
but the client type of the client … is not 'confidential'.` as a redirect error the moment `openid` is
requested. Any mobile app or SPA in the estate is simply blocked from OIDC until the algorithm changes, which
is how most organisations discover this problem.

**(c) With Module 06's assertion grant on the same client.** The two compose into something worse than either.
The secret is simultaneously (i) a key that mints *tokens the AS will believe* for arbitrary subjects, via
`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`, and (ii) a key that mints *ID tokens the client will
believe* for arbitrary subjects. One leaked string yields impersonation on both sides of the trust boundary
simultaneously, so neither party's logs will show anything unusual: the AS sees a valid assertion from a
registered client, and the client sees a valid ID token from its AS. **There is no artefact anywhere that
records the forgery.**

**(d) Two weeks, in order.**
1. **Day 1–2: switch `idTokenSignAlg` to `ES256` on every client** and confirm each RP validates against the
   JWKS. This is a config change plus an RP-side test; it eliminates (a) and unblocks (b).
2. **Day 2–3: disable the JWT assertion grant** on any client that does not demonstrably need it. Cheap, and
   it removes half of (c) immediately.
3. **Week 1: rotate the client secrets**, since the old ones must now be assumed capable of having forged
   anything. Rotation without step 1 is theatre.
4. **Week 2: move client authentication to `private_key_jwt`** so no shared secret remains, and add a CI check
   asserting the ID token's `alg` is asymmetric — because the thing that got you here was a console setting
   nobody was watching.

Ordering rationale: fix the trust model before rotating keys, because rotating a key that can still forge just
changes which string forges.

---

**Q18 — Logout across one OP and four RPs.**

| RP | Mechanism that reaches it | Still live afterwards | What to add |
|---|---|---|---|
| Server-rendered web app | RP-Initiated (it starts the flow) + Back-Channel | Its access/refresh tokens, unless revoked | Call the revocation endpoint (RFC 7009) on sign-out; rely on the server session, not the token |
| SPA | Back-Channel reaches its **server**; nothing reaches the tab | Tokens in `sessionStorage`; the tab believes it is signed in | Short access tokens; a same-origin poll or `BroadcastChannel`; clear storage on any 401 |
| Mobile app | Back-Channel reaches the backend only | Tokens in the keychain; refresh token especially | Revoke the refresh token server-side; treat the next refresh failure as a signal to sign out locally |
| Background service (refresh token) | **Nothing.** It has no session and no logout URI | The refresh token — indefinitely, and it will keep minting access tokens | Revoke the grant; better, do not give a background service a user's refresh token — use client credentials or token exchange (Module 06) |

**Which spec I would not implement: Front-Channel Logout 1.0.** It depends on the OP loading hidden iframes to
each RP's logout URI, which requires third-party cookies to be sent in those frames — and that is blocked by
default in current browsers. It fails *silently*, which is the worst property a security mechanism can have:
you get a green tick in your architecture diagram and no logout. **Session Management 1.0** is the same
diagnosis for the same reason. Back-Channel Logout plus explicit token revocation is what actually works.

**The state no specification cleans up: tokens already issued and held by clients** — above all the refresh
token. Every logout spec is about *sessions*; a refresh token is an independent, long-lived credential that
outlives the session that created it. Which is why "logout" in a real design is always two things: end the
sessions **and** revoke the grant. Answers that also name the SPA tab's in-memory state deserve credit — it is
unreachable by any server-side mechanism.

---

**Q19 — Three tests.**

1. **Send an ID token with `aud` set to a different client_id, correctly signed by the real provider.** The
   highest-information single test available: it targets step 3, the step whose absence gives full account
   takeover via token substitution, and it cannot be passed by accident. *Pass* (rejected) → the audience
   check exists, which is the one thing most likely to be missing. *Fail* (accepted) → stop the review and
   report a critical; nothing else you find will matter more.
2. **Send a token with `alg` changed to `none`, and a second with `alg` changed to `HS256` MACed with the
   provider's published public key.** One test slot, two variants, because they share a root cause: reading
   `alg` from the header. Together they tell you whether step 7 exists. *Fail* → the validator obeys
   attacker-controlled algorithm selection, and every other check is bypassable.
3. **Replay a previously-valid ID token into a fresh login attempt.** Targets step 11 (`nonce`) and step 10
   (`iat` freshness) at once. *Pass* → the login is bound to this request. *Fail* → any captured or
   separately-obtained token logs the victim in, indefinitely within `exp`.

The selection principle: pick the tests whose failure is *catastrophic and silent*, not the ones that are
easiest to run. Expiry and signature-tampering checks are almost always present, so testing them is
low-information.

**Why "we use a well-known library" does not let you skip these.** Libraries validate what you configure them
to validate. `aud` checking usually requires passing the expected audience — omit the option and many libraries
skip the check silently. `nonce` comparison is almost always the *application's* job: the library has no
access to your session store, so it cannot compare. And algorithm pinning is a parameter, frequently left at a
permissive default. **The library is not the validator; the library plus your configuration is the validator**,
and the configuration is where all three of these live. Test the deployed system, not the dependency.
