# Module 02 — Lab: Drive the code flow by hand, then break it

**The short version:** you will run a complete authorization-code flow with nothing but `curl` and a cookie
jar — five legs, watching exactly which artifact crosses which channel — then spend the token, then break the
flow five ways: replay the code, lie about the `redirect_uri` at the token endpoint, ask for an unregistered
`redirect_uri`, run the retired implicit grant and watch a live access token land in a URL, and start a device
flow that has no redirect at all.

By the end you will have driven, by hand, every leg of the diagram in the lesson.

## Setup

**Required:** the server on `:3000`, and a **confidential** client whose `redirect_uri` you know.

```bash
npm --prefix server run dev          # leave running
cd docs/curriculum/scripts && set -a && source curriculum.env && set +a && cd -
```

You need `$API`, `$CLIENT_ID`, `$CLIENT_SECRET`, `$REDIRECT_URI`, `$LAB_USER`, `$LAB_PASS`.

> **`$REDIRECT_URI` must be *exactly* one of the URIs registered on `$CLIENT_ID`.** Exact string matching is
> mandatory (RFC 9700 §4.1) and you will prove it in Break 3. Check what is registered:
> ```bash
> curl -sf -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" "$API/client/get/$CLIENT_ID" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const c=(j=>j.client||j)(JSON.parse(d));console.log("redirectUris:",c.redirectUris,"\ngrantTypes:",c.grantTypes,"\ntokenAuthMethod:",c.tokenAuthMethod)})'
> ```

**Authlete service configuration this lab needs:**

| Setting | Required value | Why |
|---|---|---|
| `fapiModes` | **empty** | FAPI 2.0 mandates PAR (Module 05) and rejects `client_secret_basic`, so the plain code flow cannot run. Re-enable at Module 10. |
| `supportedGrantTypes` | includes `AUTHORIZATION_CODE` | the flow |
| `supportedGrantTypes` | includes `IMPLICIT` | Break 4 only — the point is to *see* why it was retired. Turn it back off afterwards. |
| `supportedGrantTypes` | includes `DEVICE_CODE` | Break 5 |
| client `tokenAuthMethod` | `CLIENT_SECRET_BASIC` | this lab authenticates with HTTP Basic |

Set a cookie jar for the browser legs — `curl` is standing in for the user agent:

```bash
CJ="$(mktemp)"          # the "browser"
curl -s "$API/health"   # → {"status":"ok",...}
```

---

## Exercise 1 — Drive the authorization-code flow, leg by leg

### Leg 1 — the authorization request (front channel)

```bash
AUTH_URL="$API/authorization?response_type=code&client_id=$CLIENT_ID&redirect_uri=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' -- "$REDIRECT_URI")&scope=openid%20profile&state=Zx9qP2rLk7"

curl -s -i -c "$CJ" -b "$CJ" "$AUTH_URL" | head -n 1
curl -s -i -c "$CJ" -b "$CJ" "$AUTH_URL" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}'
```

```
HTTP/1.1 302 Found
/api/session/login?response_type=code&client_id=…&redirect_uri=…&scope=openid+profile&state=Zx9qP2rLk7
```

