# Module 03 — Lab: Prove it without a secret, then take a token you shouldn't have

**The short version:** you will compute an S256 challenge by hand, run a complete authorization-code flow
against a **public** client with no client secret anywhere, and then break it five ways — including running
the same flow with PKCE switched off and redeeming a stolen code from a separate process to get a real,
working access token. That last one is the module.

## Setup

**Required:** the server on `:3000`, and a **public** client.

```bash
npm --prefix server run dev
cd docs/curriculum/scripts && set -a && source curriculum.env && set +a && cd -
```

You need `$API`, `$PUB_CLIENT_ID`, `$LAB_USER`, `$LAB_PASS`, and a registered redirect URI. This lab uses:

```bash
PRU="http://localhost:3001/callback"     # must be registered on $PUB_CLIENT_ID
```

**The public client must be configured like this** — check it:

```bash
curl -sf -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" "$API/client/get/$PUB_CLIENT_ID" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const c=(j=>j.client||j)(JSON.parse(d));console.log(JSON.stringify({clientType:c.clientType,tokenAuthMethod:c.tokenAuthMethod,parRequired:c.parRequired,pkceRequired:c.pkceRequired,redirectUris:c.redirectUris},null,1))})'
```

> This endpoint is admin-only, hence the `-u`. Without it you get a 401 whose body has none of these fields,
> and the `JSON.stringify` below silently prints `{}` because every value is `undefined`. The `-f` makes curl
> fail loudly instead. You will attack this endpoint properly in Module 11.

| Field | Required value | If it is wrong |
|---|---|---|
| `clientType` | `PUBLIC` | — |
| `tokenAuthMethod` | `NONE` | `[A157302] The client type of the client is 'public' but the client authentication method is not 'none'.` |
| `parRequired` | `false` | `[A294308] The authorization request was sent without PAR.` |
| `pkceRequired` | `false` | Break 3 cannot run — which is the point of Break 3. Leave it off for the lab, then read the last section. |
| service `fapiModes` | empty | mandates PAR and blocks the plain flow (Module 02 setup) |

> **This lab avoids the `openid` scope** and uses `scope=profile`. If your public client's `idTokenSignAlg`
> is a symmetric algorithm (`HS256`), requesting `openid` fails with *"[A406301] The algorithm is symmetric
> (HS256), but the client type of the client … is not 'confidential'"* — a symmetric signature needs a client
> secret, which a public client does not have. Set `idTokenSignAlg` to `ES256` before Module 08.

Reusable helper — paste this once; every exercise below calls it:

```bash
run_flow() {                       # run_flow "<extra query params>" ; echo the final redirect URL
  local EX="$1" J; J="$(mktemp)"
  local ENC; ENC=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' -- "$PRU")
  local AU="$API/authorization?response_type=code&client_id=$PUB_CLIENT_ID&redirect_uri=$ENC&scope=profile&state=P1$EX"
  local L1; L1=$(curl -s -i -c "$J" -b "$J" "$AU" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}')
  case "$L1" in http*) echo "$L1"; return;; esac
  local C1; C1=$(curl -s -b "$J" -c "$J" "http://localhost:3000$L1" | grep -o 'name="_csrf" value="[^"]*"' | cut -d'"' -f4)
  local L2; L2=$(curl -s -i -b "$J" -c "$J" -X POST "$API/session/login" \
      -d "username=$LAB_USER" -d "password=$LAB_PASS" --data-urlencode "_csrf=$C1" \
      | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}')
  case "$L2" in http*) echo "$L2"; return;; esac
  local C2; C2=$(curl -s -b "$J" -c "$J" "$API/session/consent" | grep -o 'name="_csrf" value="[^"]*"' | cut -d'"' -f4)
  curl -s -i -b "$J" -c "$J" -X POST "$API/session/consent" -d "decision=approve" --data-urlencode "_csrf=$C2" \
      | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}'
}
getcode() { node -e 'const u=new URL(process.argv[1]);process.stdout.write(u.searchParams.get("code")||"")' -- "$1"; }
```

