# Module 01 — The Delegation Problem

**The short version:** OAuth exists to answer one question — *how do I let an app act on my behalf without
giving it my password?* Before OAuth, the only answer was "hand over the credential," which quietly grants
unlimited, permanent, untraceable, unrevokable access. This module makes that failure precise, then introduces
the cast of actors and endpoints that the entire rest of the curriculum uses. No grants yet. Just the problem,
and the vocabulary for the solution.

## Prerequisites

**[Module 00 — Web + JOSE Foundations](../00-web-and-jose-foundations/).** You need the front-channel /
back-channel distinction, because the delegation design is *built* around which party sees which bytes.

## Why this module exists

Every OAuth diagram you have ever seen has four or five boxes and a dozen arrows, and none of them tell you
*why the boxes are separate*. They are separate because of one specific, expensive failure: **credential
sharing**.

Picture the pre-OAuth web. A budgeting app wants to read your bank transactions. There is no protocol for
"read-only access to transactions," so the app asks for your online-banking username and password and logs in
as you. It works. It also means: the app can move money, not just read it. It can change your address. It
holds a copy of a credential you reuse elsewhere. If the app is breached, your bank account is breached. You
cannot revoke the app without changing your password — which breaks every *other* app you gave it to. Your
bank's logs show *you* logged in, not "the budgeting app acting for you." And you have trained yourself to
type your bank password into a third party's form, which is precisely the behavior phishing depends on. This
is the **password anti-pattern**, and every one of those consequences is structural, not a bug in that
particular app.

Notice what the app actually needed: *read transactions, for the next 30 days, revocably.* Notice what it
received: *everything you can do, forever, indistinguishable from you.* The gap between those two sentences is
the delegation problem. OAuth is the machinery that closes it.

The core move is to stop sharing the credential and start issuing a **token**: a separate artifact, minted by
the party that already authenticates the user, which is *narrow* (only certain operations), *time-limited*,
*revocable independently of the password*, *attributable* (the logs know which app did what), and *useless
elsewhere* (it is not the password, and it is bound to a specific audience). To issue that artifact safely you
need a third party the user already trusts to hold the credential — and that requirement is what forces the
roles apart. The client must **not** be the thing that sees the password. So the login page has to live
somewhere else. So the app must be redirected away and back. So there must be an endpoint that issues tokens
and a separate endpoint where the user authenticates.

The entire shape of OAuth — the redirect dance, the two endpoints, the code you exchange — falls out of one
constraint: **the client never touches the user's credential.** Learn the constraint now and the rest of the
protocol stops looking arbitrary.

A last framing note. OAuth is an **authorization** protocol: it answers "may this app do this thing?" It is
*not* an authentication protocol, and using it as one is a genuine, common security bug. That distinction gets
its own module (08), but plant the flag now: an access token says nothing reliable about *who the user is*.

## Learning objectives

After this module you can:

1. State the **password anti-pattern** and enumerate at least five distinct harms it causes, without listing
   "it's insecure" as one of them.
2. Explain why the delegation problem *forces* the client and the authorization server to be different
   parties — i.e. derive the shape of OAuth from the constraint rather than memorizing it.
3. Name the four roles RFC 6749 §1.1 defines, state what each is responsible for, and add the two further
   actors this deployment has that the spec does not name.
4. Map every actor to the endpoint(s) it talks to, and say whether that conversation is front channel or back
   channel.
5. Contrast a **credential** with a **token** across five properties (scope, lifetime, revocability,
   attribution, transferability).
6. Explain what the **Resource Owner Password Credentials** grant is, why RFC 6749 §4.3 defined it, and why
   RFC 9700 §2.4 now says it MUST NOT be used.
7. Describe the **confused deputy** problem in one sentence and say which OAuth features are aimed at it.
8. State plainly why an access token does **not** authenticate a user (the full argument arrives in Module 08).

## Plain-language pass (no spec vocabulary)

You are staying at a hotel, and a cleaning service needs into your room.

- **The password anti-pattern** is giving the cleaner *your* room key — the one that also opens the safe, bills
  the minibar to your name, and works every day of your stay. You cannot un-give it. If you want it back you
  change the lock, and now *your own* key stops working too. The front desk's log says *you* entered the room
  at 3am.
