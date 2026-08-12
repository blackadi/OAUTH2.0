# Module 08 — OIDC Core + Logout

**The short version:** for eight modules the question has been *"what may this software do?"* This module
changes it to *"who is this person?"* — and the first thing to establish is that **an access token cannot
answer the second question**, no matter how carefully you validated it. OpenID Connect adds a second token
with a different audience, a different purpose, and thirteen validation steps that exist because skipping any
one of them has broken a real product. Then, because sessions have to end as well as begin, four separate
specifications for logout.

## Prerequisites

- **[Module 02](../02-oauth-core-and-threats/)** — the authorization-code flow. OIDC is that flow with one
  extra scope and one extra token.
- **[Module 00](../00-web-and-jose-foundations/)** — you will verify a JWS signature by hand and use
  `alg: none` in anger. Decode ≠ trust is the whole module in four words.
- **[Module 07](../07-oauth-2-1-and-security-bcp/)** — the audit method. Two of this module's findings come
  from comparing what discovery advertises against what the server does.

## Why this module exists

Because the single most common architectural error in this space is a one-line mistake that looks like it
works.

```js
// "Sign in with Example" — the broken version
const token = await getAccessToken(code);
const profile = await fetch("https://api.example.com/userinfo",
                            { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
loginAs(profile.sub);        // ← the bug
```

This runs. It returns the right user. It passes code review, and it will pass your tests. It is also a
complete authentication bypass, and the reason is worth stating precisely, because "use an ID token instead"
is advice people follow without understanding.

**An access token is a bearer credential addressed to a resource server. It says nothing about who obtained
it, when, or how — and nothing about who it was issued *to*.** So:

1. **It carries no audience for you.** The token was minted for an API. Your login code is not that API. An
   access token that some *other* application obtained — legitimately, for its own purposes, from the same
   provider — is indistinguishable from one your flow obtained. If an attacker can get *any* access token for
   the victim's account from that provider (their own malicious app, an over-permissive integration, a leaked
   token from any of the places Module 05 catalogued), they hand it to your login endpoint and become the
   victim. This is the **token-substitution attack**, and it is the reason `aud` exists.
2. **It carries no authentication event.** Even if the token really did come from your flow, it does not tell
   you the user authenticated *just now*, or *how*. A token minted from a refresh grant at 3 a.m. while the
   user slept looks identical to one from a fresh password-and-MFA login.
3. **It is not bound to your request.** Nothing ties it to the specific login attempt in this browser tab.
   Module 03 taught you what an unbound artefact is worth.

OIDC's answer is not "a better access token." It is a **second, structurally different token**:

> An **ID token** is a signed statement, **addressed to one specific client**, that *this provider
> authenticated this user, at this time, in this way, in response to this request.*

Every clause is load-bearing, and each maps to a validation step you must perform. Signed → you check the
signature. Addressed to one client → you check `aud`. This user → `sub`. At this time → `exp`, `iat`,
`auth_time`. In this way → `acr`, `amr`. In response to this request → `nonce`. Skip any one and you have
re-created a variant of the bug above.

And the second half of the module: **a session that can be created must be destroyable.** Logout is
genuinely hard — the user's session lives in one place, the OP's session in another, and every other RP the
user signed into has a third. Four specifications attack that from four directions, and this repo implements
two of them, one of which does not currently work.

## Plain-language pass (no spec vocabulary)

The hotel again, and now we care who you are.

- **The key card is an access token.** It opens room 412. It does not have your name on it. If I find one on
  the pavement, I can open room 412 — and if I hand it to a concierge who asks "who are you?", answering
  "well, I have the card for 412" is not identification. Anyone could have the card. *That* is the login bug.
- **The signed registration slip is an ID token.** It says: *the front desk verified this guest's passport at
  14:32 today, by photo ID, and this slip was prepared for the concierge desk specifically.* The concierge
  checks the hotel's seal, checks the slip is addressed to *them*, checks the timestamp is recent, and checks
  it matches the request they just made. **A slip addressed to the spa is not valid at the concierge desk**,
  even though both are real slips from the same real hotel — that is the audience check, and it is the one
  people skip.
- **The `nonce` is a reference number you wrote on your enquiry before sending it.** When the slip comes back
  bearing your number, you know it answers *your* enquiry and not a slip someone else obtained earlier and
  kept.
- **Logging out** is where the analogy earns its keep. Handing back the key card ends your access to the room.
  It does not tell the front desk you have left, and it certainly does not tell the spa, the restaurant, and
  the gym — each of which admitted you on their own slip and still believes you are a guest. Four
  specifications, because there are four different parties who each need telling.