---

## Exercise 1 — Build the PKCE pair by hand

```bash
VERIFIER=$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64url"))')
CHALLENGE=$(node -e 'process.stdout.write(require("crypto").createHash("sha256").update(process.argv[1]).digest("base64url"))' -- "$VERIFIER")

echo "verifier  ${#VERIFIER} chars: $VERIFIER"
echo "challenge ${#CHALLENGE} chars: $CHALLENGE"
```

```
verifier  43 chars: …
challenge 43 chars: …
```

Check it against RFC 7636 §4.1: 43 characters is exactly the minimum, and 32 random bytes is 256 bits of
entropy. Both strings are 43 characters here for the same reason — base64url of 32 bytes is always 43
unpadded characters — but they are *different* strings, and one cannot be run backwards into the other.

Confirm the transform is the spec's, not something you have to trust:

```bash
node -e '
const c=require("crypto"), v=process.argv[1];
console.log("BASE64URL(SHA256(ASCII(verifier))) =", c.createHash("sha256").update(v,"ascii").digest("base64url"));
console.log("matches CHALLENGE:", c.createHash("sha256").update(v,"ascii").digest("base64url")===process.argv[2]);
' -- "$VERIFIER" "$CHALLENGE"
# → matches CHALLENGE: true
```

Now read the repo's implementation and compare it to §4.1/§4.2 line by line:

```bash
sed -n '12,27p' client/src/pkce.ts
```

It builds a 64-character verifier from the unreserved set and takes the SHA-256 with `crypto.subtle`. Same
spec, different entropy budget. (See the modulo-bias note in the lesson — find it, then judge it correctly.)

## Exercise 2 — A full flow with no client secret

```bash
R=$(run_flow "&code_challenge=$CHALLENGE&code_challenge_method=S256")
CODE=$(getcode "$R"); echo "code: ${#CODE} chars"

curl -s -X POST "$API/token" -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" -d "code=$CODE" \
  --data-urlencode "redirect_uri=$PRU" \
  -d "client_id=$PUB_CLIENT_ID" \
  -d "code_verifier=$VERIFIER" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d);console.log(Object.keys(j).join(", "),"| scope:",j.scope)})'
```

```
access_token, token_type, expires_in, scope, refresh_token | scope: profile
```

**Look at what is absent from that request:** no `Authorization: Basic`, no `client_secret`, nothing that only
the real client could know — except `code_verifier`. Compare with Module 02, where `-u "$CLIENT_ID:$CLIENT_SECRET"`
carried the whole argument. PKCE replaced a *long-lived shared* secret with a *per-request ephemeral* one, and
that is the only difference.

## Break it

Predict, then run.

### Break 1 — steal the code, redeem it with no verifier

