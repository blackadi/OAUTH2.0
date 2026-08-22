# Module 04 — Lab: Ask the issuer, kill the token, pin the audience

**The short version:** you will stand in for a resource server. Introspect a live token through two different
endpoints and compare what each knows; revoke it and watch `active` flip; probe the two deliberate anti-oracle
behaviours; audience-restrict a token with `resource` and watch `aud` appear; break RFC 8707's two rules; and
finish by proving that a metadata endpoint returning **HTTP 200** does not exist.

## Setup

```bash
npm --prefix server run dev
cd docs/curriculum/scripts && set -a && source curriculum.env && set +a && cd -
PRU="http://localhost:3001/callback"       # registered on $PUB_CLIENT_ID
```

You need `$API`, `$PUB_CLIENT_ID`, `$LAB_USER`, `$LAB_PASS`. Reuse the `run_flow` and `getcode` helpers from
[Module 03's lab](../03-pkce-and-public-clients/lab.md#setup) — paste them again if this is a new shell.

**Get a token to work with:**

```bash
VERIFIER=$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64url"))')
CHALLENGE=$(node -e 'process.stdout.write(require("crypto").createHash("sha256").update(process.argv[1]).digest("base64url"))' -- "$VERIFIER")
R=$(run_flow "&code_challenge=$CHALLENGE&code_challenge_method=S256"); CODE=$(getcode "$R")

curl -s -X POST "$API/token" -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" -d "code=$CODE" --data-urlencode "redirect_uri=$PRU" \
  -d "client_id=$PUB_CLIENT_ID" -d "code_verifier=$VERIFIER" > /tmp/m04.json
AT=$(node -e 'process.stdout.write(require("/tmp/m04.json").access_token)')
echo "access token: ${#AT} chars"     # → 43 chars, opaque
```

---

## Exercise 1 — Introspect, two ways

You are the resource server now. You hold 43 characters and know nothing.

**The RFC 7662 shape:**

```bash
curl -s -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" -X POST "$API/introspection/standard" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=$AT" -d "token_type_hint=access_token"
```

```json
{"active":true,"scope":"profile","client_id":"…","token_type":"Bearer",
 "exp":1785242182,"sub":"admin","iss":"https://…","auth_time":…,"acr":"pwd"}
```

**Authlete's own shape** — same token, much more detail:

```bash
curl -s -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" -X POST "$API/introspection" -H "Content-Type: application/x-www-form-urlencoded" -d "token=$AT" \
 | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d);console.log("fields:",Object.keys(j).join(", "));console.log({subject:j.subject,clientId:j.clientId,scopes:j.scopes,existent:j.existent,usable:j.usable,sufficient:j.sufficient,refreshable:j.refreshable,grantType:j.grantType})})'
```

```
fields: resultCode, resultMessage, action, responseContent, clientId, clientIdAlias, clientIdAliasUsed,
        expiresAt, subject, scopes, existent, usable, sufficient, refreshable, scopeDetails, …
{ subject: 'admin', clientId: …, scopes: [ 'profile' ], existent: true, usable: true,
  sufficient: false, refreshable: true, grantType: … }
```

Note the vocabulary difference. RFC 7662 gives you one boolean, `active`. Authlete splits it into
`existent` / `usable` / `sufficient` / `refreshable`, because a real AS distinguishes *"this token exists"*
from *"it is within its validity window"* from *"it covers the scopes you asked me about."* `sufficient:
false` here is not a problem — you did not pass any required scopes to check against.

**The lesson:** the standard is the interoperable floor, not the whole truth. Write against `active`, but know
your AS returns more.

## Exercise 2 — The three checks a resource server actually owes

Take the RFC 7662 response above and answer, for a hypothetical `GET /orders/42`:

| Check | From which field | Your answer |
|---|---|---|
| Is the token valid? | `active` | |
| Is **this API** the intended audience? | `aud` | |
| Does the scope permit this operation? | `scope` | |
| Does this subject own order 42? | *nothing here* | |

Look at what the introspection response contains right now — **there is no `aud` field at all**, because you
did not ask for one. Any resource server trusting this token is accepting a token that was minted for no
particular audience. Exercise 4 fixes that. The last row has no answer at any point in this curriculum until
Module 11; note that now.

## Exercise 3 — Revoke it, and probe the anti-oracle rules

```bash
curl -s -o /dev/null -w 'revoke → %{http_code}\n' -X POST "$API/revocation" \
  -H "Content-Type: application/x-www-form-urlencoded" -d "token=$AT" -d "client_id=$PUB_CLIENT_ID"

curl -s -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" -X POST "$API/introspection/standard" -H "Content-Type: application/x-www-form-urlencoded" -d "token=$AT"
```

```
revoke → 200
{"active":false}
```

Instant. No waiting for `exp`. That is the reference-token property the lesson traded latency for.

Now the two behaviours that look like bugs and are not:

```bash
curl -s -o /dev/null -w 'revoke a string that was never a token → %{http_code}\n' -X POST "$API/revocation" \
  -H "Content-Type: application/x-www-form-urlencoded" -d "token=not-a-real-token-at-all" -d "client_id=$PUB_CLIENT_ID"

curl -s -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" -X POST "$API/introspection/standard" -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=not-a-real-token-at-all" -w '  ← status %{http_code}\n'
```

```
revoke a string that was never a token → 200
{"active":false}  ← status 200
```

**Explain the gap.** Compare the responses for *revoked* and *never existed*: byte-identical. RFC 7009 §2.2
requires 200 *"if the token has been revoked successfully or if the client submitted an invalid token,"* and
RFC 7662 §2.2 requires `active: false` for not-active, non-existent, and not-allowed alike. If these differed,
an attacker with a list of candidate strings could sort them into "real" and "not real" for free. The
indistinguishability *is* the control.

### Break it — is the introspection endpoint protected?

**Predict:** RFC 7662 §2.1 says the endpoint *"MUST also require some form of authorization to access this
endpoint, such as client authentication… or a separate OAuth 2.0 access token."* Look back at every
introspection command you have run in this lab. What credentials did you send?

You sent `-u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET"` every time. Take it away and see what happens:

```bash
# No -u, no Authorization header, no client_secret. Nothing.
curl -s -X POST "$API/introspection/standard" -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=$AT" -w '\nstatus=%{http_code}\n'
```

```
{"error":"invalid_client","error_description":"Client authentication required"}
status=401
```

**Observe:** a `401`, with `WWW-Authenticate: Basic realm="introspection"`. Check the response header
yourself with `-D-`. And note what did **not** happen — no Authlete call was made at all. The gate runs
before the token is looked at, so an unauthenticated caller learns nothing, not even whether the token was
well-formed.

> **This exercise used to reproduce a live finding, and until 2026-08-12 it did.** Both introspection
> endpoints carried **no middleware at all** — no authentication, no rate limiter — and the transcript here
> was `status=200` with the full token record. The `-u` on every introspection command in this lab is what
> the fix cost, and that cost is the point §2.1 is making.

**Explain the gap that used to exist.** With an open introspection endpoint an attacker can (1) test any
string to learn whether it is a live token — a validity oracle for anything scraped from a log, a referrer
header, or browser history — and (2) for the hits, harvest `sub`, `scope`, `client_id`, and `exp`, which is a
user-enumeration and reconnaissance primitive on top of the token check. The anti-oracle design of Exercise 3
is defeated, because the attacker is not guessing *which* invalid token is which — they are asking about
tokens that are real.

**Now audit the fix, because "it returns 401" is not the end of the analysis.** Three questions worth asking
of any endpoint someone has just protected:

1. **Does the check run before the work?** Here, yes — Authlete is never called on a rejected request. A gate
   that authenticates *after* doing the lookup closes the response but not the oracle: timing and error
   shape still leak. Verify this by reading the handler, not by reading the status code.
2. **Does it fail closed?** `requireBasicAuth` rejects every request when `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET`
   are unset. The earlier version of that helper returned "allow" in the same situation, which meant an unset
   environment variable silently disabled authentication across every admin route. Unset your local
   `MGMT_CLIENT_SECRET` and confirm you get `401` rather than `200`.
3. **Is it the *right* credential?** This is the interesting one. §2.1's examples are client authentication
   and a separate access token; this deployment uses its **admin** credential instead. That satisfies "some
   form of authorization", and it is a defensible choice here — but in a real architecture a resource server
   is not an administrator, and handing every RS the deployment's management password is a different problem
   wearing a fix's clothing. Write down what you would do instead, and what you would need to know about your
   IdP before you could.

Note what is *not* a fix: the endpoint being "internal only" — that is a network control, and it evaporates
the moment anything untrusted can reach the AS. Write the whole thing up as you would a real finding:
severity, exploit path, fix, and residual risk.

## Exercise 4 — Pin the audience with `resource` (RFC 8707)

Run a fresh flow, this time naming the API you intend to call.

```bash
V2=$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64url"))')
C2=$(node -e 'process.stdout.write(require("crypto").createHash("sha256").update(process.argv[1]).digest("base64url"))' -- "$V2")
RESENC=$(node -e 'process.stdout.write(encodeURIComponent("https://api.example.com/orders"))')

R=$(run_flow "&code_challenge=$C2&code_challenge_method=S256&resource=$RESENC")
CODE2=$(getcode "$R")

curl -s -X POST "$API/token" -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" -d "code=$CODE2" --data-urlencode "redirect_uri=$PRU" \
  -d "client_id=$PUB_CLIENT_ID" -d "code_verifier=$V2" \
  --data-urlencode "resource=https://api.example.com/orders" > /tmp/m04r.json

AT2=$(node -e 'process.stdout.write(require("/tmp/m04r.json").access_token)')
curl -s -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" -X POST "$API/introspection/standard" -H "Content-Type: application/x-www-form-urlencoded" -d "token=$AT2"
```

```json
{"active":true,"scope":"profile","client_id":"…","token_type":"Bearer","exp":…,"sub":"admin",
 "aud":["https://api.example.com/orders"],"iss":"https://…","auth_time":…,"acr":"pwd"}
```

**`aud` is now present.** Compare with Exercise 1, where it was absent. A resource server that checks `aud`
will now reject this token if it is not `https://api.example.com/orders` — so a token harvested from a
low-value service cannot be replayed against a high-value one. That is the confused-deputy defence from
Module 01, finally mechanised.

### Break it — RFC 8707's two rules

§2 requires the value to be an **absolute URI** with **no fragment**. Trip each:

```bash
ENC=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' -- "$PRU")

# (a) a fragment
BAD=$(node -e 'process.stdout.write(encodeURIComponent("https://api.example.com/orders#frag"))')
curl -s "$API/authorization?response_type=code&client_id=$PUB_CLIENT_ID&redirect_uri=$ENC&scope=profile&state=X&resource=$BAD" | head -c 200; echo

# (b) not absolute
curl -s "$API/authorization?response_type=code&client_id=$PUB_CLIENT_ID&redirect_uri=$ENC&scope=profile&state=Y&resource=%2Forders" | head -c 200; echo
```

```
Found. Redirecting to …?error=invalid_target&error_description=%5BA251308%5D+The+value+of+a+%27resource%27+includes+a+fragment+component.…
Found. Redirecting to …?error=invalid_target&error_description=%5BA251307%5D+The+value+of+a+%27resource%27+is+not+an+absolute+URI.…
```

**Explain the gap.** Both are `invalid_target`, the error RFC 8707 defines for *"invalid, missing, unknown, or
malformed"* resources — and note *where* they were delivered: as a **redirect** to the registered
`redirect_uri`, not as a JSON body. This is Module 02's error-channel rule in action: the AS had already
validated the redirect URI, so it was allowed to report the error there. The fragment rule exists because a
fragment never reaches the server, so two URIs differing only by fragment are the same resource to everyone
except the string comparison — an ambiguity you do not want in an audience check.

> **Where `resource` stops working, and it is not where you would guess.** You just saw it honoured on the
> **authorization** endpoint and carried through to the **token** endpoint — the `aud` above is the proof. It is
> **not** honoured through a **token exchange**: `POST /api/token` with
> `grant_type=urn:ietf:params:oauth:grant-type:token-exchange` accepts a `resource` parameter, answers **200**,
> and issues a token with **no `aud` at all**. Nothing tells you it was dropped.
>
> That is the same parameter, the same endpoint, and a different grant — which makes it a much easier trap than
> an unsupported feature would be. **Module 06 Exercise 6b** is where you watch it happen and read why; the short
> version is that this server's exchange handler builds its Authlete request from four fields and `resources` is
> not one of them, so the restriction you asked for is silently discarded. Do not carry the confidence you just
> earned in this exercise across a grant-type boundary without re-checking `aud`.

## Exercise 5 — The three metadata documents

```bash
echo "--- AS metadata (RFC 8414), TRUE ROOT ---"
curl -s http://localhost:3000/.well-known/oauth-authorization-server | head -c 120; echo

echo "--- OIDC discovery, UNDER /api ---"
curl -s "$API/.well-known/openid-configuration" | head -c 120; echo

echo "--- diff the key sets ---"
node -e '
const get=u=>fetch(u).then(r=>r.json());
Promise.all([get("http://localhost:3000/.well-known/oauth-authorization-server"),
             get("http://localhost:3000/api/.well-known/openid-configuration")])
 .then(([as,oidc])=>{
   const A=new Set(Object.keys(as)), O=new Set(Object.keys(oidc));
   console.log("only in OIDC discovery:", [...O].filter(k=>!A.has(k)).join(", ") || "(none)");
   console.log("only in AS metadata:  ", [...A].filter(k=>!O.has(k)).join(", ") || "(none)");
 });'
```

```
only in OIDC discovery: (none)
only in AS metadata:   (none)
```

**The two documents are byte-identical on this deployment** — `AGENTS.md` records that the root RFC 8414
route deliberately serves the same content as `openid-configuration`. That is a **deployment simplification,
not a spec equivalence**: RFC 8414 and OIDC Discovery 1.0 are different documents with different registries,
and an AS that is not an OpenID Provider would serve the first and not the second. Do not learn "they are the
same" from this; learn "this server chose to make them the same."

The structural point stands regardless: **two documents, two paths, two audiences.** RFC 8414 is the
OAuth-generic one; OIDC Discovery adds the identity-layer fields you will need in Module 08. Copy-pasting the
wrong path is one of the most common wasted afternoons in this ecosystem, and this server puts one at root and
the other under `/api`.

### Break it — an endpoint that returns 200 and does not exist

**Predict:** ask for a `/.well-known/` path that certainly does not exist. What status do you expect? Then ask
for one that does — RFC 9728's `/.well-known/oauth-protected-resource`, served here since 2026-07-28. Predict
whether the **status code alone** will let you tell them apart.

```bash
curl -s -o /dev/null -w 'a path I just invented → %{http_code}\n' http://localhost:3000/.well-known/totally-made-up
curl -s -o /dev/null -w 'PRM (really exists)   → %{http_code}\n' http://localhost:3000/.well-known/oauth-protected-resource
```

```
a path I just invented → 200
PRM (really exists)   → 200
```

**Both 200, and only one of them exists.** Now look at what you actually received:

```bash
curl -s -i http://localhost:3000/.well-known/totally-made-up | grep -i '^content-type'
curl -s http://localhost:3000/.well-known/totally-made-up | head -c 60; echo
echo '---'
curl -s -i http://localhost:3000/.well-known/oauth-protected-resource | grep -i '^content-type'
curl -s http://localhost:3000/.well-known/oauth-protected-resource | head -c 60; echo
```

```
Content-Type: text/html; charset=utf-8
<!DOCTYPE html>
---
Content-Type: application/json; charset=utf-8
{"resource":"…/api/userinfo","authorization_servers":["…
```

**Explain the gap.** The SPA's catch-all handler serves `index.html` for unmatched paths outside `/api`,
so a nonexistent URL like the one above returns 200 with HTML. The status code told you nothing; the
**content type** told you everything. Three habits follow, and they generalise well beyond this repo:

1. Check the **content type** — a metadata endpoint returns `application/json`.
2. **Parse the body.** If `JSON.parse` throws, you have a page, not an API.
3. **Compare against a control** — request a path you invented. Identical responses mean a catch-all.

> **Try both halves.** `curl -i http://localhost:3000/api/totally-made-up` answers `404` with JSON here,
> because this server terminates unmatched API paths deliberately (since 2026-08-22) — while the root
> path you just probed still returns the page. Most deployments do not make that distinction, which is
> why habits 1–3 are the ones to carry away rather than "check for a 404".

This is the same trap as Module 00, where `/api/jwks` returned the SPA instead of the key set. You have now
seen it twice; that is deliberate.

## Exercise 6 (optional) — Dynamic Client Registration

> **Requires dynamic client registration to be enabled on your Authlete service.** Without it, `register`
> returns *"[A206201] Service (…) does not support dynamic client registration."* Everything above works
> regardless.

```bash
META='{"client_name":"curriculum-dcr-demo","redirect_uris":["http://localhost:3001/callback"],"grant_types":["authorization_code"],"response_types":["code"],"token_endpoint_auth_method":"none","application_type":"native"}'
BODY=$(node -e 'process.stdout.write(JSON.stringify({json:process.argv[1]}))' -- "$META")

curl -s -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" -X POST "$API/client/dcr/register" \
  -H "Content-Type: application/json" -d "$BODY" -w '\nstatus=%{http_code}\n'
```

Note the request shape: this server wraps the RFC 7591 metadata in a **`json` string field** rather than
posting it directly — a deployment-specific adaptation, not the spec's own wire format (RFC 7591 posts the
metadata as the request body). If it succeeds, keep the `registration_access_token`: it is the credential for
`dcr/get`, `dcr/update`, and `dcr/delete` on **that one registration**, and nothing else. Then delete the
client so you do not leave test registrations lying around.

