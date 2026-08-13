# Module 08 — Lab

**The short version:** six exercises. You will validate an ID token through all thirteen OIDC Core steps with
a script you write, forge one six different ways, discover that on this deployment knowing the client secret
is enough to mint an ID token for anybody, break `prompt=none`, and take apart the open redirect the logout
endpoint used to have.

## Before you start

```bash
set -a; source docs/curriculum/scripts/curriculum.env; set +a
curl -s "$API/health" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).status))'
```

```
ok
```

You need `$API`, `$CLIENT_ID`, `$CLIENT_SECRET`, `$REDIRECT_URI`, `$LAB_USER`, `$LAB_PASS`, and the issuer:

```bash
ISSUER=$(curl -s "$API/.well-known/openid-configuration" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).issuer))')
echo "$ISSUER"
```

Your client must have `openid` in its allowed scopes and the `AUTHORIZATION_CODE` grant.

> **Vendor behavior.** Bracketed codes (`[A406301]`, …) are Authlete's. HTTP statuses, `error` values and
> every claim name here are spec-defined.

> **Redaction.** Tokens below are `EXAMPLE-…`. Do the same anywhere you paste output. An ID token contains
> the user's identity claims and, on this deployment, is signed with a key that is also a client credential.

> **You will hit the rate limiter.** This lab runs more authorization-code flows than any other, and
> `loginLimiter` allows **5 logins per minute per IP** (`src/middleware/rate-limit.ts`). When you exceed it,
> `POST /api/session/login` returns **429**, the flow driver below prints `NO CODE. redirect was: ` with an
> empty redirect, and the *next* thing to fail is a confusing `403 Unauthorized - no ticket in session`.
> That cascade is not a bug in the lab and not a bug in the server — it is a rate limiter doing its job three
> steps upstream of where the error surfaces. **Wait sixty seconds and re-run.** Worth remembering as a
> diagnostic shape: an empty or missing artefact several steps into a multi-leg flow usually means an earlier
> leg failed silently, so read the *server's* log before your own code.

### A reusable flow driver

Every exercise needs "run the code flow with these parameters and give me the token response." Save this once:

```bash
cat > /tmp/flow.sh <<'EOS'
#!/bin/bash
# $1 client_id  $2 redirect_uri  $3 extra query params  $4 client_secret ("" for a public client)
CJ=$(mktemp)
RU=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' -- "$2")
curl -s -c "$CJ" -o /dev/null "$API/authorization?response_type=code&client_id=$1&redirect_uri=$RU&$3"
CSRF=$(curl -s -b "$CJ" -c "$CJ" "$API/session/login" | grep -o 'name="_csrf" value="[^"]*"' | head -1 | cut -d'"' -f4)
F=$(curl -s -b "$CJ" -c "$CJ" -o /dev/null -w '%{redirect_url}' -X POST "$API/session/login" \
     -d "username=$LAB_USER" -d "password=$LAB_PASS" --data-urlencode "_csrf=$CSRF")
case "$F" in *code=*|*error=*) ;; *)
  CS2=$(curl -s -b "$CJ" -c "$CJ" "$API/session/consent" | grep -o 'name="_csrf" value="[^"]*"' | head -1 | cut -d'"' -f4)
  F=$(curl -s -b "$CJ" -c "$CJ" -o /dev/null -w '%{redirect_url}' -X POST "$API/session/consent" \
       -d "decision=approve" --data-urlencode "_csrf=$CS2") ;; esac
CODE=$(node -e 'const u=new URL(process.argv[1]);process.stdout.write(u.searchParams.get("code")||"")' -- "$F" 2>/dev/null)
if [ -z "$CODE" ]; then echo "NO CODE. redirect was: $F"; rm -f "$CJ"; exit 1; fi
if [ -n "$4" ]; then
  curl -s -X POST "$API/token" -u "$1:$4" -d "grant_type=authorization_code" \
    --data-urlencode "code=$CODE" --data-urlencode "redirect_uri=$2"
else
  curl -s -X POST "$API/token" -d "grant_type=authorization_code" \
    --data-urlencode "code=$CODE" --data-urlencode "redirect_uri=$2" -d "client_id=$1"
fi
rm -f "$CJ"
EOS
chmod +x /tmp/flow.sh
```

---

## Exercise 1 — What the access token does not know

**Goal:** establish, by observation, that the access token you have been using for eight modules contains no
authentication evidence — and see the extra token appear the moment you ask for `openid`.

### 1a — Without `openid`

```bash
/tmp/flow.sh "$CLIENT_ID" "$REDIRECT_URI" "scope=profile&state=e1" "$CLIENT_SECRET" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(Object.keys(JSON.parse(s)).join(", ")))'
```

```
access_token, token_type, expires_in, scope, refresh_token
```

### 1b — With `openid`

```bash
/tmp/flow.sh "$CLIENT_ID" "$REDIRECT_URI" "scope=openid%20profile&state=e2" "$CLIENT_SECRET" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(Object.keys(JSON.parse(s)).join(", ")))'
```

```
access_token, token_type, expires_in, scope, refresh_token, id_token
```

**One scope value produced an entire second token.** That is the whole of "OIDC is a layer on OAuth" — same
endpoints, same flow, one extra scope, one extra artefact.

### 1c — Ask each token what it knows

```bash
R=$(/tmp/flow.sh "$CLIENT_ID" "$REDIRECT_URI" "scope=openid%20profile&state=e3&nonce=n3" "$CLIENT_SECRET")
AT=$(echo "$R" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).access_token))')
IDT=$(echo "$R" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).id_token))')

echo "--- access token, introspected ---"
curl -s -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" -X POST "$API/introspection/standard" -d "token=$AT"; echo
echo "--- id token, decoded ---"
node docs/curriculum/scripts/decode-jwt.mjs "$IDT"
```

The access token introspects to something like:

```json
{"active":true,"scope":"openid profile","client_id":"…","token_type":"Bearer",
 "exp":…,"sub":"admin","iss":"…","auth_time":…,"acr":"pwd"}
```

Now think carefully, because this looks like it contradicts the lesson. **The introspection response has
`sub`, `auth_time` and `acr` in it.** So why can't you authenticate with the access token?

Three reasons, and getting them right is the exercise:

1. **Those claims are not in the token — they are in the *introspection response*.** The access token itself
   is a 43-character opaque string. What you are reading is *the authorization server's answer to a question
   you asked*, delivered to you over a channel you authenticated. That is a very different thing from a
   signed statement addressed to you.
2. **Nothing in the request said who was asking.** Recall Module 04: this introspection endpoint accepts
   unauthenticated requests. So "I introspected it and got `sub`" is available to anyone holding the string —
   which is precisely the property that makes the token useless as identity evidence.
3. **There is no audience and no request binding.** The response never says *whom* the token was issued to,
   in a form you can check, and nothing ties it to the login attempt in this browser tab. An access token that
   some other application obtained for this user would introspect to the same `sub`.

Point 3 is the token-substitution attack in one sentence. Write it out for yourself before moving on:
*if an attacker can obtain any access token for the victim from this provider, and your login endpoint accepts
access tokens, then…*

### 1d — Now look at the ID token

```
header : {"alg":"HS256"}
payload:
{
  "iss": "https://…",
  "sub": "admin",
  "aud": "…your client_id…",
  "exp": …,
  "iat": …,
  "auth_time": …,
  "nonce": "n3",
  "acr": "pwd",
  "s_hash": "…"
}
```

