# Module 07 — Lab

**The short version:** you are going to write a real conformance report on this deployment, against RFC 9700
§2, with evidence for every row. Six exercises: build the evidence base from three sources, work through §2
section by section, then rank and write it up. One finding will contradict something Module 01 told you.

> **This lab produces a deliverable.** Not answers to questions — a document. Keep
> `docs/curriculum/my-audit.md` (gitignored) open beside your terminal and fill it in as you go. The habit of
> writing the evidence down *at the moment you observe it* is most of what separates a review from a
> recollection.

## Before you start

```bash
set -a; source docs/curriculum/scripts/curriculum.env; set +a
curl -s "$API/health" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).status))'
```

```
ok
```

You need `$API`, `$CLIENT_ID`, `$CLIENT_SECRET`, `$PUB_CLIENT_ID`, `$REDIRECT_URI`, `$LAB_USER`, `$LAB_PASS` —
plus, for the "configured" source, read access to the Authlete service:

```bash
AUTHLETE_BEARER_TOKEN=$(grep -m1 '^AUTHLETE_BEARER_TOKEN=' server/.env | cut -d= -f2-)
AUTHLETE_BASE_URL=$(grep -m1 '^AUTHLETE_BASE_URL=' server/.env | cut -d= -f2-)
AUTHLETE_SERVICE_ID=$(grep -m1 '^AUTHLETE_SERVICE_ID=' server/.env | cut -d= -f2-)
```

> **Your results will differ from the transcript below**, and that is the point — this is a template for
> auditing *a* deployment, not a walkthrough of a fixed answer. Where your output diverges, your deployment is
> configured differently. Record what *you* see.

> **Redaction.** Every token value below is replaced with `EXAMPLE-…`. Do the same in your own report. An
> audit document circulates by definition; a live token in one is a finding about the audit.

> **Vendor behavior.** Bracketed codes (`[A052301]`, `[A116302]`, …) are Authlete's. HTTP statuses and `error`
> values are spec-defined. Your report should cite the spec-defined parts and quote the vendor parts as
> evidence.

---

## Exercise 1 — Build the evidence base

**Goal:** collect all three sources before forming any opinion. Reviewers who audit item-by-item, fetching
evidence as they go, systematically miss divergences — because you cannot notice that two sources disagree
until you are holding both.

### 1a — Advertised

```bash
curl -s "$API/.well-known/openid-configuration" | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);
for (const k of ["grant_types_supported","response_types_supported","code_challenge_methods_supported",
  "token_endpoint_auth_methods_supported","require_pushed_authorization_requests",
  "authorization_response_iss_parameter_supported","tls_client_certificate_bound_access_tokens",
  "introspection_endpoint_auth_methods_supported","revocation_endpoint_auth_methods_supported"])
  console.log(k.padEnd(50), JSON.stringify(k in d ? d[k] : "ABSENT"));})'
```

```
grant_types_supported          ["authorization_code","implicit","password","client_credentials",
                                "refresh_token","urn:openid:params:grant-type:ciba",
                                "urn:ietf:params:oauth:grant-type:device_code",
                                "urn:ietf:params:oauth:grant-type:token-exchange",
                                "urn:ietf:params:oauth:grant-type:jwt-bearer",
                                "urn:ietf:params:oauth:grant-type:pre-authorized_code"]
response_types_supported       ["none","code","token","id_token","code token","code id_token",
                                "id_token token","code id_token token"]
code_challenge_methods_supported                   ["plain","S256"]
require_pushed_authorization_requests              false
authorization_response_iss_parameter_supported     true
tls_client_certificate_bound_access_tokens         false
introspection_endpoint_auth_methods_supported      []
revocation_endpoint_auth_methods_supported         []
```

**Stop and read that before continuing.** Four things should already be pulling at you, and being able to
generate this list from metadata alone — before sending a single protocol request — is a real skill:

1. `implicit` and `password` are both advertised. RFC 9700 §2.1.2 and §2.4.
2. `response_types_supported` includes `token` and three hybrid combinations that issue an access token in the
   authorization response — the same §2.1.2 concern, stated a second way.
3. `code_challenge_methods_supported` includes `plain`. §2.1.1 wants S256.
4. Both auth-method lists are **empty**. That is either "no authentication" or "we did not populate this
   field," and those are very different. Note it as a question, not a finding, and settle it in Exercise 5.

### 1b — Configured