## Specification pass (exact terminology) + the bridge

Each analogy element mapped to its formal counterpart, with the clause that defines it.

| Plain-language element | Formal concept | Defining reference |
|---|---|---|
| The key card, with no name on it | **Access token** — a capability, not an identity | RFC 6749 §1.4; presented per RFC 6750 §2.1 |
| The signed registration slip | **ID token** — a statement *about an authentication event* | OIDC Core §2 |
| "The desk verified this guest's passport" | `sub` + the fact of authentication | OIDC Core §2 |
| "…at 14:32 today" | `auth_time` | OIDC Core §2; REQUIRED once `max_age` is sent |
| "…by photo ID" | `acr` / `amr` — how strongly, and by what method | OIDC Core §2; enforced in Module 09a |
| "…prepared for the concierge desk specifically" | `aud` = `client_id` | OIDC Core §3.1.3.7 **step 3** — the audience check |
| Checking the hotel's seal | Signature verification, with `alg` **pinned from registration** | §3.1.3.7 **steps 6–8** |
| Your reference number on the enquiry | `nonce` | OIDC Core §3.1.2.1; checked at **step 11** |
| A slip addressed to the spa, refused at the concierge | **Token substitution**, defeated | §3.1.3.7 step 3 |
| Handing the key card back | **RP-Initiated Logout** — `end_session_endpoint` | RP-Initiated Logout 1.0 |
| Telling the spa, the restaurant and the gym | **Back-Channel Logout** — a signed logout token per RP | Back-Channel Logout 1.0 |
| Which of your two rooms to close | `sid` — one session, versus `sub` for the person | Back-Channel Logout 1.0 |

The row to sit with is **`aud`**. Every other row describes something the slip *says*; that one describes
who it was *written for*, and it is the only one that stops a real, correctly-signed slip from the same real
hotel logging the wrong person in.

> The step numbers in the right-hand column refer to OIDC Core §3.1.3.7's **thirteen validation steps**,
> which this module works through in full further down. You do not need them yet — they are here so that when
> you reach the list, every step already has an analogy element attached to it.

## Learning objectives

After this module you can:

1. Explain why an access token cannot authenticate a user, and describe the token-substitution attack
   concretely enough to write the exploit.
2. State the five REQUIRED ID token claims and the conditions under which `auth_time`, `nonce`, `acr` and
   `azp` become required.
3. **Perform all thirteen OIDC Core §3.1.3.7 validation steps** on a real ID token, by hand, and say which
   attack each one closes.
4. Distinguish `nonce` from `state` precisely — different tokens, different threats, both needed.
5. Explain what `at_hash`, `c_hash` and `s_hash` bind, and why the hybrid flow needs them.
6. Choose between `code`, `implicit`, and hybrid response types, and say what hybrid buys and costs.
7. Use `prompt` and `max_age` correctly, including silent renewal, and recognise a broken `prompt=none`.
8. Name the four logout specifications, what each mechanism can and cannot achieve, and why back-channel
   logout is the only one that works without a live browser.

## Access token vs. ID token — the table to internalise

| | **Access token** | **ID token** |
|---|---|---|
| Defined by | RFC 6749 / RFC 9068 | OIDC Core §2 |
| Audience | The **resource server** | The **client** (`aud` = `client_id`) |
| Answers | "May this request proceed?" | "Who authenticated, when, and how?" |
| Who validates it | The RS (introspection, or as a JWT) | The **client**, and only the client |
| Format | Opaque **or** JWT — the client must not care | **Always** a JWT (JWS, optionally JWE) |
| Client should inspect it? | **No.** Opaque by contract | **Yes.** That is its entire purpose |
| Lifetime | Minutes to hours; refreshable | Should be short — it records a moment |
| Sent to an API? | Yes, that is the point | **Never.** It is not a credential |
| If leaked | An attacker acts as the user | An attacker learns claims; cannot act |

Two rows generate most real-world bugs.

**"Sent to an API? Never."** An ID token is evidence, not authority. Sending it to a resource server invites
that server to accept it as an access token — which is the **token confusion** attack from Module 04, and
exactly what RFC 9068's `typ: at+jwt` exists to prevent. If you find yourself putting an ID token in an
`Authorization: Bearer` header, something upstream is wrong.

**"Who validates it: the client, and only the client."** The ID token is the one token in OAuth/OIDC that the
client is *supposed* to open and inspect. Everything else — access tokens, refresh tokens, codes — the client
should treat as opaque strings. Getting this backwards in either direction is a design smell.

## The ID token, claim by claim

**REQUIRED in every ID token** (OIDC Core §2, quoted):

