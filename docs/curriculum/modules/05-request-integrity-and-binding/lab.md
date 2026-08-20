# Module 05 — Lab: Hide the request, sign the proof, break the binding

**The short version:** you will push an authorization request to the back channel and prove the handle is
single-use; **sign a request object with your own key and watch the URL lose an argument with it**; find `iss`
in every response; then build a DPoP proof by hand, obtain a `token_type: DPoP` token, **compute its key
thumbprint yourself and match it against `cnf.jkt`**, and break the proof three ways. You finish by spending
that token at a protected resource and then failing to downgrade it — presenting it as a `Bearer` token, which
RFC 9449 §7.2 says the resource **MUST** refuse.

Every transcript below was captured by running the commands on this page verbatim. If yours differs, that is a
finding — read the troubleshooting table at the end before assuming you made a mistake.

## Setup

```bash
npm --prefix server run dev
cd docs/curriculum/scripts && set -a && source curriculum.env && set +a && cd -
export PRU="http://localhost:3001/callback"
```

**What each exercise needs**, all of it from `curriculum.env`:

| Exercise | Needs |
|---|---|
| 1 — PAR | `$API`, `$PUB_CLIENT_ID` |
| 2 — JAR | `$API`, `$CLIENT_ID`, `$MGMT_CLIENT_ID`, `$MGMT_CLIENT_SECRET` |
| 2, optional last step | `$PKJWT_CLIENT_ID`, `$PKJWT_PRIVATE_JWK` — **skip that step if these are blank** |
| 3 — `iss` | `$API`, `$PUB_CLIENT_ID` |
| 4 — DPoP | `$API`, `$PUB_CLIENT_ID`, `$LAB_USER`, `$LAB_PASS` |
| 5 — spend it | `$API`, `$CLIENT_ID`, `$CLIENT_SECRET` |

Check yours before you start — a blank value produces a confusing error much later:

```bash
for v in API PUB_CLIENT_ID CLIENT_ID CLIENT_SECRET MGMT_CLIENT_ID MGMT_CLIENT_SECRET LAB_USER LAB_PASS; do
  printf '%-20s %s\n' "$v" "$([ -n "${!v}" ] && echo set || echo '** BLANK **')"
done
printf '%-20s %s\n' PKJWT_CLIENT_ID "$([ -n "$PKJWT_CLIENT_ID" ] && echo set || echo 'blank — skip Exercise 2 Step 7')"
```

If something is blank, fill it in `docs/curriculum/scripts/curriculum.env`; `curriculum.env.example` explains
what each one is.

You also need the `getcode` helper from [Module 03's lab](../03-pkce-and-public-clients/lab.md#setup).

> **`parRequired` must be `false` on `$PUB_CLIENT_ID`** — the value Module 03's setup table asks for.
> Exercise 1 pushes a request *by choice*; Exercises 3 and 4 send plain authorization requests, and with
> `parRequired: true` the AS rejects those before anything interesting happens:
>
> ```json
> {"error":"invalid_request","error_description":"[A008305] The 'request_uri' parameter must be given because the 'require_pushed_authorization_requests' client metadata is true."}
> ```
>
> Exercise 3 then finds no `iss` (the response is a 400 body, not a redirect) and Exercise 4's flow script
> dies with `TypeError: Invalid URL` on an empty `Location`. If you see either, flip `parRequired` back to
> `false` in the Authlete console. **Making PAR mandatory is a per-client decision** — you will read the
> argument for turning it on in the lesson, and FAPI 2.0 requires it. Turn it on after this module, not
> during.

**Paste this helper** — Exercises 1 and 2 use it. Module 03's `run_flow` builds its own authorization URL from
`response_type`/`redirect_uri`/`scope`, which is exactly what PAR and JAR move off the URL, so it cannot drive
a `request_uri` or a `request`. This is the same login-then-consent sequence, but it drives a URL **you**
supply:

```bash
run_flow_url() {                   # run_flow_url "<full authorization URL>" ; echoes the final redirect URL
  local AU="$1" J; J="$(mktemp)"
  local L1; L1=$(curl -s -i -c "$J" -b "$J" "$AU" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}')
  case "$L1" in http*) echo "$L1"; return;; esac                    # already an error redirect — hand it back
  [ -z "$L1" ] && { echo "!! authorization request failed:"; curl -s "$AU" | head -c 300; return 1; }
  local C1; C1=$(curl -s -b "$J" -c "$J" "http://localhost:3000$L1" | grep -o 'name="_csrf" value="[^"]*"' | cut -d'"' -f4)
  local L2; L2=$(curl -s -i -b "$J" -c "$J" -X POST "$API/session/login" \
      -d "username=$LAB_USER" -d "password=$LAB_PASS" --data-urlencode "_csrf=$C1" \
      | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}')
  case "$L2" in http*) echo "$L2"; return;; esac                    # consent was already stored — skip it
  local C2; C2=$(curl -s -b "$J" -c "$J" "$API/session/consent" | grep -o 'name="_csrf" value="[^"]*"' | cut -d'"' -f4)
  curl -s -i -b "$J" -c "$J" -X POST "$API/session/consent" -d "decision=approve" --data-urlencode "_csrf=$C2" \
      | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}'
}
```

**Save the DPoP helper** — Exercises 4 and 5 both use it:

```bash
cat > /tmp/dpop.mjs <<'EOF'
import crypto from "node:crypto";
const b64u = (b) => Buffer.from(b).toString("base64url");
export const makeKey  = () => crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
export const publicJwk = (pk) => { const j = pk.export({ format: "jwk" });
  return { kty: j.kty, crv: j.crv, x: j.x, y: j.y }; };
export const ath = (t) => crypto.createHash("sha256").update(t, "ascii").digest("base64url");
export function proof({ privateKey, publicKey, htm, htu, ath: a, der = false, omitJwk = false }) {
  const header  = omitJwk ? { typ:"dpop+jwt", alg:"ES256", kid:"k1" }
                          : { typ:"dpop+jwt", alg:"ES256", jwk: publicJwk(publicKey) };
  const payload = { jti: crypto.randomUUID(), htm, htu, iat: Math.floor(Date.now()/1000) };
  if (a) payload.ath = a;
  const input = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  // RFC 9449 uses JWS ES256: the signature is raw R||S (IEEE P1363), NOT DER.
  const sig = der ? crypto.sign("sha256", Buffer.from(input), { key: privateKey })
                  : crypto.sign("sha256", Buffer.from(input), { key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${input}.${b64u(sig)}`;
}
EOF
```

---

## Exercise 1 — Push the request to the back channel (PAR)

```bash
V=$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64url"))')
CH=$(node -e 'process.stdout.write(require("crypto").createHash("sha256").update(process.argv[1]).digest("base64url"))' -- "$V")
PARAMS="response_type=code&client_id=$PUB_CLIENT_ID&redirect_uri=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' -- "$PRU")&scope=profile&state=PAR1&code_challenge=$CH&code_challenge_method=S256"

curl -s -X POST "$API/par" -H "Content-Type: application/json" \
  -d "$(node -e 'process.stdout.write(JSON.stringify({parameters:process.argv[1],clientId:process.argv[2]}))' -- "$PARAMS" "$PUB_CLIENT_ID")" \
  -w '\nstatus=%{http_code}\n' | head -c 400
```

```
{"expires_in":600,"request_uri":"urn:ietf:params:oauth:request_uri:riYUkEnxqeLoe1zFYUaDX9ESeOP4gocaw1t9zAGVIt8"}
status=201
```

**201 Created**, as RFC 9126 §2.2 requires, with a 600-second lifetime — the top of the spec's *"between 5 and
600 seconds"* range. Now use it. Note how little crosses the browser:

```bash
RQU=$(curl -s -X POST "$API/par" -H "Content-Type: application/json" \
  -d "$(node -e 'process.stdout.write(JSON.stringify({parameters:process.argv[1],clientId:process.argv[2]}))' -- "$PARAMS" "$PUB_CLIENT_ID")" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>process.stdout.write(JSON.parse(d).request_uri))')