```bash
curl -s -H "Authorization: Bearer $AUTHLETE_BEARER_TOKEN" \
  "$AUTHLETE_BASE_URL/api/$AUTHLETE_SERVICE_ID/service/get" | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);
for (const k of ["supportedGrantTypes","pkceRequired","pkceS256Required","refreshTokenKept",
  "issSuppressed","scopeRequired","dpopNonceRequired","tlsClientCertificateBoundAccessTokens",
  "accessTokenDuration","refreshTokenDuration","loopbackRedirectionUriVariable","missingClientIdAllowed"])
  console.log(k.padEnd(44), JSON.stringify(k in d ? d[k] : "ABSENT"));})'
```

```
supportedGrantTypes         ["AUTHORIZATION_CODE","IMPLICIT","PASSWORD","CLIENT_CREDENTIALS",
                             "REFRESH_TOKEN","CIBA","DEVICE_CODE","TOKEN_EXCHANGE","JWT_BEARER",
                             "PRE_AUTHORIZED_CODE"]
pkceRequired                                 false
pkceS256Required                             false
refreshTokenKept                             false
issSuppressed                                false
scopeRequired                                false
dpopNonceRequired                            false
tlsClientCertificateBoundAccessTokens        false
accessTokenDuration                          86400
refreshTokenDuration                         864000
loopbackRedirectionUriVariable               true
missingClientIdAllowed                       false
```

Two numbers deserve to be read as durations rather than integers: **86400 seconds is one day** and **864000 is
ten days**. Every token in every earlier module carried that 86400, and it went past unremarked each time
because it looked like configuration rather than exposure. It is exposure.

`refreshTokenKept: false` means the refresh token is *not* kept — i.e. rotation is on. This is the kind of
flag name that reads backwards on a first pass, and misreading it flips a §2.2.2 verdict. **Confirm it by
observation** rather than by parsing the name (Exercise 4).

### 1c — Observed

That is the rest of the lab. But set the frame now, because it decides what you write down:

> For every §2 item, the question is never *"does this deployment support X?"* It is **"what happens when an
> attacker does not use X?"**

### 1d — Start the report

```markdown
# RFC 9700 §2 conformance — <deployment>, <date>

Sources: advertised (`/.well-known/openid-configuration`), configured (Authlete service `<id>`),
observed (curl, this document).
Method: three-source triangulation; where sources diverge, observed behaviour is authoritative
and the divergence is itself recorded.

| § | Requirement | Advertised | Configured | Observed | Verdict | Severity |
|---|---|---|---|---|---|---|
```

---

## Exercise 2 — §2.1 and §2.1.1: redirect handling and PKCE

### 2a — Exact redirect-URI matching (MUST)

```bash
enc () { node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' -- "$1"; }

for RU in "$REDIRECT_URI" "${REDIRECT_URI}x" "http://evil.example.com/cb"; do
  printf '%-46s ' "$RU"
  curl -s -o /dev/null -w 'status=%{http_code} location=%{redirect_url}\n' -G "$API/authorization" \
    --data-urlencode "response_type=code" --data-urlencode "client_id=$CLIENT_ID" \
    --data-urlencode "redirect_uri=$RU" --data-urlencode "scope=profile" --data-urlencode "state=a"
done
```

```
<your registered URI>                          status=302 location=http://localhost:3000/api/session/login?…
<your registered URI>x                         status=400 location=
http://evil.example.com/cb                     status=400 location=
```

**PASS.** One appended character is refused. Note the second column carefully: on failure there is **no
`Location` header at all**. That is the §2.1 MUST NOT about open redirection working correctly — the AS
refuses to bounce the browser anywhere it has not already validated, so it cannot be used as a redirector.
Two requirements, one piece of evidence.

Record it as: *§2.1 exact matching — PASS. Evidence: `redirect_uri` + "x" → 400, no `Location`.*

### 2b — PKCE (MUST)

Three separate requirements hide in §2.1.1. Audit them separately; they have different answers.

| Requirement | How to check |
|---|---|
| AS **MUST support** PKCE | `code_challenge_methods_supported` present |
| Public clients **MUST use** PKCE | Try a flow without it |
| AS **MUST enforce** a challenge once sent, and **MUST mitigate downgrade** | Module 03's break exercises |

The first is satisfied — `["plain","S256"]`. Now the second:

