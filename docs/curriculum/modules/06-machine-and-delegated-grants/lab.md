# Module 06 — Lab

**The short version:** six exercises against the live server. You will get a token with no subject at all, then
mint one for a user who never logged in, then discover that this deployment answers a delegation request with
an impersonation token and does not mention it. Predict every outcome before you run it.

## Before you start

Running server on `:3000`, and `curriculum.env` sourced:

```bash
set -a; source docs/curriculum/scripts/curriculum.env; set +a
curl -s "$API/health" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).status))'
```

```
ok
```

You need `$API`, `$CLIENT_ID`, `$CLIENT_SECRET`, `$PUB_CLIENT_ID`, `$REDIRECT_URI`, `$LAB_USER`, `$LAB_PASS`.

### Service and client configuration this lab assumes

Three things must be true on your Authlete service. Check them in the console before you start; two of the six
exercises fail confusingly otherwise.

| Where | Setting | Needs to be | Why |
|---|---|---|---|
| Service → Grant Types | `CLIENT_CREDENTIALS`, `JWT_BEARER`, `TOKEN_EXCHANGE` | enabled | Exercises 1, 3, 6 |
| Service → Token Exchange | *Permitted Clients Only* | either, but see next row | Controls Exercise 6's gate |
| Client `$CLIENT_ID` → Token Exchange | *Explicit Permission for Token Exchange* | **enabled** | Required if the row above is on |

`$CLIENT_ID` must be **confidential** (Exercise 1 shows you why) and must have `JWT_BEARER` and
`TOKEN_EXCHANGE` in its grant types.

> **Vendor behavior, flagged once for the whole lab.** Every error string with a bracketed code —
> `[A052301]`, `[A311305]`, and so on — is **Authlete's**, not the spec's. The HTTP status codes and the
> `error` values (`invalid_request`, `invalid_grant`, `unauthorized_client`) *are* spec-defined. When you move
> to another AS, expect the codes to vanish and the shapes to stay.

> **Outputs below are redacted.** Real token values are replaced with `EXAMPLE-…`. Yours will differ. Never
> paste a real token into a document, a ticket, or a chat message — Exercise 6 is about exactly what goes
> wrong when credentials end up in fields meant for identifiers.

---

## Exercise 1 — A token with nobody in it

**Goal:** see what "the client acts as itself" actually looks like on the wire, and confirm the two rules
RFC 6749 §4.4 imposes.

### 1a — Get a client-credentials token

```bash
curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=client_credentials" -d "scope=profile"
```

```json
{"access_token":"EXAMPLE-cc-token","token_type":"Bearer","expires_in":86400,"scope":"profile"}
```

Two things to notice before moving on. There is **no `refresh_token`** — RFC 6749 §4.4.3: *"A refresh token
SHOULD NOT be included."* And `expires_in` is **86400**: twenty-four hours, the service default. Nothing about
this grant makes a long lifetime safe; it is simply what the service was configured with. Write that number
down — you will see it again on every token in this lab, including ones that should be far shorter.

### 1b — Introspect it and find the hole

```bash
CC=$(curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=client_credentials" -d "scope=profile" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).access_token))')

curl -s -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" -X POST "$API/introspection/standard" -d "token=$CC"
```

```json
{"active":true,"scope":"profile","client_id":"…","token_type":"Bearer",
 "exp":1785310203,"iss":"https://…"}
```

**There is no `sub`.** Compare against the introspection you ran in Module 04 on an authorization-code token,
which had `sub`, `auth_time`, and `acr`. Those three claims are the residue of a human having been present.
Here there was no human, so there is no residue.

This is the single most useful fact in the module. A resource server that reads `claims.sub` and looks up a
user record gets `undefined` — and in most languages `undefined` is a perfectly good lookup key that quietly
matches nothing, or worse, matches the first record.

### 1c — Confirm it cannot reach user data

```bash
curl -s -i -X GET "$API/userinfo" -H "Authorization: Bearer $CC" | grep -i '^WWW-Authenticate'
```

```
WWW-Authenticate: Bearer error="insufficient_scope",error_description="[A089304] The userinfo endpoint
requires 'openid' scope, but the access token does not cover the scope."
```

403, and the reason given is *scope*, not *subject*. Hold that thought for 1d.

### 1d — Ask for `openid` anyway

```bash
curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=client_credentials" -d "scope=openid profile"
```