| Claim | Spec text | Checked by step |
|---|---|---|
| `iss` | *"REQUIRED. Issuer Identifier for the Issuer of the response."* | 2 |
| `sub` | *"REQUIRED. Subject Identifier. A locally unique and never reassigned identifier within the Issuer."* | — (used, not validated) |
| `aud` | *"REQUIRED. Audience(s) that this ID Token is intended for. It MUST contain the OAuth 2.0 client_id."* | 3 |
| `exp` | *"REQUIRED. Expiration time on or after which the ID Token MUST NOT be accepted by the RP."* | 9 |
| `iat` | *"REQUIRED. Time at which the JWT was issued."* | 10 |

**Conditionally required:**

| Claim | When it becomes required |
|---|---|
| `auth_time` | *"When a max_age request is made or when auth_time is requested as an Essential Claim, then this Claim is REQUIRED; otherwise, its inclusion is OPTIONAL."* |
| `nonce` | If `nonce` was sent in the request, *"Authorization Servers MUST include a nonce Claim in the ID Token"* |
| `azp` | When the ID token has an `aud` different from the sole `client_id`, or multiple audiences |
| `acr` / `amr` | OPTIONAL in general; required when requested (Module 09a's step-up builds on this) |

Note the phrasing on `sub`: *never reassigned*. That is a requirement on the **provider**, and it is the
reason you must key your user records on `(iss, sub)` and not on `sub` alone — `sub` is only unique *within*
an issuer — and never on an email address, which is reassignable and changeable.

## The thirteen validation steps

This is the centre of the module. OIDC Core §3.1.3.7, in order, grouped by what each group defends:

**Envelope**

1. Decrypt if encrypted using registered keys/algorithms; reject if encryption was negotiated but the token is
   not encrypted.

**Who issued it, and who is it for** — *this group defeats token substitution*

2. The issuer identifier MUST exactly match the `iss` claim.
3. The client MUST validate that `aud` contains its `client_id`; reject if absent, or if it contains
   audiences the client does not trust.
4. If `azp` is present via extensions, validate it per those extensions.
5. Verify `client_id` matches `azp` when `azp` is present.

**Is it authentic** — *this group defeats forgery*

6. For direct Token Endpoint communication over TLS, server TLS validation MAY be used instead of checking the
   signature; otherwise validate the signature per JWS.
7. The `alg` should be `RS256` by default, or whatever `id_token_signed_response_alg` was registered.
8. For MAC algorithms (`HS256`, `HS384`, `HS512`), the validation key is the UTF-8 octets of the
   `client_secret`.

**Is it current** — *this group defeats replay of old tokens*

9. The current time MUST be before `exp`.
10. `iat` MAY be used to reject tokens issued too long ago, per a client-specific acceptable range.

**Does it answer *my* request** — *this group defeats injection*

11. If `nonce` was sent, verify the `nonce` claim matches, and check for replay.
12. If `acr` was requested, verify it is appropriate.
13. If `auth_time` was requested or `max_age` used, verify `auth_time` and re-authenticate if needed.

Three of these deserve comment because they are where people go wrong.

**Step 6 is a trap for the unwary.** Yes, the spec permits skipping signature validation when the token came
straight from the token endpoint over TLS — the reasoning being that TLS already authenticated the server.
That is sound for the **code flow** and catastrophic anywhere else: in the implicit or hybrid flows the ID
token arrives *through the browser*, where TLS to the AS proves nothing about what reached you. Treat step 6
as an optimisation with a precondition, and if you cannot state the precondition from memory, just validate
the signature.

**Step 7 is the algorithm-confusion defence.** Note what it says: the expected algorithm comes from
*registration*, not from the token. A validator that reads `alg` out of the header and picks a key accordingly
is the classic RS256-public-key-used-as-an-HS256-secret bug — and `alg: none` (Module 00) is the degenerate
case. **Pin the algorithm from configuration; treat the header's `alg` as a claim to be checked, not an
instruction to be obeyed.**

**Step 8 is why HS256 ID tokens do not scale.** The validation key is the client secret. Which means a public
client cannot validate one at all (it has no secret), and every party who can validate the token can also
*forge* it. Symmetric signing collapses the distinction between "can verify" and "can issue." Asymmetric
signing (ES256/RS256 with a published JWKS) is what makes ID tokens work across trust boundaries, and you will
see both in the lab.

## `nonce` vs. `state` — the confusion, settled

They look similar, they are both random values you generate and check, and they defend different things.

| | `state` | `nonce` |
|---|---|---|
| Defined by | RFC 6749 §10.12 | OIDC Core §3.1.2.1 |
| Travels in | Authorization request → authorization **response** | Authorization request → **ID token** |
| Returned in | A query/fragment parameter | A **claim inside the ID token** |
| Bound to | The browser session that started the flow | The ID token issued for that request |
| Defends | **CSRF** on the redirect — someone else's response landing in your session | **ID token replay/injection** — an older or elsewhere-obtained ID token being accepted for this login |
| Checked by | Comparing to a session-stored value | Comparing the claim to a session-stored value |
| Needed when | Any redirect-based flow | Any flow that yields an ID token |

**You need both, and one does not substitute for the other.** `state` is checked *before* you redeem the
code, on a value that travelled in the clear. `nonce` is checked *after*, on a value inside a signed
structure — which means `nonce` is integrity-protected and `state` is not. An attacker who can rewrite the
redirect can change `state`; they cannot change `nonce` without breaking the signature.

The failure mode worth naming: **generating either and forgetting to compare it.** A `nonce` you send and
never check is decoration, and it is decoration that makes your code look correct to a reviewer skimming for
the parameter's presence.

## `at_hash`, `c_hash`, `s_hash` — binding the pieces together

When parts of a response travel outside the signed ID token, the ID token can bind them by carrying a hash.
All three are *"the base64url encoding of the left-most half of the hash of the octets"* of the value.

| Claim | Binds | Required when | Defends |
|---|---|---|---|
| `at_hash` | The access token | `response_type` includes `token` | An attacker swapping in a different access token |
| `c_hash` | The authorization code | `response_type` includes `code` **and** `id_token` (hybrid) | Code injection — a code from another session paired with this ID token |
| `s_hash` | `state` | FAPI-profile deployments | Integrity for `state`, which is otherwise unprotected |

The pattern is the same one Module 05 named: when a value must travel through an untrusted channel, put its
hash somewhere signed. `c_hash` is precisely what makes the hybrid flow safe, which is why the hybrid flow
exists at all.

**Fourth occurrence of commit-then-prove in this curriculum**, and the one that looks least like the others.
Module 02 split the secret across two channels (code, then client authentication); Module 03 committed to a
verifier and proved it at the token endpoint; Module 05 committed to a key and proved it per request. Here
the ID token commits to a hash of an artefact that travelled separately, and *possession of the matching
artefact* is the proof — checked by the client rather than the server. Same shape, different party doing the
checking.

## Flows, and what hybrid is for

| `response_type` | What comes back through the browser | ID token validated how | Use it? |
|---|---|---|---|
| `code` | Just a code | From the token endpoint, over TLS | **Yes.** The default |
| `id_token` | An ID token, no access token | Signature — it came through the browser | Only for pure authentication, and prefer `code` |
| `id_token token` | ID token **and** access token, in the fragment | Signature + `at_hash` | **No** — implicit; RFC 9700 §2.1.2 |
| `code id_token` | Code **and** ID token | Signature + `c_hash` | Situationally — see below |
| `code token`, `code id_token token` | Code plus tokens in the fragment | Signature + hashes | **No** — carries an access token through the browser |

Hybrid (`code id_token`) exists so the client can learn *who is logging in* immediately from the front
channel, while still redeeming the code over the back channel for the tokens it will actually use. That was
genuinely useful for detecting session mismatches early, and FAPI 1.0 Advanced mandated it. FAPI 2.0 dropped
it in favour of plain `code` + PAR, which tells you how the trade-off is now judged: the front-channel ID
token adds a validation burden (signature, `c_hash`) and an attack surface for benefit you can usually get
another way.

## `prompt` and `max_age` — controlling the authentication event

These are how a client states requirements about the *act* of authenticating, rather than about the token.

| Parameter | Value | Meaning |
|---|---|---|
| `prompt` | `none` | *"The Authorization Server MUST NOT display any authentication or consent user interface pages. An error is returned if an End-User is not already authenticated."* |
| | `login` | Force re-authentication even if a session exists |
| | `consent` | Force the consent screen |
| | `select_account` | Let the user pick among sessions |
| `max_age` | seconds | Authentication must have occurred within this window; makes `auth_time` REQUIRED |

`prompt=none` is the mechanism behind **silent renewal** — the hidden iframe or fetch that every SPA uses to
find out "is the user still logged in?" without a visible redirect. Its whole contract is that it either
succeeds immediately or returns one of four specific errors (OIDC Core §3.1.2.6):

| Error | Meaning |
|---|---|
| `login_required` | *"The Authorization Server requires End-User authentication."* |
| `consent_required` | *"The Authorization Server requires End-User consent."* |
| `interaction_required` | *"The Authorization Server requires End-User interaction of some form to proceed."* |
| `account_selection_required` | *"The End-User is REQUIRED to select a session at the Authorization Server."* |

A `prompt=none` that returns anything else — including a dead redirect — breaks every client that relies on
it, and it breaks them *silently*, because the client's error handler is looking for those four strings. This
server did exactly that until 2026-08-12, and Lab Exercise 5 walks the defect, the diagnosis, and the trap
hiding behind the obvious fix.

**`max_age` is where `prompt=none` gets genuinely interesting.** Succeeding "immediately" is only correct if
the OP can *evidence* what the client asked about. A client sending `max_age=300` is asking "was this person
authenticated in the last five minutes?" — and an OP that cannot answer must say so, not guess. The failure
mode to recognise is an OP that fills in `acr` and `auth_time` from nowhere in order to return a code, which
turns a step-up control into decoration. Exercise 5 has a worked example.

## The logout family — four specs, four problems

Ending a session is harder than starting one, because "the session" is really several sessions in different
places.

| Spec | Mechanism | Who is told | Needs a live browser? | Fails when |
|---|---|---|---|---|
| **RP-Initiated Logout 1.0** | RP sends the user to `end_session_endpoint`; the OP asks, the user confirms (§2) | The **OP** | Yes | The user closes the tab mid-flow, or declines at the confirmation |
| **Front-Channel Logout 1.0** | OP renders hidden `<iframe>`s to each RP's logout URI | **Other RPs** | Yes | Third-party cookies are blocked — i.e. usually, now |
| **Back-Channel Logout 1.0** | OP POSTs a signed **logout token** to each RP, server to server | **Other RPs** | **No** | An RP is down; no browser state is cleared |
| **Session Management 1.0** | RP polls the OP via a `check_session_iframe` | The **RP**, by polling | Yes | Third-party cookies again |

**The one to understand properly is back-channel logout**, because it is the only mechanism that survives
modern browser privacy defaults, and because its logout token has validation rules people skip. A logout
token is a JWT that MUST carry an `events` claim containing
`http://schemas.openid.net/event/backchannel-logout`, MUST identify the session by `sub` and/or `sid`, and
**MUST NOT** contain a `nonce`.

> **`sid` — the claim this depends on.** `sub` names the *person*; **`sid` names one of their *sessions*** at
> the OP. A user signed in on a laptop and a phone has one `sub` and two `sid`s. That distinction is the
> whole reason both are permitted: a logout token carrying only `sub` means *"end everything for this user"*,
> while one carrying `sid` means *"end this one."* Which you get is the OP's choice, so an RP must handle
> both — and must therefore be able to look a session up **by either**, which is the requirement the next two
> paragraphs are about. And like any inbound signed token, it must be verified against *the sending
OP's* keys — with `iss`, `aud`, `exp` and `iat` all checked — before anything is destroyed.

Two structural problems with back-channel logout that no specification can solve for you:

- **You must be able to find sessions by subject.** A server that only knows "the session attached to this
  HTTP request" cannot act on a logout token, because a back-channel POST arrives with no browser cookie —
  the request has no user session by construction. You need a session store queryable by `sub`/`sid`. Lab
  Exercise 6 shows what happens when that is missed.
- **Front-channel state survives.** The RP's server-side session is gone; the SPA in the user's tab still
  holds its tokens in `sessionStorage` and does not know. Back-channel logout does not reach it.

## Wire-level walkthrough

Module 02's flow, with the OIDC additions marked. **One extra scope value and one extra token** — that really
is the whole difference on the wire, and seeing it is what stops OIDC feeling like a second protocol.

```http
# 1. FRONT CHANNEL. Identical to Module 02 except for two parameters.
GET /api/authorization?response_type=code
    &client_id=1234567890
    &redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Fcallback
    &scope=openid%20profile                       # ← "openid" is what makes this OIDC
    &state=Zx9qP2rLk7
    &nonce=n-0S6_WzA2Mj                           # ← bound into the ID token, checked at step 11
    &code_challenge=…&code_challenge_method=S256 HTTP/1.1
# Visible+editable at the user agent. `nonce` is safe here: an attacker who changes it changes
# the value the AS will echo, and the client compares against what IT stored. Tampering is detected,
# not enabled.

# 2-3. The user authenticates and consents on the AS's own pages (Module 01's credential boundary).

# 4. FRONT CHANNEL. Still just a code. No token, no ID token — this is `code`, not hybrid.
HTTP/1.1 302 Found
Location: http://localhost:3001/callback?code=8k2Jd…&state=Zx9qP2rLk7&iss=https%3A%2F%2Fas.example.com

# 5. The client checks `state` (Module 02) — then, and only then, redeems.

# 6. BACK CHANNEL.
POST /api/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded
Authorization: Basic <client_id:client_secret>

grant_type=authorization_code&code=8k2Jd…&redirect_uri=…&client_id=…&code_verifier=…

# 7. The token response — and here is the whole of OIDC's addition to the wire.
HTTP/1.1 200 OK
{"access_token":"…", "token_type":"Bearer", "expires_in":86400,
 "scope":"openid profile", "refresh_token":"…",
 "id_token":"eyJhbGciOiJFUzI1NiIsImtpZCI6IjEifQ.eyJpc3MiOi…"}      # ← the second token
```

**The ID token, decoded**, with the validation step that checks each claim. This is the artefact the client
opens; everything else in the response it treats as an opaque string.

```json
{
  "iss": "https://as.example.com",     // step 2  — MUST equal the expected issuer, exactly
  "aud": ["1234567890"],               // step 3  — MUST contain our client_id. Defeats substitution
  "sub": "admin",                      //         — used, not validated. Key records on (iss, sub)
  "exp": 1785242182,                   // step 9  — now < exp
  "iat": 1785155782,                   // step 10 — reject if too old for YOUR policy; the spec sets no bound
  "auth_time": 1785155781,             // step 13 — required once max_age is sent
  "nonce": "n-0S6_WzA2Mj",             // step 11 — MUST equal what we sent at leg 1. Defeats injection
  "acr": "pwd",                        // step 12 — verify if you requested one (Module 09a)
  "s_hash": "bOhtX8F73IMjSPeVAvOhqA"   //         — FAPI: binds the otherwise-unprotected `state`
}
```

with the header carrying the algorithm you **pinned from registration**, never read from the token:

```json
{ "alg": "ES256", "kid": "1" }         // step 7 — expected alg comes from config; step 6 verifies the signature
```

**What just happened?** Compare leg 1 and leg 7 with Module 02's. One scope value went out; one token came
back. Everything else — PKCE, `state`, the code, client authentication, the channels — is unchanged, which
is precisely why OIDC is called a *layer* rather than a protocol. The security work is not in obtaining the
ID token; it is in the thirteen checks you perform on it after leg 7, and every one of those maps to a line
in the block above.

Two things worth noticing in that JSON, because both are this deployment rather than the spec: **`aud` is an
array**, so a validator written `claims.aud === clientId` fails here and passes elsewhere; and **`exp - iat`
is 86400**, a day, for a token whose job is to record a moment. Neither is wrong; both are the kind of
detail that only shows up when you look at the artefact.

## Threat model for this module

| Threat | What goes wrong | Defence | Where |
|---|---|---|---|
| **Token substitution** | Any access token for the victim is accepted as proof of login | Use an ID token; validate `aud` (step 3) | **Ex 1** |
| ID token from another RP accepted | Real token, real signature, wrong audience | Step 3 — `aud` contains **your** `client_id` | **Ex 4 — verified here** |
| Forged ID token | Attacker mints claims | Steps 6–8; pin `alg` from registration | **Ex 4 — verified here** |
| `alg` confusion / `alg: none` | Validator obeys the header | Step 7 — expected `alg` from config, not the token | **Ex 4 — verified here** |
| ID token replay / injection | An older or elsewhere-obtained ID token accepted for this login | Step 11 — `nonce` | **Ex 5 — verified here** |
| Stale authentication accepted | Token from a months-old session treated as a fresh login | Steps 9, 10, 13; `max_age` | Ex 5 |
| Code injection in hybrid | A code from another session paired with this ID token | `c_hash` | **Ex 3 — verified here** |
| ID token used as an access token | RS accepts evidence as authority | RFC 9068 `typ: at+jwt`; never send it | Ex 1 |
| Broken `prompt=none` | Silent renewal fails in a way clients cannot handle | Return one of the four §3.1.2.6 errors | **Ex 5 — reproduced here, fixed 2026-08-12** |
| Fabricated `acr` / `auth_time` | OP asserts an authentication it never observed, so step-up checks pass vacuously | Assert only what was observed; refuse what cannot be evidenced | **Ex 5 — a *latent* finding, armed by fixing the row above; both fixed 2026-08-12** |
| Logout open redirect | `post_logout_redirect_uri` not exactly matched | Exact matching against registered URIs | **Ex 6 — reproduced here, fixed 2026-08-10** |
| Forced logout via `<img>` | Logout acts on a bare `GET`, so any page can trigger it | RP-Initiated Logout §2 — ask the End-User; act only on the POST | **Ex 6 — reproduced here, fixed 2026-08-12** |
| One client redirected to another's target | Post-logout URIs allowlisted deployment-wide, not per client | RP-Initiated Logout §3 — match the *client's* **registered** set | **Ex 6 — reproduced here, fixed 2026-08-12** |
| Unverified logout token | Anyone can end anyone's session | Verify against the OP's JWKS; check `iss`/`aud`/`exp`/`events` | **Ex 6 — verified here** |
| `sub` collision across issuers | Two providers' users merge into one account | Key records on `(iss, sub)` | Ex 2 |

## Spec delta — what each document adds

| Spec | Status | Adds | Would break without it |
|---|---|---|---|
| OIDC Core 1.0 | OpenID **Final**, errata set 2, Dec 2023 | ID token, `nonce`, UserInfo, `prompt`/`max_age`, hybrid, `acr`/`amr`, the 13 validation steps | Every RP invents its own login protocol on top of access tokens |
| OIDC Discovery 1.0 | OpenID Final, errata set 2 | `/.well-known/openid-configuration`; OP metadata | Manual configuration of every endpoint and algorithm |
| RP-Initiated Logout 1.0 | OpenID Final | `end_session_endpoint`, `id_token_hint`, `post_logout_redirect_uri`, and the End-User confirmation (§2) | No standard way for an RP to end the OP session — and logout becomes CSRF-able |
| Front-Channel Logout 1.0 | OpenID Final | Browser-mediated multi-RP logout via iframes | No way to notify other RPs at all |
| Back-Channel Logout 1.0 | OpenID Final | Signed logout token, POSTed server-to-server | Logout cannot survive blocked third-party cookies |
| Session Management 1.0 | OpenID Final | `check_session_iframe`, session state polling | RPs cannot detect an OP-side logout |

> **All six are OpenID Foundation Final specifications, not IETF RFCs.** In a review, cite them as *"OpenID
> Connect Core 1.0 incorporating errata set 2"* rather than as an RFC number, and note the errata set — the
> text has changed materially between sets.

## Where this sits in the dependency graph

Module 07 closed OAuth-as-authorization. This opens identity, and everything after it builds here.

- It **consumes** Module 02's code flow, Module 00's JWS mechanics, and Module 07's audit method.
- It **feeds Module 09a** directly: step-up authentication (RFC 9470) is `acr`/`auth_time` enforcement, and
  CIBA is authentication with no browser at all. JARM is `s_hash`'s idea applied to the whole response.
- It **feeds Module 09b**: an ID token is a credential about a person, which is the door into verified claims
  and SD-JWT.
- It **feeds Module 10**: FAPI's profiles constrain exactly the choices this module lays out — which
  `response_type`, which `alg`, which claims must be bound.
- It **contrasts with Module 06**: an assertion grant and an ID token both carry a `sub` signed by someone.
  One is an input that mints authority; the other is evidence *about* an event. Module 06 showed what happens
  when the first is under-constrained; this module shows what happens when the second is under-validated.

## Common mistakes

**❌ Authenticating with an access token**

```js
const profile = await fetchUserInfo(accessToken);
loginAs(profile.sub);
```

**✅ Authenticate with a validated ID token; use UserInfo only for extra claims**

```js
const claims = await validateIdToken(idToken, { issuer, clientId, nonce: session.nonce });
loginAs(claims.iss, claims.sub);          // key on (iss, sub)
const extra = await fetchUserInfo(accessToken);
if (extra.sub !== claims.sub) throw new Error("UserInfo sub mismatch");   // §5.3.2
```

---

**❌ Trusting the header's `alg`**

```js
const { alg, kid } = decodeHeader(idToken);
verify(idToken, await keyFor(kid), { algorithms: [alg] });   // attacker picks the algorithm
```

**✅ Pin it from registration (step 7)**

```js
verify(idToken, await keyFor(kid), { algorithms: ["ES256"] });   // what we registered, and only that
```

---

**❌ Skipping the audience check because the signature was valid**

A valid signature proves the provider issued it. It does not prove the provider issued it **to you**. Steps 2
and 3 are what stop a real token from another RP logging someone into your app.

---

**❌ Generating a `nonce` and never comparing it**

```js
const nonce = crypto.randomUUID();
session.nonce = nonce;                    // stored
// ...later...
const claims = await validateIdToken(idToken);   // never compares claims.nonce
```

**✅ Compare, and fail closed if the claim is absent**

```js
if (!claims.nonce || claims.nonce !== session.nonce) throw new Error("nonce mismatch");
```

---

**❌ Keying user records on `sub` alone, or on email**

```js
const user = await db.users.findOne({ sub: claims.sub });
```

`sub` is unique only within an issuer. Add a second provider and two different people can collide. Email is
worse — reassignable, and changeable by the user.

**✅ `(iss, sub)`**

```js
const user = await db.users.findOne({ iss: claims.iss, sub: claims.sub });
```

---

**❌ Sending an ID token to an API**

```js
fetch("/api/orders", { headers: { Authorization: `Bearer ${idToken}` } });
```

Evidence is not authority. If the API accepts it, you have found a token-confusion bug in the API.

---

**❌ Prefix-matching `post_logout_redirect_uri`**

```js
if (allowed.some(o => uri.startsWith(o))) return res.redirect(uri);
```

`http://localhost:3000` allows `http://localhost:3000.evil.example.com`. This server shipped exactly this bug
until 2026-08-10; Lab Exercise 6b walks the defect, the fix, and the gap the fix left.

**❌ One allowlist for the whole deployment**

```js
if (process.env.ALLOWED_ORIGINS.split(",").includes(new URL(uri).origin)) return res.redirect(uri);
```

Safe against the bug above, and still not §3. *"Previously registered"* means registered **by that client**;
a deployment-wide list lets any client be sent to any other client's target. Match `client_id` (or the `aud`
of a verified `id_token_hint`) to a per-client set, and refuse when no client is identified.

