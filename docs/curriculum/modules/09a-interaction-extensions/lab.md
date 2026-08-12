# Module 09a — Lab

**The short version:** five exercises, each with the same shape — **request the extension, read the refusal,
find the one field responsible, enable it, re-run.** That shape is the lab's real content. Four of these five
mechanisms are fully implemented on this deployment and switched off by a single unset value, and being able to
go from an error string to the exact field is the skill that separates "this AS doesn't support X" from "X is
one console field away."

## Before you start

```bash
set -a; source docs/curriculum/scripts/curriculum.env; set +a
curl -s "$API/health" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).status))'
```

```
ok
```

You need `$API`, `$CLIENT_ID`, `$CLIENT_SECRET`, `$REDIRECT_URI`, `$LAB_USER`, `$LAB_PASS`, plus read access to
the Authlete service — this lab reads configuration constantly:

```bash
AUTHLETE_BEARER_TOKEN=$(grep -m1 '^AUTHLETE_BEARER_TOKEN=' server/.env | cut -d= -f2-)
AUTHLETE_BASE_URL=$(grep -m1 '^AUTHLETE_BASE_URL=' server/.env | cut -d= -f2-)
AUTHLETE_SERVICE_ID=$(grep -m1 '^AUTHLETE_SERVICE_ID=' server/.env | cut -d= -f2-)

svc () { curl -s -H "Authorization: Bearer $AUTHLETE_BEARER_TOKEN" \
  "$AUTHLETE_BASE_URL/api/$AUTHLETE_SERVICE_ID/service/get"; }
cli () { curl -s -H "Authorization: Bearer $AUTHLETE_BEARER_TOKEN" \
  "$AUTHLETE_BASE_URL/api/$AUTHLETE_SERVICE_ID/client/get/${1:-$CLIENT_ID}"; }
```

> **How this lab is verified.** Every **refusal** below was executed against the live server and is
> reproduced verbatim. So, as of **2026-08-12**, is every **success** — the four "now enable it" steps
> (JARM, CIBA delivery mode, ACRs, and a RAR type) were applied to this deployment and each success path was
> run end to end, so the transcripts below are observations rather than the specification's promise.
>
> **The convention that got them there is worth more than the transcripts.** For roughly a fortnight this lab
> carried four `UNVERIFIED` markers naming the exact setting responsible for each gap. That is why closing
> them was a checklist rather than an investigation: each marker said what to change and what would then be
> observable. If you write a lab against a deployment you do not fully control, mark what you have not seen —
> and **date the marker**, because a marker whose premise has silently changed is worse than none at all.
> Module 08 had one that was wrong for a fortnight and three documents inherited it.
>
> If you are running this against **your own** Authlete service, these four settings are almost certainly
> still unset; each step says which one it needs.

> **Vendor behavior.** Bracketed codes (`[A012305]`, `[A249302]`, …) are Authlete's. HTTP statuses, `error`
> values, claim names and parameter names are spec-defined.

