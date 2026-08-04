# Module 05 — Lab: Hide the request, sign the proof, break the binding

**The short version:** you will push an authorization request to the back channel and prove the handle is
single-use; watch the AS refuse an unsigned request object; find `iss` in every response; then build a DPoP
proof by hand, obtain a `token_type: DPoP` token, **compute its key thumbprint yourself and match it against
`cnf.jkt`**, and break the proof four ways. You finish by spending that token at a protected resource and then
failing to downgrade it — presenting it as a `Bearer` token, which RFC 9449 §7.2 says the resource **MUST**
refuse.

## Setup

```bash
npm --prefix server run dev
cd docs/curriculum/scripts && set -a && source curriculum.env && set +a && cd -
PRU="http://localhost:3001/callback"
```

You need `$API`, `$PUB_CLIENT_ID`, `$LAB_USER`, `$LAB_PASS`, and the `getcode` helper from
[Module 03's lab](../03-pkce-and-public-clients/lab.md#setup). **Exercise 5 also needs the confidential client**
(`$CLIENT_ID` / `$CLIENT_SECRET`) — `curriculum.env` already provides both, and the exercise explains why the
public client cannot be used there.

> **`parRequired` must still be `false` on `$PUB_CLIENT_ID`** — the value Module 03's setup table asks for.
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

**Paste this helper** — Exercise 1 uses it. Module 03's `run_flow` builds its own authorization URL from
`response_type`/`redirect_uri`/`scope`, which is exactly what PAR moves off the URL, so it cannot drive a
`request_uri`. This is the same login-then-consent sequence, but it drives a URL **you** supply:

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

**Save the DPoP helper** — Exercises 4–6 all use it:

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
{"resultCode":"…","action":"CREATED",
 "requestUri":"urn:ietf:params:oauth:request_uri:-4PVrsTAHrY…",
 "responseContent":"{\"expires_in\":600,\"request_uri\":\"urn:ietf:params:oauth:request_uri:…\"}"}
status=201
```

**201 Created**, as RFC 9126 §2.2 requires, with a 600-second lifetime — the top of the spec's *"between 5 and
600 seconds"* range. Now use it. Note how little crosses the browser:

```bash
RQU=$(curl -s -X POST "$API/par" -H "Content-Type: application/json" \
  -d "$(node -e 'process.stdout.write(JSON.stringify({parameters:process.argv[1],clientId:process.argv[2]}))' -- "$PARAMS" "$PUB_CLIENT_ID")" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>process.stdout.write(JSON.parse(d).requestUri))')

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
http://localhost:3001/callback?state=PAR1&code=VSYhIiN8LJ5El2psk7wtTEz…&iss=https%3A%2F%2F…
code: VSYhIiN8LJ5El2psk7wtTEz…
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
{"error":"invalid_request_uri","error_description":"[A008303] The value of 'request_uri' parameter is not registered.", …}
```

**Explain the gap.** The handle is consumed on first use. If it were replayable, an attacker who captured it
from the browser could re-run the same pre-authorized request — reintroducing exactly the request-fixation
problem PAR exists to remove. Note also that a *stolen* handle is far less useful than a stolen URL: it is
opaque, bound to its client, single-use, and expires in 600 seconds.

## Exercise 2 — Watch the AS refuse an unsigned request object (JAR)

The request object's `aud` must be **this service's issuer identifier**, so read it from the discovery
document rather than hardcoding it:

```bash
ISS=$(curl -s "$API/.well-known/openid-configuration" \
 | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>process.stdout.write(JSON.parse(d).issuer))')
echo "aud will be: $ISS"

UNSIGNED=$(node -e '
const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const h=b({alg:"none",typ:"oauth-authz-req+jwt"});
const p=b({iss:process.argv[1],aud:process.argv[2],response_type:"code",client_id:process.argv[1],
           redirect_uri:"http://localhost:3001/callback",scope:"profile",state:"JAR1"});
process.stdout.write(h+"."+p+".");' -- "$PUB_CLIENT_ID" "$ISS")

curl -s -X POST "$API/jar/process" -H "Content-Type: application/json" \
  -d "$(node -e 'process.stdout.write(JSON.stringify({request:process.argv[1],clientId:process.argv[2]}))' -- "$UNSIGNED" "$PUB_CLIENT_ID")" \
  | head -c 220; echo
```

```json
{"resultCode":"A008311","resultMessage":"[A008311] The service is configured to conform to JAR (JWT Secured Authorization Request), so request objects must be always signed.","action":"BAD_REQUEST", …}
```

> **If you get `[A006359]` instead** — *"The value of the 'aud' claim … does not match the issuer identifier of
> this service"* — your `aud` is wrong, and you never reached the check this exercise is about. That is worth
> noticing rather than skipping past: **the AS validates `aud` before it validates that the object is signed.**
> An unsigned object addressed to the wrong audience is rejected for the audience, so a single error code tells
> you only about the *first* thing that failed. When you are debugging a request object, fix errors in the order
> the server finds them and re-test after each one — assuming the last error is the only error is how people
> conclude a feature is broken when they have three problems stacked up.

**Explain the gap.** This is RFC 9101 §10.1 enforced: the request object *"MUST be either signed using JWS…
or signed and then encrypted."* An `alg:none` request object is Module 00's forgery, wearing a request
object's clothes — if it were accepted, anyone could author an authorization request as any client.

> **Going further requires a client signing key.** A *signed* request object must be verifiable against a key
> the AS holds for that client (a registered `jwks` or `jwks_uri`). The lab's public client has none, so the
> signed path is not exercised here. That is a **client configuration** limitation, not a JAR limitation —
> register a JWKS on a client and the same endpoint will accept a properly signed object. You will meet client
> signing keys again in Module 06 (`private_key_jwt`).

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
  authorization_response_iss_parameter_supported = true
on an ERROR response:
iss=https%3A%2F%2F…
```

Go back to any successful callback URL from Modules 02–04: `iss` is on those too. **The AS side is done for
you. The control is the client checking it** (§2.4: *"If the value does not match the expected issuer
identifier, clients MUST reject the authorization response and MUST NOT proceed with the authorization
grant."*). Write the check as three lines of pseudocode and note that nothing in this repo's flow would break
if you deleted it — which is precisely why it gets forgotten.

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
' --input-type=module
```

```
header : {"typ":"dpop+jwt","alg":"ES256","jwk":{"kty":"EC","crv":"P-256","x":"…","y":"…"}}
payload: {"jti":"…","htm":"POST","htu":"http://localhost:3000/api/token","iat":…}
sig    : 64 bytes
```

Check each element against RFC 9449 §4.2: `typ`, `alg`, `jwk` in the header (and note the `jwk` has no `d` —
*"MUST NOT contain a private key"*); `jti`, `htm`, `htu`, `iat` in the payload. **64 bytes** is the raw
P1363 `R‖S` signature — remember that number, it is Break 1.

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
const intro = JSON.parse(sh(`curl -s -X POST "${API}/introspection/standard" -H "Content-Type: application/x-www-form-urlencoded" -d "token=${tok.access_token}"`));
console.log("cnf from introspection:", JSON.stringify(intro.cnf));
const jwk = M.publicJwk(publicKey);
const canonical = JSON.stringify({crv:jwk.crv, kty:jwk.kty, x:jwk.x, y:jwk.y});   // RFC 7638: lexicographic, no whitespace
console.log("thumbprint I computed  :", crypto.createHash("sha256").update(canonical).digest("base64url"));
fs.writeFileSync("/tmp/dpopkey.json", JSON.stringify({at:tok.access_token, priv:privateKey.export({type:"pkcs8",format:"pem"}), pub:publicKey.export({type:"spki",format:"pem"})}));
EOF
API="$API" PUB_CLIENT_ID="$PUB_CLIENT_ID" PRU="$PRU" LAB_USER="$LAB_USER" LAB_PASS="$LAB_PASS" node /tmp/dpopflow.mjs
```

```
token_type: DPoP | error: none
cnf from introspection: {"jkt":"2epgSlEy6ySL2qJgiS4uKUXwQ6tebcZkaP5umYm4u5w"}
thumbprint I computed  : 2epgSlEy6ySL2qJgiS4uKUXwQ6tebcZkaP5umYm4u5w
```

**They match.** You computed an RFC 7638 JWK thumbprint from your own public key and it equals the `jkt` the
authorization server recorded on the token. That is the binding, and you just verified it independently
rather than taking the AS's word for it. Two details worth noticing: `token_type` changed from `Bearer` to
**`DPoP`**, and the canonical JSON for the thumbprint has its members in **lexicographic order with no
whitespace** — `crv, kty, x, y` — which is what RFC 7638 specifies and a common source of mismatches.

## Break it — four ways to get a DPoP proof wrong

Each of these is a real bug documented in `AGENTS.md`. Run them against the **token endpoint**, where the
proof is actually validated. Recall from Module 02 that a *failed* exchange does not consume the code, so you
can try several against one code.

### Break 1 — DER-encode the signature

**Predict:** the signature is cryptographically correct, just encoded the way OpenSSL does it by default.

```bash
# in the flow script, replace the proof with: M.proof({privateKey, publicKey, htm:"POST", htu:`${API}/token`, der:true})
```

```json
{"error":"invalid_dpop_proof","error_description":"[A254301] There was a problem processing the DPoP header: Signed JWT rejected: Invalid signature"}
```

**Explain the gap.** DER is ~70–72 bytes with ASN.1 framing; JWS ES256 is a flat 64-byte `R‖S`. The verifier
reads the first 32 bytes as `R` and gets ASN.1 tags instead. Nothing about the *key* or the *claims* is wrong —
this is purely an encoding bug, and the error message ("Invalid signature") sends most people hunting for the
wrong problem. In Node the fix is `dsaEncoding: "ieee-p1363"`; in WebCrypto `crypto.subtle.sign` already
returns raw `R‖S`, which is why `client/src/services/dpop.service.ts` does not have to convert.

### Break 2 — `kid` instead of `jwk`

```bash
# ... M.proof({privateKey, publicKey, htm:"POST", htu:`${API}/token`, omitJwk:true})
```

```json
{"error":"invalid_dpop_proof","error_description":"[A254303] The DPoP header did not include a public key in JWK format."}
```

**Explain the gap.** RFC 9449 §4.2 requires `jwk` in the header. `kid` is a *reference*, and the server has
never seen this key — it was generated seconds ago and never registered. The AS needs the actual public key
inline both to verify the signature and to compute the thumbprint it will store as `cnf.jkt`. This is the
same reasoning as Module 00's Q13.

### Break 3 — wrong `htu`

```bash
# ... M.proof({privateKey, publicKey, htm:"POST", htu:`${API}/par`})   // valid signature, wrong target
```

```json
{"error":"invalid_dpop_proof","error_description":"[A254301] … JWT claim 'htu' (http://localhost/api/par) did not have the expected value"}
```

**Explain the gap.** The proof is perfectly signed and completely valid — for a different endpoint. `htm` and
`htu` are what stop a proof captured at one endpoint being replayed at another. Note the server compared
against a `htu` it derived from its own `Host` header (`http://localhost/api/par`, no port here) — a reminder
that behind a proxy, `htu` mismatches are a classic false-failure and RFC 9700 §4.13's TLS-terminating-proxy
concerns apply to DPoP too.

### Break 4 — get it right

```bash
# ... M.proof({privateKey, publicKey, htm:"POST", htu:`${API}/token`})
```

```
token_type: DPoP
```

Four attempts, one difference each. That is the whole debugging matrix for DPoP proofs.

## Exercise 5 — Spend the bound token, then try to downgrade it

You have a token whose `cnf.jkt` you verified yourself. Now spend it. RFC 9449 §7.1: a DPoP-bound token
*"is sent using the Authorization request header field… with an authentication scheme of DPoP"* — and the
accompanying proof must carry `ath`. Do exactly that:

```bash
node --input-type=module -e '
const M = await import("/tmp/dpop.mjs"); const crypto = await import("node:crypto");
const fs = await import("node:fs");
const d = JSON.parse(fs.readFileSync("/tmp/dpopkey.json","utf8"));
const privateKey = crypto.createPrivateKey(d.priv), publicKey = crypto.createPublicKey(d.pub);
const url = "'"$API"'/userinfo";
const p = M.proof({privateKey, publicKey, htm:"GET", htu:url, ath: M.ath(d.at)});
console.log("run:\n  curl -s -i -H \"Authorization: DPoP " + d.at + "\" -H \"DPoP: " + p + "\" " + url);
' --input-type=module
```

> `--input-type=module` makes this an ES module, so **`require` is not defined** — hence `await import("node:fs")`.
> The flag is repeated ahead of `-e` on purpose: Node decides whether the source is ambiguous *before* applying
> a trailing flag, so a snippet mixing `require` with top-level `await` fails with `ERR_AMBIGUOUS_MODULE_SYNTAX`
> rather than a clear error.

Run the printed command. **Predict** first: the token is valid, the proof is correct, `ath` is present, and the
scheme is the one the RFC mandates.

```
HTTP/1.1 403 Forbidden
WWW-Authenticate: DPoP error="insufficient_scope",error_description="[A089304] The userinfo endpoint requires
'openid' scope, but the access token does not cover the scope.",error_uri="…",algs="RS256 … ES256 … EdDSA"
```

**Not what you predicted, and not a failure of anything you built.** Your proof was fine. UserInfo is an OIDC
endpoint (OpenID Connect Core §5.3) and Exercise 4 asked for `scope=profile`, with no `openid`. **This is the
Exercise 2 lesson again**: the AS validated the *scope* before it validated the *binding*, so this one error code
tells you only about the first thing that failed. Had you concluded from it that DPoP was broken, you would have
been debugging the wrong layer. Notice the challenge is already `DPoP` scheme with an `algs` list, even here.

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
API="$API" CLIENT_ID="$CLIENT_ID" CLIENT_SECRET="$CLIENT_SECRET" PRU="$PRU" LAB_USER="$LAB_USER" LAB_PASS="$LAB_PASS" node /tmp/dpopflow-oidc.mjs
```

```
token_type: DPoP | scope: openid profile | error: none
```

Now spend *that* one — same command as above with `/tmp/dpopkey-oidc.json` in place of `/tmp/dpopkey.json`:

```bash
node --input-type=module -e '
const M = await import("/tmp/dpop.mjs"); const crypto = await import("node:crypto");
const fs = await import("node:fs");
const d = JSON.parse(fs.readFileSync("/tmp/dpopkey-oidc.json","utf8"));
const privateKey = crypto.createPrivateKey(d.priv), publicKey = crypto.createPublicKey(d.pub);
const url = "'"$API"'/userinfo";
const p = M.proof({privateKey, publicKey, htm:"GET", htu:url, ath: M.ath(d.at)});
console.log("run:\n  curl -s -i -H \"Authorization: DPoP " + d.at + "\" -H \"DPoP: " + p + "\" " + url);
' --input-type=module
```

```
HTTP/1.1 200 OK
{"sub":"admin","name":"admin","given_name":"admin","family_name":"admin","nickname":"admin",
 "preferred_username":"admin","zoneinfo":"UTC","locale":"en-US","updated_at":1785835361}
```

**You just spent a sender-constrained token.** Five things had to line up, and it is worth naming them before you
break them one at a time: the token exists and has not expired; it covers `openid`; the scheme is `DPoP`; a proof
accompanied it; and the proof's key hashes to the `cnf.jkt` you matched in Exercise 4. Each failure below
produces a **different** error code — that is what makes DPoP debuggable at all.

Keep the token handy:

```bash
AT=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync("/tmp/dpopkey-oidc.json","utf8")).at)')
```

### Break 5 — present the bound token as a Bearer token

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
telling a confused client exactly what it should have sent (§7.1 makes that challenge a MAY, and `algs` a SHOULD
once you emit one).

**Now say why this rejection is the whole point.** If it returned `200`, sender-constraining would be
decorative: an attacker who stole the token would simply drop the `DPoP` header and carry on. The binding is
only worth something if presenting the token *without* proving key possession fails. That is why §7.2 is a MUST
and not a SHOULD.

### Break 6 — right scheme, no proof

```bash
curl -s -i -H "Authorization: DPoP $AT" "$API/userinfo" | grep -iE "^HTTP|^www-auth"
```

```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: DPoP error="invalid_dpop_proof",error_description="The DPoP authentication scheme was used but
no DPoP proof was provided in the DPoP header field."
```

**Explain the gap.** Note the error changed: `invalid_token` in Break 5, `invalid_dpop_proof` here. §7.1 requires
the resource server to *"check that a DPoP proof was also received in the DPoP header field"*, and the DPoP
scheme with no proof can never satisfy that — so **this one never reaches the authorization server at all.** It
is refused locally, which is why the message has no bracketed Authlete code. Two 401s, two different causes, two
different error codes: that distinction is what lets you debug DPoP from the response alone.

### Break 7 — the thief's own key

This is the attack DPoP exists to stop. The token is genuine and untouched; the proof is freshly minted, with the
correct `htm`, `htu` and `ath`, and a valid signature. Everything is right except *whose key signed it*.

```bash
WK=$(node --input-type=module -e '
const M = await import("/tmp/dpop.mjs"); const fs = await import("node:fs");
const d = JSON.parse(fs.readFileSync("/tmp/dpopkey-oidc.json","utf8"));
const k = M.makeKey();                                   // a key the AS has never seen
process.stdout.write(M.proof({privateKey:k.privateKey, publicKey:k.publicKey,
  htm:"GET", htu:"'"$API"'/userinfo", ath: M.ath(d.at)}));
' --input-type=module)
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

### Break 8 — Bearer scheme with a proof attached

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

**Four breaks, four distinct error codes.** Write the table out from memory — `insufficient_scope`,
`invalid_token`, `invalid_dpop_proof` twice but from different causes, `invalid_request` — and say which layer
produced each. Two came from Authlete (bracketed codes), two from this server (no bracketed code). That
distinction is the whole debugging matrix for DPoP at a resource endpoint.

### The finding that used to live here

Until 2026-08-04 this exercise reproduced a **real bug in this server**: `userinfo.service.ts` stripped only the
literal `"Bearer "` prefix, so `Authorization: DPoP <token>` forwarded the string `"DPoP <token>"` and came back
`[A088302] The access token does not exist.` A DPoP-bound token could not be spent at this deployment's resource
endpoint at all — the token endpoint issued something the resource endpoint could not accept.

It is fixed. Read the fix and account for each piece against the spec:

```bash
sed -n '/export function extractAccessToken/,/^}/p' server/src/utils/dpop.ts
```

Three questions to answer from that code:

1. Why does an **unrecognised** scheme return "no token presented" rather than passing the header value through?
   (What did the old `.replace()` hand to the authorization server when it saw `Authorization: Basic …`?)
2. Why is `access_token` read only from a **form-encoded** body, and why is the URI query parameter of
   RFC 6750 §2.3 absent entirely? (RFC 9700 §4.3.2.)
3. `dpopHttpTarget()` returns **two** values. Why does `htu` drop the query string while `targetUri` keeps it?
   (RFC 9449 §4.2 — and what breaks if you send `GET /api/userinfo?schema=openid` with the query in `htu`?)

**The more interesting question, which the fix also answers.** The bug above *failed closed*: loud, immediate,
a ticket on day one. What is the inverse — the version that would be dangerous rather than merely broken?

A resource server that accepts `Bearer` for a DPoP-bound token and never checks `cnf`. It **fails open**, and
silently: `cnf.jkt` is still on the token, every dashboard still says "DPoP enabled", and a stolen token works
anywhere. Nothing errors, so nobody looks. **A security control that is silently not applied is worse than one
that is visibly broken.** Break 5 is that inverse, refused — you just ran the proof that this deployment closes
it. That is Q14 in the quiz.

> **And one thing DPoP does *not* give you.** Present an ordinary, **unbound** token under the `DPoP` scheme with
> any well-formed proof and you get `200`. Nothing is wrong: the token carries no `cnf`, so there is no binding
> to check and the proof is decorative. The security property lives on **the token's `cnf.jkt`**, not on the
> scheme the caller chose. "The request used DPoP" is not evidence of sender-constraint — only an issued-bound
> token is.

## Verification — you're done when

- [ ] You ran a PAR flow and can state, without notes, what an attacker who reads the browser's URL learns
      compared with a plain authorization request.
- [ ] The `request_uri` is single-use, and you can cite the RFC 9126 section and say why.
- [ ] An `alg:none` request object is rejected, and you can explain what would be forgeable if it were not.
- [ ] You found `iss` on both success and error responses, and can state what the *client* must do with it.
- [ ] You built a DPoP proof by hand and can name the three required header parameters and four required
      claims, and what each defends against.
- [ ] **You computed a JWK thumbprint that matched `cnf.jkt`**, and can explain what that binding means.
- [ ] You reproduced all three `AGENTS.md` DPoP bugs and can map each error message to its cause.
- [ ] **You spent the bound token** at UserInfo under the `DPoP` scheme and got claims back.
- [ ] You can name the five conditions that had to hold for that `200`, and the distinct error each one produces
      when it fails.
- [ ] **You presented the same token as `Bearer` and watched it be refused**, and can cite RFC 9449 §7.2 and say
      why that MUST is the thing that makes sender-constraining worth anything.
- [ ] You can explain why a proof signed with a different key fails with `[A089312]`, and connect that to the
      thumbprint you computed by hand in Exercise 4.
- [ ] You can state which of the four rejections came from Authlete and which from this server, and how you can
      tell from the response alone.
- [ ] You can describe the inverse bug — an RS that accepts `Bearer` for a bound token and never checks `cnf` —
      and say why it is more dangerous than a loud failure.

## What was real vs. simulated

- Everything above is **real**: a genuine `request_uri`, a genuine DPoP-bound token, a genuine thumbprint
  match, and genuine rejections.
- **The signed-JAR path is not exercised** — the lab's public client has no registered signing key, so only
  the `alg:none` rejection is demonstrated. Labelled in Exercise 2; it is a client-configuration limit, not a
  spec or server limit.
- **mTLS is not implemented in this repo.** RFC 8705 is taught in the lesson and nothing here claims to run
  it. A proposal to implement it is at the end of the lesson.
- **Exercise 5 used to reproduce a real server bug** — UserInfo could not accept the `DPoP` scheme at all. It was
  **fixed on 2026-08-04** (with three further defects found in the same function, one of them a proof-replay
  bypass); see `PROGRESS.md`. The exercise now demonstrates the working path and four conformant rejections
  instead. Every transcript above was re-captured against the fixed server.
- **Exercise 5 uses the confidential client, not the public one.** `openid` scope forces an ID token and this
  service signs those with HS256, which Authlete refuses for a public client. That is a *service configuration*
  limit on this deployment, not a spec rule.
- Bracketed codes (`[A008303]`, `[A008311]`, `[A254301]`, `[A254303]`, `[A089304]`, `[A089311]`, `[A089312]`,
  `[A406301]`) are **Authlete vendor behavior**. The `error` values themselves — `invalid_request_uri`
  (RFC 9126), `invalid_dpop_proof` (RFC 9449), `invalid_token` and `insufficient_scope` (RFC 6750 §3.1),
  `invalid_request` (RFC 6750 §3.1) — are spec-defined. The two rejections with **no** bracketed code come from
  this server rather than Authlete.
- The `htu` the server compares against is derived from its own `Host` header, so it omits the port on this
  deployment. That is deployment behaviour and would differ behind a proxy.