AUTH_URL="$API/authorization?client_id=$PUB_CLIENT_ID&request_uri=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' -- "$RQU")"
echo "$AUTH_URL"
```

**Two parameters.** No `scope`, no `redirect_uri`, no `code_challenge`, no `state` — all of them are on the AS
already. There is nothing in this URL for a browser extension to read or rewrite. Compare with the
authorization URL in Module 02.

Now complete the flow. `run_flow_url` logs in and approves consent for you, then echoes the final redirect:

```bash
REDIRECT=$(run_flow_url "$AUTH_URL")
echo "$REDIRECT"
echo "code: $(getcode "$REDIRECT")"
```

```
http://localhost:3001/callback?state=PAR1&code=GXLVNlUOmBNK1XOJG1YHDDfUBVp9nGzMe09NMu8XIHs&iss=https%3A%2F%2F…
code: GXLVNlUOmBNK1XOJG1YHDDfUBVp9nGzMe09NMu8XIHs
```

A normal authorization code came back — the flow is identical from here on. **`state=PAR1` is on the callback
even though you never put it in the URL**: it came out of the pushed request, which is the whole point. And
`iss` is already there; you will come back to it in Exercise 3.

### Break it — reuse the `request_uri`

RFC 9126 §4: *"the client MUST only use a 'request_uri' value once."* **Predict**, then replay the same URL:

```bash
curl -s -c "$(mktemp)" "$AUTH_URL" | head -c 220; echo
```

```json
{"error":"invalid_request_uri","error_description":"[A008303] The value of 'request_uri' parameter is not registered.","error_uri":"https://docs.authlete.com/#A008303"}
```

**Explain the gap.** The handle is consumed on first use. If it were replayable, an attacker who captured it
from the browser could re-run the same pre-authorized request — reintroducing exactly the request-fixation
problem PAR exists to remove. Note also that a *stolen* handle is far less useful than a stolen URL: it is
opaque, bound to its client, single-use, and expires in 600 seconds.

## Exercise 2 — Sign a request object, then break it (JAR)

PAR moved the request off the URL. JAR does something different: it lets the client **prove it authored** the
request. You will refuse an unsigned object, register a client signing key, get a signed one accepted, and then
break it three ways — each with a different error code.

**Use the confidential client here** (`$CLIENT_ID`), not `$PUB_CLIENT_ID`. A public client with a registered
signing key is a contradiction: having nowhere safe to keep a private key is the whole definition of public.

### Setup for this exercise

The request object's `aud` must be **this service's issuer identifier**, so read it from the discovery document
rather than hardcoding it:

```bash
ISS=$(curl -s "$API/.well-known/openid-configuration" \
 | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>process.stdout.write(JSON.parse(d).issuer))')
echo "aud will be: $ISS"
export CID="$CLIENT_ID"
```

**Save the JAR helper** — every step below uses it:

```bash
cat > /tmp/jar.mjs <<'EOF'
import crypto from "node:crypto"; import fs from "node:fs";
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
export const loadKey = () => crypto.createPrivateKey(fs.readFileSync("/tmp/jar-client-private.pem"));
// A signed request object. `over` overrides any claim; alg:"none" drops the signature entirely.
export function requestObject({ clientId, iss, over = {}, alg = "ES256", key, kid = "client-jar-1" }) {
  const claims = {
    iss: clientId, aud: iss, response_type: "code", client_id: clientId,
    redirect_uri: "http://localhost:3001/callback", scope: "profile", state: "JAR2",
    nbf: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + 50, ...over,
  };
  if (alg === "none") return `${b64u({ alg:"none", typ:"oauth-authz-req+jwt" })}.${b64u(claims)}.`;
  const input = `${b64u({ alg, typ:"oauth-authz-req+jwt", kid })}.${b64u(claims)}`;
  const sig = crypto.sign("sha256", Buffer.from(input), { key: key ?? loadKey(), dsaEncoding: "ieee-p1363" });
  return `${input}.${sig.toString("base64url")}`;
}
export const throwawayKey = () => crypto.generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
// The key from PKJWT_PRIVATE_JWK — a client key already registered on this service (last step).
export const registeredKey = () => crypto.createPrivateKey({ key: JSON.parse(process.env.PKJWT_PRIVATE_JWK), format: "jwk" });
EOF

jar() {   # jar '<js expression building the object>'  -> posts it to /api/jar/process
  node --input-type=module -e '
  const J = await import("/tmp/jar.mjs");
  const fs = await import("node:fs");
  const jwt = '"$1"';
  fs.writeFileSync("/tmp/jar-body.json", JSON.stringify({request: jwt, clientId: process.env.CID}));
  '
  curl -s -X POST "$API/jar/process" -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" \
    -H "Content-Type: application/json" --data-binary @/tmp/jar-body.json \
    | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d);
        console.log("action:",j.action);console.log(j.resultMessage);
        if(j.scopes)console.log("scopes:",JSON.stringify(j.scopes.map(s=>s.name||s)));})'
}
```

> **Why that `curl` authenticates.** `/api/jar/process` is this repo's own debugging endpoint — no RFC defines
> it — and it needs admin credentials. The reason is a field you will *not* see in any output below: Authlete's
> authorization response carries a **`ticket`**, and a ticket is a credential. Whoever holds one can drive an
> authorization to completion. The endpoint returns only `action`, `resultCode`, `resultMessage`,
> `responseContent` and `scopes`, and drops everything else. When you build a debugging endpoint of your own,
> ask the same two questions: *what does the upstream response contain that I am about to forward?*, and *who
> is allowed to ask?*

### Step 1 — start from a known state

**Do not skip this.** This exercise is about *which* error the AS returns, and the answer depends on what is
already registered on the client. If you or anyone else has run this lab before, a key is still there and you
will see a different code at Step 3 than the one printed below. Empty the client's key set first:

```bash
curl -s -X PATCH "$API/client/update/$CID" -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" \
  -H "Content-Type: application/json" -d '{"jwks":"{\"keys\":[]}"}' \
  -o /dev/null -w 'status=%{http_code}\n'