- **The OAuth way** is that you never hand over anything. You walk to the **front desk** — the only party that
  ever verifies who you are — and say "issue this cleaning service a key." The desk asks you to confirm what
  it may open (*the room, not the safe*) and for how long (*today*). It prints a **separate key card**. The
  cleaner holds only that card.
- The card is **narrow** (room only), **temporary** (expires tonight), **revocable** (the desk deactivates it
  without touching your key), **attributable** (the log says "cleaning service card #7 entered at 10:14"), and
  **useless elsewhere** (it is not your key, and it will not open a room in another hotel).
- Crucially, the cleaner is *never* standing at the desk with you when you show ID. That is not politeness —
  it is the whole design. The moment the cleaner can watch you authenticate, everything above collapses.
- And the doors are dumb. A door does not know you; it reads a card and opens or doesn't. **A key card proves
  a permission, not an identity.** The cleaner holding a valid card is not thereby "you."

The last two bullets are the ones people skip, and they are the ones the rest of the curriculum is built on.

## Specification pass (exact terminology) + the bridge

| Plain-language element | Formal concept | Defining reference |
|------------------------|----------------|--------------------|
| You, the guest | **Resource owner** — "An entity capable of granting access to a protected resource. When the resource owner is a person, it is referred to as an end-user." | RFC 6749 §1.1 |
| The cleaning service | **Client** — "An application making protected resource requests on behalf of the resource owner and with its authorization." | RFC 6749 §1.1 |
| The front desk | **Authorization server (AS)** — "The server issuing access tokens to the client after successfully authenticating the resource owner and obtaining authorization." | RFC 6749 §1.1 |
| The door / the room | **Resource server (RS)** — "The server hosting the protected resources, capable of accepting and responding to protected resource requests using access tokens." | RFC 6749 §1.1 |
| Walking to the desk yourself | **User agent** — the browser that carries the front-channel redirects | RFC 6749 §1.2 (protocol flow); *not* one of the four §1.1 roles |
| The desk's back office | **Authorization policy engine** — here, Authlete | *Deployment architecture, not a spec role* |
| The key card | **Access token**, presented as `Authorization: Bearer <token>` | RFC 6750 §2.1 |
| "The room, not the safe" | **Scope** | RFC 6749 §3.3 |
| Showing ID at the desk | **Authentication of the resource owner**, performed by the AS | RFC 6749 §1.1 (AS definition) |
| Confirming what the card opens | **Authorization grant** / consent | RFC 6749 §1.3 |
| Handing over your own key | **Resource Owner Password Credentials grant** | RFC 6749 §4.3 — **MUST NOT be used**, RFC 9700 §2.4 |

### The six actors in this lab, and where each one talks

RFC 6749 §1.1 names **four** roles. A real deployment has two more actors that matter operationally, and
pretending otherwise makes the labs confusing — so here is the honest cast:

| # | Actor | In this repo | Talks to | Channel |
|---|-------|--------------|----------|---------|
| 1 | **Resource owner** (end-user) | the person typing `admin`/`password` into `views/login.ejs` | the AS's login + consent pages, via the browser | front |
| 2 | **User agent** *(not a §1.1 role)* | your browser, or `curl` following redirects | relays messages between client and AS | front — **untrusted** |
| 3 | **Client** | the React SPA in `client/`, or your `curl` | AS token endpoint; RS resource endpoints | back (token), front (authorization request) |
| 4 | **Authorization server** | this Express server (`server/`) | the client, the user, the policy engine | both |
| 5 | **Resource server** | UserInfo + Introspection stand in for one here | validates tokens with the AS | back |
| 6 | **Policy engine** *(not a spec role)* | Authlete Cloud | the AS only — never the browser | back |

Two things to notice, because they are load-bearing:

- **Actor 2 is untrusted and unavoidable.** The user agent must be in the path — that is how the user reaches
  the AS's login page without the client seeing it — and it can read and rewrite everything it relays. Module
  00 taught you why; Modules 03 and 05 are largely about defending this leg.
- **Actor 6 is invisible to everyone but the AS.** This server holds **zero** OAuth state; every decision —
  token issuance, client authentication, scope validation — happens in Authlete. That is an architecture
  choice of this deployment, not a spec requirement, and the labs keep the distinction explicit, because
  Authlete's policy checks sometimes reject requests that the published metadata appears to permit.

