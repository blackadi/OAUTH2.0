# Module 01 — Lab: Find the credential boundary

**The short version:** you will identify every actor in this deployment from the metadata it publishes, then
locate the single line of HTML that keeps the user's password away from the client — and prove the server
enforces it. Then you'll **break it**: send the password anti-pattern as a real token request and watch a
modern authorization server refuse, and try to spend a password as though it were a token.

No tokens are issued in this module. That is deliberate — Module 02 does that, and doing it here would mean
teaching grants before you can say why the roles are separate.

## Setup

**Required:** the server running on `:3000`.

```bash
npm --prefix server run dev     # in one terminal; leave it running
```

- **.env:** the server needs `AUTHLETE_BEARER_TOKEN`, `AUTHLETE_BASE_URL`, `AUTHLETE_SERVICE_ID`, and
  `SESSION_SECRET` in `server/.env`, or it will not start (a fail-fast config check, not an OAuth requirement).
- **Curriculum env:** set this up once — every lab from here on reads these variables:
  ```bash
  cd docs/curriculum/scripts
  cp curriculum.env.example curriculum.env   # fill in CLIENT_ID / CLIENT_SECRET
  set -a; source curriculum.env; set +a
  cd -
  ```
  For this module you need `$API`, `$LAB_USER`, `$LAB_PASS`, and — for Break 1 only — a confidential
  `$CLIENT_ID`/`$CLIENT_SECRET`. Create one in the dashboard's **Client Management** section if you have none.
- **Authlete flags:** none required.
- **Tools:** `curl`, `node`, and the dashboard on `:3001` for cross-check.

Confirm the server is up:

```bash
curl -s "$API/health"
# → {"status":"ok","uptime":...,"timestamp":"..."}
```

> **Note on your values:** issuer and endpoint URLs depend on how *your* Authlete service and `server/.env`
> are configured — they may show a public or tunnel hostname rather than `localhost`. That is deployment
> configuration, not a spec requirement. Keep calling `localhost:3000` (via `$API`) regardless of what the
> metadata advertises.

---

## Exercise 1 — Inventory the actors from the live metadata

The AS publishes a document that names its own endpoints. Every actor from the lesson is implied by one line
of it.

```bash
curl -s "$API/.well-known/openid-configuration" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d);for(const k of ["issuer","authorization_endpoint","token_endpoint","userinfo_endpoint","introspection_endpoint","revocation_endpoint","jwks_uri"])console.log(k.padEnd(24),j[k]);console.log("grant_types_supported   ",(j.grant_types_supported||[]).join(" "))})'
```

Fill this in from your own output — the point is to attach a *who* and a *channel* to each URL:

| Metadata field | Which actor calls it | Front or back channel | What it is for |
|----------------|----------------------|-----------------------|----------------|
| `authorization_endpoint` | the **user agent** (browser) | front | the user authenticates + consents here |
| `token_endpoint` | the **client**, directly | back | grant → token, with client authentication |
| `userinfo_endpoint` | the **client**, holding a token | back | a stand-in **resource server** |
| `introspection_endpoint` | a **resource server** | back | "is this token active?" (RFC 7662) |
| `revocation_endpoint` | the **client** | back | kill one token without touching the password (RFC 7009) |
| `jwks_uri` | anyone verifying a signature | back | public keys (Module 00) |

Two observations worth writing down:

1. **There is no "credential endpoint."** Nothing in this document is where a client sends a user's password.
   The only place a credential is ever typed is a page the AS renders for the *user*, which is why it is not
   in the machine-readable metadata at all.
2. **`grant_types_supported` advertises `password`.** Note that; you will test it in Break 1, and the result
   will teach you something about the difference between what metadata *claims* and what a server *does*.

**Dashboard cross-check:** open `:3001` → **Discovery**. Same document, rendered.

## Exercise 2 — Locate the credential boundary

The lesson's central claim is that the client never sees the password. That claim lives in exactly one HTML
attribute. Go read it:

```bash
curl -s "$API/session/login" | grep -o '<form[^>]*>'
```

```
<form method="POST" action="/api/session/login" id="login-form">
```

That `action` posts to the **authorization server's own origin**. Not to the client, not to a redirect URI,
not anywhere the client controls. Compare with the source at `server/src/views/login.ejs:18` — same line.

Now confirm the parallel for consent — the step where the resource owner *narrows* the grant:

```bash
grep -n 'action=' server/src/views/consent.ejs | head -2
```