```

```
status=200
```

### Step 2 — an unsigned object is refused

```bash
jar 'J.requestObject({clientId: process.env.CID, iss: "'"$ISS"'", alg: "none"})'
```

```
action: BAD_REQUEST
[A008311] The service is configured to conform to JAR (JWT Secured Authorization Request), so request objects must be always signed.
```

**Explain the gap.** This is RFC 9101 §10.1 enforced: the request object *"MUST be either signed using JWS…
or signed and then encrypted."* An `alg:none` request object is Module 00's forgery, wearing a request
object's clothes — if it were accepted, anyone could author an authorization request as any client.

> **If you get `[A006359]` instead** — *"The value of the 'aud' claim … does not match the issuer identifier of
> this service"* — your `aud` is wrong, and you never reached the check this exercise is about. That is worth
> noticing rather than skipping past: **the AS validates `aud` before it validates that the object is signed.**
> An unsigned object addressed to the wrong audience is rejected for the audience, so a single error code tells
> you only about the *first* thing that failed. When you are debugging a request object, fix errors in the order
> the server finds them and re-test after each one — assuming the last error is the only error is how people
> conclude a feature is broken when they have three problems stacked up.

### Step 3 — the trap: which JWKS?

A signed object must be verifiable against a key the AS holds **for that client**. Try it before registering
anything, and read the error carefully:

```bash
jar 'J.requestObject({clientId: process.env.CID, iss: "'"$ISS"'", key: J.throwawayKey()})'
```

```
action: BAD_REQUEST
[A005352] The registered JWK Set does not contain the public key to verify the signature of the request object passed by 'request' parameter. (alg=ES256, kid=client-jar-1)
```

Notice how specific that is: the AS tells you the `alg` and the `kid` it went looking for. That is the most
useful of the three key-related codes you will meet in this exercise:

| Code | Means |
|---|---|
| `[A005332]` | the client has **no** `jwks` and no `jwks_uri` at all |
| `[A005352]` | it has a key set, but **nothing in it matches** this `alg`/`kid` — what you just saw |
| `[A005328]` | a matching key was found and the **signature did not verify** — you will see this at Step 5 |

**"Registered" means on the client — and this is where people lose an afternoon.** There are two entirely
separate JWKS slots in an Authlete service, pointing in opposite directions:

| | **Service** JWKS | **Client** JWKS |
|---|---|---|
| Whose keys | the authorization server's | the client's |
| The AS holds | private **and** public | public only |
| Published at | `jwks_uri` → `/api/.well-known/jwks.json` | nowhere; it is client metadata |
| Used to | **sign** ID tokens, JWT access tokens, JARM | **verify** request objects (JAR), `private_key_jwt` |
| Direction | AS → client | client → AS |

Look at what your service publishes:

```bash
curl -s "$API/.well-known/jwks.json" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>console.log(JSON.parse(d).keys.map(k=>({kty:k.kty,crv:k.crv,alg:k.alg,use:k.use,kid:k.kid,hasPrivate:!!k.d}))))'
```

Those are the **AS's** keys. You cannot sign a request object with them — you do not have the private half, and
you should not. Putting a JWKS there does nothing for JAR.

### Step 4 — generate a client key and register it

Generate it **locally**. A private key should not be produced by, or pass through, a third-party website:

```bash
node -e '
const crypto = require("crypto"), fs = require("fs");
const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const pub = publicKey.export({ format: "jwk" });
fs.writeFileSync("/tmp/jar-client-private.pem", privateKey.export({type:"pkcs8",format:"pem"}));
fs.writeFileSync("/tmp/jar-client-jwks.json", JSON.stringify({ keys: [ { ...pub, kid: "client-jar-1", use: "sig", alg: "ES256" } ] }));
console.log("private half -> /tmp/jar-client-private.pem   (never leaves this machine)");
console.log("public half  -> /tmp/jar-client-jwks.json     (this is what the AS gets)");
console.log("contains private d:", !!pub.d, " <- must be false");
'
```

```
private half -> /tmp/jar-client-private.pem   (never leaves this machine)
public half  -> /tmp/jar-client-jwks.json     (this is what the AS gets)
contains private d: false  <- must be false
```

**Check `d` is absent** before registering. A JWK with a `d` member is a private key, and putting one in a
client record leaks it. The command prints the check for you.

Now register the public half:

```bash
curl -s -X PATCH "$API/client/update/$CID" -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" \
  -H "Content-Type: application/json" \
  -d "$(node -e 'process.stdout.write(JSON.stringify({jwks: require("fs").readFileSync("/tmp/jar-client-jwks.json","utf8")}))')" \
  -o /dev/null -w 'status=%{http_code}\n'
```

```
status=200
```

> You can do this in the Authlete console instead — your **client** (`$CLIENT_ID`) → **JWK Set Content** —
> and it is worth looking at the field once so you know where it lives. Either way, **leave *Request Object
> Signature Algorithm* unset.** If you pin it to `ES256`, Step 2's `alg:none` starts failing with `[A005336]`,
> a *client-level* algorithm mismatch, instead of `[A008311]`, the *service-level* "JAR requires signing"
> check. Both are correct rejections of the same object; pinning simply moves which guard fires first. That is
> Step 2's lesson about error ordering, showing up again in your own config.

### Step 5 — a properly signed object is accepted

```bash
V=$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64url"))')
CH=$(node -e 'process.stdout.write(require("crypto").createHash("sha256").update(process.argv[1]).digest("base64url"))' -- "$V")
jar 'J.requestObject({clientId: process.env.CID, iss: "'"$ISS"'", over: {code_challenge: "'"$CH"'", code_challenge_method: "S256"}})'
```

```
action: INTERACTION
[A004001] Authlete has successfully issued a ticket to the service (API Key = …) for the authorization request from the client (ID = …). [response_type=code, openid=false]
scopes: ["profile"]
```

**`INTERACTION` means accepted** — the AS verified your signature, unpacked the object, and is ready to ask the
user to log in. Note `scopes: ["profile"]`: that came out of the **signed** JWT. Nothing on any URL said
`profile`.

### Break it — three ways to get a request object wrong

Each produces a different code, which is the point: the response tells you which check failed.

```bash
# Wrong key — signed with a key the AS has never seen
jar 'J.requestObject({clientId: process.env.CID, iss: "'"$ISS"'", key: J.throwawayKey()})'
```

```
action: BAD_REQUEST
[A005328] The signature of the request object passed by 'request' parameter was not verified.
```

The object is perfectly well-formed and genuinely signed — with the wrong key. Compare with `[A005352]` at
Step 3: *no matching key* and *matching key, bad signature* are different failures, and the codes distinguish
them.

```bash
# Wrong audience — addressed to a different AS
jar 'J.requestObject({clientId: process.env.CID, iss: "https://wrong.example.com"})'
```

```
action: BAD_REQUEST
[A006359] The value of the 'aud' claim in the request object passed by the 'request' parameter does not match the issuer identifier of this service.
```

`aud` is what stops an object minted for one AS being replayed at another — the request-object analogue of
`htu` on a DPoP proof.

```bash
# Expired — nbf and exp both in the past
jar 'J.requestObject({clientId: process.env.CID, iss: "'"$ISS"'", over: {nbf: Math.floor(Date.now()/1000)-600, exp: Math.floor(Date.now()/1000)-300}})'
```

```
action: BAD_REQUEST
[A006339] The request object passed by the 'request' parameter has already expired: now=1787199390, exp=1787199090, skew=0
```

Note `skew=0`. This service allows no clock tolerance, and its `nbfOptional` flag is `false` — so a request
object **must carry `nbf`**, which is what lets its lifetime be bounded at all. The bound that matters in
practice comes from [FAPI 1.0 Part 2 §5.2.2](https://openid.net/specs/openid-financial-api-part-2-1_0.html):
`exp` no more than **60 minutes** after `nbf`, and `nbf` no more than **60 minutes** in the past. A signed
request object is a bearer artifact until it expires, which is why the window is bounded at all.

Now get it right again, so you have a good object for the next step:

```bash
jar 'J.requestObject({clientId: process.env.CID, iss: "'"$ISS"'", over: {code_challenge: "'"$CH"'", code_challenge_method: "S256"}})'
```

```
action: INTERACTION
```

### Step 6 — the payoff: the object outranks the URL

Now use it as a real client would. RFC 9101 §5 puts only `client_id` and `request` on the URL — everything else
lives inside the signature:

```bash
RO=$(node --input-type=module -e '
const J = await import("/tmp/jar.mjs");
process.stdout.write(J.requestObject({clientId: process.env.CID, iss: "'"$ISS"'",
  over: {code_challenge: "'"$CH"'", code_challenge_method: "S256"}}));
')

REDIRECT=$(run_flow_url "$API/authorization?client_id=$CID&request=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' -- "$RO")")
echo "$REDIRECT"
```

```
http://localhost:3001/callback?state=JAR2&code=Ys0ycAohgSTAmb6oSoReRtJfXwDMk4zrJJchm_XLvDs&iss=https%3A%2F%2F…
```

**Two parameters on the URL, and a full authorization code back.** Now the important part — **predict** what
happens if the URL contradicts the object. Here the URL asks for `scope=openid` and `state=URL_WINS`, and the
signed object says `scope=profile` and `state=JAR2`:

```bash
REDIRECT2=$(run_flow_url "$API/authorization?client_id=$CID&scope=openid&state=URL_WINS&request=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' -- "$RO")")
echo "$REDIRECT2"
```

```
http://localhost:3001/callback?state=JAR2&code=DlsRBNO0W7e0virjBZ4IdfE7-vRx_AtYKCowYj0zH3s&iss=https%3A%2F%2F…
```

**`state=JAR2`, not `URL_WINS`.** Now exchange that code and check the scope too — the URL asked for `openid`:

```bash
curl -s -X POST "$API/token" -u "$CID:$CLIENT_SECRET" \
  -d "grant_type=authorization_code" -d "code=$(getcode "$REDIRECT2")" \
  --data-urlencode "redirect_uri=$PRU" -d "code_verifier=$V" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d);console.log("scope:",j.scope,"| id_token present:",!!j.id_token)})'