### Endpoints, and which conversation each one is

| Endpoint | Defined by | Who calls it | Channel | Why it exists |
|----------|-----------|--------------|---------|---------------|
| Authorization endpoint | RFC 6749 §3.1 | the **user agent** (not the client directly) | front | Where the user authenticates and consents — the one place the credential is typed |
| Token endpoint | RFC 6749 §3.2 | the **client**, directly | back | Where a grant is exchanged for a token, with client authentication |
| Redirection endpoint | RFC 6749 §3.1.2 | the AS sends the user agent here | front | How the result gets back to the client |
| Protected resource | RFC 6750 §2.1 | the **client**, with `Authorization: Bearer` | back | Where the token is actually spent |

That table *is* the delegation design. The credential is typed only at row 1; the token is minted only at row
2; the client never handles a credential at row 1, and the browser never handles a token at row 2.

## Assigned reading

Read these from `docs/` — this module adds the *why*, not a re-description:

| Read | For |
|------|-----|
| root [`README.md`](../../../../README.md) | What the deployment is, and the Authlete-as-engine split (actor 6) |
| [`docs/ARCHITECTURE.md`](../../../ARCHITECTURE.md) | "System Context" and "Container Diagram" — the actors as deployed boxes. Note the stated key property: *the server holds zero OAuth state.* |
| [`docs/DATA-FLOWS.md`](../../../DATA-FLOWS.md) | "Authorization Code Flow" — read it now for **who talks to whom**, not for the parameters. You dissect the parameters in Module 02. |

**The delta this module adds:** those documents show *what the system does*. None of them says *why* the client
and the authorization server must be different parties, what specifically goes wrong when they are not, or what
an access token buys you that a shared password does not. That argument is here.

## Where this lives in the code

- **`server/src/views/login.ejs`** — the login form. Look at line 18: `action="/api/session/login"`. The form
  posts to the **authorization server**, not to any client. That single attribute is the credential boundary.
- **`server/src/controllers/session.controller.ts`** — `handleLogin` refuses to authenticate anyone unless
  `req.session.authorization` exists (a pending authorization request). You cannot "just log in" and have a
  client harvest the result: authentication is bound to a specific authorization request.
- **`server/src/views/consent.ejs`** — the consent form, showing the client name and the requested scopes, and
  posting back to `/api/session/consent`. This is where the resource owner narrows the grant.
- **`server/src/routes/token.routes.ts` → `controllers/token.controller.ts`** — the back-channel endpoint. No
  browser, no user, client authentication required.
- **`server/src/routes/userinfo.routes.ts`** — the closest thing to a resource server here: it accepts a
  bearer token and returns claims (RFC 6750 §2.1).
- **Dashboard:** the **Grant Flows** section walks the same path with a UI; **Token Management** and **Grant
  Management** let you see and revoke what was granted — the revocability property, made visible.

## Wire-level walkthrough

Three ways to let an app read your data. Watch what each party learns.

**(1) The password anti-pattern — direct credential sharing.** The client collects the credential itself:

```http
POST /connect-my-bank HTTP/1.1
Host: budgeting-app.example
Content-Type: application/x-www-form-urlencoded

bank_username=jane&bank_password=hunter2      # the client now HAS this, indefinitely
```

*What the client learns:* the credential. *What the bank learns:* nothing — to the bank this is just Jane
logging in. *Scope:* everything Jane can do. *Revocation:* change the password, breaking every other app.

**(2) The same thing wearing an OAuth costume — ROPC (RFC 6749 §4.3).** The credential still passes through
the client; only the plumbing changed:

```http
POST /api/token HTTP/1.1
Host: as.example.com
Content-Type: application/x-www-form-urlencoded
Authorization: Basic czZCaGRSa3F0Mzo...

grant_type=password&username=admin&password=password&scope=openid
```