**❌ Logging the user out on a `GET`**

```js
router.get("/logout", (req, res) => { req.session.destroy(); res.redirect(uri); });
```

RP-Initiated Logout §2 says the OP **MUST** ask the End-User first, and the reason is visible in one line of
HTML: `<img src="https://as.example/api/logout">` on any page logs its viewer out. This server shipped that
too, until 2026-08-12. Render a confirmation carrying a CSRF token on the `GET`; act on the `POST`.

**✅ Exact string comparison against registered URIs**

```js
if (!registeredPostLogoutUris.has(uri)) return renderLogoutPage();
return res.redirect(uri);
```

## What just happened?

1. **An access token cannot authenticate anyone.** No audience for you, no authentication event, no binding
   to your request. Token substitution is the concrete attack, and `aud` is the concrete defence.
2. **The ID token is the one token the client opens.** Signed, addressed to one client, describing an
   authentication event. Everything else is an opaque string to the client.
3. **Thirteen validation steps, in four groups:** envelope; issuer and audience (defeats substitution);
   authenticity (defeats forgery — pin `alg` from registration); currency (defeats old tokens); and
   request-binding via `nonce` (defeats injection).
4. **`nonce` and `state` are different tools.** `state` protects the redirect and is unprotected itself;
   `nonce` lives inside the signature. You need both.