```

```
scope: profile | id_token present: false
```

RFC 9101 §6.3: *"The authorization server MUST only use the parameters in the Request Object, even if the same
parameter is provided in the query parameter."* The URL is not merged, not preferred, not consulted — it is
**ignored**. No `openid` scope, so no ID token.

**Explain the gap.** This is what JAR buys that PAR does not. PAR hides the request; JAR makes it
*tamper-evident*. An attacker who can rewrite the query string can add `scope=openid`, swap `redirect_uri`, or
strip `code_challenge` — and against a JAR request every one of those edits is discarded, because they are not
covered by the signature. An AS that *merged* query parameters into a request object would hand that power
straight back, which is why §6.3 is a MUST and why `traditionalRequestObjectProcessingApplied: false` matters
in the service config.

### Step 7 (optional) — a client with the algorithm pinned

**Skip this step if `$PKJWT_CLIENT_ID` is blank** — nothing later depends on it.

Steps 3–5 are the exercise: you generated a key, registered it, and watched the error move. But that setup is
throwaway. This service also carries a client that is *permanently* registered for asymmetric JAR:
`$PKJWT_CLIENT_ID`, with a JWKS **and** `requestSignAlg: ES256` pinned. Point the helper at it:

```bash
CID_SAVE="$CID"; export CID="$PKJWT_CLIENT_ID"
KID=$(node -e 'process.stdout.write(JSON.parse(process.env.PKJWT_PRIVATE_JWK).kid)')

# This client has `pkceRequired: true` — unlike $CLIENT_ID, which Module 02 keeps permissive on purpose.
# Reuse the $CH from Step 5, or mint a fresh pair:
V=$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64url"))')
CH=$(node -e 'process.stdout.write(require("crypto").createHash("sha256").update(process.argv[1]).digest("base64url"))' -- "$V")

jar 'J.requestObject({clientId: process.env.CID, iss: "'"$ISS"'", key: J.registeredKey(), kid: "'"$KID"'",
  over: {code_challenge: "'"$CH"'", code_challenge_method: "S256"}})'
```

```
action: INTERACTION
[A004001] Authlete has successfully issued a ticket to the service (API Key = …) for the authorization request from the client (ID = …). [response_type=code, openid=false]
scopes: ["profile"]
```

> **Drop the `code_challenge` and you get `[A124301]`, not a signature error** — and that is worth doing
> once. The AS answers `action: LOCATION` with *"The authorization request does not contain 'code_challenge'
> parameter"*, which means your **signature already verified**: the request object was unpacked and its
> contents checked before PKCE was evaluated. A failed signature is `[A005328]` and never gets that far.
> Two clients, two PKCE postures, the same signed object — this is the table in `AGENTS.md` showing up in
> your own terminal.

No console step, no `/tmp` key. Now send the **unsigned** object to this client and compare with Step 2, which
sent the identical object to `$CLIENT_ID`:

```bash
jar 'J.requestObject({clientId: process.env.CID, iss: "'"$ISS"'", alg: "none"})'
export CID="$CID_SAVE"
```

```
action: BAD_REQUEST
[A005336] The request object passed by 'request' parameter is not signed but the registered value of
'request_object_signing_alg' is neither 'none' nor null.
```

**`[A005336]`, not `[A008311]`.** Same object, same service, two clients, two different guards firing. The
service-level check ("JAR must be signed") never runs for this client because the *client-level* check ("you
promised `ES256`") rejects it first. Two lessons stacked: error codes identify a **guard**, not a **cause**;
and pinning `request_object_signing_alg` per client is what makes a downgrade to `none` impossible for that
client no matter how the service is configured.

## Exercise 3 — Find `iss` everywhere

RFC 9207 §2 requires the AS to include `iss` in authorization responses *"including error responses."* Check
both:

```bash
echo "advertised?"
curl -s "$API/.well-known/openid-configuration" \
 | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>console.log("  authorization_response_iss_parameter_supported =",JSON.parse(d).authorization_response_iss_parameter_supported))'

ENC=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' -- "$PRU")
echo "on an ERROR response:"
curl -s "$API/authorization?response_type=code&client_id=$PUB_CLIENT_ID&redirect_uri=$ENC&scope=profile&state=E1&resource=%2Fnot-absolute" \
 | grep -o 'iss=[^&"]*'
```

```
advertised?
  authorization_response_iss_parameter_supported = true
on an ERROR response:
iss=https%3A%2F%2F…
```

Go back to any successful callback URL from Modules 02–04: `iss` is on those too. **The AS side is done for
you. The control is the client checking it** (§2.4: *"If the value does not match the expected issuer
identifier, clients MUST reject the authorization response and MUST NOT proceed with the authorization
grant."*). Write the check as three lines of pseudocode and note that nothing in this repo's flow would break
if you deleted it — which is precisely why it gets forgotten.

### Where does *"the expected issuer identifier"* come from?

§2.4 tells the client to compare `iss` against the issuer it expected, and says nothing about how the client
got that value. **It comes from discovery, and RFC 8414 §3.3 is what makes it trustworthy** — the `issuer`
value *"MUST be identical to the issuer identifier value into which the well-known URI string was inserted to
create the URL used to retrieve the metadata"*. So RFC 9207 has a precondition it never states: mix-up
protection is only as good as the correspondence between the `issuer` in the metadata document and the URL the
document was fetched from.

Look at yours:

```bash
curl -s "$API/.well-known/openid-configuration" | jq -r '.issuer, .authorization_endpoint, .token_endpoint'
```

```
https://oauth2-0-ekh2.onrender.com
https://oauth2-0-ekh2.onrender.com/api/authorization
https://oauth2-0-ekh2.onrender.com/api/token
```

> **Expect a mismatch here, and understand why it is not a bug.** You fetched that document from
> `http://localhost:3000`, and it names a completely different host. That is because your local server is a
> front end onto a **shared Authlete service**, and that service's issuer identifier is the deployed URL. The
> §3.3 self-consistency check is a claim about the *deployed* issuer, not about your laptop: fetch
> `https://oauth2-0-ekh2.onrender.com/.well-known/openid-configuration` and every URL above lines up with
> where you got it from.
>
> This matters more than it looks. If the `issuer` and the endpoints genuinely disagreed, two opposite things
> would go wrong: a strict client rejects every response and the flow simply breaks, while a lenient client
> skips the comparison as unworkable and **loses the mix-up defence entirely** — silently, which is the worse
> one.
>
> The takeaway for the exercise you just ran: **`iss` being present and correct proves the AS half only.** The
> client half needs a value to compare against, and that value comes from a different document, fetched at a
> different time, by a different rule. Two specifications, one control; neither is sufficient alone.

## Exercise 4 — Build a DPoP proof and bind a token

```bash
node --input-type=module -e '
const M = await import("/tmp/dpop.mjs");
const {privateKey, publicKey} = M.makeKey();
const p = M.proof({privateKey, publicKey, htm:"POST", htu:"'"$API"'/token"});
const [h, pl, s] = p.split(".");
console.log("header :", Buffer.from(h,"base64url").toString());
console.log("payload:", Buffer.from(pl,"base64url").toString());
console.log("sig    :", Buffer.from(s,"base64url").length, "bytes");
'
```