Both forms post back to the AS. **The client is not in either conversation.** Everything in the lesson's
"what each party learns" table follows from these two lines of HTML.

## Exercise 3 — Watch the server enforce it

A login page that anyone can drive is not a boundary. Check whether the AS will authenticate a user who has
no pending authorization request — that is, whether a client could send someone to the login page and harvest
the result.

```bash
# Fetch the page (creates a session + CSRF token), extract the token, then POST valid credentials.
CSRF=$(curl -s -c /tmp/m01.jar "$API/session/login" | grep -o 'name="_csrf" value="[^"]*"' | cut -d'"' -f4)

curl -s -b /tmp/m01.jar -X POST "$API/session/login" \
  -d "username=$LAB_USER" -d "password=$LAB_PASS" --data-urlencode "_csrf=$CSRF" \
  -w '\nstatus=%{http_code}\n' | head -c 200
```

```
{"error":"Unauthorized","message":"Missing authorization context - session not found", ...
status=401
```

The credentials were **correct** and the server still refused. Authentication here is not a free-standing
service; it exists only to complete a specific pending authorization request (`req.session.authorization`,
set by the authorization endpoint — see `server/src/controllers/session.controller.ts:72`).

The consent page behaves the same way:

```bash
curl -s -o /dev/null -w 'consent status=%{http_code}\n' "$API/session/consent"
# → consent status=403      ("Unauthorized - no ticket in session")
```

> The JSON error bodies include a `stack` field because this server is running in development mode. In
> production those are suppressed (`docs/ARCHITECTURE.md` → "Dev vs Production").

**What just happened?** You established the boundary in three steps: the credential is collected only by the
AS (Ex. 2), and only in service of a request the AS itself started (Ex. 3). A client cannot obtain a password,
and cannot get the AS to authenticate someone on demand. Those two facts are what make a token meaningful —
they are the reason a token is evidence of *a specific delegated grant* rather than just "someone knew the
password."

## Break it

Write your prediction down before running each one.

### Break 1 — send the password anti-pattern for real

**Predict:** `grant_types_supported` includes `password`. You have a valid client credential and a valid user
credential. What happens when the client posts the user's password to the token endpoint?

```bash
curl -s -u "$CLIENT_ID:$CLIENT_SECRET" -X POST "$API/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "username=$LAB_USER" \
  --data-urlencode "password=$LAB_PASS" \
  -d "scope=openid"
```

**Observe.** You will get one of two outcomes, and **both are instructive** — record which one you saw, with
the date. Either a refusal (**Authlete vendor behavior**, not spec wording):

```json
{"error":"invalid_request",
 "error_description":"[A295306] The grant type ('password') is not allowed.",
 "error_uri":"https://docs.authlete.com/#A295306"}
```

…or a token:

```json
{"access_token":"EXAMPLE-ropc-token","token_type":"Bearer","expires_in":86400,
 "scope":"profile","refresh_token":"EXAMPLE-ropc-refresh"}
```

> **This is not a lab that has two answers because it is vague.** It has two answers because the outcome
> depends on a service-level setting that has nothing to do with the ROPC grant. When this module was first
> written the request was refused; today, on the same deployment with no code change and no client change, it
> returns a token — because a profile flag was cleared for unrelated reasons. **[Module
> 07](../07-oauth-2-1-and-security-bcp/lab.md#3c--the-finding-that-contradicts-an-earlier-module)** takes that
> reversal apart, and it is one of the more useful things in this curriculum. For now: note what *your*
> deployment did, and note the date.

**Explain the gap — three separate lessons here:**

1. **The ecosystem has closed this door.** RFC 6749 §4.3 defined the Resource Owner Password Credentials
   grant; **RFC 9700 §2.4** (Best Current Practice for OAuth 2.0 Security, BCP 240, January 2025) now states:
   *"The resource owner password credentials grant [RFC6749] MUST NOT be used."* OAuth 2.1 (an **active
   Internet-Draft**, `draft-ietf-oauth-v2-1` — not normative) does not specify it at all. A refusal is the
   correct modern behavior.
2. **Advertised ≠ permitted — and permitted ≠ advertised.** The metadata in Exercise 1 listed `password`.
   Whether the token request then succeeds is decided per request by the policy engine, not by the metadata.
   Never conclude from discovery that something will work *or* that it won't — test it. (A live example of
   the AS-versus-policy-engine split from the lesson: actor 6 gets the last word.)
3. **Whatever happened is a policy choice, not physics.** Nothing in HTTP stopped — or would stop — that
   request. If it was refused, some setting refused it, and settings change. If it succeeded, you are now
   holding an access token *and* the user's password, which is the anti-pattern with extra steps.