```json
{"access_token":"EXAMPLE-cc-token-2","token_type":"Bearer","expires_in":86400,"scope":"profile"}
```

**You asked for `openid profile`. You got `profile`.** HTTP 200. No warning, no error field, nothing in a log
you would notice.

The behavior is right: `openid` asks for an ID token, an ID token is an assertion about an authenticated user,
and there is no user. But the *reporting* is the lesson. RFC 6749 §3.3 requires the AS to include `scope` in
the response when the granted scope differs from the requested scope — which it did, so this response is
conformant. Conformant, and still able to produce a 3 a.m. incident, because the client that assumed it would
get an ID token finds out at runtime.

**Rule to carry:** on every token response, compare the `scope` you got to the `scope` you asked for. Silence
is not agreement.

### 1e — Try it as a public client

```bash
curl -s -X POST "$API/token" \
  -d "grant_type=client_credentials" -d "client_id=$PUB_CLIENT_ID" -d "scope=profile"
```

```json
{"error":"unauthorized_client",
 "error_description":"[A052301] Public clients are not allowed to use 'grant_type=client_credentials'."}
```

RFC 6749 §4.4: *"The client credentials grant type MUST only be used by confidential clients."* The reasoning
is not bureaucratic — a public client has no secret, so "authenticate the client" has no meaning, so there is
no principal whose authority the token could represent. The grant would issue a token to anyone who knows a
`client_id`, and `client_id` is public by construction.

---

## Exercise 2 — Get a user token to work with