```bash
PRU="http://localhost:3001/callback"     # a redirect URI registered on your PUBLIC client
CJ=$(mktemp)
curl -s -c "$CJ" -o /dev/null \
  "$API/authorization?response_type=code&client_id=$PUB_CLIENT_ID&redirect_uri=$(enc "$PRU")&scope=profile&state=nopkce"
CSRF=$(curl -s -b "$CJ" -c "$CJ" "$API/session/login" | grep -o 'name="_csrf" value="[^"]*"' | head -1 | cut -d'"' -f4)
F=$(curl -s -b "$CJ" -c "$CJ" -o /dev/null -w '%{redirect_url}' -X POST "$API/session/login" \
     -d "username=$LAB_USER" -d "password=$LAB_PASS" --data-urlencode "_csrf=$CSRF")
case "$F" in *code=*) : ;; *) CS2=$(curl -s -b "$CJ" -c "$CJ" "$API/session/consent" \
       | grep -o 'name="_csrf" value="[^"]*"' | head -1 | cut -d'"' -f4)
     F=$(curl -s -b "$CJ" -c "$CJ" -o /dev/null -w '%{redirect_url}' -X POST "$API/session/consent" \
       -d "decision=approve" --data-urlencode "_csrf=$CS2") ;; esac
CODE=$(node -e 'const u=new URL(process.argv[1]);process.stdout.write(u.searchParams.get("code")||"")' -- "$F")

curl -s -X POST "$API/token" -d "grant_type=authorization_code" --data-urlencode "code=$CODE" \
  --data-urlencode "redirect_uri=$PRU" -d "client_id=$PUB_CLIENT_ID"
rm -f "$CJ"
```

```json
{"access_token":"EXAMPLE-token","token_type":"Bearer","expires_in":86400,
 "scope":"profile","refresh_token":"EXAMPLE-refresh"}
```

**FAIL.** A public client, no `code_challenge`, no `code_verifier`, and a live access token — plus a refresh
token valid for ten days.

Now write the finding properly, because this is the exercise's real content:

> **§2.1.1 — FAIL (public clients).** *"Public clients MUST use PKCE."* The AS supports PKCE
> (`code_challenge_methods_supported: ["plain","S256"]`) and does not require it (`pkceRequired: false`).
> Evidence: completed an authorization-code flow for public client `<id>` with no PKCE parameters; received an
> access token (86400 s) and a refresh token (864000 s). Additionally, `plain` is advertised and accepted,
> contrary to §2.1.1's guidance. **Severity: high** — reachable by any attacker who can intercept a redirect
> on the user's device, which is the exact threat PKCE exists for, and the refresh token converts a
> single interception into ten days of access. **Remediation:** set `pkceRequired` and `pkceS256Required`
> true; remove `plain`.

Compare that with "PKCE: FAIL." Same verdict; only one of them can be acted on, argued with, or checked by
someone else.

The third requirement — enforcement once a challenge is sent, and downgrade mitigation in both directions —
you verified in [Module 03](../03-pkce-and-public-clients/lab.md). It **passes**. Cite your own earlier
evidence rather than re-running it; an audit that re-derives everything never finishes.

---

## Exercise 3 — §2.1.2 and §2.4: the two retired grants

This is where the report gets uncomfortable.

### 3a — The implicit grant (SHOULD NOT)

```bash
CJ=$(mktemp)
curl -s -c "$CJ" -o /dev/null \
  "$API/authorization?response_type=token&client_id=$CLIENT_ID&redirect_uri=$(enc "$REDIRECT_URI")&scope=profile&state=imp"
CSRF=$(curl -s -b "$CJ" -c "$CJ" "$API/session/login" | grep -o 'name="_csrf" value="[^"]*"' | head -1 | cut -d'"' -f4)
F=$(curl -s -b "$CJ" -c "$CJ" -o /dev/null -w '%{redirect_url}' -X POST "$API/session/login" \
     -d "username=$LAB_USER" -d "password=$LAB_PASS" --data-urlencode "_csrf=$CSRF")
case "$F" in *access_token=*|*code=*) : ;; *) CS2=$(curl -s -b "$CJ" -c "$CJ" "$API/session/consent" \
       | grep -o 'name="_csrf" value="[^"]*"' | head -1 | cut -d'"' -f4)
     F=$(curl -s -b "$CJ" -c "$CJ" -o /dev/null -w '%{redirect_url}' -X POST "$API/session/consent" \
       -d "decision=approve" --data-urlencode "_csrf=$CS2") ;; esac
echo "$F" | sed -E 's/access_token=[^&]*/access_token=REDACTED/'
rm -f "$CJ"
```