```
header : {"typ":"dpop+jwt","alg":"ES256","jwk":{"kty":"EC","crv":"P-256","x":"…","y":"…"}}
payload: {"jti":"…","htm":"POST","htu":"http://localhost:3000/api/token","iat":1787199241}
sig    : 64 bytes
```

Check each element against RFC 9449 §4.2: `typ`, `alg`, `jwk` in the header (and note the `jwk` has no `d` —
*"MUST NOT contain a private key"*); `jti`, `htm`, `htu`, `iat` in the payload. **64 bytes** is the raw
P1363 `R‖S` signature — remember that number, it is the first break.

Now run a flow and exchange the code **with** the proof. Save this as `/tmp/dpopflow.mjs` and run it — it
drives the whole flow and keeps the key:

```bash
cat > /tmp/dpopflow.mjs <<'EOF'
import crypto from "node:crypto"; import fs from "node:fs";
import { execSync } from "node:child_process";
const M = await import("/tmp/dpop.mjs");
const API = process.env.API, PCID = process.env.PUB_CLIENT_ID, PRU = process.env.PRU;
const sh = c => execSync(c, {encoding:"utf8"});
const loc = o => { const m = o.split("\n").find(l => /^location:/i.test(l.trim())); return m ? m.split(/:\s/)[1].trim() : ""; };
const jar = sh("mktemp").trim();
const v  = crypto.randomBytes(32).toString("base64url");
const ch = crypto.createHash("sha256").update(v).digest("base64url");
const au = `${API}/authorization?response_type=code&client_id=${PCID}&redirect_uri=${encodeURIComponent(PRU)}&scope=profile&state=D1&code_challenge=${ch}&code_challenge_method=S256`;
let l = loc(sh(`curl -s -i -c ${jar} -b ${jar} "${au}"`));
const c1 = (sh(`curl -s -b ${jar} -c ${jar} "http://localhost:3000${l}"`).match(/name="_csrf" value="([^"]*)"/)||[])[1];
let l2 = loc(sh(`curl -s -i -b ${jar} -c ${jar} -X POST "${API}/session/login" -d "username=${process.env.LAB_USER}" -d "password=${process.env.LAB_PASS}" --data-urlencode "_csrf=${c1}"`));
if (!/^http/.test(l2)) { const c2=(sh(`curl -s -b ${jar} -c ${jar} "${API}/session/consent"`).match(/name="_csrf" value="([^"]*)"/)||[])[1];
  l2 = loc(sh(`curl -s -i -b ${jar} -c ${jar} -X POST "${API}/session/consent" -d "decision=approve" --data-urlencode "_csrf=${c2}"`)); }
const code = new URL(l2).searchParams.get("code");
const {privateKey, publicKey} = M.makeKey();
const dpop = M.proof({privateKey, publicKey, htm:"POST", htu:`${API}/token`});
const tok = JSON.parse(sh(`curl -s -X POST "${API}/token" -H "Content-Type: application/x-www-form-urlencoded" -H "DPoP: ${dpop}" -d "grant_type=authorization_code" -d "code=${code}" --data-urlencode "redirect_uri=${PRU}" -d "client_id=${PCID}" -d "code_verifier=${v}"`));
console.log("token_type:", tok.token_type, "| error:", tok.error || "none");
const intro = JSON.parse(sh(`curl -s -u "${process.env.MGMT_CLIENT_ID}:${process.env.MGMT_CLIENT_SECRET}" -X POST "${API}/introspection/standard" -H "Content-Type: application/x-www-form-urlencoded" -d "token=${tok.access_token}"`));
console.log("cnf from introspection:", JSON.stringify(intro.cnf));
const jwk = M.publicJwk(publicKey);
const canonical = JSON.stringify({crv:jwk.crv, kty:jwk.kty, x:jwk.x, y:jwk.y});   // RFC 7638: lexicographic, no whitespace
console.log("thumbprint I computed  :", crypto.createHash("sha256").update(canonical).digest("base64url"));
fs.writeFileSync("/tmp/dpopkey.json", JSON.stringify({at:tok.access_token, priv:privateKey.export({type:"pkcs8",format:"pem"}), pub:publicKey.export({type:"spki",format:"pem"})}));
EOF
node /tmp/dpopflow.mjs
```

```
token_type: DPoP | error: none
cnf from introspection: {"jkt":"6J3AmGkyQZ6l94c3pn1UPxv3--ajaiu1JN805RqUrSI"}
thumbprint I computed  : 6J3AmGkyQZ6l94c3pn1UPxv3--ajaiu1JN805RqUrSI
```

**They match.** You computed an RFC 7638 JWK thumbprint from your own public key and it equals the `jkt` the
authorization server recorded on the token. That is the binding, and you just verified it independently
rather than taking the AS's word for it. Two details worth noticing: `token_type` changed from `Bearer` to
**`DPoP`**, and the canonical JSON for the thumbprint has its members in **lexicographic order with no
whitespace** — `crv, kty, x, y` — which is what RFC 7638 specifies and a common source of mismatches.

### Break it — three ways to get a DPoP proof wrong

Each of these is a real bug this repo has hit. They run against the **token endpoint**, where the proof is
validated. Recall from Module 02 that a *failed* exchange does not consume the code, so this script gets one
code and tries all four variants against it:

```bash
cat > /tmp/dpopbreaks.mjs <<'EOF'
import crypto from "node:crypto";
import { execSync } from "node:child_process";
const M = await import("/tmp/dpop.mjs");
const API = process.env.API, PCID = process.env.PUB_CLIENT_ID, PRU = process.env.PRU;
const sh = c => execSync(c, {encoding:"utf8"});
const loc = o => { const m = o.split("\n").find(l => /^location:/i.test(l.trim())); return m ? m.split(/:\s/)[1].trim() : ""; };
const jar = sh("mktemp").trim();
const v  = crypto.randomBytes(32).toString("base64url");
const ch = crypto.createHash("sha256").update(v).digest("base64url");
const au = `${API}/authorization?response_type=code&client_id=${PCID}&redirect_uri=${encodeURIComponent(PRU)}&scope=profile&state=D1&code_challenge=${ch}&code_challenge_method=S256`;
let l = loc(sh(`curl -s -i -c ${jar} -b ${jar} "${au}"`));
const c1 = (sh(`curl -s -b ${jar} -c ${jar} "http://localhost:3000${l}"`).match(/name="_csrf" value="([^"]*)"/)||[])[1];
let l2 = loc(sh(`curl -s -i -b ${jar} -c ${jar} -X POST "${API}/session/login" -d "username=${process.env.LAB_USER}" -d "password=${process.env.LAB_PASS}" --data-urlencode "_csrf=${c1}"`));
if (!/^http/.test(l2)) { const c2=(sh(`curl -s -b ${jar} -c ${jar} "${API}/session/consent"`).match(/name="_csrf" value="([^"]*)"/)||[])[1];
  l2 = loc(sh(`curl -s -i -b ${jar} -c ${jar} -X POST "${API}/session/consent" -d "decision=approve" --data-urlencode "_csrf=${c2}"`)); }
const code = new URL(l2).searchParams.get("code");
const {privateKey, publicKey} = M.makeKey();
const exchange = (dpop) => JSON.parse(sh(`curl -s -X POST "${API}/token" -H "Content-Type: application/x-www-form-urlencoded" -H "DPoP: ${dpop}" -d "grant_type=authorization_code" -d "code=${code}" --data-urlencode "redirect_uri=${PRU}" -d "client_id=${PCID}" -d "code_verifier=${v}"`));
const show = (name, r) => console.log(`${name}\n  ${r.error ? r.error + ": " + r.error_description : "OK, token_type=" + r.token_type}\n`);
show("DER signature :", exchange(M.proof({privateKey, publicKey, htm:"POST", htu:`${API}/token`, der:true})));
show("kid, no jwk   :", exchange(M.proof({privateKey, publicKey, htm:"POST", htu:`${API}/token`, omitJwk:true})));
show("wrong htu     :", exchange(M.proof({privateKey, publicKey, htm:"POST", htu:`${API}/par`})));
show("correct       :", exchange(M.proof({privateKey, publicKey, htm:"POST", htu:`${API}/token`})));
EOF
node /tmp/dpopbreaks.mjs
```