RFC 6749 §4.3 permitted this only where "the resource owner has a trust relationship with the client, such as
the device operating system or a highly privileged application," and required that "the client MUST discard
the credentials once an access token has been obtained" — a rule no protocol can enforce. It is now forbidden:
**RFC 9700 §2.4 states "The resource owner password credentials grant [RFC6749] MUST NOT be used."** You will
send this exact request in the lab — and what you get back depends on how *your* service is configured, which
is itself the lesson. Record the outcome and the date; Break 1 explains both cases, and Module 07 §3c takes
apart what it means that the answer changed on this very deployment without a line of code moving.

**(3) The delegated way.** Split across parties, so that no single arrow carries both the credential and the
token:

```http
# 3a. Client → user agent → AS. Front channel. No credential, no client secret.
GET /api/authorization?response_type=code&client_id=...&redirect_uri=...&scope=openid HTTP/1.1

# 3b. User → AS, on the AS's own page. The credential is typed HERE and nowhere else.
POST /api/session/login HTTP/1.1
Host: as.example.com
username=admin&password=password&_csrf=...      # see the note below on _csrf

# 3c. User → AS. Consent narrows the grant to specific scopes.
POST /api/session/consent HTTP/1.1

# 3d. AS → user agent → client. Front channel — carries a code, not a token.
HTTP/1.1 302 Found
Location: https://client.example.com/callback?code=SplxlOBeZQ...&state=xyz

# 3e. Client → AS. Back channel, client authenticates, code becomes a token.
POST /api/token HTTP/1.1
grant_type=authorization_code&code=SplxlOBeZQ...&redirect_uri=...

# 3f. Client → RS. The token is spent (RFC 6750 §2.1).
GET /api/userinfo HTTP/1.1
Authorization: Bearer eyJhbGciOiJFUzI1NiIsInR5cCI6ImF0K2p3dCJ9...
```

> **What `_csrf` is, since it appears in every browser leg from here on.** These two POSTs are ordinary HTML
> form submissions, so the browser attaches the session cookie **automatically** — including when the form
> was submitted from a page an attacker controls. That is **cross-site request forgery (CSRF)**: the victim's
> browser makes a request they did not intend, with their credentials. The defence is a value the attacker
> cannot read: the AS puts a random token in a hidden field when it renders the page and checks it on
> submission, and the same-origin policy stops attacker script reading it. `_csrf` is that field on this
> server (`middleware/csrf.ts`), and the labs extract it before every form POST for exactly this reason. The
> **`state` parameter** you meet in Module 02 is the same idea applied to the redirect rather than to a form.

### What each party learns

| | Password sharing (1) & ROPC (2) | Delegated (3) |
|---|---|---|
| Client sees the credential | **Yes** | No — never |
| AS knows *which app* is acting | No (it looks like the user) | Yes — `client_id`, authenticated at 3e |
| User sees and narrows what is granted | No | Yes — at 3c |
| Access is limited in scope | No | Yes — `scope` |
| Access expires on its own | No | Yes — token lifetime |
| Revoke one app without breaking others | No | Yes — revoke that token/grant |
| Audit trail attributes actions to the app | No | Yes |

Every "No" in the left column is a consequence of one decision: letting the client hold the credential.

### Credential vs. token — the five properties

| Property | Password (a **credential**) | Access token (a **capability**) |
|----------|------------------------------|---------------------------------|
| **Scope** | Everything the user can do | Only the granted scopes |
| **Lifetime** | Until changed — possibly years | Minutes to hours; `exp` is checked |
| **Revocability** | Only by changing it, breaking every other use | Individually revocable (RFC 7009), grant by grant |
| **Attribution** | Actions look like the user's | Actions attributable to a `client_id` |
| **Transferability** | Works anywhere that password works | Bound to an audience; useless at another API |

Read that table right-to-left and you have the design brief OAuth was written against.

## Diagram