5. **Hashes bind what travels outside the signature** — `at_hash`, `c_hash`, `s_hash`. Same pattern as PKCE
   and DPoP: if it goes through an untrusted channel, sign a hash of it.
6. **Logout is four specifications** because four different parties need telling, and only back-channel
   logout survives blocked third-party cookies — provided you can find sessions by subject and you verify the
   logout token before acting on it.

The habit to carry: **for every token, ask who it is addressed to.** That single question distinguishes an
access token from an ID token, catches token substitution, catches token confusion, explains `aud`, `azp`,
`resource`, and `at_hash`, and is the shortest path to noticing that a signature check alone has told you
almost nothing.

## Assigned reading

Read after the lesson, before the lab:

- [`docs/BACKCHANNEL-LOGOUT-TUTORIAL.md`](../../../BACKCHANNEL-LOGOUT-TUTORIAL.md) — this repo's
  implementation of the sending side (issue/deliver) and the receiving side.

> **Read it with Module 07's method in hand.** Discovery does not advertise `backchannel_logout_supported`,
> and the receiving endpoint does not work on this deployment. Both are findings you will confirm yourself in
> Exercise 6 rather than take from me.

## Then do the lab

**[lab.md](lab.md)** — six exercises. You will validate an ID token through all thirteen steps by hand, forge
one four different ways, break `prompt=none`, and take apart the open redirect the logout endpoint used to
have (fixed 2026-08-10 — Exercise 6b now walks the defect, the fix, and the gap the fix left).

Then **[quiz.md](quiz.md)** — 19 items. Tier 4 is the gate.

---

## Onward

**Module 09a — Interaction extensions** takes the authentication event apart. JARM signs the whole
authorization response rather than hashing pieces of it; CIBA moves authentication to a different device with
no redirect at all; RFC 9470 lets a resource server demand *stronger* authentication mid-session, which is
`acr` and `auth_time` doing real work; and RAR replaces coarse scopes with typed, structured authorization
detail.