Everything the introspection response had, plus the two things it could not have: **`aud`** — addressed to
you specifically — and **`nonce`** — answering *this* request. Both inside a signature.

Note `exp`. Compare it to `iat`. On this deployment that gap is **86400 seconds**, and an ID token is
supposed to record a moment, not license a day. Add it to your Module 07 report.

---

## Exercise 2 — Map every claim to its requirement

Before validating anything, make sure you can say *why each claim is there*. Fill this in from your own token:

| Claim | Your value | REQUIRED? | Which validation step uses it |
|---|---|---|---|
| `iss` | | REQUIRED | 2 |
| `sub` | | REQUIRED | — |
| `aud` | | REQUIRED | 3 |
| `exp` | | REQUIRED | 9 |
| `iat` | | REQUIRED | 10 |
| `auth_time` | | conditional | 13 |
| `nonce` | | conditional | 11 |
| `acr` | | optional | 12 |
| `s_hash` | | profile | — |

Two things to notice and write down.

**`aud` is a bare string here — and it was an array until 2026-08-12.** Both are legal: `aud` is defined as
*"Audience(s)"*, so a single value may be sent either as `"<your-client-id>"` or as `["<your-client-id>"]`.
The service now sets `idTokenAudType: "string"` (following a FAPI WG decision of November 2024, which
`AGENTS.md`'s recommended-flag table has always listed); before that it emitted the array form.

**This is the most useful thing in the exercise, so do not skim it.** A validator written
`claims.aud === clientId` was *broken* against this server a fortnight ago and *works* today — and one
written `claims.aud.includes(clientId)` was fine then and **throws `TypeError: claims.aud.includes is not a
function` now.** Nothing about the specification changed. One console flag flipped, and each naive validator
broke in the opposite direction from the other. That is why step 3 of the validator you are about to write
normalises first:

```js
const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
```

**Handle both shapes; you do not control which one a provider sends, and you may not control when it
changes.**

**`s_hash` is present and `at_hash` is not.** `s_hash` binds `state`; `at_hash` would bind an access token,
and is only required when the access token travels through the front channel — which, in the code flow, it
does not. You will see `c_hash` appear in Exercise 3c.

---

## Exercise 3 — Validate all thirteen steps

**Goal:** write the validator. Not use a library — write it, once, so that you know what the library does.

### 3a — The script

```bash
cat > /tmp/validate-id-token.mjs <<'EOF'
// OIDC Core 1.0 §3.1.3.7, step by step.
//   node validate-id-token.mjs <id_token>
// Env: ISSUER, CLIENT_ID, and either CLIENT_SECRET (HS*) or JWKS_URI (ES*/RS*)
//      optional: EXPECT_NONCE, EXPECT_ALG, MAX_IAT_AGE
import crypto from "node:crypto";

const jwt = process.argv[2];
const { ISSUER, CLIENT_ID, CLIENT_SECRET, JWKS_URI, EXPECT_NONCE, EXPECT_ALG, MAX_IAT_AGE } = process.env;
const b64 = (s) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
const ok = [], bad = [];
const step = (n, what, pass, detail = "") =>
  (pass ? ok : bad).push(`${pass ? "PASS" : "FAIL"}  step ${String(n).padStart(2)}  ${what}${detail ? " — " + detail : ""}`);

const [h64, p64, s64] = jwt.split(".");
const header = b64(h64), claims = b64(p64);

// 1 — encryption
step(1, "not encrypted (3 parts, JWS)", jwt.split(".").length === 3);

// 2 — issuer must match EXACTLY
step(2, "iss matches expected issuer", claims.iss === ISSUER, `${claims.iss}`);

// 3 — audience must contain our client_id, and nothing we don't trust
const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
step(3, "aud contains client_id", aud.includes(CLIENT_ID), JSON.stringify(claims.aud));
const untrusted = aud.filter((a) => a !== CLIENT_ID);
if (untrusted.length) step(3, "aud contains ONLY trusted audiences", false, `extra: ${untrusted}`);

// 4 & 5 — azp
if (claims.azp !== undefined) step(5, "azp equals client_id", claims.azp === CLIENT_ID, claims.azp);
else step(5, "azp absent (single audience) — n/a", aud.length === 1);

// 7 — the algorithm comes from CONFIGURATION, never from the token
const expectedAlg = EXPECT_ALG || (CLIENT_SECRET ? "HS256" : "ES256");
step(7, `alg is the registered algorithm (${expectedAlg})`, header.alg === expectedAlg, `header says ${header.alg}`);

// 6 & 8 — signature
let sigOk = false, how = "";
if (header.alg?.startsWith("HS") && CLIENT_SECRET) {
  const mac = crypto.createHmac(`sha${header.alg.slice(2)}`, Buffer.from(CLIENT_SECRET, "utf8"))
                    .update(`${h64}.${p64}`).digest("base64url");
  sigOk = mac.length === s64.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(s64));
  how = "HMAC with client_secret (step 8)";
} else if (JWKS_URI) {
  const jwks = await fetch(JWKS_URI).then((r) => r.json());
  const key = jwks.keys.find((k) => k.kid === header.kid) ??
              (jwks.keys.length === 1 ? jwks.keys[0] : undefined);
  if (!key) how = `no JWK for kid=${header.kid}`;
  else {
    const pub = crypto.createPublicKey({ key, format: "jwk" });
    sigOk = crypto.verify(null, Buffer.from(`${h64}.${p64}`),
      { key: pub, dsaEncoding: "ieee-p1363" }, Buffer.from(s64, "base64url"));
    how = `JWKS key kid=${key.kid} (${key.alg ?? key.kty})`;
  }
} else how = "no key material available";
step(6, "signature verifies", sigOk, how);

// 9 — expiry
const now = Math.floor(Date.now() / 1000);
step(9, "now < exp", now < claims.exp, `${claims.exp - now}s remaining`);

// 10 — issued-at freshness
const maxAge = Number(MAX_IAT_AGE || 600);
step(10, `iat within ${maxAge}s`, now - claims.iat <= maxAge, `issued ${now - claims.iat}s ago`);

// 11 — nonce
if (EXPECT_NONCE) step(11, "nonce matches the value we sent", claims.nonce === EXPECT_NONCE, `${claims.nonce}`);
else step(11, "no nonce sent — n/a", true);

// 13 — auth_time
step(13, "auth_time present and not in the future", !claims.auth_time || claims.auth_time <= now + 60,
     claims.auth_time ? `${now - claims.auth_time}s ago` : "absent");

for (const l of [...ok, ...bad]) console.log(l);
console.log(bad.length ? `\nREJECT — ${bad.length} check(s) failed` : "\nACCEPT — all checks passed");
process.exit(bad.length ? 1 : 0);
EOF
```

Note the `dsaEncoding: "ieee-p1363"` on the asymmetric branch. Same raw R‖S encoding you met in Module 05's
DPoP proofs — JWS signatures are never DER.

### 3b — Run it on a real token

```bash
NONCE="NONCE-$(openssl rand -hex 6)"
IDT=$(/tmp/flow.sh "$CLIENT_ID" "$REDIRECT_URI" "scope=openid%20profile&state=v1&nonce=$NONCE" "$CLIENT_SECRET" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).id_token))')

ISSUER="$ISSUER" CLIENT_ID="$CLIENT_ID" CLIENT_SECRET="$CLIENT_SECRET" EXPECT_NONCE="$NONCE" \
  node /tmp/validate-id-token.mjs "$IDT"
```

```
PASS  step  1  not encrypted (3 parts, JWS)
PASS  step  2  iss matches expected issuer — https://…
PASS  step  3  aud contains client_id — "…"
PASS  step  5  azp absent (single audience) — n/a
PASS  step  7  alg is the registered algorithm (HS256) — header says HS256
PASS  step  6  signature verifies — HMAC with client_secret (step 8)
PASS  step  9  now < exp — 86400s remaining
PASS  step 10  iat within 600s — issued 0s ago
PASS  step 11  nonce matches the value we sent — NONCE-…
PASS  step 13  auth_time present and not in the future — 0s ago

ACCEPT — all checks passed
```

Look at step 9's detail: **86400 seconds remaining.** Your validator passed it because the spec only requires
`now < exp` — the spec cannot know what lifetime is appropriate for your application. Step 10 is where you
impose your own judgement, and it is the reason step 10 exists at all: *"iat MAY be used to reject tokens
issued too far from current time per Client-specific acceptable range."* A 24-hour ID token accepted at hour
23 is a 23-hour-old authentication event being treated as a login.

### 3c — Watch `c_hash` appear

Run the hybrid flow and look at what the front channel returns:

```bash
CJ=$(mktemp)
RU=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' -- "$REDIRECT_URI")
curl -s -c "$CJ" -o /dev/null \
  "$API/authorization?response_type=code%20id_token&client_id=$CLIENT_ID&redirect_uri=$RU&scope=openid&state=h1&nonce=hn1"
CSRF=$(curl -s -b "$CJ" -c "$CJ" "$API/session/login" | grep -o 'name="_csrf" value="[^"]*"' | head -1 | cut -d'"' -f4)
F=$(curl -s -b "$CJ" -c "$CJ" -o /dev/null -w '%{redirect_url}' -X POST "$API/session/login" \
     -d "username=$LAB_USER" -d "password=$LAB_PASS" --data-urlencode "_csrf=$CSRF")
case "$F" in *id_token=*|*error=*) ;; *)
  CS2=$(curl -s -b "$CJ" -c "$CJ" "$API/session/consent" | grep -o 'name="_csrf" value="[^"]*"' | head -1 | cut -d'"' -f4)
  F=$(curl -s -b "$CJ" -c "$CJ" -o /dev/null -w '%{redirect_url}' -X POST "$API/session/consent" \
       -d "decision=approve" --data-urlencode "_csrf=$CS2") ;; esac
echo "$F" | sed -E 's/(id_token|code)=[^&]*/\1=REDACTED/g'
rm -f "$CJ"
```

```
https://<your-callback>/#state=h1&code=REDACTED&id_token=REDACTED&iss=https%3A%2F%2F…
```

Both artefacts, in the **fragment**. Decode that ID token and you will find:

```json
{"iss":"…","sub":"admin","aud":"…","exp":…,"iat":…,"auth_time":…,
 "nonce":"hn1","acr":"pwd","c_hash":"BgRKDAMjHi43C3By_ZB_Ww","s_hash":"…"}
```

**`c_hash` has appeared**, because the code and the ID token both crossed the browser and the ID token is the
only signed thing among them. Without it, an attacker who can substitute a *different* valid code into that
fragment gets the victim's ID token paired with the attacker's code. `c_hash` is what makes hybrid safe, and
computing it is the same left-half-of-a-SHA-256 construction as `at_hash`.

> Nothing about the code flow needs `c_hash`, because there is no ID token in the front channel to bind.
> That is one fewer thing to get wrong, and it is a large part of why FAPI 2.0 chose plain `code` + PAR.

### 3d — Validating against JWKS instead of a shared secret

Everything above verified the signature with the **client secret**, because `$CLIENT_ID` — the confidential
client the labs use — is registered with `idTokenSignAlg: HS256`. That is the branch OIDC Core step 8
describes, and Exercise 4 will show you why it is the wrong choice.

You do not need to change any console setting to see the other branch. **`$PUB_CLIENT_ID` already signs
`ES256`**, so run the flow against it and re-run the validator with the JWKS branch instead of the secret — a
public client takes no secret, hence the empty fourth argument:

```bash
NONCE="NONCE-$(openssl rand -hex 6)"
IDT=$(/tmp/flow.sh "$PUB_CLIENT_ID" "$REDIRECT_URI" "scope=openid%20profile&state=v1&nonce=$NONCE" "" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).id_token))')

JWKS_URI="$API/.well-known/jwks.json" ISSUER="$ISSUER" CLIENT_ID="$PUB_CLIENT_ID" \
  EXPECT_ALG=ES256 EXPECT_NONCE="$NONCE" node /tmp/validate-id-token.mjs "$IDT"
```

The header now carries a `kid`, and the script selects the matching key from

```bash
curl -s "$API/.well-known/jwks.json"
```

```json
{"keys":[{"kty":"EC","use":"sig","crv":"P-256","kid":"1","x":"…","y":"…","alg":"ES256"},
         {"kty":"RSA","e":"AQAB","use":"sig","kid":"rsa-1","n":"…"}]}
```

```
PASS  step  7  alg is the registered algorithm (ES256) — header says ES256
PASS  step  6  signature verifies — JWKS key kid=1 (ES256)

ACCEPT — all checks passed
```

…verified against the public key. **This is the path that matters in production**, because it is the only one
that lets a party verify without also being able to forge.

> **Two keys, and that is what makes step 6 honest.** Until 2026-08-12 this JWKS held a single key, so the
> script's fallback — `?? (jwks.keys.length === 1 ? jwks.keys[0] : undefined)` in 3a — quietly rescued a
> `kid` lookup that found nothing, and a broken selector would still have printed `ACCEPT`. It no longer can.
> Re-read that line now that it cannot fire: **a fallback that is never exercised is a test you are not
> running.** The RSA key arrived to satisfy the Discovery §3 `MUST` you will meet in 6d.

> **Verified end to end, 2026-08-12** — `$PUB_CLIENT_ID`, `kid: "1"`, all thirteen applicable steps `PASS`.
> The previous note here said *"both clients here are still `HS256`"* and marked this branch `UNVERIFIED as
> of 2026-07-28`. **That was wrong when written and got wronger:** only the confidential client is `HS256`;
> the two public clients have been `ES256` throughout, so the branch was runnable the whole time and nobody
> ran it. The lesson is the one this module keeps teaching — *"the console said so"* is not evidence, and an
> `UNVERIFIED` marker whose premise nobody re-checked is worse than no marker, because it looks like
> diligence.

---

## Exercise 4 — Forge it six ways

**Predict each result before running.** Which step number catches it, and does anything catch it twice?

```bash
cat > /tmp/forge.mjs <<'EOF'
//   node forge.mjs <id_token> '<json patch>' [--keep-sig | --alg=none | --sign]
import crypto from "node:crypto";
const [, , jwt, patchJson, mode = "--sign"] = process.argv;
const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const d = (s) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
const [h64, p64, s64] = jwt.split(".");
const alg = mode === "--alg=none" ? "none" : d(h64).alg;
const si = `${b({ ...d(h64), alg })}.${b({ ...d(p64), ...JSON.parse(patchJson) })}`;
if (mode === "--alg=none") console.log(`${si}.`);
else if (mode === "--keep-sig") console.log(`${si}.${s64}`);
else console.log(`${si}.${crypto.createHmac("sha256", Buffer.from(process.env.CLIENT_SECRET,"utf8")).update(si).digest("base64url")}`);
EOF

v () { echo "── $1"
  ISSUER="$ISSUER" CLIENT_ID="$CLIENT_ID" CLIENT_SECRET="$CLIENT_SECRET" EXPECT_NONCE="$NONCE" \
    node /tmp/validate-id-token.mjs "$2" 2>&1 | grep -E '^(FAIL|ACCEPT|REJECT)'; echo; }

v "B1 tamper sub, keep the original signature" "$(node /tmp/forge.mjs "$IDT" '{"sub":"attacker"}' --keep-sig)"
v "B2 alg:none, signature stripped"            "$(node /tmp/forge.mjs "$IDT" '{"sub":"attacker"}' --alg=none)"
v "B3 wrong audience, properly re-signed"      "$(node /tmp/forge.mjs "$IDT" '{"aud":["some-other-client"]}')"
v "B4 expired, properly re-signed"             "$(node /tmp/forge.mjs "$IDT" '{"exp":1000000000}')"
v "B5 nonce mismatch, properly re-signed"      "$(node /tmp/forge.mjs "$IDT" '{"nonce":"someone-elses"}')"
v "B6 sub=ceo, properly re-signed"             "$(node /tmp/forge.mjs "$IDT" '{"sub":"ceo@example.com"}')"
```

```
── B1 tamper sub, keep the original signature
FAIL  step  6  signature verifies — HMAC with client_secret (step 8)
REJECT — 1 check(s) failed

── B2 alg:none, signature stripped
FAIL  step  7  alg is the registered algorithm (HS256) — header says none
FAIL  step  6  signature verifies — no key material available
REJECT — 2 check(s) failed

── B3 wrong audience, properly re-signed
FAIL  step  3  aud contains client_id — ["some-other-client"]
FAIL  step  3  aud contains ONLY trusted audiences — extra: some-other-client
REJECT — 2 check(s) failed

── B4 expired, properly re-signed
FAIL  step  9  now < exp — -785228815s remaining
REJECT — 1 check(s) failed

── B5 nonce mismatch, properly re-signed
FAIL  step 11  nonce matches the value we sent — someone-elses
REJECT — 1 check(s) failed

── B6 sub=ceo, properly re-signed
ACCEPT — all checks passed
```

### Read B2 carefully

**Two** steps caught `alg: none`, and the order matters. Step 7 caught it *first*, on configuration — "we
registered HS256, this says none" — before any key material was involved. Step 6 then failed for a
second, weaker reason. A validator that only implements step 6 and reads `alg` from the header would have
looked up "the key for algorithm none", found none needed, and accepted. **Step 7 is load-bearing, and
almost every `alg: none` CVE is a missing step 7.**

### Now sit with B6

**Every check passed, on a token you minted, for a user who did not log in.**

B6 is not a failure of the validator. The validator did exactly what OIDC Core §3.1.3.7 specifies, including
step 8's *"use the UTF-8 client_secret octets as validation key."* The token is genuinely, correctly signed.

The problem is upstream: **with HS256, the verification key and the signing key are the same key**, so
"can validate" and "can forge" are the same capability. Consequences worth writing down:

- Anyone holding the client secret — the client itself, every deploy pipeline that injects it, every engineer
  who has ever read the config, anyone who compromised any of those — can mint an ID token asserting any
  identity, and it will validate perfectly at that client.
- A **public** client cannot participate at all. It has no secret, so it cannot validate. That is the exact
  cause of `[A406301] The algorithm is symmetric (HS256), but the client type of the client … is not
  'confidential'.` — try the flow with `$PUB_CLIENT_ID` and `scope=openid` and you will get it as a redirect
  error.
- Nothing can be verified by a **third party**. An auditor, a downstream service, a log pipeline — none of
  them can check the token without being handed the ability to forge it.

Compare this with **Module 06's** finding: with the JWT assertion grant enabled, the client secret becomes a
user-minting key at the *authorization server*. Here the same secret becomes a user-minting key at the
*client*. Same root cause — a symmetric secret doing a job that needs asymmetry — showing up on both sides
of the same deployment.

With ES256 and a published JWKS, B6 becomes impossible: the forger would need the AS's private key, which
never leaves the AS.

---

## Exercise 5 — `nonce`, `prompt`, and a real defect

### 5a — `nonce` in, `nonce` out

```bash
for N in "" "abc123"; do
  printf 'requested nonce=%-8s → ' "${N:-<none>}"
  /tmp/flow.sh "$CLIENT_ID" "$REDIRECT_URI" "scope=openid&state=n1${N:+&nonce=$N}" "$CLIENT_SECRET" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      const p=JSON.parse(s).id_token.split(".")[1];
      const c=JSON.parse(Buffer.from(p,"base64url").toString());
      console.log("id_token nonce =", JSON.stringify(c.nonce ?? null))})'
done
```

```
requested nonce=<none>   → id_token nonce = null
requested nonce=abc123   → id_token nonce = "abc123"
```

Exactly as OIDC Core requires: sent → *"Authorization Servers MUST include a nonce Claim in the ID Token"*;
not sent → absent. Note what this means for your validator: **if you did not send a `nonce`, there is nothing
to check, and you have no replay protection.** Always send one.

### 5b — `max_age`

```bash
/tmp/flow.sh "$CLIENT_ID" "$REDIRECT_URI" "scope=openid&state=m1&max_age=0" "$CLIENT_SECRET" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      const p=JSON.parse(s).id_token.split(".")[1];
      const c=JSON.parse(Buffer.from(p,"base64url").toString());
      console.log("auth_time =", c.auth_time, " iat =", c.iat, " delta =", c.iat-c.auth_time)})'
```

```
auth_time = 1785227652  iat = 1785227652  delta = 0
```

`auth_time` is present (as it must be when `max_age` is used) and equals `iat` — the authentication happened
in this flow. Step 13 is where you compare that delta against your own policy. This is the machinery Module
09a's step-up authentication is built on.

### 5c — `prompt=none`, and what should happen

`prompt=none` is how every SPA silently checks "is the user still signed in?" It must either succeed
immediately or return one of the four errors from OIDC Core §3.1.2.6.

```bash
curl -s -i -G "$API/authorization" \
  --data-urlencode "response_type=code" --data-urlencode "client_id=$CLIENT_ID" \
  --data-urlencode "redirect_uri=$REDIRECT_URI" --data-urlencode "scope=openid" \
  --data-urlencode "state=p1" --data-urlencode "prompt=none" \
  | grep -iE '^(HTTP|location)'
```

```
HTTP/1.1 302 Found
Location: http://localhost:3001/callback?error=login_required&error_description=%5BA060301%5D+The+authorization+
request+contains+prompt%3Dnone%2C+but+no+end-user+has+logged+in+this+service.&state=p1&iss=https%3A%2F%2F…
```

**`login_required` — one of the four §3.1.2.6 errors, delivered to the redirect URI with `state` and `iss`
echoed.** That is what a client's silent-renewal handler is written to parse.

> **Until 2026-08-12 this returned `Location: ` — empty.** Not a success, not one of the four errors: a dead
> redirect. The transcript above is the post-fix output, and 5d below is the diagnosis that produced the fix.
> **Run 5d anyway** — the reasoning is the exercise, and the second half of what it uncovers is more
> interesting than the empty header.

Now establish a session and try again, because "is the user still signed in?" is the question `prompt=none`
exists to answer. Run any interactive flow with a cookie jar (`-c jar`), then re-send with `-b jar`:

```
plain                        SUCCESS (code=…)
max_age=3600                 SUCCESS (code=…)
max_age=0  (auth is 2s old)  error=login_required
```

The last row is the one to sit with. `max_age=0` says *"I will only accept an authentication that just
happened."* The session is two seconds old, so the OP refuses and tells the client to re-authenticate —
`EXCEEDS_MAX_AGE` internally, which Authlete renders as `login_required` because that is what §3.1.2.6 gives
the client to act on. **Before this fix that request returned a code**, with an `auth_time` the server had
made up. Keep that in mind through 5d.

### 5d — Diagnose it

Ask the authorization server directly what it told the application to do:

```bash
AUTHLETE_BEARER_TOKEN=$(grep -m1 '^AUTHLETE_BEARER_TOKEN=' server/.env | cut -d= -f2-)
AUTHLETE_BASE_URL=$(grep -m1 '^AUTHLETE_BASE_URL=' server/.env | cut -d= -f2-)
AUTHLETE_SERVICE_ID=$(grep -m1 '^AUTHLETE_SERVICE_ID=' server/.env | cut -d= -f2-)

P="response_type=code&client_id=$CLIENT_ID&redirect_uri=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' -- "$REDIRECT_URI")&scope=openid&state=p1&prompt=none"
curl -s -X POST -H "Authorization: Bearer $AUTHLETE_BEARER_TOKEN" -H "Content-Type: application/json" \
  "$AUTHLETE_BASE_URL/api/$AUTHLETE_SERVICE_ID/auth/authorization" -d "{\"parameters\":\"$P\"}" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);
      console.log("action          =", d.action);
      console.log("responseContent =", JSON.stringify(d.responseContent));
      console.log("ticket present  =", !!d.ticket);
      console.log("resultMessage   =", d.resultMessage)})'
```

```
action          = NO_INTERACTION
responseContent = null
ticket present  = true
resultMessage   = [A004001] Authlete has successfully issued a ticket to the service … [response_type=code, openid=true]
```

There it is. `NO_INTERACTION` means *"you must not show any UI — decide for yourself whether you can satisfy
this, then call `/auth/authorization/issue` or `/auth/authorization/fail`."* It comes with a **ticket** and
**no `responseContent`**, because there is nothing to redirect to yet.

Now read the branch that used to handle it:

```js
// BEFORE — the defect
case "NO_INTERACTION":
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  return res.redirect(result.responseContent ?? "");
```

It treats a *"you decide"* answer as if it were a ready-made redirect URL. `responseContent` is `null`, so
`res.redirect("")` emitted `Location: `.

**Now the second, subtler part, and it is the reason this exercise matters.** The controller *did* contain
`prompt=none` handling — checking for a session and stored consent. But that code sat inside
`case "INTERACTION"`, and the authorization server answers a `prompt=none` request with `NO_INTERACTION`,
never `INTERACTION`. **The handling was unreachable for the only parameter value it was written for.** Dead
code that reads as a feature.

Before reading on, do the exercise: **write what a correct `NO_INTERACTION` branch would do.** Check whether
the session satisfies the request; if yes call the issue API with the ticket; if no call the fail API with the
reason that maps to `login_required` / `consent_required` / `interaction_required` /
`account_selection_required`.

Then compare your answer with the dead code — because the obvious fix was a trap:

```js
// The trap: route NO_INTERACTION into the existing prompt=none block, which contained…
if (!req.session.stepUp) {
  req.session.stepUp = { acr: "pwd", authTime: Math.floor(Date.now() / 1000) };
}
```

**That invents an authentication event.** `acr: "pwd"` with no evidence a password was used; `auth_time: now`
for an authentication that happened at some unknown earlier point — or never. Both were then passed to
Authlete, which stamps them onto the access and ID tokens. And on that path there was no `max_age` check and
no essential-`acr` check at all; those live on the login POST, which `prompt=none` bypasses entirely.

So a one-line "fix" to the empty `Location` would have activated a path where a resource server enforcing
step-up authentication accepts a token whose freshness the OP fabricated. **That is a security control that is
silently not applied** — the exact failure mode `modules/05-request-integrity-and-binding/lab.md` teaches you
to fear. It is strictly worse than the visible bug, and it would have looked like progress.

**Both were fixed together on 2026-08-12**, which is why the `max_age=0` row in 5c now refuses. The rule the
fix encodes is one line long: *an authentication this OP did not observe is one it will not assert.* An
unknown `acr` does not satisfy an essential `acr` request, and an unknown `auth_time` does not satisfy a
`max_age` — "we cannot prove it" is answered as "no", never as "skip the check".

**Severity, using Module 07's method.** Two findings, and they rank differently:

| | Empty `Location` | Fabricated authentication event |
|---|---|---|
| Exploitable | No — nobody gains access | **Yes, once activated** — a step-up control is bypassed |
| Effect | Availability: silent renewal breaks in a way clients cannot classify | Integrity: tokens assert authentication strength and freshness that were never checked |
| Reachable | Any client, no credentials | Only after the first one is "fixed" |

Write both up. The second is what the audit calls a **latent** finding: not exploitable in the code as it
stands, but armed by a change someone is already planning to make. Those are the ones worth hunting, because
the fix that activates them arrives labelled as an improvement.

---

## Exercise 6 — Logout, and two more findings

### 6a — UserInfo, and the check people skip

```bash
R=$(/tmp/flow.sh "$CLIENT_ID" "$REDIRECT_URI" "scope=openid%20profile&state=u1&nonce=nu1" "$CLIENT_SECRET")
AT=$(echo "$R" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).access_token))')
curl -s "$API/userinfo" -H "Authorization: Bearer $AT"
```

```json
{"sub":"admin","name":"admin","given_name":"admin","family_name":"admin","nickname":"admin",
 "preferred_username":"admin","zoneinfo":"UTC","locale":"en-US","updated_at":…}
```

OIDC Core §5.3.2 requires the client to verify that this `sub` matches the `sub` from the ID token. It looks
redundant — same provider, same flow — and it is not: the access token and the ID token are separate
artefacts, and a mismatch means they describe different people. Add the check to your mental template; it is
two lines and it is the difference between "I fetched a profile" and "I fetched *this user's* profile."

### 6b — RP-initiated logout, and an open redirect

Start with the obvious thing: hand the logout endpoint five destinations and see which ones it accepts.

```bash
for U in "http://localhost:3000" \
         "http://localhost:3000.evil.example.com/bye" \
         "http://localhost:3001@evil.example.com/" \
         "http://localhost:31337/bye" \
         "https://evil.example.com/bye"; do
  printf '%-46s ' "$U"
  curl -s -o /dev/null -w 'status=%{http_code} loc=%{redirect_url}\n' -G "$API/logout" \
    --data-urlencode "post_logout_redirect_uri=$U" --data-urlencode "state=xyz"
done
```

```
http://localhost:3000                          status=200 loc=
http://localhost:3000.evil.example.com/bye     status=200 loc=
http://localhost:3001@evil.example.com/        status=200 loc=
http://localhost:31337/bye                     status=200 loc=
https://evil.example.com/bye                   status=200 loc=
```

**Five identical rows, and not one of them logged you out.** That is not the redirect check working — it is
the endpoint refusing to *act* on a `GET` at all, and it is the second of two fixes this exercise carries.

RP-Initiated Logout 1.0 §2:

> At the Logout Endpoint, the OP SHOULD ask the End-User whether to log out of the OP as well. Furthermore,
> the OP **MUST** ask the End-User this question if an `id_token_hint` was not provided or if the supplied
> ID Token does not belong to the current OP session.

Until 2026-08-12 the server never asked. It destroyed the session on a bare `GET`, which is a MUST violation
and — because logout is a state-changing operation reachable by `GET` — CSRF-able by construction. **An
`<img src="http://localhost:3000/api/logout">` on any page you visited logged you out of the OP.** Note what
that does to the *other* finding in this exercise: an attacker did not need you to intend to log out, so the
open redirect below was reachable without your cooperation.

Confirm the fix for yourself — fetch the page and read what came back:

```bash
curl -s "$API/logout?client_id=demo-client&post_logout_redirect_uri=http://localhost:3000/bye&state=xyz" \
  | grep -E '_csrf|<h1>|hidden'
```

```html
    <h1>Sign out?</h1>
      <input type="hidden" name="_csrf" value="4d3b69d6fde7abf252a46fa5b9b1d1b23cc86c3ab3f29f0161af59687e16c529" />
      <input type="hidden" name="post_logout_redirect_uri" value="http://localhost:3000/bye" />
      <input type="hidden" name="state" value="xyz" />
      <input type="hidden" name="client_id" value="demo-client" />
```

A question, a CSRF token, and your parameters held for replay. **Now** do the loop properly — as a `POST`
that submits that form:

```bash
for U in "http://localhost:3000" \
         "http://localhost:3000.evil.example.com/bye" \
         "http://localhost:3001@evil.example.com/" \
         "http://localhost:31337/bye" \
         "https://evil.example.com/bye"; do
  J=$(mktemp)
  CSRF=$(curl -s -c "$J" "$API/logout" | sed -n 's/.*name="_csrf" value="\([^"]*\)".*/\1/p')
  printf '%-46s ' "$U"
  curl -s -b "$J" -o /dev/null -w 'status=%{http_code} loc=%{redirect_url}\n' -X POST "$API/logout" \
    --data-urlencode "_csrf=$CSRF" --data-urlencode "client_id=$CLIENT_ID" \
    --data-urlencode "post_logout_redirect_uri=$U" --data-urlencode "state=xyz"
  rm -f "$J"
done
```

```
http://localhost:3000                          status=302 loc=http://localhost:3000/?state=xyz
http://localhost:3000.evil.example.com/bye     status=200 loc=
http://localhost:3001@evil.example.com/        status=200 loc=
http://localhost:31337/bye                     status=200 loc=
https://evil.example.com/bye                   status=200 loc=
```

**Note the `client_id`.** It is not decoration — §3 matches against *that client's* registered URIs, so
without it there is nothing to match and every row would be a `200`. You will prove that in a moment.

**Why a fresh `GET` inside the loop?** Two reasons, both worth internalising. The CSRF token is rotated on
every accepted `POST`, and a successful logout destroys the session that was holding it — so a token is good
for exactly one logout. Try it: reuse one and you get `403`.

```bash
J=$(mktemp)
CSRF=$(curl -s -c "$J" "$API/logout" | sed -n 's/.*name="_csrf" value="\([^"]*\)".*/\1/p')
echo -n "no token    : "; curl -s -o /dev/null -w '%{http_code}\n' -X POST "$API/logout"
echo -n "first POST  : "; curl -s -b "$J" -o /dev/null -w '%{http_code}\n' -X POST "$API/logout" -d "_csrf=$CSRF"
echo -n "same token  : "; curl -s -b "$J" -o /dev/null -w '%{http_code}\n' -X POST "$API/logout" -d "_csrf=$CSRF"
rm -f "$J"
```

```
no token    : 403
first POST  : 200
same token  : 403
```

> **This exercise used to reproduce a live open redirect. It was fixed on 2026-08-10, and the `POST`
> transcript above is the post-fix output.** The two attacker hosts now render the signed-out page instead of
> redirecting. The exercise is still worth running, because *why* they used to pass is the lesson — and
> because one row still redirects somewhere nobody registered. Keep reading.

**What used to happen, and why.** Before the 2026-08-10 fix — back when a bare `GET` did all of this — rows two and three were both `302`s to `evil.example.com`:

- `http://localhost:3000.evil.example.com` — the host is `evil.example.com`. `localhost:3000` is a *subdomain
  label*. A human skims it as localhost.
- `http://localhost:3001@evil.example.com/` — everything before `@` is userinfo. The host is, again,
  `evil.example.com`.

The cause was in `server/src/services/logout.service.ts`, and it is worth reading the old code:

```js
// BEFORE — the defect
const isAllowed =
  post_logout_redirect_uri === allowedRedirectUri ||
  (process.env.NODE_ENV !== "production" && post_logout_redirect_uri.startsWith("http://localhost:")) ||
  [...allowedOrigins].some((origin) => post_logout_redirect_uri?.startsWith(origin));
```

Two prefix matches. **`startsWith` is not URI matching** — it has no idea where the host ends.

Now do the part that separates a finding from a shrug: **decide whether it survived in production.** The middle
clause is gated on `NODE_ENV !== "production"`, so it disappeared. The third clause did not — and with
`ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001`, the string
`http://localhost:3000.evil.example.com/bye` still passed `startsWith("http://localhost:3000")`. **The open
redirect survived production**, and in a real deployment where `ALLOWED_ORIGINS` is `https://app.example.com`, so
did `https://app.example.com.evil.net/`. It was not a dev-only finding.

RFC 9700 §2.1: *"Clients and authorization servers MUST NOT expose URLs that forward the user's browser to
arbitrary URIs obtained from a query parameter."* Note the contrast with Module 07 Exercise 2a, where the
**authorization** endpoint refused an unregistered `redirect_uri` with a 400 and no `Location` — the same
deployment got exact matching right in one place and wrong in another. That is the "enforced in one path"
shape of conformance theatre, found in the wild.

**The first fix, and what it teaches.** On 2026-08-10 `isAllowedPostLogoutRedirectUri` was changed to *parse*
the value and compare **origins**, never strings:

```js
// 2026-08-10 — parse, then compare  (superseded 2026-08-12; see below)
const url = new URL(candidate);                    // throws → refuse
if (url.protocol !== "http:" && url.protocol !== "https:") return false;
if (allowedOrigins.has(url.origin)) return true;   // exact origin equality
```

Three details were doing the work, and each is a transferable lesson — they are why the two attacker rows are
refused, and they remain true about URL parsing even though this code has since been replaced:

1. **`new URL("http://localhost:3000.evil.example.com/bye")` throws** — `3000.evil.example.com` is not a valid port. Failing closed on a parse error is not defensive padding; it is the check.
2. **`new URL("http://localhost:3001@evil.example.com/").origin` is `http://evil.example.com`** — the parser knows where userinfo ends and the host begins. `startsWith` never will.
3. **Origin comparison normalises host case** (RFC 3986 §3.2.2), so `https://APP.EXAMPLE.COM` matches `https://app.example.com`. String comparison would have needed that by hand, and most implementations forget.

**The row that used to redirect, and no longer does.** `http://localhost:31337/bye` was a `302` until
2026-08-12 — to a port nobody registered — because outside production the check accepted any `localhost` host
so the labs would keep working. That clause is gone, and the reason is the second half of §3.

**Matching origins was never what §3 asked for.** Read it again:

> The OP also MUST NOT perform post-logout redirection if the `post_logout_redirect_uri` value supplied does
> not exactly match one of the **previously registered** `post_logout_redirect_uris` values.

Two requirements, and origin matching met only one. *"Exactly match"* — met. *"Previously registered"* — not
met at all: the list came from `ALLOWED_ORIGINS`, a **deployment-wide** environment variable, so every client
shared one list and any client could be sent to any allowed origin. §3 wants a **per-client** registry.

Prove the difference yourself. Same URI, same everything, only the client changes:

```bash
post() {                       # $1 = label, then extra curl args
  local L="$1"; shift
  local J=$(mktemp)
  local CSRF=$(curl -s -c "$J" "$API/logout" | sed -n 's/.*name="_csrf" value="\([^"]*\)".*/\1/p')
  printf '%-30s ' "$L"
  curl -s -b "$J" -o /dev/null -w 'status=%{http_code} loc=%{redirect_url}\n' -X POST "$API/logout" \
    --data-urlencode "_csrf=$CSRF" --data-urlencode "post_logout_redirect_uri=http://localhost:3000" "$@"
  rm -f "$J"
}

post "registered client"   --data-urlencode "client_id=$CLIENT_ID"
post "no client_id"
post "unknown client"      --data-urlencode "client_id=9999999999"
post "trailing slash"      --data-urlencode "client_id=$CLIENT_ID" \
                           --data-urlencode "post_logout_redirect_uri=http://localhost:3000/"
```

```
registered client              status=302 loc=http://localhost:3000/
no client_id                   status=200 loc=
unknown client                 status=200 loc=
trailing slash                 status=200 loc=
```

Three lessons in four lines:

1. **No client means no registered set, and an empty set refuses everything.** That is not the server being
   cautious — it is §3's own answer. A logout request that names nobody cannot be redirected anywhere.
2. **A trailing slash is a different URI.** `http://localhost:3000/` is not `http://localhost:3000`. "Exactly"
   really does mean byte-for-byte, and this is the single most common cause of a redirect-URI support ticket
   in any OAuth deployment.
3. **The comparison no longer parses anything.** Origin matching needed `new URL()` because it had to know
   where the host ended; matching whole registered URIs needs a `===`. A check with no parser cannot have a
   parser bug — which is worth remembering, because both of the payloads in rows 2 and 3 were parser
   confusion.

**Where the registry lives, and the vendor gap behind it.** This deployment holds the per-client list in a
`POST_LOGOUT_REDIRECT_URIS` environment variable rather than in client metadata, and that is not laziness:
**Authlete 3.0 has no field for it.** Its `Client` schema has 108 properties and not one of them is a
post-logout redirect URI; its only client-level logout fields are `backchannelLogoutUri` and
`backchannelLogoutSessionRequired`. Writing `postLogoutRedirectUris` through the client update API returns
**`200` and silently discards it** — verified on all three clients.

That is worth sitting with, because it is the most realistic thing in this exercise. **A specification's MUST
can be unsatisfiable in the form the specification imagines, because your identity provider does not model the
field.** The honest response is not to pretend, and not to give up: it is to implement the *property* the
requirement exists to provide — per-client, exact — record precisely where your implementation departs and
why, and make the departure a stored fact rather than folklore. Write that up. A finding that says "§3 is
unmet" is worth much less than one that says "§3's security property is met; its registration model cannot be,
for this reason, and here is the evidence."

**Three findings, three fixes, and a sequencing lesson.** You have now seen the whole of this endpoint's
history, and the parts are worth separating:

| Finding | Spec | Fixed | What it cost the attacker |
|---|---|---|---|
| Prefix matching accepted attacker hosts | §3 (*"exactly match"*) | 2026-08-10 | The destination |
| No confirmation, so a `GET` logged you out | §2 (*"MUST ask"*) | 2026-08-12 | The trigger |
| One deployment-wide list, not a per-client one | §3 (*"previously registered"*) | 2026-08-12 | Borrowing another client's targets |

Fixing only the first would have left `<img src="…/api/logout">` working as a forced logout — annoying rather
than dangerous, but still a MUST violation. Fixing only the second would have left an open redirect that now
needed a click. The third was invisible while the first two were open, and it is the one an origin-matching
fix *looks* like it has already solved. **No fix subsumes another**, and an audit that reports one and stops
has found a third of the defect. That is the shape to look for: a single endpoint failing three requirements
of the same specification — two of them clauses of the same sentence — for unrelated reasons.

### 6c — Back-channel logout

```bash
LT=$(node -e '
const c=require("crypto");
const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const now=Math.floor(Date.now()/1000);
console.log(
  b({alg:"ES256",typ:"logout+jwt",kid:"x"})+"."+
  b({iss:"https://other-op.example.com",aud:"client",iat:now,exp:now+120,jti:c.randomUUID(),
     sub:"admin",events:{"http://schemas.openid.net/event/backchannel-logout":{}}})+".AAAA");')

echo -n "well-formed logout token : "; curl -s -X POST "$API/backchannel_logout" -d "logout_token=$LT"; echo
echo -n "no events claim          : "; curl -s -X POST "$API/backchannel_logout" \
  -d "logout_token=$(node -e 'const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");console.log(b({alg:"ES256"})+"."+b({iss:"x",sub:"admin"})+".AAAA")')"; echo
echo -n "missing logout_token     : "; curl -s -X POST "$API/backchannel_logout" -d ""; echo
```

```
well-formed logout token : {"error":"server_error"}
no events claim          : {"error":"server_error"}
missing logout_token     : {"error":"invalid_request","error_description":"Missing logout_token"}
```

**Read those three answers carefully, because the first two changed on 2026-08-13 and the change is the
lesson.** They used to be:

```
well-formed logout token : {"error":"invalid_request","error_description":"Invalid logout token"}
no events claim          : {"error":"invalid_request","error_description":"Token is not a backchannel logout token"}
```

`400 invalid_request` means *"your token is bad"*. But `JWKS_URI` is not set in `server/.env`, so this server
**cannot check any signature at all**. It was not judging the token; it could not. An operator debugging that
reads the error, inspects their perfectly good token, finds nothing wrong, and loses an afternoon.

`500 server_error` means *"my fault, not yours"* — and the server's log now says which knob is missing.
**Notice that even the "no events claim" case became a 500**, and that is deliberate rather than sloppy: if
the server cannot verify a signature, it must not render *any* verdict on the token, not even a true one about
a missing claim. Declaring "this token is malformed" while unable to accept a well-formed one would be an
accident of check ordering, not an assessment.

The last line still answers 400, because "you sent no `logout_token`" is a fact about the *request* that holds
regardless of our configuration.

> **The rule.** Map a failure to the party that can fix it. `4xx` is the caller's problem, `5xx` is yours. A
> server that reports its own misconfiguration as client error sends people to debug the wrong machine — and
> it is the single most common way a correct client is blamed for a broken deployment.

### What else was wrong here, and what it took to see it

Two structural defects sat in `logout.controller.ts` alongside the status-code bug. Both were fixed on
2026-08-13; read them as a worked example of how to audit a validation routine.

1. **`jwt.verify(logoutToken, publicKey, { algorithms: [...] })` checked the signature and almost nothing
   else.** No `issuer`, no `audience`, no `iat` bound, no `sub`/`sid` presence, no rejection of `nonce` —
   five of §2.6's eleven steps missing. `exp` *was* checked, because `jsonwebtoken` enforces it by default;
   knowing which checks a library gives you free and which it does not is the whole skill here. The gap
   meant any OP whose key happened to be in the configured JWKS could log out any subject, and a token
   addressed to a different `aud` was accepted.
2. **It destroyed `req.session`** — the session of whoever sent the POST. A back-channel logout is a
   server-to-server call carrying no browser cookie, so `req.session` was never the user's session. The
   endpoint therefore destroyed nothing, returned `200`, and the sending OP believed the user had been
   logged out. **A security feature that silently does nothing is worse than one that visibly fails**, and
   this one had `AGENTS.md` describing it as working correctly.

The fix looks sessions up by `sub` in the session store (`utils/session-store.ts`). One detail there is worth
your attention because it is the kind of thing that ships broken: the two session stores this server supports
return **different shapes** from `Store.all()` — an object keyed by session id for the in-memory store, an
array for Redis. Handle only one and the feature silently terminates nothing on the other, which is exactly
the failure mode being fixed. The test suite runs the real in-memory store rather than trusting a reading of
its source.

Also check what discovery says about all this:

```bash
curl -s "$API/.well-known/openid-configuration" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);
for (const k of ["end_session_endpoint","backchannel_logout_supported","frontchannel_logout_supported","check_session_iframe"])
  console.log(k.padEnd(34), JSON.stringify(k in d ? d[k] : "ABSENT"))})'
```

```
end_session_endpoint               "https://…/api/logout"
backchannel_logout_supported       "ABSENT"
frontchannel_logout_supported      "ABSENT"
check_session_iframe               "ABSENT"
```

Which is, in this one instance, **accurate**: the endpoint exists in code but does not function, and discovery
does not claim it does. Compare with Module 07's finding that the same document misdescribes the revocation
endpoint. Metadata here is neither reliably right nor reliably wrong, which is the worst of both — and is
exactly why the audit method has three sources.

### 6d — One more from discovery

```bash
curl -s "$API/.well-known/openid-configuration" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).id_token_signing_alg_values_supported))'
```

```
[
  'PS384', 'RS384',
  'HS256', 'HS512',
  'ES256', 'RS256',
  'HS384', 'PS256',
  'PS512', 'RS512'
]
```

OpenID Connect Discovery 1.0 §3, on `id_token_signing_alg_values_supported`: *"The algorithm RS256 **MUST**
be included."* It is — and it only started being on **2026-08-12**. Until then this endpoint returned:

```
[ 'HS256', 'HS512', 'ES256', 'HS384' ]
```

**Read that pair of transcripts as one exercise, because the fix is more interesting than the defect.** No
code changed. Nobody edited a list of algorithm names. One **RSA key** was registered in the service's JWK
Set, and Authlete recomputed *four* metadata members from the key material it now holds — this one,
`userinfo_signing_alg_values_supported`, `introspection_signing_alg_values_supported` and
`authorization_signing_alg_values_supported` all gained the same six entries. That is the shape worth
learning: **this document is derived, not authored.** The `HS*` entries come from client secrets, the `ES256`
from the EC key, and all six `RS*`/`PS*` from one 2048-bit RSA key with **no `alg` member** — RFC 7517 §4.4
makes `alg` OPTIONAL, and omitting it is what lets a single key back every algorithm it can compute.

Two follow-ups, and the second is the point:

- **Discovery §3's `MUST` was failing for a year of this deployment's life**, and it is exactly the kind of
  thing an interop test suite fails you on while every hand-written test passes. It belonged in your Module
  07 report.
- **Advertised is not the same as usable** — the rule this curriculum applies to grant types, response modes
  and client-auth methods applies to algorithms too. Checking took one flow: a client set to `RS256` was
  issued an ID token with `{"kid":"rsa-1","alg":"RS256"}` in the header, and 3d's validator returned `ACCEPT`
  against the published key. Ten advertised algorithms, one of them now actually exercised. **Nine to go** —
  and `PS256`, the one FAPI 1.0 Advanced §5.2.2 requires, is among the nine.

---

## Break it — three to reason about

**Break 1 — the login bug, written out.** Take the broken snippet from the lesson and write the attacker's
steps concretely against a hypothetical "Sign in with Example": what they register, what they get the victim
to do, what they send to the vulnerable endpoint, and at exactly which of the thirteen steps a correct
implementation stops them. Then explain why adding "and we also check the token is valid" does not fix it.

**Break 2 — the validator with one step missing.** For each of steps 2, 3, 7 and 11, describe an attack that
becomes possible if only that step is dropped, everything else being correct. One of the four is much harder
to exploit than the others — say which and why.

**Break 3 — logout that does not log out.** The user clicks "sign out" in an SPA. Enumerate everything that is
still alive afterwards on this deployment: the OP session, the RP session, the access token, the refresh
token, tokens in `sessionStorage`, and any other RP the user signed into. For each, say what would be required
to actually end it, and which of the four logout specs (if any) covers it.

---

## Verification block

- [ ] Adding `openid` to `scope` produced an `id_token`, and you can name the two things it has that the
      introspection response cannot have.
- [ ] You wrote the validator and it printed `ACCEPT` on a real token, with all thirteen applicable steps.
- [ ] You noticed the ID token's lifetime and can say why step 10 exists given step 9 already passed.
- [ ] Five of six forgeries were rejected, and you can name the step that caught each.
- [ ] **B6 was accepted**, and you can explain why that is a correct validator and a broken configuration.
- [ ] You saw `c_hash` in a hybrid ID token and can say what it binds and why the code flow does not need it.
- [ ] `nonce` appeared in the ID token when sent and was absent when not.
- [ ] `prompt=none` returned one of the four §3.1.2.6 errors, you traced *why* it once returned an empty
      `Location` to `NO_INTERACTION`, and you can name all four errors.
- [ ] You can explain why fixing the empty `Location` **alone** would have been worse than leaving it, and
      what "latent finding" means.
- [ ] `max_age=0` against a two-second-old session was refused, and you can say which of `acr` and
      `auth_time` the server is entitled to assert and on what evidence.
- [ ] Every row of the **`GET`** loop returned `200` and logged nobody out, and you can state the §2
      requirement that makes that correct and the CSRF consequence of the old behaviour.
- [ ] The two attacker hosts were **refused** by the logout endpoint on the **`POST`**, and you can explain —
      from the old code — why prefix matching accepted them and why `NODE_ENV=production` did not fix it.
- [ ] You can say why the same CSRF token cannot log you out twice.
- [ ] You can explain why the same URI redirects for one `client_id`, is refused with no `client_id`, and is
      refused with a trailing slash — quoting the two clauses of §3 that each case exercises.
- [ ] You can say where this deployment keeps its registered URIs, why they are not in Authlete, and what you
      would write in a finding about a MUST the vendor gives you no way to satisfy.
- [ ] You can list, from the code, two things the back-channel logout handler fails to validate.

## Clean up

```bash
rm -f /tmp/flow.sh /tmp/validate-id-token.mjs /tmp/forge.mjs
unset IDT AT NONCE AUTHLETE_BEARER_TOKEN
```

The forged tokens in Exercise 4 were never sent anywhere — they only ever went into your own validator. That
is deliberate: you can learn everything from B1–B6 without pointing a forged credential at a running service.

---

## What to carry into Module 09a

**Ask, of every token: who is this addressed to?** Access token → a resource server. ID token → one specific
client. That single question is `aud`, and it is the difference between a login system and an
authentication bypass.

**A correct validator on a broken configuration still loses.** B6 passed all thirteen steps. The spec was
followed exactly. HS256 was the mistake, made in a console, months earlier, by someone who was not thinking
about forgery. Most real failures look like this.

Module 09a takes the authentication event apart: **JARM** signs the whole authorization response instead of
hashing pieces of it; **CIBA** authenticates a user with no redirect at all; **RFC 9470** lets a resource
server demand stronger authentication mid-session, which is `acr` and `auth_time` — the two claims you just
learned to read — doing real work.