```
https://<your-callback>/#state=imp&access_token=REDACTED&token_type=Bearer&expires_in=86400&scope=profile&iss=…
```

A live 24-hour access token in a **URL fragment** — browser history, `Referer` on any subsequent navigation,
and anything reading `window.location`. RFC 9700 §4.2/§4.3, which Module 02 walked you through.

The nuance for the report: §2.1.2 says *clients* SHOULD NOT use the implicit grant. It does not say servers
MUST NOT offer it. So strictly, an AS that supports implicit is not violating §2.1.2 — the violation would
belong to a client that used it. **Write it that way**, and then say why it is still a finding: a capability
that is enabled is a capability that will be used, by a rushed integrator or an attacker who registers a
client. Precision about who the requirement binds, followed by a judgement about risk, is exactly the register
a good report is written in.

### 3b — ROPC (MUST NOT)

```bash
curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=password" -d "username=$LAB_USER" -d "password=$LAB_PASS" -d "scope=profile"
```

```json
{"access_token":"EXAMPLE-ropc-token","token_type":"Bearer","expires_in":86400,
 "scope":"profile","refresh_token":"EXAMPLE-ropc-refresh"}
```

**FAIL, and this is the headline.** RFC 9700 §2.4: *"The resource owner password credentials grant MUST NOT be
used."* The user's password went to the client, the client sent it to the AS, and the AS returned an access
token **and a ten-day refresh token** — meaning the client can now hold that access indefinitely without ever
touching the password again, and the user has no record that it happened and no way to revoke it short of
changing their password.

This is the password anti-pattern from **Module 01**, the thing the entire curriculum opened by arguing OAuth
exists to eliminate, working perfectly on the deployment you have been studying for seven modules.

### 3c — The finding that contradicts an earlier module