## Verification — you're done when

- [ ] You can read an RFC 7662 response and name what `active: true` does and does not assert.
- [ ] You can list the **three** checks a resource server owes beyond `active`, and say which one no token can
      ever answer.
- [ ] Revocation flips `active` to `false` immediately, and you can explain why the same 200 is returned for a
      token that never existed.
- [ ] You demonstrated that this deployment's introspection endpoint **refuses** unauthenticated calls, can
      cite RFC 7662 §2.1 for why it must, and can describe in two sentences the exploit it used to allow.
- [ ] You checked the fix rather than trusting it: the gate runs before Authlete is called, it fails closed
      when the management credentials are unset, and you can say why an admin credential is a defensible but
      imperfect answer to §2.1.
- [ ] Adding `resource` puts `aud` in the introspection response, and you can state RFC 8707's two constraints
      and the error code for violating them.
- [ ] You can name all three metadata documents, their paths on this server, and who consumes each.
- [ ] You can prove an endpoint does not exist even though it returned **200**, using three independent
      signals.

## What was real vs. simulated

- Every request and response above is **real**, including the `401` from the unauthenticated introspection
  and the `aud` restriction.
- **You are simulating the resource server.** This repo has no dedicated RS, so UserInfo and introspection
  stand in for one — and since 2026-08-12 you are simulating it with the deployment's *administrator*
  credentials, because that is the credential the endpoint takes. In production the introspecting party would
  be a separate service with its **own** credentials, and that gap is exactly what the third audit question in
  Exercise 3's Break is about.
- **Access tokens are opaque here** (service configuration). RFC 9068 `at+jwt` access tokens are taught in the
  lesson but cannot be produced on this deployment without changing the AS's access-token signing settings, so
  no lab step claims to show one.
- Bracketed error codes (`[A251307]`, `[A251308]`, `[A206201]`) are **Authlete vendor behavior**;
  `invalid_target` is spec-defined (RFC 8707 §2).
- The `{"json": "…"}` DCR request wrapper is **this server's API shape**, not RFC 7591's wire format.
- **RFC 9728 *is* implemented here** (since 2026-07-28) and returns real JSON. The detection exercise now uses
  an invented path as its negative control. It used to use RFC 9728 itself — worth knowing, because *"this
  endpoint does not exist"* is exactly the kind of claim that silently expires when someone ships the route.
  Re-run the check rather than trusting the sentence.