**If your deployment does return a token:** you have reproduced the anti-pattern. Decode the token locally
(`node docs/curriculum/scripts/decode-jwt.mjs "$ACCESS_TOKEN"`), then answer in writing: which of the five
credential-vs-token properties did you actually gain? (Answer: the token is scoped and expiring — but the
client still holds the password, so revocability, attribution, and non-transferability are all still lost.
The delegation never happened.) Then turn the grant off in your Authlete service.

### Break 2 — spend a password as if it were a token

**Predict:** the resource server takes an `Authorization: Bearer` header. You know a valid password. Does the
resource server care about the difference?

```bash
curl -s -i -H "Authorization: Bearer $LAB_PASS" "$API/userinfo" | head -n 1
curl -s -i -H "Authorization: Bearer $LAB_PASS" "$API/userinfo" | grep -i '^WWW-Authenticate'
```

```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="invalid_token",error_description="[A088302] The access token does not exist.",...
```

**Explain the gap.** A credential and a token are *different kinds of thing*, and the resource server only
accepts one of them. It does not ask "does this string authenticate someone?" — it asks "did my authorization
server issue this exact token, and what was it issued for?" That question has a definite answer for a token
and no answer at all for a password. The error code is `invalid_token` (RFC 6750 §3.1: *"The access token
provided is expired, revoked, malformed, or invalid for other reasons"*), returned in a `WWW-Authenticate`
header per RFC 6750 §3.

This is the mechanical reason a token can be scoped, expired, and revoked while a password cannot: the token
has a *record* at the issuer. The password is just a fact about the user.

### Break 3 — try to revoke a password (thought experiment)

Exercise 1 found a `revocation_endpoint` (RFC 7009). It takes a **token** and kills it.

**Predict, then write the answer out:**

1. A client holding an access token misbehaves. What exactly do you send to `revocation_endpoint`, and what
   still works afterwards for *other* clients? (Nothing else is affected — that is the point.)
2. A client holding the user's **password** misbehaves. What is the equivalent request? *(There isn't one.)*
   What is the only remedy, and what does it break?
3. Your bank's incident log shows a suspicious transfer. Under delegation, what field identifies the culprit?
   Under credential sharing, what does the log say instead?

Answer 2 is the reason revocation endpoints exist at all, and answer 3 is why "it's just a login" is never a
sufficient design.

## Verification — you're done when

- [ ] You produced a table mapping every metadata endpoint to an actor and a channel, without notes.
- [ ] `curl -s "$API/session/login" | grep -o '<form[^>]*>'` shows an `action` on the **AS's** origin, and you
      can say in one sentence why that attribute is a security boundary.
- [ ] A POST of **valid** credentials to `/api/session/login` returns **401** with *"Missing authorization
      context"*, and you can explain why refusing correct credentials is the right behavior.
- [ ] The ROPC token request is refused (or, if permitted, you can state exactly which security properties
      you still do not have).
- [ ] `Authorization: Bearer <password>` returns **401 `invalid_token`**, and you can explain why a token has
      an answer at the issuer and a password does not.
- [ ] You can state the module's rule without notes: **the client never touches the user's credential.**

## What was real vs. simulated

- The metadata, the login and consent pages, the 401/403 enforcement, the ROPC outcome (whichever you saw),
  and the `invalid_token` response are all **real** responses from the running server and Authlete.
- The budgeting-app and hotel stories in the lesson are **illustrations**; no bank was involved.
- Error strings prefixed with a bracketed code (`[A295306]`, `[A088302]`) are **Authlete vendor behavior**,
  not spec-defined wording. The *status codes* and the `error`/`WWW-Authenticate` structure are spec-defined
  (RFC 6749 §5.2, RFC 6750 §3).
- **Deployment note, and a worked example of why findings need dates.** When this module was written, a plain
  `GET /api/authorization` on this service was rejected with *"[A008306] The 'request_uri' parameter must be
  given…"* — mandatory PAR. The diagnosis at the time (`require_pushed_authorization_requests`) turned out to
  be **wrong**: the real cause was `fapiModes: ["FAPI2_SECURITY"]`, which was also what refused ROPC above and
  `client_secret_basic` in Module 02. Clearing that one field fixed all three at once. Nothing here affects
  this module — no authorization request is needed — but keep the shape of it: *one setting, three unrelated
  symptoms, and a plausible first diagnosis that was not the cause.*