Get a fresh code (Exercise 2's is spent), then play the attacker: you saw the callback URL, you know the
`client_id` because it is public, and that is all you have.

```bash
V2=$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64url"))')
C2=$(node -e 'process.stdout.write(require("crypto").createHash("sha256").update(process.argv[1]).digest("base64url"))' -- "$V2")
R=$(run_flow "&code_challenge=$C2&code_challenge_method=S256"); CODE=$(getcode "$R")

curl -s -X POST "$API/token" -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" -d "code=$CODE" \
  --data-urlencode "redirect_uri=$PRU" -d "client_id=$PUB_CLIENT_ID" -w '\nstatus=%{http_code}\n'
```

```json
{"error":"invalid_grant","error_description":"[A050312] The token request does not contain 'code_verifier' although the authorization code was created with 'code_challenge'.", …}
status=400
```

**Explain the gap.** This is the first half of the RFC 9700 §4.8 rule: a code created *with* a challenge can
only be redeemed *with* a verifier. The attacker cannot strip the requirement at redemption time.

### Break 2 — guess the verifier

```bash
curl -s -X POST "$API/token" -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" -d "code=$CODE" \
  --data-urlencode "redirect_uri=$PRU" -d "client_id=$PUB_CLIENT_ID" \
  -d "code_verifier=$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64url"))')" \
  -w '\nstatus=%{http_code}\n'
```

```json
{"error":"invalid_grant","error_description":"[A050315] The code challenge value computed with 'code_verifier' is different from 'code_challenge' contained in the authorization request.", …}
status=400
```

**Explain the gap.** The AS recomputed `BASE64URL(SHA256(verifier))` and compared. `invalid_grant` is exactly
what RFC 7636 §4.6 mandates. To succeed the attacker would have to invert SHA-256 or brute-force 256 bits.

### Break 3 — the same client, with PKCE switched off

This is the one that matters. Run the identical flow with **no** `code_challenge`, then redeem the code with
nothing but the public `client_id` — the position an attacker who merely read the callback URL is in.

**Predict:** what comes back?

```bash
R=$(run_flow ""); CODE=$(getcode "$R")     # no PKCE parameters at all
echo "code obtained: ${#CODE} chars"

curl -s -X POST "$API/token" -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" -d "code=$CODE" \
  --data-urlencode "redirect_uri=$PRU" -d "client_id=$PUB_CLIENT_ID" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d);console.log(j.access_token?"ACCESS TOKEN ISSUED ("+j.access_token.length+" chars), scope="+j.scope:"error: "+j.error)})'
```

```
ACCESS TOKEN ISSUED (43 chars), scope=profile
```

**Explain the gap.** Nothing was broken, guessed, or bypassed. The request contained only values that are
*public by design* — a `client_id` anyone can read from the app bundle, a registered `redirect_uri`, and a
code that travelled through the browser in plain sight. For a public client, the base RFC 6749 flow offers no
step at which the AS could tell you apart from the real client. **This is authorization code interception,
RFC 9700 §4.5**, and comparing it with Break 1 tells you exactly what PKCE buys: the same attacker, the same
stolen code, one line of difference.

Write down the one sentence that distinguishes the two outcomes before moving on.

### Break 4 — use `plain` and look at the URL

**Predict:** with `code_challenge_method=plain` the challenge *is* the verifier. Does the AS accept it, and
what does an observer of the authorization request now know?

```bash
V4=$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64url"))')
R=$(run_flow "&code_challenge=$V4&code_challenge_method=plain"); CODE=$(getcode "$R")

curl -s -X POST "$API/token" -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" -d "code=$CODE" \
  --data-urlencode "redirect_uri=$PRU" -d "client_id=$PUB_CLIENT_ID" -d "code_verifier=$V4" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d);console.log(j.access_token?"token issued — the AS accepted plain":"error: "+j.error)})'
```

```
token issued — the AS accepted plain
```

**Explain the gap.** The AS accepted it, and it is spec-legal. But the value you sent as `code_challenge` in
the browser-visible URL is byte-for-byte the value you later sent as `code_verifier`. An attacker who saw the
authorization request has both halves and Break 1 and Break 2 both stop working. `plain` reduces PKCE to
theatre against a front-channel observer — which is why RFC 9700 §2.1.1 says clients *"SHOULD use PKCE code
challenge methods that do not expose the PKCE verifier in the authorization request… Currently, S256 is the
only such method."* And remember §4.3: omitting `code_challenge_method` **defaults to `plain`**.

### Break 5 — probe the other direction of the downgrade rule

RFC 9700 §4.8 requires the AS to reject a token request carrying a `code_verifier` when the authorization
request had **no** `code_challenge`. Test it:

```bash
R=$(run_flow ""); CODE=$(getcode "$R")     # code created WITHOUT a challenge

curl -s -X POST "$API/token" -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" -d "code=$CODE" \
  --data-urlencode "redirect_uri=$PRU" -d "client_id=$PUB_CLIENT_ID" \
  -d "code_verifier=$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64url"))')" \
  -w '\nstatus=%{http_code}\n'
```

```json
{"error":"invalid_grant","error_description":"[A050317] The token request contains 'code_verifier' although its corresponding authorization request did not contain 'code_challenge'.", …}
status=400
```

**Explain the gap.** This deployment enforces both directions, which is what §4.8 demands. Ask yourself why
the *second* direction matters at all — the answer is that an AS which silently ignores a stray verifier
cannot tell a downgraded request from a normal one, so an attacker who strips `code_challenge` upstream gets
a code that behaves identically to a protected one.

**The real fix is not to rely on this.** Setting `pkceRequired` (and `pkceS256Required`) on the service or
client makes the authorization endpoint refuse a request with no challenge in the first place, rather than
issuing a code that is only as safe as the redemption-time checks. On this deployment both read `false` —
which is precisely why Break 3 worked.

### Break 6 — watch the refresh token rotate

```bash
# Use the refresh_token from Exercise 2 (re-run it if you no longer have one).
curl -s -X POST "$API/token" -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token" -d "refresh_token=$RT" -d "client_id=$PUB_CLIENT_ID" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d);console.log("new refresh_token differs from the old one:", j.refresh_token!==process.argv[1])})' -- "$RT"
```

```
new refresh_token differs from the old one: true
```

**Explain.** Rotation is on for this service (`refreshTokenKept = false`), and it is one of the two answers
RFC 9700 §2.2.2 permits for a public client: *"Refresh tokens for public clients MUST be sender-constrained
or use refresh token rotation."* Note the whole request again — no client authentication. A refresh token on
a user's device is a long-lived credential that anyone holding it can spend, which is why "neither rotated nor
sender-constrained" is not an option. Now re-read the lesson's note on the FAPI 2.0 tension and be ready to
argue both sides.

## Verification — you're done when

- [ ] You can compute an S256 challenge from a verifier and state RFC 7636 §4.1's character set and length
      bounds without notes.
- [ ] You completed a token exchange for a public client with **no client secret in the request**, and can
      name the single value that stood in for one.
- [ ] Break 1 and Break 2 both return **`invalid_grant`**, and you can name the RFC 7636 section that mandates
      that error code.
- [ ] **Break 3 issued you a working access token**, and you can state in one sentence what differed from
      Break 1.
- [ ] You can explain why `plain` leaves a front-channel observer fully equipped, and what
      `code_challenge_method`'s default is.
- [ ] Both directions of the §4.8 downgrade rule are enforced, and you can say why the second direction
      matters.
- [ ] You can state the two acceptable treatments of a public client's refresh token.
- [ ] You can explain why `state` does not substitute for any of this.

## What was real vs. simulated

- Every request and response is **real** — a genuine public client, genuine codes, and a genuinely issued
  access token in Break 3.
- **Break 3 is a real attack, executed against your own server with your own consent.** The "theft" is
  simulated only in that you handed yourself the code instead of reading it out of someone else's browser
  history; from the authorization server's point of view the redemption is indistinguishable.
- `curl` stands in for the user agent. A real browser adds the leakage paths that make the theft plausible in
  the first place — history, `Referer`, extensions, and on mobile a rogue app claiming the same custom URL
  scheme (RFC 8252 §7.1).
- Errors with bracketed codes (`[A050312]`, `[A050315]`, `[A050317]`, `[A157302]`, `[A406301]`) are
  **Authlete vendor behavior**. The `error` value `invalid_grant` is spec-defined — RFC 7636 §4.6 and
  RFC 6749 §5.2.
- **Refresh-token rotation is this service's configuration** (`refreshTokenKept = false`), not a spec
  requirement. RFC 9700 §2.2.2 requires rotation *or* sender-constraining; FAPI 2.0 takes the other branch.
- The `openid` scope is avoided here for the reason given in Setup. That is a **client configuration**
  limitation on this deployment, not anything about PKCE.
