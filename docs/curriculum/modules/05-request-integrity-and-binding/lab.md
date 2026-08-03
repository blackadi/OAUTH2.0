# Module 05 — Lab: Hide the request, sign the proof, break the binding

**The short version:** you will push an authorization request to the back channel and prove the handle is
single-use; watch the AS refuse an unsigned request object; find `iss` in every response; then build a DPoP
proof by hand, obtain a `token_type: DPoP` token, **compute its key thumbprint yourself and match it against
`cnf.jkt`**, and break the proof four ways. You finish by discovering that this server cannot accept the
DPoP-bound token it just issued.

## Setup

```bash
npm --prefix server run dev
cd docs/curriculum/scripts && set -a && source curriculum.env && set +a && cd -
PRU="http://localhost:3001/callback"
```

You need `$API`, `$PUB_CLIENT_ID`, `$LAB_USER`, `$LAB_PASS`, and the `getcode` helper from
[Module 03's lab](../03-pkce-and-public-clients/lab.md#setup).

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

```bash
UNSIGNED=$(node -e '
const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const h=b({alg:"none",typ:"oauth-authz-req+jwt"});
const p=b({iss:process.argv[1],aud:"https://your-issuer",response_type:"code",client_id:process.argv[1],
           redirect_uri:"http://localhost:3001/callback",scope:"profile",state:"JAR1"});
process.stdout.write(h+"."+p+".");' -- "$PUB_CLIENT_ID")

curl -s -X POST "$API/jar/process" -H "Content-Type: application/json" \
  -d "$(node -e 'process.stdout.write(JSON.stringify({request:process.argv[1],clientId:process.argv[2]}))' -- "$UNSIGNED" "$PUB_CLIENT_ID")" \
  | head -c 220; echo
```

```json
{"resultCode":"A008311","resultMessage":"[A008311] The service is configured to conform to JAR (JWT Secured Authorization Request), so request objects must be always signed.","action":"BAD_REQUEST", …}
```

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
node -e '
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

## Exercise 5 — Try to spend the bound token, and find the bug

RFC 9449 §7.1: a DPoP-bound token *"is sent using the Authorization request header field… with an
authentication scheme of DPoP"* — and §7 requires the accompanying proof to carry `ath`. Do exactly that:

```bash
node -e '
const M = await import("/tmp/dpop.mjs"); const crypto = await import("node:crypto");
const d = JSON.parse(require("fs").readFileSync("/tmp/dpopkey.json","utf8"));
const privateKey = crypto.createPrivateKey(d.priv), publicKey = crypto.createPublicKey(d.pub);
const url = "'"$API"'/userinfo";
const p = M.proof({privateKey, publicKey, htm:"GET", htu:url, ath: M.ath(d.at)});
console.log("run:\n  curl -s -i -H \"Authorization: DPoP " + d.at + "\" -H \"DPoP: " + p + "\" " + url);
' --input-type=module
```

Run the printed command. **Predict** first: the token is valid, the proof is correct, `ath` is present, and
the scheme is the one the RFC mandates.

```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="invalid_token",error_description="[A088302] The access token does not exist."
```

**"The access token does not exist"** — for a token you obtained ninety seconds ago and just introspected
successfully. Find out why:

```bash
sed -n '19,22p' server/src/services/userinfo.service.ts
```

```ts
if (req.headers["authorization"]) {
  const authHeader = req.headers["authorization"] || "";
  reqBody.token = authHeader.replace("Bearer ", "");
```

**Explain the gap.** The code strips only the literal `"Bearer "` prefix. Given `Authorization: DPoP <token>`
nothing matches, so the string sent to the authorization server is `"DPoP <token>"` — which is, correctly, not
a token that exists. **This is a real bug in the server**, not a lab artifact: RFC 9449 §7.1 requires the
`DPoP` scheme for DPoP-bound tokens, so this endpoint cannot accept a DPoP-bound token at all. The one-line
fix is to strip either scheme case-insensitively.

Write it up as a finding — severity, exploit path or impact, fix — and then answer the more interesting
question: **what is the analogous bug that would be dangerous rather than merely broken?** (An RS that accepts
`Bearer` for a DPoP-bound token and never checks `cnf` — it silently discards the binding you paid for, and
nothing fails, so nobody notices. That is Q14 in the quiz.)

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
- [ ] You can explain why `Authorization: DPoP <token>` fails at this server's UserInfo endpoint, and what the
      more dangerous inverse bug would be.

## What was real vs. simulated

- Everything above is **real**: a genuine `request_uri`, a genuine DPoP-bound token, a genuine thumbprint
  match, and genuine rejections.
- **The signed-JAR path is not exercised** — the lab's public client has no registered signing key, so only
  the `alg:none` rejection is demonstrated. Labelled in Exercise 2; it is a client-configuration limit, not a
  spec or server limit.
- **mTLS is not implemented in this repo.** RFC 8705 is taught in the lesson and nothing here claims to run
  it. A proposal to implement it is at the end of the lesson.
- **The UserInfo DPoP failure is a real server bug**, verified and reported in `PROGRESS.md`, not a
  deliberately planted exercise. The lab uses it as one because it is the most instructive thing in the file.
- Bracketed codes (`[A008303]`, `[A008311]`, `[A254301]`, `[A254303]`, `[A088302]`) are **Authlete vendor
  behavior**. The `error` values themselves — `invalid_request_uri` (RFC 9126), `invalid_dpop_proof`
  (RFC 9449), `invalid_token` (RFC 6750 §3.1) — are spec-defined.
- The `htu` the server compares against is derived from its own `Host` header, so it omits the port on this
  deployment. That is deployment behaviour and would differ behind a proxy.