Exercise 1 showed you a token with nobody in it. To know what that absence actually costs, you need the other
half of the comparison: a token with a human behind it. Drive the authorization-code flow exactly as in
[Module 02's lab](../02-oauth-core-and-threats/lab.md#exercise-1--drive-the-authorization-code-flow-leg-by-leg);
this is the condensed version.

```bash
CJ=$(mktemp)
RU_ENC=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' -- "$REDIRECT_URI")

# Leg 1 — authorization request
curl -s -c "$CJ" -o /dev/null \
  "$API/authorization?response_type=code&client_id=$CLIENT_ID&redirect_uri=$RU_ENC&scope=profile&state=m06lab"

# Leg 2 — log in
CSRF=$(curl -s -b "$CJ" -c "$CJ" "$API/session/login" | grep -o 'name="_csrf" value="[^"]*"' | head -1 | cut -d'"' -f4)
FINAL=$(curl -s -b "$CJ" -c "$CJ" -o /dev/null -w '%{redirect_url}' -X POST "$API/session/login" \
  -d "username=$LAB_USER" -d "password=$LAB_PASS" --data-urlencode "_csrf=$CSRF")

# Leg 3 — consent, but only if we were actually asked for it
case "$FINAL" in
  *code=*) : ;;                       # stored consent already covered it; we have the code
  *) CSRF2=$(curl -s -b "$CJ" -c "$CJ" "$API/session/consent" \
       | grep -o 'name="_csrf" value="[^"]*"' | head -1 | cut -d'"' -f4)
     FINAL=$(curl -s -b "$CJ" -c "$CJ" -o /dev/null -w '%{redirect_url}' -X POST "$API/session/consent" \
       -d "decision=approve" --data-urlencode "_csrf=$CSRF2") ;;
esac

# Leg 4 — redeem
CODE=$(node -e 'const u=new URL(process.argv[1]);process.stdout.write(u.searchParams.get("code")||"")' -- "$FINAL")
USER_AT=$(curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=authorization_code" --data-urlencode "code=$CODE" \
  --data-urlencode "redirect_uri=$REDIRECT_URI" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).access_token))')

curl -s -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" -X POST "$API/introspection/standard" -d "token=$USER_AT"
```

```json
{"active":true,"scope":"profile","client_id":"…","token_type":"Bearer","exp":1785310381,
 "sub":"admin","iss":"https://…","auth_time":1785223980,"acr":"pwd"}
```

`sub`, `auth_time`, `acr`. **This** is what a token with a human behind it looks like. Set it beside the
introspection from 1b and the three missing claims are the whole difference between the two grants.

Keep `$USER_AT`. Exercise 6 deliberately exchanges the *subject-less* client-credentials token instead —
that is what makes the defect there visible — but you will want this one to hand to confirm for yourself that
the same exchange behaves differently when Authlete can resolve a real subject.

> **Why the `case` statement.** Depending on whether `consent-store.service.ts` already holds a consent for
> this `{clientId}:{subject}` pair (24-hour TTL), the login leg either lands you on the consent page or
> redirects straight to your callback with a code. Both happen in practice; the branch handles either. The
> store is in memory, so restarting the server clears it if you want to watch the consent screen.

---

## Exercise 3 — Mint a token for a user who never logged in

**Goal:** the headline. You will produce an access token whose `sub` is a user who did not authenticate, did
not consent, and need not exist — using nothing but a client credential you already hold.

### 3a — Build a signed assertion

The service verifies the assertion against **the calling client's own key**. Your client authenticates with
`client_secret_basic`, so its key is the client secret and the algorithm is HS256. Save this helper:

```bash
cat > /tmp/mkassert.mjs <<'EOF'
import crypto from "node:crypto";
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const [, , alg, secret, iss, sub, aud, extra] = process.argv;
const now = Math.floor(Date.now() / 1000);
const payload = { iss, sub, aud, iat: now, exp: now + 300, jti: crypto.randomUUID(),
                  ...(extra ? JSON.parse(extra) : {}) };
const si = `${b64({ alg, typ: "JWT" })}.${b64(payload)}`;
const sig = alg === "none" ? "" : crypto.createHmac("sha256", secret).update(si).digest("base64url");
console.log(`${si}.${sig}`);
EOF
```

The audience must be the AS's issuer identifier or its token endpoint URL — RFC 7521 §5.2 requires the AS to
reject anything else. Read it from discovery rather than guessing:

```bash
ISS=$(curl -s "$API/.well-known/openid-configuration" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).issuer))')
echo "$ISS"
```

### 3b — Assert yourself, and check it works at all

```bash
ASSERTION=$(node /tmp/mkassert.mjs HS256 "$CLIENT_SECRET" "$CLIENT_ID" "$CLIENT_ID" "$ISS")

curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" \
  --data-urlencode "assertion=$ASSERTION" -d "scope=profile"
```

```json
{"access_token":"EXAMPLE-jwtbearer-token","token_type":"Bearer","expires_in":86400,"scope":"profile"}
```

Fine so far — `sub` is the client, so this is a roundabout client-credentials grant.

### 3c — Now change one field

```bash
ASSERTION=$(node /tmp/mkassert.mjs HS256 "$CLIENT_SECRET" "$CLIENT_ID" "alice" "$ISS")
#                                                                       ^^^^^ the only change

AT=$(curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" \
  --data-urlencode "assertion=$ASSERTION" -d "scope=profile" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).access_token||""))')

curl -s -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" -X POST "$API/introspection/standard" -d "token=$AT"
```

```json
{"active":true,"scope":"profile","client_id":"…","token_type":"Bearer",
 "exp":1785310260,"sub":"alice","iss":"https://…"}
```

**`"sub": "alice"`.** A live access token for a user who never authenticated, never consented, and — as far as
this AS is concerned — need not exist. No browser was involved. The only input was the client secret.

Try `sub` values of your own: another demo user, a plausible admin account, a string that is not a user at all.
They all work. The AS is not checking a user database; it is relying on the assertion, exactly as RFC 7521
describes: *"the authorization server acts as a relying party."*

### 3d — Sit with what that means

**This is not a bug in RFC 7523.** It is the design working correctly. The assertion grant exists so a trusted
issuer can vouch for subjects who are not present — a partner IdP, an enterprise directory, a CI system. The
signature proves *who is speaking*, and the deployment is responsible for deciding *what they may say*.

What is worth calling out is where the trust anchor sits **here**:

| | Intended design | This deployment |
|---|---|---|
| Who is the trusted issuer? | A registered federation partner | The calling client itself |
| What key verifies the assertion? | The issuer's registered key, resolved from `iss` | The client's own credential |
| Which subjects may it assert? | An allowlist or namespace rule, per issuer | **Anything** |

The consequence in one sentence: **on this deployment, the client secret is a user-minting key.** Every place
that secret is stored — a CI variable, a `.env` on a laptop, a container image layer, a Terraform state file —
is a place someone can mint a token for any user.

Prove the trust anchor is the client and not `iss` by putting a stranger in the issuer field:

```bash
ASSERTION=$(node /tmp/mkassert.mjs HS256 "$CLIENT_SECRET" "https://not-a-real-idp.example.com" "alice" "$ISS")
curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" \
  --data-urlencode "assertion=$ASSERTION" -d "scope=profile" | head -c 60
```

```
{"access_token":"EXAMPLE-token","token_type":"Bearer",…
```

Accepted. `iss` names an issuer that does not exist and nothing objects, because the signature was checked
against the client's key and `iss` was never resolved against a trust store. **On this deployment `iss` is
decorative.** In a real federation it is the most important claim in the assertion — it selects the key and
the policy. Both statements are true at once, which is why you check rather than assume.

**What just happened?** You learned that a signature answers "who signed this," never "were they allowed to
say it." The second question is deployment configuration, it has no standard mechanism, and its default is
usually "no restriction."

---

## Exercise 4 — Break the assertion six ways

**Predict each result before running.** Write down the HTTP status and the `error` value you expect.

```bash
brk () {
  printf '%-28s ' "$1"
  curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" \
    -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" \
    --data-urlencode "assertion=$2" -d "scope=profile" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);
      console.log(j.access_token ? "ISSUED A TOKEN" : `${j.error}: ${j.error_description}`)})'
}

brk "alg:none"        "$(node /tmp/mkassert.mjs none x "$CLIENT_ID" alice "$ISS")"
brk "wrong key"       "$(node /tmp/mkassert.mjs HS256 not-the-secret "$CLIENT_ID" alice "$ISS")"
brk "wrong audience"  "$(node /tmp/mkassert.mjs HS256 "$CLIENT_SECRET" "$CLIENT_ID" alice https://evil.example.com)"
brk "expired"         "$(node /tmp/mkassert.mjs HS256 "$CLIENT_SECRET" "$CLIENT_ID" alice "$ISS" '{"exp":1000000000}')"
brk "no sub"          "$(node /tmp/mkassert.mjs HS256 "$CLIENT_SECRET" "$CLIENT_ID" '' "$ISS")"
```

```
alg:none                     invalid_grant: [A314310] The JWT specified by the 'assertion' request parameter is not signed.
wrong key                    invalid_grant: Invalid assertion
wrong audience               invalid_grant: [A314314] Neither the issuer identifier of this service nor the URL of the token endpoint is listed as audience in the 'aud' claim of the JWT specified by the 'assertion' request parameter.
expired                      invalid_grant: [A314309] The 'exp' claim in the JWT specified by the 'assertion' request parameter failed to pass the validation.
no sub                       invalid_grant: The value of the 'sub' claim failed to be extracted from the payload of the assertion.
```

And the sixth, dropping client authentication entirely:

```bash
curl -s -X POST "$API/token" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" \
  --data-urlencode "assertion=$(node /tmp/mkassert.mjs HS256 "$CLIENT_SECRET" "$CLIENT_ID" alice "$ISS")"
```

```json
{"error":"invalid_request",
 "error_description":"[A244305] The token request does not include any clue to identify the client. Add a 'client_id' parameter."}
```

### Read the error messages, not just the statuses

Every JWT failure is `invalid_grant` — RFC 7523 §3.1: *"The value of the 'error' parameter MUST be the
'invalid_grant' error code."* The client-identification failure is `invalid_request`, because that is a
malformed request rather than a bad grant. That distinction is spec-mandated and the server gets it right.

Now look at **which** messages carry a bracketed code:

| Break | Message shape | Who rejected it |
|---|---|---|
| `alg:none` | `[A314310] …` | Authlete, phase 1 (claims + policy) |
| wrong audience | `[A314314] …` | Authlete, phase 1 |
| expired | `[A314309] …` | Authlete, phase 1 |
| **wrong key** | `Invalid assertion` — no code | **This repo**, phase 2 (`jwt-verification.service.ts:55`) |
| **no `sub`** | plain sentence, no code | **This repo**, phase 2 (`jwt-verification.service.ts:77`) |

This is the two-phase validation from the assigned reading, and it is a genuinely useful diagnostic: a
bracketed code means your *claims* were wrong; a bare sentence means your *signature or key* was wrong. When a
JWT bearer integration fails in production, that tells you which half of the problem to look at before you
read a single line of code.

### One more: the §2.1 / §2.2 confusion, live

Send a JWT in the **client authentication** slot instead of the grant slot:

```bash
TOKEN_EP=$(curl -s "$API/.well-known/openid-configuration" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).token_endpoint))')
CA=$(node /tmp/mkassert.mjs HS256 "$CLIENT_SECRET" "$CLIENT_ID" "$CLIENT_ID" "$TOKEN_EP")

curl -s -X POST "$API/token" -d "grant_type=client_credentials" -d "scope=profile" \
  -d "client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer" \
  --data-urlencode "client_assertion=$CA"
```

```json
{"error":"invalid_client",
 "error_description":"[A157357] The client identifier is not found at the expected location: The
  'client_secret_basic' client authentication method expects the basic authentication in the 'Authorization' header."}
```

The assertion is perfectly valid. It is refused because **the client's registered authentication method is
pinned**, and this client is registered for `client_secret_basic`. Your service metadata advertises
`client_secret_jwt` and `private_key_jwt` in `token_endpoint_auth_methods_supported` — that is what the
*service* supports, not what *this client* is permitted to use. Module 02's "advertised ≠ permitted" rule,
now applied to client authentication.

### Now do it on a client that *is* permitted — §2.2 for real

`$PKJWT_CLIENT_ID` is registered `PRIVATE_KEY_JWT` with a public JWK Set, and `$PKJWT_PRIVATE_JWK` is the
matching private key. `/tmp/mkassert.mjs` cannot sign this one — it only does HMAC — so here is its
asymmetric sibling:

```bash
cat > /tmp/mkassert-es256.mjs <<'EOF'
// private_key_jwt client assertion, signed with an EC P-256 key (RFC 7523 §2.2).
//   node mkassert-es256.mjs '<privateJwkJson>' <clientId> <aud>
import crypto from "node:crypto";
const [, , jwkJson, clientId, aud] = process.argv;
const jwk = JSON.parse(jwkJson);
const u8 = (b) => Buffer.from(b).toString("base64url");           // bytes -> base64url
const j64 = (o) => u8(JSON.stringify(o));                          // object -> base64url JSON
const now = Math.floor(Date.now() / 1000);
const si = `${j64({ alg: "ES256", typ: "JWT", kid: jwk.kid })}.${j64(
  { iss: clientId, sub: clientId, aud, iat: now, exp: now + 300, jti: crypto.randomUUID() })}`;
const sig = crypto.sign("sha256", Buffer.from(si), {
  key: crypto.createPrivateKey({ key: jwk, format: "jwk" }),
  dsaEncoding: "ieee-p1363",     // raw R‖S — JWS signatures are never DER
});
console.log(`${si}.${u8(sig)}`);
EOF

CA=$(node /tmp/mkassert-es256.mjs "$PKJWT_PRIVATE_JWK" "$PKJWT_CLIENT_ID" "$ISS")

curl -s -X POST "$API/token" -d "grant_type=client_credentials" -d "scope=profile" \
  -d "client_id=$PKJWT_CLIENT_ID" \
  -d "client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer" \
  --data-urlencode "client_assertion=$CA"
```

```json
{"access_token":"EXAMPLE-Vvd2Ohbi","token_type":"Bearer","expires_in":86400,"scope":"profile"}
```

**Byte for byte the same request shape that just failed**, and the only difference is which client sent it.
That is the whole of "advertised ≠ permitted" in one pair of transcripts.

Four things worth noticing:

1. **There is no `client_secret` anywhere.** The AS holds only a *public* key for this client, so nothing it
   stores can be replayed if the AS's own database leaks. That is the property §2.2 exists for, and the one
   `client_secret_jwt` — which HMACs with the shared secret — does not have.
2. **`aud` is the issuer**, read from discovery as `$ISS` in 3a. Both values work here — verified: the issuer
   and the token endpoint URL each authenticate, and anything else is refused with
   `[A157318] The 'aud' claim of the client assertion is invalid`. RFC 7521 §5.2 is what requires that
   refusal, and it is the check that stops an assertion you were given for one AS being replayed at another.
3. **`dsaEncoding: "ieee-p1363"`.** Same raw R‖S encoding as the DPoP proofs in Module 05 and the ID token
   validator in Module 08. Get it wrong and you get `[A157326] The signature of the JWT for client
   authentication is invalid` — indistinguishable from having the wrong key, and worth remembering the next
   time a signature "should" verify. That exact error was produced while writing this exercise, by a
   base64url helper that JSON-stringified the signature bytes instead of encoding them.
4. **`jti` is sent and nothing enforces it** — verified: the *same* assertion sent twice inside its
   300-second window returns two different access tokens. RFC 7523 §3 and §6 make replay prevention
   OPTIONAL, so this is conformant, not a defect. It is also why §2.2's security rests on the private key
   never leaving the client, and not on the assertion being single-use.

> **Verified live 2026-08-12.** This client did not exist before then — until the audit registered it, §2.2
> was untestable on this deployment and this exercise ended at the paragraph above. The registration was one
> `client/create` call; no code changed.

---

## Exercise 5 — Predict, then check the tutorial

Before running Exercise 6, read
[`docs/TOKEN-EXCHANGE-TUTORIAL.md`](../../../TOKEN-EXCHANGE-TUTORIAL.md) Part 7 and Part 4, and write down
answers to these. You are being asked to commit to a prediction so that Exercise 6 is a test rather than a
demonstration.

1. What exact JSON keys do you expect in a successful token-exchange response?
2. What do you expect to happen to `resource=https://api.example.com/orders` — what will show up in
   introspection?
3. If you send `actor_token`, what should be different about the resulting token?
4. Which RFC 8693 §2.2.1 REQUIRED parameter does the tutorial's example response omit?

Keep your answers. Question 4 is answerable from the lesson alone, and it is the thread the whole next
exercise pulls on.

---

## Exercise 6 — Ask for delegation, receive impersonation

**Goal:** the module gate. You will find four request parameters silently discarded, one required response
parameter missing, and a live credential in a `sub` claim.

### 6a — Exchange a token, and read the response against the spec

Mint a client-credentials token to use as the subject token, then exchange it:

```bash
CC0=$(curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" -d "grant_type=client_credentials" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).access_token))')

curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  --data-urlencode "subject_token=$CC0" \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:access_token"
```

```json
{"access_token":"EXAMPLE-exchanged-token","token_type":"Bearer","expires_in":86400,
 "scope":"","client_id":…,"subject":"EXAMPLE-subject-token-value"}
```

**200, and a token.** Nothing in the OAuth surface complains, which is the point of this exercise: everything
you are about to find is invisible from a green response. A scoped subject token works identically — that has
not always been true here, and the reason is worth knowing once you have finished the module
(`docs/DEVELOPMENT.md` → **SDK Version Pin**; the same story sits behind Q14).

Now hold this response up against RFC 8693 §2.2.1:

| §2.2.1 | Status | Present? |
|---|---|---|
| `access_token` | REQUIRED | ✅ |
| `token_type` | REQUIRED | ✅ |
| **`issued_token_type`** | **REQUIRED** | ❌ **missing** |
| `expires_in` | RECOMMENDED | ✅ (86400 — a *day*, for a token meant for one downstream call) |
| `scope` | REQUIRED when it differs from requested | ✅ |
| `client_id`, `subject` | **not in the spec at all** | present |

Two non-standard fields added; one required field dropped. That is the answer to Exercise 5, question 4.

### 6b — The four silent discards

Send every optional parameter that should change the outcome. Predict each one first.

```bash
ex () {
  printf '%-34s ' "$1"; shift
  curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" \
    -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
    --data-urlencode "subject_token=$CC0" \
    -d "subject_token_type=urn:ietf:params:oauth:token-type:access_token" "$@" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);
      console.log(j.error ? `${j.error}` : `200  keys: ${Object.keys(j).join(",")}`)})'
}

AC=$(curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" -d "grant_type=client_credentials" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).access_token))')

ex "actor_token (asks for DELEGATION)" --data-urlencode "actor_token=$AC" \
   -d "actor_token_type=urn:ietf:params:oauth:token-type:access_token"
ex "resource"            -d "resource=https://api.example.com/orders"
ex "audience"            -d "audience=https://partner.example.com"
ex "requested_token_type=id_token" -d "requested_token_type=urn:ietf:params:oauth:token-type:id_token"
```

```
actor_token (asks for DELEGATION)  200  keys: access_token,token_type,expires_in,scope,client_id,subject
resource                           200  keys: access_token,token_type,expires_in,scope,client_id,subject
audience                           200  keys: access_token,token_type,expires_in,scope,client_id,subject
requested_token_type=id_token      200  keys: access_token,token_type,expires_in,scope,client_id,subject
```

**Four identical responses.** Every one of them 200. Now verify that the tokens really are identical in
substance — check the one that asked for an audience restriction:

```bash
NEW=$(curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  --data-urlencode "subject_token=$CC0" \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:access_token" \
  -d "resource=https://api.example.com/orders" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).access_token))')

curl -s -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" -X POST "$API/introspection/standard" -d "token=$NEW"
```

```json
{"active":true,"scope":null,"client_id":"…","token_type":"Bearer","exp":…,"sub":"…","iss":"https://…"}
```

**No `aud`.** Compare with [Module 04 Exercise 4](../04-token-lifecycle-and-metadata/lab.md#exercise-4--pin-the-audience-with-resource-rfc-8707), where the same
`resource` parameter on an authorization-code flow produced `"aud":["https://api.example.com/orders"]`. The
mechanism works on this server — just not on this path.

Roll it up:

| Parameter sent | RFC 8693 says | This server does | Consequence |
|---|---|---|---|
| `actor_token` | Requests delegation; result should carry `act` | discarded | **Delegation downgraded to impersonation, silently** |
| `resource` | Audience-restrict the new token | discarded | Token minted "for the orders API" works everywhere |
| `audience` | Same, logical name | discarded | Same |
| `requested_token_type` | Choose the returned token type | discarded | You get an access token; `issued_token_type` is absent, so you cannot even tell |

One root cause explains all four. `token-exchange-response.handler.ts:29-34` builds its request to Authlete
from exactly four fields — `grantType`, `clientId`, `scopes`, `subject` — and throws away everything else
Authlete resolved. Read those six lines; the whole table above follows from them.

### 6c — Find the credential in the identity field

Look again at the response in 6a. The `subject` field looked like a random string. Compare it to your subject
token:

```bash
NEW=$(curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  --data-urlencode "subject_token=$CC0" \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:access_token" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).access_token))')

SUB=$(curl -s -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" -X POST "$API/introspection/standard" -d "token=$NEW" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).sub))')

[ "$SUB" = "$CC0" ] && echo "sub IS the subject token" || echo "different"
```

```
sub IS the subject token
```

And it is not an inert copy:

```bash
curl -s -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" -X POST "$API/introspection/standard" -d "token=$SUB" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log("active =",JSON.parse(s).active))'
```

```
active = true
```

**A live access token is sitting in a `sub` claim.** The cause is one line —
`token-exchange-response.handler.ts:27`:

```js
const subject = result.subject || subjectToken;
```

When Authlete resolves no subject (correct here — a client-credentials token has no user, as you established in
Exercise 1b), the code falls back to **the credential itself**. That value is then returned to the client in
the response body, stored as the new token's subject, and handed out by introspection to anyone who asks —
and Module 04 established that this server's introspection endpoint requires no authentication at all.

Follow it one hop further — carefully, because the precise claim matters. This repo's audit logger does record
a `user` field, but it reads it from the **session** (`audit-log.ts:24-25`, `sess?.user`), not from a token
subject, so *this* log is not affected. Check that yourself rather than taking it from me; being able to tell
"a credential is exposed" from "a credential is exposed **here**" is most of what a useful finding is.

The exposure is real anyway, one layer out. A subject identifier is a non-secret by convention, so it flows
into places secrets are not allowed to go: log lines, trace attributes, metrics labels, analytics events, the
`sub` of a downstream JWT, a support ticket. Any of those, in any service that receives this token and records
who it is for, now holds a working access token in plaintext with that system's retention period. The defect
is not that one particular log is dirty — it is that a credential was placed in a field whose entire contract
is "safe to copy around."

**Why the pattern is wrong, independent of this codebase:** `||` on a missing identity substitutes *whatever
is to hand* rather than failing. A subject is an assertion about who someone is; a token is a bearer
credential. They are different kinds of value and one must never default to the other. The correct behavior is
to fail closed — a client-credentials token has no subject, so exchanging it for a subject-bearing token is a
request that cannot be honoured.

**What just happened?** You asked for delegation and got impersonation, HTTP 200, no error. That is precisely
the failure mode the lesson opened with — and you can now say exactly what a correct response would have
contained: `issued_token_type`, an `aud` matching `resource`, and an `act` claim naming the actor.

---

## Break it — three predictions

For each: predict, run, explain.

**Break 1 — a subject token that does not exist.**

```bash
curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=not-a-real-token" \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:access_token"
```

```json
{"error":"invalid_request",
 "error_description":"[A311306] The token specified by the 'subject_token' request parameter does not exist."}
```

Now argue the other side: RFC 7662 §2.2 requires introspection to answer `active: false` rather than reveal
whether a token exists, and you verified that anti-oracle behavior in Module 04. Does `[A311306]` on the token
endpoint undermine it? Consider who can reach each endpoint and what authentication each requires before you
answer — the two cases are not the same, and the difference is the point.

**Break 2 — omit `subject_token_type`.**

```bash
curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  --data-urlencode "subject_token=$CC0"
```

```json
{"error":"invalid_request","error_description":"[A250302] The request parameter 'subject_token_type' is missing."}
```

Why does RFC 8693 make the type REQUIRED rather than sniffing it? Write the attack that type-sniffing enables
when a JWT and an opaque access token can both appear in `subject_token`.

**Break 3 — exchange with no client authentication.**

```bash
curl -s -X POST "$API/token" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  --data-urlencode "subject_token=$CC0" \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:access_token"
```

```json
{"error":"invalid_request",
 "error_description":"[A244305] The token request does not include any clue to identify the client. Add a 'client_id' parameter."}
```

This is service policy (`tokenExchangeByIdentifiableClientsOnly`), not an RFC 8693 requirement. Explain what
an unauthenticated token-exchange endpoint would let anyone holding a leaked token do, and why that is worse
than the leak itself. If your service has *Permitted Clients Only* enabled, also try the exchange from a
client without explicit permission — expect `[A311305]`.

---

## Verification block

You have completed this lab when every line is true, checked against your own output:

- [ ] A client-credentials token introspects with **no `sub`**, and a user token introspects **with** `sub`,
      `auth_time`, and `acr`.
- [ ] `scope=openid profile` on client credentials returned `scope=profile`, HTTP 200, no error.
- [ ] A public client was refused client credentials with `unauthorized_client`.
- [ ] You minted an access token whose `sub` is a user who never authenticated, and you can explain in one
      sentence why that is the design working rather than a spec defect.
- [ ] You changed `iss` to a nonexistent issuer and the assertion was still accepted — and you can say what
      that proves about where the trust anchor sits on this deployment.
- [ ] All five assertion breaks returned `invalid_grant`, and you can say which two were rejected by the repo
      rather than by Authlete, and how you can tell from the message alone.
- [ ] A valid `client_assertion` was refused because the client's auth method is pinned.
- [ ] Token exchange returned HTTP 200 with a usable token, and you can name what that response omits, what
      it adds that RFC 8693 does not define, and why neither is visible from the status code.
- [ ] `actor_token`, `resource`, `audience`, and `requested_token_type` all produced identical 200 responses,
      and the `resource` token had no `aud`.
- [ ] The success response is missing `issued_token_type`, and you can quote its status in RFC 8693 §2.2.1.
- [ ] You confirmed `sub == subject_token` on an exchanged token, and that the value is still `active`.
- [ ] You can state what a *correct* delegation response would have contained.

## Clean up

```bash
rm -f /tmp/mkassert.mjs "$CJ"
unset CC CC0 AC AT NEW SUB USER_AT ASSERTION CA
```

The tokens you minted in Exercise 3 have `sub` values for users who do not exist and 24-hour lifetimes. Revoke
them (`POST $API/revocation`, Module 04) rather than waiting them out — partly hygiene, mostly because
deliberately cleaning up a token you should never have been able to mint is a good habit to build.

---

## What to carry into Module 07

Six defects in one module, and not one of them announced itself:

| What you saw | Why it is silent |
|---|---|
| `openid` dropped from a client-credentials request | Correct behavior, unreported |
| Any subject assertable with the client secret | Signature valid; policy absent |
| `iss` unresolved against any trust store | Nothing to compare against, so nothing fails |
| `actor_token` / `resource` / `audience` / `requested_token_type` discarded | Handler builds its request from four fields |
| `issued_token_type` missing | Nobody validates a response against the RFC |
| A live credential in `sub` | `\|\|` substituted rather than failing closed |

**The habit:** verify the token you received, not the request you sent. Module 07 assembles every attack from
Modules 02–06 into RFC 9700's catalogue and asks which of them a best-current-practice document published in
January 2025 already named.