```
DER signature :
  invalid_dpop_proof: [A254301] There was a problem processing the DPoP header: Signed JWT rejected: Invalid signature

kid, no jwk   :
  invalid_dpop_proof: [A254303] The DPoP header did not include a public key in JWK format.

wrong htu     :
  invalid_dpop_proof: [A254301] There was a problem processing the DPoP header: JWT claim 'htu' (http://localhost/api/par) did not have the expected value (http://localhost/api/token)

correct       :
  OK, token_type=DPoP
```

**Same `error` code three times, three completely different causes.** That is the lesson: `invalid_dpop_proof`
tells a client *retry differently*, and the `error_description` is where the actual diagnosis lives.

**DER signature.** DER is ~70–72 bytes with ASN.1 framing; JWS ES256 is a flat 64-byte `R‖S`. The verifier
reads the first 32 bytes as `R` and gets ASN.1 tags instead. Nothing about the *key* or the *claims* is wrong —
this is purely an encoding bug, and "Invalid signature" sends most people hunting for the wrong problem. In
Node the fix is `dsaEncoding: "ieee-p1363"`; in WebCrypto `crypto.subtle.sign` already returns raw `R‖S`,
which is why `client/src/services/dpop.service.ts` does not have to convert.

**`kid` instead of `jwk`.** RFC 9449 requires `jwk` in the proof header. `kid` is a *reference*, and the server
has never seen this key — it was generated seconds ago and never registered. The AS needs the actual public
key inline both to verify the signature and to compute the thumbprint it will store as `cnf.jkt`. This is the
same reasoning as Module 00's Q13.

**Wrong `htu`.** The proof is perfectly signed and completely valid — for a different endpoint. `htm` and `htu`
are what stop a proof captured at one endpoint being replayed at another. Note the server told you both the
value it got *and* the one it wanted, and that it compared against a `htu` derived from its own `Host` header
(`http://localhost/api/token`, no port here) — a reminder that behind a proxy, `htu` mismatches are a classic
false-failure and RFC 9700 §4.13's TLS-terminating-proxy concerns apply to DPoP too.

## Exercise 5 — Spend the bound token, then try to downgrade it

You have a token whose `cnf.jkt` you verified yourself. Now spend it. RFC 9449 §7.1: a DPoP-bound token
*"is sent using the Authorization request header field… with an authentication scheme of DPoP"* — and per
§7.1 the accompanying proof must carry `ath`, the hash of the access token. This script does exactly that:

```bash
cat > /tmp/spend.mjs <<'EOF'
import crypto from "node:crypto"; import fs from "node:fs";
import { execSync } from "node:child_process";
const M = await import("/tmp/dpop.mjs");
const d = JSON.parse(fs.readFileSync(process.argv[2] || "/tmp/dpopkey.json", "utf8"));
const privateKey = crypto.createPrivateKey(d.priv), publicKey = crypto.createPublicKey(d.pub);
const url = `${process.env.API}/userinfo`;
const p = M.proof({ privateKey, publicKey, htm: "GET", htu: url, ath: M.ath(d.at) });
const out = execSync(`curl -s -i -H "Authorization: DPoP ${d.at}" -H "DPoP: ${p}" "${url}"`, {encoding:"utf8"});
console.log(out.split("\n").filter(l => /^HTTP|^WWW-Auth|^\{/i.test(l)).join("\n"));
EOF
node /tmp/spend.mjs /tmp/dpopkey.json
```

**Predict** first: the token is valid, the proof is correct, `ath` is present, and the scheme is the one the
RFC mandates.

```
HTTP/1.1 403 Forbidden
WWW-Authenticate: DPoP error="insufficient_scope",error_description="[A089304] The userinfo endpoint requires 'openid' scope, but the access token does not cover the scope.",error_uri="…",algs="RS256 … ES256 … EdDSA"
```

**Not what you predicted, and not a failure of anything you built.** Your proof was fine. UserInfo is an OIDC
endpoint (OpenID Connect Core §5.3) and Exercise 4 asked for `scope=profile`, with no `openid`. **This is the
Exercise 2 lesson again**: the AS validated the *scope* before it validated the *binding*, so this one error
code tells you only about the first thing that failed. Had you concluded from it that DPoP was broken, you
would have been debugging the wrong layer. Notice the challenge is already `DPoP` scheme with an `algs` list,
even here.

So get a token UserInfo will actually honour. **This needs the confidential client** (`$CLIENT_ID` /
`$CLIENT_SECRET`): `openid` forces an ID token, this service signs ID tokens with HS256, and Authlete refuses a
symmetric algorithm for a public client — `[A406301] The algorithm is symmetric (HS256), but the client type of
the client … is not 'confidential'`. Same flow as Exercise 4, two changes: `scope=openid profile`, and client
authentication on the token call.

```bash
cat > /tmp/dpopflow-oidc.mjs <<'EOF'
import crypto from "node:crypto"; import fs from "node:fs";
import { execSync } from "node:child_process";
const M = await import("/tmp/dpop.mjs");
const API = process.env.API, CID = process.env.CLIENT_ID, SEC = process.env.CLIENT_SECRET, PRU = process.env.PRU;
const sh = c => execSync(c, {encoding:"utf8"});
const loc = o => { const m = o.split("\n").find(l => /^location:/i.test(l.trim())); return m ? m.split(/:\s/)[1].trim() : ""; };
const jar = sh("mktemp").trim();
const v  = crypto.randomBytes(32).toString("base64url");
const ch = crypto.createHash("sha256").update(v).digest("base64url");
const au = `${API}/authorization?response_type=code&client_id=${CID}&redirect_uri=${encodeURIComponent(PRU)}`
         + `&scope=${encodeURIComponent("openid profile")}&state=D2&code_challenge=${ch}&code_challenge_method=S256`;
let l = loc(sh(`curl -s -i -c ${jar} -b ${jar} "${au}"`));
const c1 = (sh(`curl -s -b ${jar} -c ${jar} "http://localhost:3000${l}"`).match(/name="_csrf" value="([^"]*)"/)||[])[1];
let l2 = loc(sh(`curl -s -i -b ${jar} -c ${jar} -X POST "${API}/session/login" -d "username=${process.env.LAB_USER}" -d "password=${process.env.LAB_PASS}" --data-urlencode "_csrf=${c1}"`));
if (!/^http/.test(l2)) { const c2=(sh(`curl -s -b ${jar} -c ${jar} "${API}/session/consent"`).match(/name="_csrf" value="([^"]*)"/)||[])[1];
  l2 = loc(sh(`curl -s -i -b ${jar} -c ${jar} -X POST "${API}/session/consent" -d "decision=approve" --data-urlencode "_csrf=${c2}"`)); }
const code = new URL(l2).searchParams.get("code");
const {privateKey, publicKey} = M.makeKey();
const dpop = M.proof({privateKey, publicKey, htm:"POST", htu:`${API}/token`});
const tok = JSON.parse(sh(`curl -s -X POST "${API}/token" -H "Content-Type: application/x-www-form-urlencoded" -H "DPoP: ${dpop}" -u "${CID}:${SEC}" -d "grant_type=authorization_code" -d "code=${code}" --data-urlencode "redirect_uri=${PRU}" -d "code_verifier=${v}"`));
console.log("token_type:", tok.token_type, "| scope:", tok.scope, "| error:", tok.error || "none");
fs.writeFileSync("/tmp/dpopkey-oidc.json", JSON.stringify({at:tok.access_token, priv:privateKey.export({type:"pkcs8",format:"pem"}), pub:publicKey.export({type:"spki",format:"pem"})}));
EOF
node /tmp/dpopflow-oidc.mjs
```