> **Rate limiter.** `loginLimiter` is 5 logins/minute. Exercises 2 and 4 run browser flows; if you see an
> empty redirect, wait a minute. (Module 08's lab explains the cascade this produces.)

### A helper for reading authorization-endpoint errors

```bash
autherr () {
  curl -s -o /dev/null -w '%{redirect_url}\n' -G "$API/authorization" \
    --data-urlencode "response_type=code" --data-urlencode "client_id=$CLIENT_ID" \
    --data-urlencode "redirect_uri=$REDIRECT_URI" --data-urlencode "scope=openid" \
    --data-urlencode "state=x" "$@" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      const u=new URL(s.trim()); const q=u.searchParams.size?u.searchParams:new URLSearchParams(u.hash.slice(1));
      console.log(" ", q.get("error")??"(none)", "|", (q.get("error_description")??"").slice(0,160))})'
}
```

---

## Exercise 1 — Inventory: what is switched off, and where

**Goal:** before requesting anything, predict which extensions will fail, from configuration alone. This is
Module 07's method applied to *capability* rather than *conformance*.

```bash
svc | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);
for (const k of ["supportedAcrs","supportedAuthorizationDetailsTypes","supportedBackchannelTokenDeliveryModes",
  "backchannelAuthenticationEndpoint","backchannelAuthReqIdDuration","backchannelPollingInterval",
  "backchannelUserCodeParameterSupported","authorizationResponseDuration","nativeSsoSupported"])
  console.log(k.padEnd(46), JSON.stringify(k in d ? d[k] : "ABSENT"))})'
```

```
supportedAcrs                                  "ABSENT"
supportedAuthorizationDetailsTypes             "ABSENT"
supportedBackchannelTokenDeliveryModes         ["POLL","PING","PUSH"]
backchannelAuthenticationEndpoint              "https://…/api/ciba/authentication"
backchannelAuthReqIdDuration                   600
backchannelPollingInterval                     5
backchannelUserCodeParameterSupported          true
authorizationResponseDuration                  600
nativeSsoSupported                             false
```

```bash
cli | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);
for (const k of ["responseModes","authorizationSignAlg","authorizationEncryptionAlg","bcDeliveryMode",
  "bcNotificationEndpoint","bcUserCodeRequired","defaultMaxAge","authTimeRequired","grantTypes"])
  console.log(k.padEnd(30), JSON.stringify(k in d ? d[k] : "ABSENT"))})'
```

```
responseModes                  ["QUERY","FRAGMENT","FORM_POST","JWT","QUERY_JWT","FRAGMENT_JWT","FORM_POST_JWT"]
authorizationSignAlg           "ABSENT"
bcDeliveryMode                 "ABSENT"
bcUserCodeRequired             false
defaultMaxAge                  0
authTimeRequired               false
grantTypes                     [… "CIBA" …]
```

**Now predict.** Fill this in before running anything:

| Extension | Will it work? | Which field decides |
|---|---|---|
| JARM | | |
| CIBA | | |
| Step-up (RFC 9470) | | |
| RAR | | |
| Native SSO | | |

The interesting rows are JARM and CIBA, and they are interesting for the same reason: **the capability is
listed and the enabling value is missing.** The client's `responseModes` includes `JWT`, `QUERY_JWT`,
`FRAGMENT_JWT`, `FORM_POST_JWT` — JARM is *permitted*. Its `authorizationSignAlg` is absent — JARM is not
*configured*. The client's `grantTypes` includes `CIBA` and the service advertises all three delivery modes;
the client's `bcDeliveryMode` is absent.

**"Permitted but not configured" is a third state**, distinct from Module 07's "supported but not required."
Supported-but-not-required is a security finding — the mechanism works and nothing insists on it.
Permitted-but-not-configured is an availability one — the mechanism is allowed and cannot run. Both look like
a green tick in a capability matrix.

---

## Exercise 2 — JARM

### 2a — Ask for a signed response

```bash
echo "response_mode=jwt";           autherr --data-urlencode "response_mode=jwt"
echo "response_mode=query.jwt";     autherr --data-urlencode "response_mode=query.jwt"
```

```
response_mode=jwt
  invalid_request | [A012305] The authorization request required the authorization response be encoded as
                    JWT by specifying 'response_mode=jwt', but the 'authorization_signed_response_alg'
                    metadata of the client (ID = …) is not set.
response_mode=query.jwt
  invalid_request | [A012305] The authorization request required the authorization response be encoded as
                    JWT by specifying 'response_mode=query.jwt', but the 'authorization_signed_response_alg'
                    metadata of the client (ID = …) is not set.
```

**This is an unusually good error message** — it names the exact metadata parameter, in its
specification-defined form (`authorization_signed_response_alg`, from the JARM spec) rather than in the
vendor's internal spelling (`authorizationSignAlg`). Note the value of that: you can go from this string to
the JARM spec without knowing anything about Authlete.

And note the conclusion, which matters for how you read this repo:

> **JARM requires no code in `server/src`.** The authorization server already constructs, signs, and delivers
> the response object; the whole feature is behind one client metadata field.
> [SPEC-INVENTORY](../../SPEC-INVENTORY.md) previously listed JARM as an implementation gap. On the **AS side**
> it is a configuration gap. A **client** consuming JARM does need new code, and the dashboard SPA does not
> have it.

### 2b — A vendor anomaly worth logging

```bash
curl -s -o /dev/null -w 'status=%{http_code} content-type=%{content_type}\n' -G "$API/authorization" \
  --data-urlencode "response_type=code" --data-urlencode "client_id=$CLIENT_ID" \
  --data-urlencode "redirect_uri=$REDIRECT_URI" --data-urlencode "scope=openid" \
  --data-urlencode "state=x" --data-urlencode "response_mode=form_post.jwt"
```

```
status=302 content-type=text/plain; charset=utf-8
```

A **302** — but `form_post` is supposed to return an HTML form with 200. Look at where it is redirecting:

```bash
curl -s -G "$API/authorization" \
  --data-urlencode "response_type=code" --data-urlencode "client_id=$CLIENT_ID" \
  --data-urlencode "redirect_uri=$REDIRECT_URI" --data-urlencode "scope=openid" \
  --data-urlencode "state=x" --data-urlencode "response_mode=form_post.jwt" | head -c 200
```

```
Found. Redirecting to %3Chtml%3E%3Chead%3E%3Cmeta%20http-equiv=%22content-type%22%20content=%22text/html;…
```

**The `Location` header contains a URL-encoded HTML document.** Now find out whose fault that is — the
distinction between vendor behaviour and repo behaviour is exactly what `AGENTS.md` requires you to keep
straight, and you can settle it in one request:

```bash
P="response_type=code&client_id=$CLIENT_ID&redirect_uri=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' -- "$REDIRECT_URI")&scope=openid&state=x&response_mode=form_post.jwt"
curl -s -X POST -H "Authorization: Bearer $AUTHLETE_BEARER_TOKEN" -H "Content-Type: application/json" \
  "$AUTHLETE_BASE_URL/api/$AUTHLETE_SERVICE_ID/auth/authorization" -d "{\"parameters\":\"$P\"}" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);
      console.log("action          =", d.action);
      console.log("resultCode      =", d.resultCode);
      console.log("responseContent =", JSON.stringify((d.responseContent||"").slice(0,60)))})'
```

```
action          = LOCATION
resultCode      = A012305
responseContent = "<html><head><meta http-equiv=\"content-type\" content=\"te"
```

**The authorization server returned `action: LOCATION` with an HTML document as the content.** `LOCATION` means
"redirect the user agent to this URL"; the content is not a URL. The repo's controller did exactly what
`LOCATION` instructs (`authorization.controller.ts:39-42`), so the malformed response originates **upstream**,
in the AS, on the `form_post.jwt` **error** path.

Write it up as vendor behaviour, and be careful about scope: this was observed on the *error* path only.
Whether the success path behaves the same cannot be determined until JARM is enabled — say so rather than
generalising. A defensive controller could detect content that is not a URL and fall back to the `FORM`
handling, and that would be a reasonable hardening, but it is a workaround for someone else's bug.

### 2c — Enable it, then verify properly

Authlete Console → your client → **Authorization Signature Algorithm** → `ES256` → Save. Confirm:

```bash
cli | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log("authorizationSignAlg =",JSON.parse(s).authorizationSignAlg))'
```

Then run a full flow with `response_mode=jwt`, and **verify the response the way you verified an ID token in
Module 08** — signature first, then all three JARM claims, then the parameters:

```bash
cat > /tmp/verify-jarm.mjs <<'EOF'
// Verify a JARM response JWT. Usage: node verify-jarm.mjs <jwt>
// Env: ISSUER, CLIENT_ID, JWKS_URI, EXPECT_STATE
import crypto from "node:crypto";
const jwt = process.argv[2];
const { ISSUER, CLIENT_ID, JWKS_URI, EXPECT_STATE } = process.env;
const d = (s) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
const [h64, p64, s64] = jwt.split(".");
const header = d(h64), c = d(p64);

const jwks = await fetch(JWKS_URI).then((r) => r.json());
const key = jwks.keys.find((k) => k.kid === header.kid) ?? (jwks.keys.length === 1 ? jwks.keys[0] : null);
if (!key) throw new Error(`no JWK for kid=${header.kid}`);
const sigOk = crypto.verify(null, Buffer.from(`${h64}.${p64}`),
  { key: crypto.createPublicKey({ key, format: "jwk" }), dsaEncoding: "ieee-p1363" },
  Buffer.from(s64, "base64url"));

const now = Math.floor(Date.now() / 1000);
const checks = [
  ["signature verifies",              sigOk],
  ["iss is the expected AS",           c.iss === ISSUER,      c.iss],
  ["aud is our client_id",             c.aud === CLIENT_ID,   JSON.stringify(c.aud)],
  ["not expired",                      c.exp > now,           `${c.exp - now}s left`],
  ["exp within 10 min (RECOMMENDED)",  c.exp - now <= 600,    `${c.exp - now}s`],
  ["state matches",                    !EXPECT_STATE || c.state === EXPECT_STATE, c.state],
];
for (const [what, pass, detail] of checks)
  console.log(`${pass ? "PASS" : "FAIL"}  ${what}${detail ? " — " + detail : ""}`);
console.log("\npayload:", JSON.stringify(c, null, 1));
if (!checks.every(([, p]) => p)) process.exit(1);
EOF
```

Drive the flow, pull the single `response` parameter out of the redirect, and run it through:

```bash
CJ=$(mktemp); RU=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' -- "$REDIRECT_URI")
curl -s -c "$CJ" -o /dev/null \
  "$API/authorization?response_type=code&client_id=$CLIENT_ID&redirect_uri=$RU&scope=openid&state=jarm1&nonce=n1&response_mode=jwt"
CSRF=$(curl -s -b "$CJ" -c "$CJ" "$API/session/login" | grep -o 'name="_csrf" value="[^"]*"' | head -1 | cut -d'"' -f4)
F=$(curl -s -b "$CJ" -c "$CJ" -o /dev/null -w '%{redirect_url}' -X POST "$API/session/login" \
     -d "username=$LAB_USER" -d "password=$LAB_PASS" --data-urlencode "_csrf=$CSRF")
case "$F" in *response=*) ;; *) CS2=$(curl -s -b "$CJ" -c "$CJ" "$API/session/consent" \
     | grep -o 'name="_csrf" value="[^"]*"' | head -1 | cut -d'"' -f4)
   F=$(curl -s -b "$CJ" -c "$CJ" -o /dev/null -w '%{redirect_url}' -X POST "$API/session/consent" \
       -d "decision=approve" --data-urlencode "_csrf=$CS2") ;; esac
rm -f "$CJ"
JWT=$(node -e 'const u=new URL(process.argv[1]);process.stdout.write(u.searchParams.get("response")||"")' -- "$F")

ISSUER=$(curl -s "$API/.well-known/openid-configuration" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).issuer))') \
CLIENT_ID="$CLIENT_ID" JWKS_URI="$API/.well-known/jwks.json" EXPECT_STATE=jarm1 \
  node /tmp/verify-jarm.mjs "$JWT"
```

Expect the payload to contain `iss`, `aud`, `exp`, plus `code` and `state` — **one parameter in the URL instead
of three or four**, with everything inside a signature.

```
query parameters : response          <- one parameter, not four
JWT header       : {"kid":"1","alg":"ES256"}
JWT claims       : ["aud","state","code","iss","exp"]
iss / aud        : https://blackadi.dev / <your client_id>
carries code     : true | state: jarm1 | expires in 600 s
signature verifies against jwks kid=1: true
```

**Verified end to end 2026-08-12**, after `authorizationSignAlg = ES256` was set on `$CLIENT_ID`. Three
things in that transcript are worth stopping on:

- **One query parameter.** `code`, `state` and `iss` are all *inside* the JWT. A shoulder-surfer, a proxy log
  or a `Referer` header now sees one opaque blob instead of a usable authorization code.
- **`exp` is 600 seconds**, not the 24 hours everything else on this deployment gets. The response JWT is a
  transport wrapper, and it is bounded like one.
- **The signature is the service's `kid: "1"` EC key** — the same key Module 08 verifies ID tokens against,
  and the same one Module 00 read out of the JWKS. JARM does not introduce new key material; it reuses the
  OP's signing key for a different envelope. Which is why `verify-jarm.mjs` is an adaptation of Module 08's
  validator rather than a new program.

### 2d — Reason about it without running it

Answerable from the lesson, and worth writing down:

1. You have `state` and PKCE already. **What does JARM add that neither provides?** (Two things.)
2. Module 05 gave you `iss` as a query parameter for mix-up. **Why is `iss` inside a JARM JWT strictly
   stronger** rather than merely equivalent?
3. A client decodes the `response` JWT with `atob`, reads `code`, and redeems it — signature never checked.
   **Argue that this is worse than not using JARM at all.**

---

## Exercise 3 — CIBA

### 3a — Ask for a decoupled authentication

```bash
curl -s -o /dev/null -w 'status=%{http_code}\n' -X POST "$API/ciba/authentication" \
  -H "Content-Type: application/json" \
  -d "{\"parameters\":\"scope=openid&login_hint=$LAB_USER\",\"clientId\":\"$CLIENT_ID\",\"clientSecret\":\"$CLIENT_SECRET\"}"

curl -s -X POST "$API/ciba/authentication" -H "Content-Type: application/json" \
  -d "{\"parameters\":\"scope=openid&login_hint=$LAB_USER\",\"clientId\":\"$CLIENT_ID\",\"clientSecret\":\"$CLIENT_SECRET\"}" \
  | head -c 300
```

```
status=400
{"resultCode":"A169301","resultMessage":"[A169301] The backchannel token delivery mode of the client
application is not set.","action":"BAD_REQUEST","responseContent":"{\"error\":\"unauthorized_client\",
\"error_description\":\"[A169301] The backchannel token delivery mode of the client application is not
set.\",\"error_uri\":\"https://docs.authlete.com/#A169301\"}","clientId":…
```

The field is `bcDeliveryMode`. But **look at the response body itself**, because there is a second lesson here
that has nothing to do with CIBA:

The endpoint returned Authlete's **entire internal response object** — `resultCode`, `resultMessage`, `action`,
`clientId`, and a `responseContent` string that contains the *actual* OAuth error body, JSON-escaped inside
JSON. A client wanting `error` and `error_description` has to know to parse a nested JSON string out of a
vendor-shaped envelope.

Contrast that with the token endpoint (Modules 02–06), which always returned a clean
`{"error":"…","error_description":"…"}`. Same server, same class of endpoint, two different contracts. Write it
up as a finding — low severity, real integration cost — and note which one is correct: the `responseContent`
field is what should have been sent, with the envelope discarded.

### 3b — Where the delivery mode lives, and what it costs

```bash
svc | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);
  console.log("service supports:", d.supportedBackchannelTokenDeliveryModes);
  console.log("poll interval   :", d.backchannelPollingInterval, "s");
  console.log("auth_req_id ttl :", d.backchannelAuthReqIdDuration, "s");
  console.log("user_code       :", d.backchannelUserCodeParameterSupported)})'
```

```
service supports: [ 'POLL', 'PING', 'PUSH' ]
poll interval   : 5 s
auth_req_id ttl : 600 s
user_code       : true
```

All three modes are available at the service, so the choice is the client's. **Decide before you set it**, and
write down why:

| Mode | Client needs a public endpoint? | What arrives there | Pick it when |
|---|---|---|---|
| `POLL` | No | — | Default. Terminal, NAT, browser |
| `PING` | Yes | "ready" notification | Avoid polling cost, still fetch tokens yourself |
| `PUSH` | Yes | **The tokens** | Lowest latency; that endpoint now needs token-endpoint-grade protection |

For a lab, `POLL` — it needs nothing reachable from the internet. Console → client → **Backchannel Token
Delivery Mode** → `POLL`.

### 3c — The sub-endpoints, before you have a real ticket

The repo exposes four CIBA endpoints. Probe the other three with a bogus ticket and read the shapes:

```bash
for EP in issue fail complete; do
  printf '%-9s ' "$EP"
  curl -s -o /dev/null -w 'status=%{http_code}  ' -X POST "$API/ciba/$EP" -H "Content-Type: application/json" \
    -d '{"ticket":"bogus","reason":"ACCESS_DENIED","result":"AUTHORIZED","subject":"admin"}'
  curl -s -X POST "$API/ciba/$EP" -H "Content-Type: application/json" \
    -d '{"ticket":"bogus","reason":"ACCESS_DENIED","result":"AUTHORIZED","subject":"admin"}' | head -c 110; echo
done
```

```
issue     status=400  {"resultCode":"A181201","resultMessage":"[A181201] The ticket does not exist.","action":"INVALID_TICKET",…
fail      status=403  {"resultCode":"A185001","resultMessage":"[A185001] Successfully generated an error response…","action":"FORBIDDEN",…
complete  status=500  {"resultCode":"A186202","resultMessage":"[A186202] No record that holds the ticket.","action":"SERVER_ERROR",…
```

Three endpoints, three statuses, one nonexistent ticket. **`complete` returns 500** for a bad ticket — a client
error reported as a server error, which will page whoever owns the alerting. And `fail` returns 403 with a
`resultMessage` saying *"Successfully generated an error response"* — Authlete describing its own success at
producing your failure, which is correct from its side and confusing from yours. These are worth a line each in
your notes; the general point is that **an endpoint that forwards a vendor's action-to-status mapping
unexamined will produce status codes that mean nothing to its own callers.**

Now the polling error you *can* verify, because it is on the token endpoint:

```bash
curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=urn:openid:params:grant-type:ciba" -d "auth_req_id=bogus"
```

```json
{"error":"invalid_grant","error_description":"[A200304] The 'auth_req_id' does not exist.",
 "error_uri":"https://docs.authlete.com/#A200304"}
```

A clean, spec-shaped OAuth error — because this is the **token** endpoint, which the earlier modules exercised
and which gets it right. Same deployment, two conventions.

### 3d — Run it, once `bcDeliveryMode` is set

The full poll-mode sequence:

```bash
# 1. Client asks the AS to authenticate the user out of band
AR=$(curl -s -X POST "$API/ciba/authentication" -H "Content-Type: application/json" \
  -d "{\"parameters\":\"scope=openid&login_hint=$LAB_USER&binding_message=W7-3F2\",\"clientId\":\"$CLIENT_ID\",\"clientSecret\":\"$CLIENT_SECRET\"}")
echo "$AR" | head -c 300
TICKET=$(echo "$AR" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).ticket||""))')

# 2. The AS has no UI here, so this repo hands you the operator's half:
#    issue the auth_req_id, then (standing in for the user's phone) complete the authentication.
AUTH_REQ_ID=$(curl -s -X POST "$API/ciba/issue" -H "Content-Type: application/json" \
  -d "{\"ticket\":\"$TICKET\"}" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).authReqId||""))')

# 3. Poll BEFORE approving — expect authorization_pending
curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=urn:openid:params:grant-type:ciba" --data-urlencode "auth_req_id=$AUTH_REQ_ID"

# 4. The user approves on their own device (simulated)
curl -s -X POST "$API/ciba/complete" -H "Content-Type: application/json" \
  -d "{\"ticket\":\"$TICKET\",\"result\":\"AUTHORIZED\",\"subject\":\"$LAB_USER\"}" | head -c 200

# 5. Poll again — expect tokens
curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=urn:openid:params:grant-type:ciba" --data-urlencode "auth_req_id=$AUTH_REQ_ID"
```

Expect `authorization_pending` at step 3 and an access token plus ID token at step 5. Then try step 5 a third
time, and reason about whether an `auth_req_id` should be single-use.

```
1 authentication -> 200 | action: USER_IDENTIFICATION | hint: admin | deliveryMode: POLL
2 issue          -> 200 | authReqId: issued | expiresIn: 600 | interval: 5
3 poll (early)   -> 400 | authorization_pending
4 complete       -> 200 | action: NO_ACTION
5 poll (after)   -> 200 | access_token + id_token, expires_in=86400
6 poll (replay)  -> 400 | invalid_grant
```

**Verified end to end 2026-08-12**, after `bcDeliveryMode = POLL` was set on `$CLIENT_ID`. Four observations,
and the last one answers the question posed above:

- **`action: NO_ACTION` at step 4 is success, not a no-op.** In poll mode the AS has nowhere to push the
  result, so "no action" means *"I have recorded the authorization; the device will find out when it next
  polls."* `AGENTS.md` documents this mapping; a reader who assumed `NO_ACTION` meant failure would give up
  one step from the token.
- **`interval: 5` and `expiresIn: 600` are the service's `backchannelPollingInterval` and
  `backchannelAuthReqIdDuration`.** Poll faster than the interval and you are supposed to get `slow_down`.
- **`authorization_pending` is a 400.** A pending CIBA request is an *error* response by RFC design, which is
  the same shape Module 09a's device-flow sibling uses. Do not treat 400 as terminal in a polling loop.
- **The `auth_req_id` is single-use.** Step 6 replays a request that worked at step 5 and gets
  `invalid_grant`. That is the right answer to 3d's question: it is an authorization-code-shaped artefact and
  it inherits the code's one-shot rule, for the same reason — a replayable one would let anyone who read it
  from a log mint tokens for the user who approved it.

### 3e — The threat that has no analogue in a redirect flow

Notice `binding_message=W7-3F2` in step 1. Now reason about why it is there:

1. In a redirect flow, the user clicked something and then a page appeared — **the user initiated the
   interaction**, so its context is self-evident. In CIBA the prompt is **unsolicited**. What does that change?
2. Any client permitted to use CIBA can make a prompt appear on any user's device knowing only a `login_hint`.
   Write the phishing attack: what the attacker sends, what the user sees, and why the AS's own branding makes
   it worse.
3. `binding_message` and `user_code` each mitigate part of it. Say which part each covers, and what neither
   covers. (`backchannelUserCodeParameterSupported` is `true` here, so `user_code` is available.)
4. Compare with the **device grant** from Module 02. Both authenticate on a second device. Which direction does
   the secret flow in each, and why does that make the device grant's consent model easier?

---

## Exercise 4 — Step-up authentication (RFC 9470)

### 4a — Ask for an authentication context

```bash
echo "acr_values=pwd";  autherr --data-urlencode "acr_values=pwd"
echo "essential acr";   autherr --data-urlencode 'claims={"id_token":{"acr":{"essential":true,"values":["mfa"]}}}'
```

```
acr_values=pwd
  invalid_request | [A021303] ACR values cannot be specified by any means ('claim', 'acr_values' or
                    'default_acr_values') because this service supports no ACR value.
essential acr
  invalid_request | [A021303] ACR values cannot be specified by any means ('claim', 'acr_values' or
                    'default_acr_values') because this service supports no ACR value.
```

**Both routes are closed by the same field**, and note what the message tells you: `acr_values`, the `claims`
parameter, and `default_acr_values` on the client are three ways to ask, all gated on the service having at
least one ACR.

This is worth pausing on, because it is a genuinely surprising interaction with Module 08. The ID tokens you
validated there **carried `acr: "pwd"`**. The server records a satisfied ACR on login
(`session.controller.ts`) and Authlete puts it in the token. So the deployment *emits* an ACR it will not let
you *request*.

**That is ACR theatre in its purest form:** a claim asserting an authentication context, on a service that has
declared no authentication contexts. A resource server reading `acr: "pwd"` and making a decision on it is
relying on a value that means whatever the login handler happened to write. Add it to your notes with that
framing — the value is not wrong, it is *unaccountable*.

### 4b — Enable ACRs, then force a challenge

Console → **Service** → Supported ACRs → add `pwd` and `mfa` → Save.

```bash
svc | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log("supportedAcrs =",JSON.parse(s).supportedAcrs))'
```

Then the two halves of RFC 9470.

**Half one — a satisfiable ACR.** Request `acr_values=pwd`, complete the flow, and confirm the ID token's `acr`
and the introspection response's `acr`/`auth_time`. This should succeed: the login handler satisfies `pwd`.

**Half two — an unsatisfiable *essential* ACR.** Request `mfa` as an essential claim. The login handler cannot
satisfy it, so the authorization must **fail** rather than downgrade:

```bash
autherr --data-urlencode 'claims={"id_token":{"acr":{"essential":true,"values":["mfa"]}}}'
```

Expect a redirect error. This is the distinction that matters: `acr_values` is a **preference** the AS may not
meet; an `acr` claim marked `"essential": true` (OIDC Core §5.5.1) is a **requirement** it must refuse rather
than silently satisfy with something weaker. The repo's `session.controller.ts` implements exactly that —
`ACR_NOT_SATISFIED` when `acrEssential` is set and the satisfied ACR does not match, `EXCEEDS_MAX_AGE` when
`max_age` is blown.

**Half three — the challenge.** The point of RFC 9470 is the *resource server's* side. Present a `pwd`-backed
token to something requiring `mfa` and read the challenge:

```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="insufficient_user_authentication",
  error_description="A different authentication level is required",
  acr_values="mfa"
```

Then check what this repo does with it: `introspection.controller.ts:47` parses Authlete's `WWW-Authenticate`
for `insufficient_user_authentication` and re-shapes it into JSON carrying `acr_values`/`max_age`, so a
browser client can read the requirement without parsing an HTTP header.

```
half one — acr_values=pwd
  id_token acr       : "pwd"
  id_token auth_time : present, 0 s ago
  introspection      : 200 | acr: "pwd"

half two — claims={"id_token":{"acr":{"essential":true,"values":["mfa"]}}}
  error              : unmet_authentication_requirements
  error_description  : [A060305] The authorization request requests 'acr' as essential, but the
                       authentication performed for the request does not satisfy it
  code issued        : no
```

**Both halves verified end to end 2026-08-12**, after `supportedAcrs = ["pwd","mfa"]` was set. The pair is
the point:

- **Half one succeeds** because the login handler really does satisfy `pwd`, and the value reaches both the
  ID token and introspection — so a resource server can act on it.
- **Half two refuses.** `unmet_authentication_requirements` is OIDC Core §5.5.1.1's error, and refusing is
  the *only* correct answer: the alternative is issuing a token that claims `acr: "pwd"` to a client that
  said `mfa` was essential, which is exactly the fabricated-assurance failure `utils/step-up.ts` exists to
  prevent. **An AS that cannot meet an essential requirement must say so, not approximate it.**
- **`mfa` had to be registered in `supportedAcrs` for half two to fail *this* way.** An unregistered value
  fails earlier and for a different reason, which would demonstrate a different lesson. Registering an ACR
  the deployment cannot satisfy is deliberate here — it is what makes the refusal path reachable.

### 4c — Design the challenge

Write the exact `WWW-Authenticate` header a payments API should return for a transfer above its limit. Then:

1. Remove `acr_values` from your header. **What can the client do now?** Explain why this is the single most
   common RFC 9470 implementation mistake.
2. Why 401 and not 403? Point at the mechanism, not the convention.
3. `max_age=300` and `acr_values="mfa"` express different requirements. Give a scenario where you need both,
   and one where `max_age` alone is right.

---

## Exercise 5 — Rich Authorization Requests (RFC 9396)

### 5a — Four ways to get it wrong, and four different errors

```bash
echo "unknown type:";   autherr --data-urlencode 'authorization_details=[{"type":"account_information","actions":["list"]}]'
echo "missing type:";   autherr --data-urlencode 'authorization_details=[{"actions":["initiate"]}]'
echo "malformed JSON:"; autherr --data-urlencode 'authorization_details=not-json'
echo "not an array:";   autherr --data-urlencode 'authorization_details={"type":"payment_initiation"}'
```

```
unknown type:
  invalid_authorization_details | [A249302] The 'type' of the element (index = 0) in 'authorization_details' is not supported.
missing type:
  invalid_authorization_details | [A249301] The 'type' of the element (index = 0) in 'authorization_details' is null or empty.
malformed JSON:
  invalid_authorization_details | [A249304] The format of the value of 'authorization_details' is wrong.
not an array:
  invalid_authorization_details | [A249304] The format of the value of 'authorization_details' is wrong.
```

**One spec error code, four distinct diagnostics, and the element index.** Compare this with what a
scope-encoded equivalent could tell you: `scope=payment:123.50:EUR:DE02…` either matches a registered scope
string or does not. There is no "field 3 of element 0 is malformed," because there are no fields and no
elements.

That is the concrete argument for RAR, and it is worth stating as a general principle: **structure is what
makes validation possible, and validation is what makes good error messages possible.** RFC 9396 defines
`invalid_authorization_details` for *"unknown types, unknown fields, incorrect field types, invalid values, or
missing required fields"* — five failure classes that a string cannot distinguish.

Note also that `[A249302]` and `[A249301]` are different: *unsupported* type versus *absent* type. The first
means "not registered on this AS," the second "you sent an object without a schema selector." Different fixes.

> **Why `account_information` here, and not `payment_initiation`.** Since **2026-08-12** this service
> registers `payment_initiation` — 5b needs it — so sending *that* type no longer produces `[A249302]`; it
> succeeds. The refusal needs a type nobody has registered. If you register more types later, move this
> example to a fresh name: **a control that has quietly become a success is worse than no control**, because
> the exercise still prints four cases and one of them is now lying. The "not an array" case below keeps
> `payment_initiation` deliberately — its `[A249304]` is a *format* rejection that happens before the type is
> ever looked at, which you can prove by swapping the name and watching the error stay the same.

### 5b — Register a type, then send a real one

**Already done on this deployment** (2026-08-12) — `payment_initiation` is registered on the service *and*
on `$CLIENT_ID`. Both are needed: the service decides which types exist, the client decides which of them it
may request. On a service where it is not yet registered: Console → **Service** → Supported Authorization
Details Types → add `payment_initiation` → Save, then the same on the client.

```bash
svc | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log("types =",JSON.parse(s).supportedAuthorizationDetailsTypes))'
```

Then send a properly-formed object using RFC 9396's common data fields:

```bash
AD='[{
  "type": "payment_initiation",
  "actions": ["initiate", "status"],
  "locations": ["https://api.example.com/payments"],
  "instructedAmount": { "currency": "EUR", "amount": "123.50" },
  "creditorAccount": { "iban": "DE02100100109307118603" }
}]'
autherr --data-urlencode "authorization_details=$AD"
```

Expect `(none)` — no error — and then complete the flow and look for the **granted** `authorization_details`
in the token response and the introspection response. That round trip is the whole feature: the AS validated
the structure, the consent screen could render it, and the resource server receives structure to compare
against rather than a string to parse.

```
(none)
```

Then complete the flow and look at what came back:

```
token response  authorization_details:
[{"instructedAmount":{"currency":"EUR","amount":"123.50"},
  "creditorAccount":{"iban":"DE02100100109307118603"},
  "type":"payment_initiation",
  "locations":["https://api.example.com/payments"],
  "actions":["initiate","status"]}]

introspection   authorizationDetails:
{"elements":[{"type":"payment_initiation",
              "locations":["https://api.example.com/payments"],
              "actions":["initiate","status"],
              "otherFields":"{\"instructedAmount\":{...},\"creditorAccount\":{...}}"}]}
```

**Verified end to end 2026-08-12.** The round trip is real: the AS validated the structure, and the granted
details came back on both the token response and introspection.

**Now compare those two blocks, because they are not the same document.** The token response is
RFC 9396-shaped — a JSON array named `authorization_details`, your fields at the top level. The introspection
response is **Authlete's internal shape**: an object with an `elements` array, and every field the RFC calls
*common data* that Authlete does not model natively — `instructedAmount`, `creditorAccount` — flattened into
a **string** called `otherFields`. A resource server that parsed `authorization_details` from the token
response and then tried the same parser on the introspection response would fail, and the fields it needs
most are the ones inside that string.

That is this repo's third systemic theme in one artefact: **the vendor's envelope crossing a boundary the
specification defines.** You met it at PAR and at CIBA; here it is again, on the same feature, in one of two
responses and not the other. Write it up the way Module 07 taught you: *which* response, *which* fields, and
what a conforming client would have expected instead.

### 5c — Judge when to use it

For each, decide RAR or scopes, and give a one-line reason:

1. "Read this user's email address."
2. "Transfer €500 from account A to IBAN X, once, today."
3. "Read this patient's records for encounter 4471, for the next hour."
4. "Administer the tenant."
5. "Grant read access to these three named S3 prefixes."

Then answer the harder one: **for a case where RAR is right, what have you committed to?** Name at least three
ongoing obligations that scopes do not carry. (Schema design and registration; versioning as the API changes;
consent-screen rendering per type; RS-side structural comparison; and AS-side validation rules.)

---

## Break it — three to reason about

**Break 1 — JARM without verification.** A client parses the `response` JWT with a base64 decode, reads `code`,
and redeems it. Write the attack that JARM was supposed to prevent and now does not, and explain why the team
is *more* exposed than before they adopted JARM.

**Break 2 — CIBA prompt-bombing.** You control a client permitted to use CIBA and know one `login_hint`.
Describe what you can do, what it costs you, what the user experiences, and the three controls that would stop
it — ranked by how much they actually help.

**Break 3 — the extension nobody enabled.** Pick any one of the four fields this lab identified. Argue the case
for leaving it unset. (There is a real case for each. A reviewer who can only argue for turning things on is
not much use to a team that has to operate the result.)

---

## Verification block

- [ ] You predicted, from configuration alone, which of the five extensions would fail — and were right.
- [ ] You can explain the difference between "supported but not required" (Module 07) and "permitted but not
      configured", and why both look identical in a capability matrix.
- [ ] `response_mode=jwt` returned `[A012305]` naming `authorization_signed_response_alg`, and you can state
      why that means **no server code** is needed for JARM here.
- [ ] You traced the `form_post.jwt` 302-with-HTML to `action: LOCATION` from the AS, and can say why that
      makes it vendor behaviour rather than a repo defect.
- [ ] CIBA returned `[A169301]`, and you noticed the response body is a vendor envelope rather than an OAuth
      error — and can say which field inside it should have been the response.
- [ ] You can name the three CIBA delivery modes and defend a choice for a terminal behind NAT.
- [ ] `acr_values=pwd` returned `[A021303]`, **and** you found `acr: "pwd"` in a live ID token — and can
      explain why holding both facts at once is a finding.
- [ ] All four RAR malformations returned distinct diagnostics under one spec error code, and you can say what
      that demonstrates about structure versus strings.
- [ ] You wrote a `WWW-Authenticate` challenge and can say what breaks if `acr_values` is omitted.
- [ ] You made the case for leaving one of these fields unset.

## Clean up

```bash
rm -f /tmp/verify-jarm.mjs
unset AUTHLETE_BEARER_TOKEN AUTHLETE_BASE_URL AUTHLETE_SERVICE_ID TICKET AUTH_REQ_ID JWT
```

If you enabled fields for this lab, decide deliberately whether to leave them on. `supportedAcrs` and
`supportedAuthorizationDetailsTypes` are harmless additions. **`bcDeliveryMode` is not** — it makes the client
able to trigger authentication prompts, which is exactly Break 2. Module 10 needs JARM; nothing later needs
CIBA.

---

## What to carry into Module 09b

**Four mechanisms, four unset fields, zero lines of server code.** That is the headline, and it cuts both ways:
the distance between "unsupported" and "supported" is often a console field, which is also the distance
between a control being enforced and not. Module 07's audit method exists because of this.

**Read a refusal as a map.** Every error in this lab named its own cause, and the good ones named it in
*specification* vocabulary (`authorization_signed_response_alg`) rather than vendor vocabulary. When an error
message lets you go straight to the spec, that is a deliberate kindness by its author — and when it does not,
the fastest route is to ask the policy engine directly, as you did in 2b.

**Hold contradictory facts at once.** `supportedAcrs` is empty *and* live ID tokens carry `acr: "pwd"`. Neither
observation is wrong. The finding is the pair.

Module 09b changes the subject from *how the interaction is shaped* to *what is being asserted about a person*:
verified claims and identity assurance, **selective disclosure** so a holder can prove one fact without
revealing the rest, verifiable credential issuance and presentation, and federation — trust between parties
with no direct relationship.