```mermaid
%%{init: {'theme':'dark'}}%%
sequenceDiagram
    autonumber
    actor RO as Resource Owner (user)
    participant UA as User Agent (browser) — untrusted
    participant C as Client (the app)
    participant AS as Authorization Server
    participant PE as Policy Engine (Authlete)
    participant RS as Resource Server

    rect rgb(80, 30, 30)
        Note over RO,C: ANTI-PATTERN — one arrow, everything lost
        RO->>C: username + password
        C->>RS: acts AS the user: unlimited, untraceable, unrevokable
    end

    rect rgb(25, 55, 40)
        Note over RO,RS: DELEGATION — the credential never reaches C
        C-->>UA: 1. redirect to the AS (front channel, no secret)
        UA-->>AS: 2. authorization request
        RO->>AS: 3. credential typed on the AS's OWN page
        AS->>PE: 4. may this client get these scopes?
        RO->>AS: 5. consent — narrows the grant
        AS-->>UA: 6. redirect back with a code (front channel)
        UA-->>C: 7. code delivered to the client
        C->>AS: 8. code + client authentication (BACK channel)
        AS->>PE: 9. mint token
        AS->>C: 10. access token (narrow, expiring, revocable)
        C->>RS: 11. Authorization: Bearer <token>
        RS->>PE: 12. is this token valid, and for what?
    end
```

Dashed arrows are front channel (through the untrusted browser); solid arrows are back channel. Trace the
credential: it appears **only** at step 3, on a page served by the AS. None of the client's arrows touch it.
That is the whole invention.

## Lab

See **[lab.md](lab.md)**. You will inventory the actors from the live metadata document; locate the credential
boundary by proving the login form posts to the *authorization server*; watch the AS refuse to authenticate a
user who has no pending authorization request; then **break it** — send the password anti-pattern as a real
ROPC token request and watch a modern AS reject it, and try to spend a password as if it were a token.

## Threat notes — what breaks if you get this wrong

- **Credential replication.** Every party holding the password is a place it can leak from. The blast radius
  of a client breach becomes the blast radius of the credential — which the user has probably reused.
- **Unbounded authority (the over-privileged client).** With a credential there is no "read-only." A client
  that only needed to list transactions can also move money.
- **The confused deputy.** A privileged intermediary is tricked into using its authority on an attacker's
  behalf. Scopes, audience restriction (`aud`; `resource`, RFC 8707), and consent all exist to bound what a
  deputy can be talked into doing. The classic OAuth instance — a client induced to send its code or token to
  the wrong party — arrives as *mix-up* in Module 05.
- **No revocation granularity.** "Revoking" a shared password means changing it, which is all-or-nothing and
  therefore rarely done. Compromised access persists.
- **Audit blindness.** If every action looks like the user, incident response cannot answer "which app did
  this?" Attribution is a security property, not a reporting nicety.
- **Phishing normalization.** Training users to type their credential into arbitrary third-party UIs destroys
  the only heuristic they have. Keeping the login on the AS's own origin is what makes "check the address bar"
  meaningful advice.
- **Using authorization as authentication.** Concluding "the user is X" from possession of an access token. A
  token is a capability, not an identity assertion; anyone who obtains it presents it identically. Module 08.

## Spec delta

| Question | Answer |
|----------|--------|
| **What came before** | Credential sharing (the password anti-pattern) and ad-hoc API keys: unlimited, permanent, unattributable, effectively unrevokable. |
| **What this adds** | A four-role separation (RFC 6749 §1.1) that keeps the credential away from the client; an issued **token** that is scoped, expiring, revocable, and attributable; an explicit consent step; a front/back-channel split governing who may see what. |
| **What it deprecates** | Direct credential sharing. RFC 6749 §4.3 (ROPC) formalized it as a migration path; **RFC 9700 §2.4 now says it MUST NOT be used**, and OAuth 2.1 (active Internet-Draft, `draft-ietf-oauth-v2-1`) removes it from the framework. |
| **What remains unsolved (and where it's addressed)** | *How* a grant is obtained, and which grant to choose → **Module 02**. Stopping an attacker who intercepts the front-channel code → **Module 03**. What the token means, how it is checked and revoked → **Module 04**. Stopping theft of the token itself → **Module 05**. Proving *who the user is* → **Module 08**. |

## What to study next and why

You can now say what OAuth is for and name every actor and endpoint in the system. What you cannot yet do is
describe how the client actually gets a token — which parameters go where, why the authorization endpoint
returns a *code* rather than a token, and what the alternatives are when there is no user in front of a
browser. **Module 02 — OAuth Core + Threats** walks every grant type at wire level, including the two the
ecosystem has since abandoned, and introduces the systematic threat model (RFC 6819, superseded in practice by
RFC 9700) that Modules 03–07 spend their time defending against.