```
token_type: DPoP | scope: openid profile | error: none
```

Now spend *that* one — same script, different key file:

```bash
node /tmp/spend.mjs /tmp/dpopkey-oidc.json
```

```
HTTP/1.1 200 OK
{"sub":"admin","name":"admin","given_name":"admin","family_name":"admin","nickname":"admin",
 "preferred_username":"admin","zoneinfo":"UTC","locale":"en-US","updated_at":1787199702}
```

**You just spent a sender-constrained token.** Five things had to line up, and it is worth naming them before
you break them one at a time: the token exists and has not expired; it covers `openid`; the scheme is `DPoP`;
a proof accompanied it; and the proof's key hashes to the `cnf.jkt` you matched in Exercise 4. Each failure
below produces a **different** error — that is what makes DPoP debuggable at all.

Keep the token handy:

```bash
AT=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync("/tmp/dpopkey-oidc.json","utf8")).at)')
```

### Break it — present the bound token as a Bearer token

This is the one that matters. **Predict first:** the token is unchanged and still valid; the only difference is
the scheme name.

```bash
curl -s -i -H "Authorization: Bearer $AT" "$API/userinfo" | grep -iE "^HTTP|^www-auth"
```

```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: DPoP error="invalid_token",error_description="[A089311] Expected a DPoP header but none was
provided.",error_uri="https://docs.authlete.com/#A089311",algs="RS256 RS384 … ES256 … EdDSA"
```

**Explain the gap.** RFC 9449 §7.2 is explicit: a protected resource *"MUST reject a DPoP-bound access token
received as a bearer token."* The authorization server sees `cnf.jkt` on the token, finds no proof, and refuses.
Read the challenge closely — it comes back with the **`DPoP` scheme** and an `algs` list, which is the server
telling a confused client exactly what it should have sent.

**Now say why this rejection is the whole point.** If it returned `200`, sender-constraining would be
decorative: an attacker who stole the token would simply drop the `DPoP` header and carry on. The binding is
only worth something if presenting the token *without* proving key possession fails. That is why §7.2 is a MUST
and not a SHOULD.

### Break it — right scheme, no proof

```bash
curl -s -i -H "Authorization: DPoP $AT" "$API/userinfo" | grep -iE "^HTTP|^www-auth"
```

```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: DPoP error="invalid_dpop_proof",error_description="The DPoP authentication scheme was used but
no DPoP proof was provided in the DPoP header field."
```

**Explain the gap.** The error changed: `invalid_token` above, `invalid_dpop_proof` here. §7.1 requires the
resource server to *"check that a DPoP proof was also received in the DPoP header field"*, and the DPoP scheme
with no proof can never satisfy that — so **this one never reaches the authorization server at all.** It is
refused locally, which is why the message has no bracketed Authlete code.

### Break it — proof with no `ath`

The proof is signed with the right key, has the right `htm` and `htu`, and is missing one claim:

```bash
NOATH=$(node --input-type=module -e '
const M = await import("/tmp/dpop.mjs"); const crypto = await import("node:crypto"); const fs = await import("node:fs");
const d = JSON.parse(fs.readFileSync("/tmp/dpopkey-oidc.json","utf8"));
process.stdout.write(M.proof({privateKey: crypto.createPrivateKey(d.priv), publicKey: crypto.createPublicKey(d.pub),
  htm:"GET", htu:"'"$API"'/userinfo"}));           // no ath
')
curl -s -i -H "Authorization: DPoP $AT" -H "DPoP: $NOATH" "$API/userinfo" | grep -iE "^HTTP|^www-auth"
```

```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: DPoP error="invalid_dpop_proof",error_description="[A089313] There was an error processing the
DPoP header: JWT missing required claims: [ath].",error_uri="…",algs="RS256 … EdDSA"
```

**Explain the gap.** RFC 9449 §7.1 makes `ath` required when a proof accompanies an access token, and the
reason is replay: without `ath`, a proof captured from one request could be reused with a *different* stolen
token at the same endpoint, since nothing in it names a token. `ath` is the base64url SHA-256 of the access
token — the claim that ties this proof to this token. A common mistake is putting `sub` here instead; the
server does not look at `sub`, and you get exactly this error.

### Break it — the thief's own key

This is the attack DPoP exists to stop. The token is genuine and untouched; the proof is freshly minted, with the
correct `htm`, `htu` and `ath`, and a valid signature. Everything is right except *whose key signed it*.

```bash
WK=$(node --input-type=module -e '
const M = await import("/tmp/dpop.mjs"); const fs = await import("node:fs");
const d = JSON.parse(fs.readFileSync("/tmp/dpopkey-oidc.json","utf8"));
const k = M.makeKey();                                   // a key the AS has never seen
process.stdout.write(M.proof({privateKey:k.privateKey, publicKey:k.publicKey,
  htm:"GET", htu:"'"$API"'/userinfo", ath: M.ath(d.at)}));
')
curl -s -i -H "Authorization: DPoP $AT" -H "DPoP: $WK" "$API/userinfo" | grep -iE "^HTTP|^www-auth"
```

```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: DPoP error="invalid_dpop_proof",error_description="[A089312] Thumbprint of the provided DPoP key
does not match the expected DPoP thumbprint.",error_uri="…",algs="RS256 … EdDSA"
```

**Explain the gap.** A valid token and a cryptographically valid proof, and it still fails — because they do not
belong to each other. `[A089312]` is the `cnf.jkt` comparison from Exercise 4 running on the server side: the AS
thumbprints the `jwk` in your proof header and compares it against the value recorded on the token. **Stealing
the token is no longer sufficient**; you need the private key, and that never left the legitimate client. That
sentence is the entire value proposition of DPoP, and you have now watched it hold.

### Break it — Bearer scheme with a proof attached

```bash
curl -s -i -H "Authorization: Bearer $AT" -H "DPoP: anything" "$API/userinfo" | grep -iE "^HTTP|^www-auth"
```

```
HTTP/1.1 400 Bad Request
WWW-Authenticate: Bearer, DPoP error="invalid_request",error_description="A DPoP proof was provided with the
Bearer authentication scheme. RFC 9449 Section 7.1 requires the DPoP scheme when presenting a DPoP proof."
```

**Explain the gap.** An ambiguous presentation, refused before it reaches the AS — note the proof was the literal
string `anything` and it never got parsed. If the server honoured a proof under the `Bearer` scheme, `Bearer`
would become a working route for bound tokens: exactly the downgrade §7.2 closes. Note also that this challenge
lists **both** schemes, because at this point the server does not know which one you meant.

### The scoreboard

Five presentations, five outcomes. Fill this in from memory before you look:

| What you sent | Status | `error` | Who refused it |
|---|---|---|---|
| `DPoP` + proof, token lacks `openid` | 403 | `insufficient_scope` | Authlete — `[A089304]` |
| `Bearer` + bound token, no proof | 401 | `invalid_token` | Authlete — `[A089311]` |
| `DPoP`, no proof header | 401 | `invalid_dpop_proof` | **this server** — no bracketed code |
| `DPoP` + proof missing `ath` | 401 | `invalid_dpop_proof` | Authlete — `[A089313]` |
| `DPoP` + proof signed by another key | 401 | `invalid_dpop_proof` | Authlete — `[A089312]` |
| `Bearer` + a proof header | 400 | `invalid_request` | **this server** — no bracketed code |

**A bracketed code means Authlete answered; no bracketed code means this server refused locally, before any
Authlete call.** That is how you tell the two layers apart from the response alone, and it is the fastest way
to know whether a DPoP problem is yours or your vendor's.

### Read the code that makes this work

```bash
sed -n '/export function extractAccessToken/,/^}/p' server/src/utils/dpop.ts
sed -n '/export function dpopHttpTarget/,/^}/p' server/src/utils/dpop.ts
```