Go back and read [Module 01's lab](../01-the-delegation-problem/lab.md). It records this exact request being
**refused**, with `[A295306] The grant type ('password') is not allowed.`

Nothing about the client changed. What changed is a service-level setting: `fapiModes` was set to
`["FAPI2_SECURITY"]` when Module 01 was written, and clearing it (to let Modules 02–06 run) removed the
restriction that had been incidentally blocking ROPC.

**Sit with this, because it is the most valuable thing in the lab.**

- **A conformance result is a snapshot, not a property.** This deployment was §2.4-conformant in Module 01 and
  is not now. No code was deployed. One flag moved.
- **It was never conformant for the right reason.** ROPC was blocked as a side effect of a FAPI profile
  nobody enabled in order to block ROPC. A control you get by accident is a control you lose by accident.
- **Therefore: every finding needs a date and a configuration snapshot**, and every audit report needs a
  statement of what would invalidate it. Yours should say something like: *"Assessed against Authlete service
  `<id>` as configured on `<date>`; `fapiModes` empty. Re-assessment required on any change to service-level
  grant types or profile settings."*

Add both grants to the report. Then answer, in writing: **which of the two is more severe here, and why?**
Argue it from reachability, not from the strength of the keyword — ROPC's MUST NOT looks decisive, but the
implicit grant is reachable from a browser by anyone who can get a user to click a link, while ROPC requires
the attacker to already have the password. Whichever way you come down, the reasoning is the deliverable.

---

## Exercise 4 — §2.2 and §2.3: replay prevention and privilege restriction

### 4a — §2.2.1 sender-constraining (SHOULD)

Module 05 established that DPoP works here. §2.2.1 asks whether it is *used*, and the answer sits in two
flags plus one metadata field:

```
dpop_signing_alg_values_supported            [RS256, PS256, ES256, …]   ← supported
tls_client_certificate_bound_access_tokens   false                       ← mTLS not offered
dpopNonceRequired                            false
```

Nothing requires DPoP. Every token you have obtained in seven modules was a plain bearer token.

**Verdict: DEVIATES from §2.2.1, no documented rationale.** For a demonstration server this is a defensible
deviation — but the rationale has to exist somewhere, and "it is a lab" is a legitimate one *if written down*.
Note in your report that the deviation would be unacceptable for the payments scenario in Q17 of the Module 06
quiz, and that Module 10's FAPI 2.0 profile converts this SHOULD into a MUST.

### 4b — §2.2.2 refresh tokens (MUST)

`refreshTokenKept: false` — read as "the old refresh token is not kept," i.e. rotation. Do not trust the name.
Observe it:

```bash
RT=$(curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=password" -d "username=$LAB_USER" -d "password=$LAB_PASS" -d "scope=profile" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).refresh_token))')

NEW=$(curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=refresh_token" --data-urlencode "refresh_token=$RT" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).refresh_token))')

[ "$RT" = "$NEW" ] && echo "NOT rotated — same refresh token returned" || echo "rotated — new refresh token"
```

```
rotated — new refresh token
```

**PASS**, via rotation rather than sender-constraining. Both satisfy the MUST. Record *which* — they have
different properties, and Module 10 will show you a profile that forbids the one this deployment chose.

### 4c — §2.3 privilege restriction (SHOULD ×2)

Audience restriction first — and check more than one path, because Module 06 taught you not to generalise:

```bash
aud_of () {
  curl -s -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" -X POST "$API/introspection/standard" -d "token=$1" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);
      console.log("aud:", JSON.stringify(j.aud ?? null), " exp-in:", j.exp - Math.floor(Date.now()/1000))})'
}

echo -n "client_credentials + resource:  "
aud_of "$(curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" -d "grant_type=client_credentials" \
  -d "scope=profile" -d "resource=https://api.example.com/orders" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).access_token))')"

echo -n "client_credentials, no resource:"
aud_of "$(curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" -d "grant_type=client_credentials" \
  -d "scope=profile" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).access_token))')"
```

```
client_credentials + resource:  aud: ["https://api.example.com/orders"]  exp-in: 86400
client_credentials, no resource: aud: null                               exp-in: 86400
```

So the mechanism works and **nothing requires it**. Combined with Module 04 (works on the authorization-code
path) and Module 06 (silently discarded on the token-exchange path), the honest finding is three-part:

> **§2.3 — DEVIATES.** Audience restriction is available and optional: `resource` produces `aud` on the
> client-credentials and authorization-code paths, and is **silently discarded** on the token-exchange path
> (Module 06). A token requested without `resource` has no `aud` and is therefore valid at every resource
> server. Minimum-privilege is also not enforced in the time dimension: all access tokens are issued with
> `accessTokenDuration: 86400` (24 h) regardless of grant, including client-credentials tokens for jobs that
> run for seconds. **Severity: medium**, rising to high in any deployment with more than one RS.

Note what made that finding good: it names where the control works, where it does not, and one place it is
*claimed* to work and does not.

---

## Exercise 5 — §2.5 and §2.6: client authentication and the endpoints nobody audits

### 5a — Settle the empty metadata arrays

In 1a you flagged `introspection_endpoint_auth_methods_supported: []` and
`revocation_endpoint_auth_methods_supported: []` as a question. Settle it by observation.

```bash
CC=$(curl -s -X POST "$API/token" -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=client_credentials" -d "scope=profile" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).access_token))')

echo "--- introspection, no credentials ---"
curl -s -o /dev/null -w 'status=%{http_code}  ' -X POST "$API/introspection/standard" -d "token=$CC"
curl -s -X POST "$API/introspection/standard" -d "token=$CC"; echo

echo "--- introspection, admin credentials ---"
curl -s -o /dev/null -w 'status=%{http_code}  ' -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" \
  -X POST "$API/introspection/standard" -d "token=$CC"
curl -s -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" -X POST "$API/introspection/standard" -d "token=$CC"; echo

echo "--- revocation, no credentials ---"
curl -s -X POST "$API/revocation" -d "token=$CC"; echo

echo "--- revocation, full credentials ---"
curl -s -o /dev/null -w 'status=%{http_code}\n' -X POST "$API/revocation" -u "$CLIENT_ID:$CLIENT_SECRET" -d "token=$CC"
curl -s -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" -X POST "$API/introspection/standard" -d "token=$CC"; echo
```

```
--- introspection, no credentials ---
status=401  {"error":"invalid_client","error_description":"Client authentication required"}
--- introspection, admin credentials ---
status=200  {"active":true,"scope":"profile","client_id":"…","token_type":"Bearer","exp":…,"iss":"…"}
--- revocation, no credentials ---
{"error":"invalid_client","error_description":"[A116302] The revocation request does not contain
 'client_secret' although the client type of the client application that is associated with the token
 is 'confidential'."}
--- revocation, full credentials ---
status=200
{"active":false}
```

> **This exercise used to find an unauthenticated introspection endpoint. It was fixed on 2026-08-12** —
> RFC 7662 §2.1 — and the transcript above is the post-fix output. The first block is the finding it used to
> reproduce, preserved because the *reasoning* is the exercise. Keep reading: the metadata question it raised
> has not gone away, it has changed shape.

**Two sibling endpoints, and the metadata still describes neither.**

- **Revocation requires client authentication.** Correct, and the empty
  `revocation_endpoint_auth_methods_supported` array is simply wrong.
- **Introspection now requires authentication too** — RFC 7662 §2.1: *"To prevent token scanning attacks, the
  endpoint MUST also require some form of authorization to access this endpoint."* Until 2026-08-12 it
  required nothing, and the `401` above is the fix.

**But look carefully at *which* credential it takes, because this is the subtle part.** The introspection
endpoint accepts this deployment's **admin** credentials — `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` — not a
*client's* credentials. So `introspection_endpoint_auth_methods_supported: []` is *still* accurate in the
narrow sense: no **client** authentication method is supported there. The endpoint is protected; it is just
not protected by anything OAuth metadata has vocabulary for.

Two lessons, and the second is the one worth carrying:

1. **§2.1 says "some form of authorization", not "client authentication".** It offers client authentication
   and a separate access token as *examples*. An admin credential satisfies the MUST.
2. **"Metadata is accurate" and "the deployment is well-configured" are independent claims.** You started this
   exercise expecting the empty array to be a documentation bug. It was a documentation bug *and* a security
   bug, and fixing the security bug left the documentation bug standing — for a new reason. When you audit
   metadata, always ask what the empty value would look like in each case: absent capability, undocumented
   capability, or a capability the vocabulary cannot express.

That is three findings from one exercise, and only one of them is about a protocol behaviour:

> **F-1. Introspection endpoint unauthenticated.** RFC 7662 §2.1 requires authorization. Evidence: `POST
> /api/introspection/standard` with no credentials → 200 with full token metadata. **Severity: high** —
> reachable unauthenticated by any network peer; enables token scanning and oracle-style confirmation of
> whether a captured string is live. (Mitigating: `active:false` is returned for unknown tokens, so it is not
> a *distinguishing* oracle — verified in Module 04.)
>
> **F-2. Metadata misdescribes the revocation endpoint.** Advertises no auth methods; observed behaviour
> requires client authentication. **Severity: low** (integration defect, not exploitable) — but it is
> evidence that the metadata document is not generated from configuration, which undermines every other
> metadata-derived conclusion in this report. Note that limitation explicitly.
>
> **F-3.** …

The middle one is the sort of thing that gets dropped as "cosmetic." Say what it costs: **it means you cannot
trust source 1 anywhere**, which is a statement about your own method and belongs in the report.

### 5b — §2.5 client authentication

Two requirements. Client authentication is **enforced** for confidential clients — you have watched
`[A157357]` refuse mismatched methods twice (Modules 06 and just now). PASS.

The asymmetric-cryptography RECOMMENDED is a different matter: `$CLIENT_ID` uses `client_secret_basic`, a
shared symmetric secret. The service supports `private_key_jwt`, and **one client uses it** — `$PKJWT_CLIENT_ID`,
which you exercised in Module 06. So this is *"available and mostly unused"*, not *"available and unused"*.

> **§2.5 — PASS (enforcement); DEVIATES (asymmetric RECOMMENDED).** Available and used by one of four clients.
> **Severity: low** for a lab; note that Module 10's FAPI profile makes it mandatory, and that Module 06
> demonstrated the concrete cost of the symmetric secret here — with the JWT assertion grant enabled, that one
> shared secret is also a user-impersonation key.

That cross-reference is the point. A shared secret is a weak finding on its own and a serious one in
combination, and only someone who has done both modules can see it.

### 5b-bis — *advertised but unusable*, and the audit trail of a fix

Module 09a gives you four states a capability can be in. This subsection is where you meet the third one on a
live service, and the reason it is worth its own step is that **the evidence for it disappeared when it was
fixed** — so you are reading history, not running a probe.

Until 2026-08-12 this deployment's `token_endpoint_auth_methods_supported` listed **nine** methods:

```
none  client_secret_basic  client_secret_post  client_secret_jwt  private_key_jwt
tls_client_auth  self_signed_tls_client_auth  attest_jwt_client_auth  spiffe_jwt
```

**Four of those nine could not be used by anyone.** Not "not configured on a client" — *unusable*:

| Advertised | Why no client could ever use it |
|---|---|
| `tls_client_auth`, `self_signed_tls_client_auth` | mTLS is not implemented, and `tls_client_certificate_bound_access_tokens` is `false`. There is no TLS-terminating hop that forwards a client certificate |
| `attest_jwt_client_auth` | no Client Attester is configured, and the discovery document had **no `challenge_endpoint`** — so the method's own precondition was missing from the same document that advertised it |
| `spiffe_jwt` | nothing here speaks SPIFFE. It also **broke `service.get()` for six days**, because the TypeScript SDK's `ClientAuthMethod` enum does not contain it |

Now run it and count:

```bash
curl -s "$API/.well-known/openid-configuration" | jq '.token_endpoint_auth_methods_supported | length'
```

```
5
```

**The four were withdrawn, not implemented.** That is the correct fix for *advertised but unusable*, and it is
worth sitting with, because the instinct runs the other way: the list looked like a feature set, so removing
entries looks like losing features. Nothing was lost — no client could authenticate by any of the four, so the
only thing the advertisement ever did was mislead a client into trying.

**Three things to take into your report.**

1. **A metadata document is a promise, and an unkeepable promise is a defect** even though every endpoint
   returns 200 and nothing in a test suite fails. There is no error to grep for.
2. **Withdrawal has side effects worth checking.** Dropping `attest_jwt_client_auth` also removed
   `client_attestation_signing_alg_values_supported` and `client_attestation_pop_signing_alg_values_supported`,
   because those two members exist only to describe that method. One withdrawal, three advertisements gone,
   and the document went from 64 members to 62.
3. **This is the state Module 09a calls *advertised but unusable*, and it cost trust in the metadata** — the
   fourth column of that table. Compare it with the other three states there, and note that a report written
   from discovery metadata alone would have scored all nine of these methods as supported.

> **Write it up as a finding even though it is closed.** *"Four of nine advertised client-authentication methods
> were unusable; withdrawn 2026-08-12."* An auditor who only reports open items produces a document that cannot
> distinguish *fixed* from *never examined* — the same reason the specification inventory records rows it
> checked and found correct.

### 5c — §2.6 other recommendations

```bash
curl -s -o /dev/null -w 'AS metadata at root: %{http_code}\n' "$AS/.well-known/oauth-authorization-server"
```

AS metadata is published (RECOMMENDED — PASS). The TLS requirements are about deployment, not this server's
code: you are running it over plaintext HTTP on localhost, which is correct for a lab and would be
**§2.6 non-conformance in production** (*"Authorization responses MUST NOT be transmitted over unencrypted
network connections"*). Write it as an environment-scoped finding — a report that says "FAIL: no TLS" about a
localhost dev server is a report nobody reads twice.

---

## Exercise 6 — Rank, and write it up

You now have roughly ten findings. Ranking them is the exercise.

### 6a — Score each on both axes

For every finding, fill in: normative strength (MUST / SHOULD / RECOMMENDED), reachability (unauthenticated
remote / needs a registered client / needs admin), and **what the attacker gains**.

The third column is the one that does the work. "Violates §2.4" ranks nothing. "An attacker who phishes one
password obtains a ten-day refresh token that survives the password change" ranks itself.

### 6b — Produce the order, and defend it

Write your remediation order and, beside each, one sentence of justification. Then check it against these two
tests:

- **The swap test.** Take any adjacent pair and argue the reverse order. If you cannot, one of them is
  misplaced. If you can argue it easily *either* way, say so in the report — reviewers who hide their
  uncertainty get found out.
- **The Monday test.** Could the team start on item 1 tomorrow morning without asking you a question? If not,
  the remediation is not specific enough.

For calibration, here is a defensible order for this deployment. **Yours may differ, and a different order you
can defend is worth more than this one copied.**

| # | Finding | § | Strength | Reachability | Why here |
|---|---|---|---|---|---|
| 1 | PKCE not required for public clients | 2.1.1 | MUST | Anyone who can intercept a redirect | Highest-value MUST with a real remote attack path; one flag fixes it |
| 2 | ROPC enabled | 2.4 | MUST NOT | Any client with credentials | Explicit MUST NOT; disable the grant — no client here needs it |
| 3 | Introspection unauthenticated | RFC 7662 §2.1 | MUST | Unauthenticated remote | Only unauthenticated-remote item, but the oracle is weak, so below the two token-issuance defects |
| 4 | Implicit grant enabled | 2.1.2 | SHOULD NOT (clients) | Any client | Leaks tokens through the browser; the requirement binds clients, so slightly softer |
| 5 | No audience restriction by default; discarded on exchange | 2.3 | SHOULD | Any client | Widens the blast radius of every other item |
| 6 | 24 h access tokens / 10 d refresh | 2.3 | SHOULD | — | Multiplies the cost of every leak; cheap to fix |
| 7 | No sender-constraining required | 2.2.1 | SHOULD | — | Real, but a much larger change than 1–6 |
| 8 | Symmetric client authentication | 2.5 | RECOMMENDED | — | Elevated by the Module 06 interaction; still a migration |
| 9 | `plain` PKCE advertised | 2.1.1 | — | — | Subsumed by #1 |
| 10 | Metadata misdescribes revocation auth | — | — | — | Not exploitable; matters because it undermines source 1 |

Notice items 1 and 2 are both MUSTs and 3 is the only unauthenticated-remote one, yet 3 sits third — because
its exploitability is genuinely limited by the anti-oracle behaviour you verified in Module 04. **That is a
judgement, it is arguable, and the report says so.** A ranking you cannot argue against is usually a ranking
nobody thought about.

### 6c — Write the limitations section

Every honest report has one. Yours should include at least:

- **Scope.** One service, two clients. Findings about *this* configuration, not the software.
- **Point in time.** Configuration snapshot date. Exercise 3c is the proof that this matters: the same
  deployment gave the opposite §2.4 answer six modules ago.
- **Source reliability.** Metadata was shown to misdescribe at least one endpoint (F-2), so metadata-only
  conclusions are downgraded.
- **Coverage.** Which §2 items you verified by observation versus by configuration reading alone. Anything
  checked only by flag name is weaker evidence — and you now know exactly why (`refreshTokenKept`).
- **Not assessed.** Authentication (Module 08), the profiles (Module 10), and everything a valid token cannot
  protect (Module 11). Say so, so nobody reads "RFC 9700 §2 conformance" as "secure."

---

## Break it — three challenges to your own report

**Break 1 — argue the opposite.** Pick your #1 and write the strongest case that it should be #6. If you
cannot make that case at all, you have probably not understood the mitigations.

**Break 2 — find the composition.** Every finding above is listed on its own. Chain three of them into a
single attack narrative that is worse than any one, and say which of the three you would break to stop it.
(Start from a public client, no PKCE.)

**Break 3 — pass the audit without fixing anything.** Given the checklist, what is the smallest set of
*configuration* changes that flips the most rows to PASS while leaving the deployment substantially as
exploitable? This is conformance theatre, constructed deliberately. Doing it once makes it recognisable
forever — and it is the best possible preparation for reading someone else's compliance report.

---

## Verification block

You have completed this lab when:

- [ ] You have an evidence base from **all three** sources, collected before forming verdicts.
- [ ] You found at least two places where the sources **disagree**, and recorded each as a finding.
- [ ] Every §2 row in your report cites the quoted requirement and the command that produced its evidence.
- [ ] You obtained a token for a public client with no PKCE, and wrote the finding with severity and
      remediation rather than "FAIL".
- [ ] You obtained an access token **and a refresh token** from `grant_type=password`, and you can explain why
      Module 01 recorded the opposite result.
- [ ] You confirmed refresh-token rotation by **observation**, not by reading `refreshTokenKept`.
- [ ] You can state the postures of the introspection and revocation endpoints and why the metadata describes
      neither correctly.
- [ ] Your findings are ranked by strength × reachability, and you can argue any adjacent pair either way.
- [ ] Your report has a limitations section that names the snapshot date and what would invalidate it.
- [ ] You built the conformance-theatre variant in Break 3 and can name what it does not fix.

## Clean up

```bash
curl -s -o /dev/null -X POST "$API/revocation" -u "$CLIENT_ID:$CLIENT_SECRET" -d "token=$RT"
unset CC RT NEW CODE F CSRF
```

The ROPC and implicit exercises minted real tokens for a real user with 24-hour lifetimes. Revoke them. Then
note in your report that you did — an audit that leaves live credentials behind has added risk rather than
measured it.

---

## What to carry into Module 08

Two things, and only one of them is about OAuth.

**The method.** Three sources, observed wins, divergence is a finding, severity is strength × reachability,
every claim carries its evidence. That transfers to any protocol and any deployment. You will use it directly
in Module 10 against FAPI and in Module 12 at full scale.

**The humility.** Module 01 recorded ROPC as refused. It was true when written, verified against a live
server, and it is false now — not because anyone was careless, but because a conformance result describes a
configuration at a moment. **Date your findings. Say what would invalidate them.** Then Module 08 changes the
question entirely: everything you just audited is about what software may *do*. None of it establishes who
anybody *is*.