The AS has no session for you, so it redirects to **its own** login page (Module 01's credential boundary).
Note what this request did **not** contain: no client secret, no credential. It is safe on the front channel
precisely because it carries nothing worth stealing.

### Leg 2 — authenticate on the AS's page

```bash
LOGIN_PATH=$(curl -s -i -c "$CJ" -b "$CJ" "$AUTH_URL" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}')
CSRF=$(curl -s -b "$CJ" -c "$CJ" "http://localhost:3000$LOGIN_PATH" | grep -o 'name="_csrf" value="[^"]*"' | cut -d'"' -f4)
echo "csrf: ${#CSRF} chars"

NEXT=$(curl -s -i -b "$CJ" -c "$CJ" -X POST "$API/session/login" \
  -d "username=$LAB_USER" -d "password=$LAB_PASS" --data-urlencode "_csrf=$CSRF" \
  | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}')
echo "→ $NEXT"
```

```
csrf: 64 chars
→ /api/session/consent?clientId=…&clientName=test&scopes=openid,profile
```

Compare with Module 01, where this same POST returned **401 "Missing authorization context."** The only thing
that changed is that Leg 1 created a pending authorization request. That is the binding in action.

### Leg 3 — consent

```bash
CSRF2=$(curl -s -b "$CJ" -c "$CJ" "$API/session/consent" | grep -o 'name="_csrf" value="[^"]*"' | cut -d'"' -f4)

FINAL=$(curl -s -i -b "$CJ" -c "$CJ" -X POST "$API/session/consent" \
  -d "decision=approve" --data-urlencode "_csrf=$CSRF2" \
  | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}')
echo "$FINAL"
```

```
https://your-registered-callback/?state=Zx9qP2rLk7&code=EXAMPLE-authorization-code-43-chars&iss=https%3A%2F%2F…
```

> **If Leg 2 redirected straight to your callback instead of to `/api/session/consent`,** stored consent
> covered the request — `consent-store.service.ts` keeps `{clientId}:{subject}` → scopes for 24 h. Add
> `&prompt=consent` to `AUTH_URL` to force the screen (behavior documented in `docs/DATA-FLOWS.md`).

**Three things arrived through the browser:** `code`, `state`, and `iss`. Look at them and note that the
`code` is the *only* thing of value, and it is worth nothing without Leg 4.

### Leg 4 — the client checks `state`, then redeems the code (back channel)

```bash
CODE=$(node -e 'const u=new URL(process.argv[1]);process.stdout.write(u.searchParams.get("code")||"")' -- "$FINAL")
STATE=$(node -e 'const u=new URL(process.argv[1]);process.stdout.write(u.searchParams.get("state")||"")' -- "$FINAL")

[ "$STATE" = "Zx9qP2rLk7" ] && echo "state OK" || echo "STATE MISMATCH — abort the flow"

curl -s -u "$CLIENT_ID:$CLIENT_SECRET" -X POST "$API/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=$CODE" \
  --data-urlencode "redirect_uri=$REDIRECT_URI" \
  -d "client_id=$CLIENT_ID" > /tmp/tokens.json

node -e 'const j=require("/tmp/tokens.json");console.log(Object.keys(j).join(", "));console.log("scope:",j.scope,"| expires_in:",j.expires_in)'
```

```
access_token, token_type, expires_in, scope, refresh_token, id_token
scope: openid profile | expires_in: 86400
```

That `-u` is the whole security argument of this module: the code became a token only because the client could
authenticate. Anyone who read the URL in Leg 3 cannot do this.

**What just happened?** You moved a secret across two channels so that neither one alone was sufficient. The
browser saw a code it could not redeem; the token endpoint returned tokens the browser never saw. Every
mitigation in Modules 03–05 is a repair to one of these two legs.

## Exercise 2 — Inspect what you were given

Decode **locally**, never in an online decoder — these are live credentials.

```bash
AT=$(node -e 'process.stdout.write(require("/tmp/tokens.json").access_token)')
IDT=$(node -e 'process.stdout.write(require("/tmp/tokens.json").id_token)')

node docs/curriculum/scripts/decode-jwt.mjs "$AT"
```

```
Not a JWS (3 parts) or JWE (5 parts): got 1 segment(s).
If this is an opaque/reference access token, it has no readable structure —
introspect it instead (see Module 04).
```

**The access token is opaque** on this deployment — a 43-character reference, not a JWT. That is a
configuration choice, not a spec requirement: RFC 6749 deliberately says nothing about access-token format.
A resource server cannot read it; it must ask the AS (introspection, RFC 7662 — Module 04). Now the ID token:

```bash
node docs/curriculum/scripts/decode-jwt.mjs "$IDT"
```

```
HEADER:   { "alg": "HS256" }
PAYLOAD:  { "iss": "https://…", "sub": "admin", "aud": "<your client_id>",
            "exp": …, "iat": …, "auth_time": …, "acr": "pwd", "s_hash": "…" }
```

Two different artifacts with two different jobs: the **access token** is a capability the RS will check with
the AS; the **ID token** is a signed statement *about the user*, addressed to the client (`aud` is your
`client_id`). You will validate one properly in Module 08 — and note the tool's warning: you have decoded it,
not verified it.

Spend the access token:

```bash
curl -s -H "Authorization: Bearer $AT" "$API/userinfo"
# → {"sub":"admin","name":"admin",…,"preferred_username":"admin",…}
```

**Dashboard cross-check:** open `:3001` → **Grant Flows** and run the same flow with the UI, then look at
**TokenVault** in the sidebar. Same artifacts, prettier.

## Break it

Predict first, then run.

### Break 1 — replay the authorization code

**Predict:** you still have `$CODE`. It was already redeemed once. What happens on a second exchange?

```bash
curl -s -u "$CLIENT_ID:$CLIENT_SECRET" -X POST "$API/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" -d "code=$CODE" \
  --data-urlencode "redirect_uri=$REDIRECT_URI" -d "client_id=$CLIENT_ID" \
  -w '\nstatus=%{http_code}\n'
```

```json
{"error":"invalid_grant","error_description":"[A050305] No such authorization code.", …}
status=400
```

**Explain the gap.** A code is single-use; redemption consumes it. This matters more than it looks: if a code
is *ever* presented twice, one of the two presenters is not the legitimate client, so the correct AS response
is not merely to refuse — it is to treat the grant as compromised and revoke the tokens already issued from
that code. Note the error is `invalid_grant` from RFC 6749 §5.2's vocabulary, delivered as JSON on the back
channel. Nothing was redirected.

### Break 2 — lie about the `redirect_uri` at the token endpoint

Get a **fresh** code first (repeat Exercise 1, Legs 1–3), then:

```bash
curl -s -u "$CLIENT_ID:$CLIENT_SECRET" -X POST "$API/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" -d "code=$CODE" \
  --data-urlencode "redirect_uri=https://attacker.example/cb" -d "client_id=$CLIENT_ID" \
  -w '\nstatus=%{http_code}\n'
```

```json
{"error":"invalid_grant","error_description":"[A050309] The redirect URI contained in the token request does not match the one which was specified when the authorization code was created.", …}
status=400
```

**Explain the gap.** This is why §4.1.3 makes you repeat a parameter that appears to be redundant: the AS
pins the code to the `redirect_uri` used when it was created. An attacker who steals a code but wants it
delivered somewhere else cannot re-point it.

**Now observe something the spec does not mandate** — retry the *same* code with the correct URI:

```bash
curl -s -u "$CLIENT_ID:$CLIENT_SECRET" -X POST "$API/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" -d "code=$CODE" \
  --data-urlencode "redirect_uri=$REDIRECT_URI" -d "client_id=$CLIENT_ID" | head -c 80
# → {"access_token":"…
```

It still works. A *failed* exchange did not burn the code — only a *successful* one did (Break 1). That is
**Authlete's behavior**, not a spec requirement; RFC 9700's concern is reuse of an already-redeemed code.
Worth knowing before you write a detection rule that assumes otherwise.

### Break 3 — ask for an unregistered `redirect_uri`

**Predict:** the AS must report an error. Where does the error go — to the URI you supplied, or somewhere else?

```bash
curl -s -i "$API/authorization?response_type=code&client_id=$CLIENT_ID&redirect_uri=https%3A%2F%2Fattacker.example%2Fcb&scope=openid&state=evil" | head -n 1
curl -s "$API/authorization?response_type=code&client_id=$CLIENT_ID&redirect_uri=https%3A%2F%2Fattacker.example%2Fcb&scope=openid&state=evil"
```

```
HTTP/1.1 400 Bad Request
{"error":"invalid_request","error_description":"[A011304] The value of 'redirect_uri' (https://attacker.example/cb) is not registered.", …}
```

**Explain the gap — and note what is *absent*: there is no `Location` header.** The AS refused to redirect.
This is the error-channel rule from the lesson: an error may only be sent to a `redirect_uri` the AS has
already validated. Had it redirected this error, the AS would be an **open redirector** (RFC 9700 §4.11) —
an attacker could send phishing links that genuinely originate from the authorization server's own domain.

Try variations and confirm each is refused: a trailing character (`$REDIRECT_URI` + `x`), a different scheme,
an extra query parameter. Exact string matching (RFC 9700 §2.1) means *exact*.

### Break 4 — run the implicit grant and watch a token leak

**Predict:** `response_type=token` asks the AS to return the access token through the browser. Where exactly
does it end up, and who can see it?

> Requires `IMPLICIT` in your service's `supportedGrantTypes` and `TOKEN` in the client's response types.
> **Turn both back off when you are done** — you are deliberately enabling a retired grant.

```bash
IMP_URL="$API/authorization?response_type=token&client_id=$CLIENT_ID&redirect_uri=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' -- "$REDIRECT_URI")&scope=openid&state=implicitDemo"
CJ2="$(mktemp)"
LP=$(curl -s -i -c "$CJ2" -b "$CJ2" "$IMP_URL" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}')
C3=$(curl -s -b "$CJ2" -c "$CJ2" "http://localhost:3000$LP" | grep -o 'name="_csrf" value="[^"]*"' | cut -d'"' -f4)
curl -s -i -b "$CJ2" -c "$CJ2" -X POST "$API/session/login" \
  -d "username=$LAB_USER" -d "password=$LAB_PASS" --data-urlencode "_csrf=$C3" \
  | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}'
```

```
https://your-callback/#state=implicitDemo&access_token=EXAMPLE-opaque-token…&token_type=Bearer&expires_in=86400&scope=openid&iss=…
```

**Explain the gap.** There is no code and no token endpoint call — the **live access token is in the URL**,
after the `#`. Everything from Module 00 applies at once: it is in the browser's address bar, in history, in
any extension's reach, and — depending on the page — in `Referer` headers (RFC 9700 §4.2, §4.3). There was no
back-channel leg, so the AS had no opportunity to authenticate the client or bind the token to it
(§4.6). Compare the two redirects side by side: Leg 3 gave you something useless to a thief; this gives a
thief everything.

This is why RFC 9700 §2.1.2 says clients SHOULD NOT use the implicit grant, and why OAuth 2.1 removes it.

### Break 5 — a grant with no redirect at all

**Predict:** a TV cannot receive a redirect. What replaces it, and what does the device do while it waits?

```bash
curl -s -X POST "$API/device/authorization" -H "Content-Type: application/json" \
  -d "{\"parameters\":\"scope=openid&client_id=$CLIENT_ID\",\"clientId\":\"$CLIENT_ID\",\"clientSecret\":\"$CLIENT_SECRET\"}" \
  > /tmp/device.json
node -e 'const j=require("/tmp/device.json");console.log(JSON.stringify({user_code:j.user_code,verification_uri:j.verification_uri,expires_in:j.expires_in,interval:j.interval},null,1))'
```

```json
{ "user_code": "NRHSJMBS",
  "verification_uri": "https://…/api/device/verification",
  "expires_in": 600, "interval": 5 }
```

**These are RFC 8628 §3.2's names, and `action` is gone.** Until 2026-08-14 this endpoint returned Authlete's
envelope — `userCode`, `verificationUri`, an `action` and a `resultCode` — so a device implementing §3.2 found
none of the fields it was looking for (work item **8628-W3**). Authlete's response has always carried the
§3.2-shaped JSON in a `responseContent` member; the server was returning the wrapper instead of the contents.

Now poll the token endpoint **before** approving anything:

```bash
DC=$(node -e 'process.stdout.write(require("/tmp/device.json").deviceCode)')
curl -s -u "$CLIENT_ID:$CLIENT_SECRET" -X POST "$API/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:device_code" \
  -d "device_code=$DC" -d "client_id=$CLIENT_ID" -w '\nstatus=%{http_code}\n'
```

```json
{"error":"authorization_pending","error_description":"[A242307] The device authorization request has not been authorized yet.", …}
status=400
```

**Explain the gap.** No `redirect_uri` appears anywhere in this grant — so the entire family of redirect
attacks (Breaks 2–4, RFC 9700 §4.1, §4.11) is structurally inapplicable. In exchange you inherit a different
problem: the user authorizes a device identified only by an eight-character code they were told to type.
`interval: 5` and `expires_in: 600` are your only rate and time bounds; `authorization_pending` and
`slow_down` (RFC 8628 §3.5) are how the AS keeps a polling device honest. To finish the flow, open
`verificationUri` in a browser and enter the `user_code` — see `docs/DEVICE-FLOW-TUTORIAL.md`.

## Verification — you're done when

- [ ] You completed all four legs of the code flow with `curl` and can say, for each, whether it crossed the
      front or the back channel and who could read it.
- [ ] You can explain why the `code` in Leg 3 is safe to expose but the `access_token` in Break 4 is not.
- [ ] Replaying a code returns **`invalid_grant`**, and you can say what an AS *should* do beyond refusing.
- [ ] A mismatched `redirect_uri` at the token endpoint returns **`invalid_grant`**, and you can explain why
      §4.1.3 repeats a parameter that looks redundant.
- [ ] An unregistered `redirect_uri` returns **400 with no `Location` header**, and you can name the attack
      that redirecting it would enable.
- [ ] The implicit grant puts a live access token in a URL fragment, and you can cite the two RFC 9700
      sections about where it leaks.
- [ ] The device grant issues a `user_code` with **no `redirect_uri` anywhere**, and polling returns
      `authorization_pending`.
- [ ] You turned `IMPLICIT` back off in your service configuration.

## What was real vs. simulated

- Every request and response above is **real**: a genuine authorization code, genuine tokens, and genuine
  refusals from Authlete via the running server.
- `curl` + a cookie jar is standing in for the **user agent**. That is faithful for the HTTP legs, but a real
  browser adds behaviors this lab cannot show — `Referer` headers, history, extensions, and the address bar
  that makes Break 4 dangerous in practice.
- **Opaque access tokens** are this deployment's configuration, not a spec requirement. RFC 6749 defines no
  access-token format; other deployments issue JWTs (RFC 9068, Module 04).
- Errors with bracketed codes (`[A050305]`, `[A050309]`, `[A011304]`, `[A242307]`) are **Authlete vendor
  behavior**. The `error` values themselves (`invalid_grant`, `invalid_request`, `authorization_pending`) are
  spec-defined — RFC 6749 §5.2 and RFC 8628 §3.5.
- **A failed token exchange not consuming the code** (Break 2) is observed Authlete behavior, not a
  normative rule. Do not build detection logic on it without checking your own AS.
- The `s_hash` claim in the ID token and `acr: "pwd"` come from this deployment's step-up binding
  (`AGENTS.md`, RFC 9470) — Module 09a. Ignore them for now.