Three questions to answer from that code:

1. Why does an **unrecognised** scheme return "no token presented" rather than passing the header value
   through? (What would a naive `.replace("Bearer ", "")` hand to the authorization server when it saw
   `Authorization: Basic …`?)
2. Why is `access_token` read only from a **form-encoded** body, and why is the URI query parameter of
   RFC 6750 §2.3 absent entirely? (RFC 9700 §4.3.2.)
3. `dpopHttpTarget()` returns **two** values. Why does `htu` drop the query string while `targetUri` keeps it?
   (RFC 9449 §4.2 — and what breaks if you send `GET /api/userinfo?schema=openid` with the query in `htu`?)

**And the more interesting question.** Every failure you just produced was *loud*: a 400 or a 401, immediately,
with a code you could look up. What would the **dangerous** version look like?

A resource server that accepts `Bearer` for a DPoP-bound token and never checks `cnf`. It **fails open**, and
silently: `cnf.jkt` is still on the token, every dashboard still says "DPoP enabled", and a stolen token works
anywhere. Nothing errors, so nobody looks. **A security control that is silently not applied is worse than one
that is visibly broken.** The Bearer break is that inverse, refused — you just ran the proof that this
deployment closes it. That is Q14 in the quiz.

> **And one thing DPoP does *not* give you.** Present an ordinary, **unbound** token under the `DPoP` scheme with
> any well-formed proof and you get `200`. Nothing is wrong: the token carries no `cnf`, so there is no binding
> to check and the proof is decorative. The security property lives on **the token's `cnf.jkt`**, not on the
> scheme the caller chose. "The request used DPoP" is not evidence of sender-constraint — only an issued-bound
> token is.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `[A008305] The 'request_uri' parameter must be given…` | `parRequired: true` on the client | Set it back to `false` — see the Setup note |
| Exercise 2 Step 3 gives `[A005328]`, not `[A005352]` | a key is still registered from a previous run | Run Step 1; it empties the key set |
| Exercise 2 Step 3 gives `[A005332]` | the client has never had a JWKS | Fine — skip to Step 4 |
| Step 2 gives `[A006359]` instead of `[A008311]` | `$ISS` is blank or wrong | Re-run the `ISS=$(curl …)` line and check it is non-empty |
| Step 2 gives `[A005336]` instead of `[A008311]` | *Request Object Signature Algorithm* is pinned on the client | Unset it, or read Step 7 — this is that lesson |
| `jar` prints `action: undefined` | `$MGMT_CLIENT_ID`/`$MGMT_CLIENT_SECRET` wrong; the endpoint returned 401 | Re-check the Setup table |
| Step 7 fails with `Unexpected token` from `JSON.parse` | `$PKJWT_PRIVATE_JWK` is blank | Skip Step 7 — it is optional |
| `TypeError: Invalid URL` in a flow script | the authorization request errored, so `Location` was empty | Run the URL by hand with `curl -s -i` and read the body |
| Exercise 4 gives `invalid_grant` | the code was already consumed by a *successful* exchange | Re-run the script; it gets a fresh code |
| `htu` mismatch names a host you did not send | the server derives `htu` from its own `Host` header | Expected — use the value from the error message |
| Everything 429s | Authlete rate limit, ~15 token calls in a short window | Wait a minute |

## Verification — you're done when

- [ ] You ran a PAR flow and can state, without notes, what an attacker who reads the browser's URL learns
      compared with a plain authorization request.
- [ ] The `request_uri` is single-use, and you can cite the RFC 9126 section and say why.
- [ ] An `alg:none` request object is rejected, and you can explain what would be forgeable if it were not.
- [ ] You can state the difference between the **service** JWKS and a **client** JWKS in one sentence each, and
      say which one JAR needs and in which direction it is used.
- [ ] **You registered a client signing key and had a signed request object accepted**, and can say what each of
      `[A005332]`, `[A005352]` and `[A005328]` tells you about where the key search got to.
- [ ] **You put `scope` and `state` on the URL that contradicted the signed object, and the object won.** You can
      cite RFC 9101 §6.3 and say what an attacker gains against an AS that merges query parameters instead.
- [ ] You can state what JAR gives you that PAR does not, and vice versa.
- [ ] You found `iss` on both success and error responses, and can state what the *client* must do with it — and
      where the client gets the value it compares against.
- [ ] You built a DPoP proof by hand and can name the three required header parameters and four required
      payload claims, and what each defends against.
- [ ] **You computed a JWK thumbprint that matched `cnf.jkt`**, and can explain what that binding means.
- [ ] You broke the proof at the token endpoint three ways — DER signature, missing `jwk`, wrong `htu` — and can
      explain why all three return the same `error` code and how you tell them apart.
- [ ] **You spent the bound token** at UserInfo under the `DPoP` scheme and got claims back.
- [ ] You can name the five conditions that had to hold for that `200`, and the distinct error each one produces
      when it fails.
- [ ] **You presented the same token as `Bearer` and watched it be refused**, and can cite RFC 9449 §7.2 and say
      why that MUST is the thing that makes sender-constraining worth anything.
- [ ] You can explain why a proof signed with a different key fails with `[A089312]`, and connect that to the
      thumbprint you computed by hand in Exercise 4.
- [ ] You can reproduce the scoreboard table and say which rejections came from Authlete and which from this
      server, from the response alone.
- [ ] You can describe the inverse bug — an RS that accepts `Bearer` for a bound token and never checks `cnf` —
      and say why it is more dangerous than a loud failure.

## What was real vs. simulated

- **Everything above is real.** A genuine `request_uri`, a genuine signed request object, a genuine DPoP-bound
  token, a genuine thumbprint match, and genuine rejections. Every transcript on this page was captured by
  running the commands verbatim against this deployment.
- **Exercise 2 changes your client's configuration.** Step 1 empties `$CLIENT_ID`'s JWKS and Step 4 registers a
  new one. That is deliberate — it is what makes the exercise produce the same error codes for everyone — but
  it does mean the private half lives in `/tmp` and disappears when `/tmp` is cleared. Re-run Steps 1 and 4 to
  get back to a working state.
- **One conformance gap is Authlete's behaviour, not this server's.** RFC 6749 §4.1.2.1 wants failures reported
  by redirecting to the redirection URI with an `error` parameter whenever `client_id` and `redirect_uri` are
  themselves valid. With `response_type` **present** and some other parameter invalid, you do get that redirect
  — Exercise 3 relies on it. With `response_type` **absent**, Authlete answers `400 [A009301]` as a body
  instead. Defensible — without `response_type` the AS cannot determine the response mode, so it cannot know
  how to shape a redirect — but it is a body, not a redirect, and this repo does not control it.
- **mTLS is not implemented in this repo.** RFC 8705 is taught in the lesson and nothing here claims to run
  it. A proposal to implement it is at the end of the lesson.
- **Exercise 5 uses the confidential client, not the public one.** `openid` scope forces an ID token and this
  service signs those with HS256, which Authlete refuses for a public client. That is a *service configuration*
  limit on this deployment, not a spec rule.
- **Bracketed codes are Authlete vendor behaviour** — `[A008303]`, `[A008311]`, `[A254301]`, `[A254303]`,
  `[A005328]`, `[A005332]`, `[A005336]`, `[A005352]`, `[A006339]`, `[A006359]`, `[A009301]`, `[A089304]`,
  `[A089311]`, `[A089312]`, `[A089313]`, `[A406301]`. The `error` values themselves are spec-defined:
  `invalid_request_uri` (RFC 9126), `invalid_dpop_proof` (RFC 9449), `invalid_token` and `insufficient_scope`
  (RFC 6750 §3.1), `invalid_request` (RFC 6750 §3.1).
- **The `htu` the server compares against is derived from its own `Host` header**, so it omits the port on this
  deployment. That is deployment behaviour and would differ behind a proxy.
