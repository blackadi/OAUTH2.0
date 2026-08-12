# Module 10 — Lab

> **What you will do:** run a single flow that violates every FAPI 2.0 requirement at once and still walks
> away with a 24-hour Bearer token; measure this deployment's numbers against the profile's numbers; run the
> grant lifecycle end to end; and find out what a revoked grant does *not* revoke. The deliverable is a
> conformance report you write yourself.

**This is an audit lab, like Module 07.** The transcripts below are from *this* deployment on 2026-07-28.
Yours will differ if your service is configured differently — that is the point. What transfers is the
method.

---

## Before you start

```bash
set -a; source docs/curriculum/scripts/curriculum.env; set +a
curl -s -o /dev/null -w "%{http_code}\n" "$API/health"     # expect 200
```

You need a **confidential** client for this lab (`$CLIENT_ID` / `$CLIENT_SECRET`) — FAPI 2.0 only permits
confidential clients, and grant management needs client authentication.

### A reusable flow driver

Several exercises need a full authorization-code flow. Paste this once:

```bash
cat > /tmp/flow.sh <<'SH'
# usage: flow "<extra-query-params>" ; prints the callback URL
flow() {
  local J; J=$(mktemp); local RUE
  RUE=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$REDIRECT_URI")
  curl -s -c "$J" -o /dev/null \
    "$API/authorization?response_type=code&client_id=$CLIENT_ID&redirect_uri=$RUE&state=lab10&$1"
  local C1; C1=$(curl -s -b "$J" -c "$J" "$API/session/login" | grep -o 'name="_csrf" value="[^"]*"' | head -1 | cut -d'"' -f4)
  local L2; L2=$(curl -s -b "$J" -c "$J" -o /dev/null -w '%{redirect_url}' \
    -d "username=$LAB_USER&password=$LAB_PASS&_csrf=$C1" "$API/session/login")
  if echo "$L2" | grep -q consent; then
    local C2; C2=$(curl -s -b "$J" -c "$J" "$API/session/consent" | grep -o 'name="_csrf" value="[^"]*"' | head -1 | cut -d'"' -f4)
    curl -s -b "$J" -c "$J" -o /dev/null -w '%{redirect_url}' -d "decision=approve&_csrf=$C2" "$API/session/consent"
  else
    printf '%s' "$L2"      # stored consent (24 h) short-circuits the consent page
  fi
  rm -f "$J"
}
SH
source /tmp/flow.sh
```

> **Two things that will cost you an hour if you skip them.** The consent form field is **`decision=approve`**,
> not `approved=true` — get it wrong and the flow ends in `consent_required [A060311]` three steps later, with
> nothing pointing at the cause. And this repo stores consent for 24 hours, so the login leg sometimes
> redirects straight to the callback and skips consent entirely; the driver handles both.

> **Rate limits.** `loginLimiter` is 5/min. This lab runs several flows. If a leg starts failing oddly, wait
> sixty seconds before concluding you found a bug — Module 08 lost time to exactly this.

---

## Exercise 1 — Read the claim before auditing against it

You cannot audit against a profile you have not read the *goals* of. Start there.

Open the **FAPI 2.0 Attacker Model** — and mind the URL:

| Use this | Not this |
|---|---|
| `openid.net/specs/fapi-attacker-model-2_0.html` — **Final, 22 Feb 2025** | `openid.net/specs/fapi-2_0-attacker-model.html` — a **December 2022 draft** |

Confirm for yourself that they differ: in the draft the resource-server attacker is **A7**; in the Final it
is **A5**, and the token-endpoint attacker moved from A5 to **A4**. Citing A7 in a report dates your
knowledge and, worse, will not match what your reader finds.

Now write down, in your own words and without looking:

1. The three security goals (§5.2–§5.4).
2. The six attackers (§7).
3. Four things §6 and §8 put **out of scope**.

Then answer: **which attacker in the list does this repo's logout open redirect (Module 08) serve?** Write
the answer down; it is quiz material.

<details>
<summary>Check yourself on the last one</summary>

**A1, the plain web attacker.** No special capability is needed: A1 *"can send links to honest users that are
then visited by these users."* That is the entire attack. The lowest-capability attacker in the model defeats
that endpoint — which is exactly what makes it a serious finding rather than a theoretical one. §5.3.2.1 also
names it directly: *"shall not expose open redirectors."*
</details>

---

## Exercise 2 — Violate every requirement at once

The headline. One flow, deliberately constructed to breach as much of §5.3.2 as possible:

- **no PAR** — §5.3.2.2 *"shall reject authorization requests sent without [RFC9126]"*
- **no PKCE** — §5.3.2.2 *"shall require PKCE … with S256"*
- **`client_secret_basic`** — §5.3.2.1 permits only MTLS or `private_key_jwt`
- **a plain Bearer token** — §5.3.2.1 *"shall only issue sender-constrained access tokens"*

```bash
CB=$(flow "scope=profile")
echo "$CB" | sed 's|.*?||' | tr '&' '\n' | sed -E 's/^(code|iss)=.*/\1=<redacted>/'
CODE=$(node -e 'const u=new URL(process.argv[1]);process.stdout.write(u.searchParams.get("code")||"")' -- "$CB")

RUE=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$REDIRECT_URI")
curl -s -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=authorization_code&code=$CODE&redirect_uri=$RUE" "$API/token" | python3 -m json.tool
```

```
state=lab10
code=<redacted>
iss=<redacted>
{
    "access_token": "<43 chars, opaque>",
    "token_type": "Bearer",
    "expires_in": 86400,
    "scope": "profile",
    "refresh_token": "<43 chars>"
}
```

**Four `shall` requirements breached in one request, and the response is a success.** No warning, no
degraded mode, nothing in the token that records how weakly it was obtained. A resource server receiving
this token cannot tell it apart from one issued through a fully conformant flow.

Sit with `"expires_in": 86400` for a moment. **A bearer token, not bound to anything, valid for 24 hours.**
Anyone who obtains it — from a log, a proxy, a crash dump, attacker A5's TLS-intercepting proxy — has a full
day of access. FAPI 2.0's sender-constraining requirement exists precisely so that possession is not enough,
and this deployment does not apply it.

One thing the deployment *does* get right: **`iss` is present** in the callback. Record that as your first
PASS.

---

## Exercise 3 — Measure the numbers

Conformance is not only about mechanisms. Several FAPI 2.0 requirements are numeric, and numeric
requirements are the ones people skim.

```bash
# PAR request_uri lifetime — §5.3.2.2 requires "less than 600 seconds"
PUBRU=$(python3 -c "import urllib.parse;print(urllib.parse.quote('$REDIRECT_URI',safe=''))")
curl -s -X POST "$API/par" -H 'Content-Type: application/json' \
  -d "{\"parameters\":\"response_type=code&client_id=$PUB_CLIENT_ID&redirect_uri=$PUBRU&scope=profile&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256\",\"clientId\":\"$PUB_CLIENT_ID\"}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('expires_in =', json.loads(d.get('responseContent') or '{}').get('expires_in'))"
```

```
expires_in = 600
```

**600 is not less than 600.** By one second, this deployment is non-conformant on §5.3.2.2. If that feels
pedantic, consider what a conformance suite does with it: it fails. Normative text means what it says, and
`<` is not `<=`.

Now the token lifetimes, read from the service configuration rather than inferred:

| Setting | This deployment | FAPI 2.0 |
|---|---|---|
| `pushedAuthReqDuration` | **600** | *"less than 600 seconds"* — **FAIL** by 1 |
| `accessTokenDuration` | **86400** (24 h) | no hard limit, but §6.1 discusses short lifetimes; 24 h on a **bearer** token is indefensible |
| `refreshTokenDuration` | **864000** (10 days) | permitted |
| `authorizationCodeDuration` | **0** | *"maximum lifetime of 60 seconds"* — `0` means *service default*, so this field **does not evidence conformance either way** |

That last row is the honest answer, and worth internalising: **a configuration value of "default" is not a
finding, and it is not a pass — it is an unanswered question.** Write it into your report as *"cannot be
evidenced from configuration; requires an empirical test or vendor documentation."* Do not guess.

> **Note on `client_secret_basic` and PAR.** If you push a PAR request for the *confidential* client with its
> secret inside the `parameters` string, you get `[A157357] The client identifier is not found at the expected
> location`. That is not a FAPI finding — it is client-auth-method pinning (Module 06). This client is
> registered `CLIENT_SECRET_BASIC`, and credentials placed inside `parameters` are the `CLIENT_SECRET_POST`
> channel, so Authlete refuses to look for them there. Send them as an `Authorization: Basic` header instead
> and the same push succeeds: `/api/par` selects the channel from how *you* presented the credentials and
> passes them to Authlete accordingly. The error is Authlete enforcing the client's registered method, not a
> limitation of this server. The exercise above uses the public client to isolate the number being measured.
> Keeping those two causes apart is the skill.

---

## Exercise 4 — Supported, but not required

This is the distinction that decides most FAPI claims, and the one Module 07 named. Establish both halves.

**Half 1 — the mechanisms all work here.** You proved PAR in Exercise 3 (201 Created), and Module 05 proved
DPoP end to end, including a `cnf.jkt` you computed yourself. `iss` appeared in Exercise 2. PKCE with S256
was verified in Module 03. So the toolkit is present.

**Half 2 — none of it is required.** The advertised metadata says so out loud:

```bash
curl -s "$API/.well-known/openid-configuration" | python3 -c "
import sys,json; d=json.load(sys.stdin)
for k in ['require_pushed_authorization_requests','code_challenge_methods_supported',
          'tls_client_certificate_bound_access_tokens','token_endpoint_auth_methods_supported',
          'authorization_response_iss_parameter_supported','response_types_supported']:
    print(f'{k:48}', json.dumps(d.get(k,'<absent>'))[:110])"
```

```
require_pushed_authorization_requests            false
code_challenge_methods_supported                 ["plain", "S256"]
tls_client_certificate_bound_access_tokens       false
token_endpoint_auth_methods_supported            ["none", "client_secret_basic", "client_secret_post", ...
authorization_response_iss_parameter_supported   true
response_types_supported                         ["none", "code", "token", "id_token", "code token", ...
```

Read each line as an attacker would:

| Advertised | What an attacker does with it |
|---|---|
| `require_pushed_authorization_requests: false` | Does not use PAR. The request goes through the front channel where A3a reads it. |
| `code_challenge_methods_supported` includes `plain` | Uses `plain`, or omits PKCE entirely (Module 03 proved the latter works). |
| `tls_client_certificate_bound_access_tokens: false` | Nothing to steal a key for — the token is a bearer token. |
| `token_endpoint_auth_methods_supported` includes `none` | Picks the weakest method the AS accepts. |
| `response_types_supported` includes `token`, `id_token token` | Uses the implicit flow, which §5.3.2.2 forbids (`shall` be `code`). |

**An attacker never picks the strong option.** The security of a deployment is the security of its *weakest
permitted* configuration, not its best supported one. That sentence is the entire content of this exercise,
and it is what "supports FAPI 2.0" almost always means when a vendor says it.

For completeness, confirm what enforcement is switched off at the service:

```bash
# Both endpoints are meant to report this. Watch what they do instead.
curl -s -o /dev/null -w "fapi/config -> %{http_code}\n" "$API/fapi/config"
curl -s "$API/fapi/status" | head -c 160; echo
```

```
fapi/config -> 500
{"error":"Internal Server Error","message":"Response validation failed", ...
```

**Both FAPI reporting endpoints fail.** The one thing in this deployment whose job is to answer *"are we
FAPI conformant?"* cannot answer at all — you had to read the service configuration directly to learn
anything in Exercises 3 and 4. Record that as a finding in Exercise 7: it is an **observability failure**,
and it is why an audit reads configuration rather than trusting a status page.

### The number that used to be there

Run the same command against a copy of this repo from before **2026-08-11** and you get:

```
fapi/config -> 200
{"error":"Bad Request","message":"Response validation failed","stack":"ResponseValidationError: ...
```

**Read that carefully, because it is the more instructive failure.** A `200`, carrying an error body, that
calls itself a Bad Request. Three mutually contradictory signals in one response. A monitoring system
checking status codes reported this endpoint healthy **forever**, and a dashboard rendering the JSON showed
a stack trace.

**Predict where that came from before reading on.** It was not the SDK, and it was not FAPI. The global
error handler derived the HTTP status from the thrown error object — and the Authlete SDK's `AuthleteError`
subclasses set `statusCode` from the response they were *reading*. Authlete answered `200`; the SDK could
not parse the body; the error carried `statusCode: 200`; the handler emitted it. **Every one of the 57 SDK
call sites in this server had the same exposure**, not just these two endpoints.

The fix was one clause — trust an error-supplied status only inside 400–599 — and it is worth naming what
that fix did and did not do:

| | Before | After |
|---|---|---|
| Does `service.get()` work? | No | **No** — that is the `SPIFFE_JWT` enum gap, still open |
| Can a monitor tell? | **No** — 200 | Yes — 500 |

**Two separable defects, one visible symptom.** The one that made the failure *silent* is fixed; the one
that makes it *fail* is not. Being able to say which is which — before proposing a fix — is most of what
this exercise is for. Note also which one was cheap: the status clamp had no dependency on the vendor, the
SDK, or this curriculum.

---

## Exercise 5 — The grant lifecycle

Now the part of this module that works properly. First confirm the AS advertises it:

```bash
curl -s "$API/.well-known/openid-configuration" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('endpoint :', d.get('grant_management_endpoint'))
print('actions  :', d.get('grant_management_actions_supported'))
print('required :', d.get('grant_management_action_required'))
print('scopes   :', [s for s in d.get('scopes_supported',[]) if 'grant' in s])"
```

```
endpoint : https://<your-host>/api/gm
actions  : ['create', 'merge', 'query', 'replace', 'revoke']
required : False
scopes   : ['grant_management_query', 'grant_management_revoke']
```

Create a grant. Note that you must request the two management scopes *in the same authorization* — the token
that queries a grant is an ordinary access token that happens to carry `grant_management_query`:

```bash
CB=$(flow "scope=profile%20grant_management_query%20grant_management_revoke&grant_management_action=create")
CODE=$(node -e 'const u=new URL(process.argv[1]);process.stdout.write(u.searchParams.get("code")||"")' -- "$CB")
RUE=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$REDIRECT_URI")
curl -s -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=authorization_code&code=$CODE&redirect_uri=$RUE" "$API/token" -o /tmp/gm.json
python3 -c "
import json; d=json.load(open('/tmp/gm.json'))
print('keys     :', list(d.keys()))
print('scope    :', d.get('scope'))
print('grant_id :', d.get('grant_id'))"
AT=$(python3 -c "import json;print(json.load(open('/tmp/gm.json'))['access_token'])")
GID=$(python3 -c "import json;print(json.load(open('/tmp/gm.json'))['grant_id'])")
```

```
keys     : ['access_token', 'token_type', 'expires_in', 'scope', 'refresh_token', 'grant_id']
scope    : grant_management_query grant_management_revoke profile
grant_id : <redacted — 43 chars>
```

A sixth member appears in the token response: **`grant_id`**. Now exercise the API:

```bash
echo "-- query --";            curl -s -H "Authorization: Bearer $AT" "$API/gm/$GID" -w '\n[%{http_code}]\n'
echo "-- no token --";         curl -s "$API/gm/$GID" -w '\n[%{http_code}]\n'
echo "-- nonexistent grant --";curl -s -H "Authorization: Bearer $AT" "$API/gm/not-a-real-grant" -w '\n[%{http_code}]\n'
echo "-- revoke --";           curl -s -X DELETE -H "Authorization: Bearer $AT" "$API/gm/$GID" -w '[%{http_code}]\n'
echo "-- query again --";      curl -s -H "Authorization: Bearer $AT" "$API/gm/$GID" -w '\n[%{http_code}]\n'
```

```
-- query --
{"scopes":[{"scope":"grant_management_query grant_management_revoke profile"}],"claims":["birthdate","family_name",...]}
[200]
-- no token --
{"error":"invalid_token","error_description":"Access token is invalid or expired"}
[401]
-- nonexistent grant --
{"error":"not_found","error_description":"Grant not found"}
[404]
-- revoke --
[204]
-- query again --
{"error":"not_found","error_description":"Grant not found"}
[404]
```

Every status matches the specification: 200 with the grant contents, 401 unauthenticated, 404 for an unknown
grant, **204 with an empty body** on revoke (§6.5), 404 afterwards. Scope enforcement holds too — try a
`client_credentials` token carrying only `profile` and you get 401.

**This is what a correct implementation looks like**, and it is worth noticing after nine modules of finding
defects. Write down what makes it correct: local validation before the upstream call, spec-mandated status
codes, typed errors, no stack traces.

---

## Exercise 6 — What a revocation does not revoke

You revoked the grant. The user, in effect, pressed "disconnect this app." Test what that actually
accomplished — and read the modal verbs before you predict.

§6.5: *"The AS **MUST** revoke the grant and all refresh tokens issued based on that particular grant, it
**should** revoke all access tokens issued based on that particular grant."*

**Predict both outcomes before running this.**

```bash
echo "-- refresh token from the revoked grant (MUST be revoked) --"
RT=$(python3 -c "import json;print(json.load(open('/tmp/gm.json'))['refresh_token'])")
curl -s -u "$CLIENT_ID:$CLIENT_SECRET" -d "grant_type=refresh_token&refresh_token=$RT" "$API/token" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ',d.get('error','ISSUED A TOKEN'),'|',d.get('error_description','')[:80])"

echo "-- access token from the revoked grant (should be revoked) --"
curl -s -u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET" -X POST "$API/introspection/standard" -d "token=$AT" | python3 -c "
import sys,json,time;d=json.load(sys.stdin)
print('   active:',d.get('active'),'| scope:',d.get('scope'))
if d.get('exp'): print('   still valid for %.1f hours' % ((d['exp']-time.time())/3600))"
```

```
-- refresh token from the revoked grant (MUST be revoked) --
   invalid_grant | [A053305] The refresh token passed to the token endpoint does not exist.
-- access token from the revoked grant (should be revoked) --
   active: True | scope: grant_management_query grant_management_revoke profile
   still valid for 24.0 hours
```

**The MUST is satisfied. The should is not.**

Be precise about what that means, because the temptation is to over-claim. This is **not** a specification
violation of a MUST. It is a `should` that has not been followed, which Module 07 taught you to treat as a
finding *unless a written rationale exists* — and none does.

Now the part that determines its severity: the `should` is only tolerable because access tokens are assumed
short-lived. **This deployment's access tokens last 24 hours.** So the two settings interact:

> A user who revokes consent continues to be exposed for up to a day, and the interface gave them no
> indication of that.

Neither fact alone is alarming. A 24-hour access token is defensible on its own; a `should` unfollowed is
minor on its own. **Together they defeat the feature's purpose.** Finding interactions between individually
acceptable settings is what separates an audit from a checklist run — and it is why Module 07 insisted on
recording severity as *strength × reachability* rather than copying the modal verb.

Finally, distinguish two things people conflate. §6.5:

> "token revocation is not required to cause the revocation of the underlying grant."

So RFC 7009 revocation (Module 04) discards a credential and leaves the grant standing; grant revocation
withdraws the authority. **A "disconnect this app" button wired to RFC 7009 has not disconnected the app** —
the next authorization request is approved with no prompt, because the consent still exists.

---

## Exercise 7 — Write the conformance report

The deliverable. Use the Module 07 format — statement, evidence, severity as strength × reachability,
remediation — and cover at minimum:

1. Each §5.3.2.1 `shall` and §5.3.2.2 `shall`: **PASS / FAIL / NOT EVIDENCED**, with the command you ran.
2. The numeric requirements, with measured values.
3. The grant-management revocation gap, with its severity argued from the *interaction* rather than the
   modal verb.
4. The FAPI reporting endpoints failing, so the deployment cannot report its own posture — and, as a
   separate finding with a separate fix, the 200-with-error status inversion that used to hide it.
5. A remediation order, justified.

Write it to `docs/curriculum/my-fapi-audit.md` (gitignored, like Module 07's).

> **Redact before you save.** Your report will otherwise contain live tokens, a client secret, and a
> deployment hostname. Same rule as Module 07.

<details>
<summary>My top-line summary, for comparison after you write yours</summary>

**Verdict: this deployment is not FAPI 2.0 conformant, and is not claimed to be** — `fapiModes` and
`supportedServiceProfiles` are absent. The useful finding is not "it fails" but *how it fails*: **every
required mechanism is available and none is mandatory.**

| §5.3.2 requirement | Result |
|---|---|
| Confidential clients only | **FAIL** — a public client exists and works |
| Sender-constrained access tokens only | **FAIL** — plain Bearer issued (Ex 2) |
| MTLS or `private_key_jwt` client auth | **FAIL** — `client_secret_basic` accepted; `none` advertised |
| Reject requests without PAR | **FAIL** — `require_pushed_authorization_requests: false` |
| Require PKCE S256 | **FAIL** — `plain` advertised; Module 03 got a token with no PKCE at all |
| `response_type` must be `code` | **FAIL** — implicit response types advertised and working |
| Return `iss` | **PASS** |
| Reject reused authorization code | **PASS** — Module 02 verified |
| No open redirectors | **FAIL** — logout endpoint (Module 08) |
| No refresh-token rotation | **FAIL** — rotation is on (`refreshTokenKept: false`) |
| `request_uri` lifetime < 600 s | **FAIL** — exactly 600 |
| Code lifetime ≤ 60 s | **NOT EVIDENCED** — `authorizationCodeDuration: 0` (service default) |

**Remediation order, and the reasoning matters more than the list.** Not "hardest first" and not "spec order":

1. **The open redirect.** Only item exploitable by the model's *weakest* attacker (A1), and it is a one-line
   fix. Highest reachability, lowest cost.
2. **Set `fapiModes`.** One setting flips the majority of the FAIL rows at once, because it converts
   "supported" into "required" across PAR, PKCE, client auth and response types. Best ratio in the list by a
   wide margin.
3. **Sender-constraining (DPoP).** Already proven to work here (Module 05); it is the single largest
   reduction in the value of a stolen token.
4. **Access-token lifetime.** Cheap, and it also repairs the grant-revocation gap without touching that code.
5. **The `request_uri` 600 → 599.** Trivially fixed, zero real-world risk, but it fails conformance testing.
6. **Fix the FAPI introspection endpoints.** No direct security impact; without them nobody can *see* any of
   the above, which is why it should not be last on a longer list.

Note items 4 and 6: one fixes a security gap as a side effect of a performance-shaped change, and the other
has no security impact but governs whether the rest ever gets noticed. Severity ranking that only counts
exploitability misses both.
</details>

---

## Break it — three to reason about

1. **A vendor states: "We are FAPI 2.0 Security Profile compliant and formally verified."** Write the three
   questions you would ask first, and say what a bad answer to each would sound like.

2. **A team enables refresh-token rotation on a FAPI 2.0 deployment** because their security policy mandates
   it. Using §5.3.2.1 NOTE 1, explain why this makes the deployment *less* secure, not merely non-conformant.
   Then describe the failure mode a user would actually experience.

3. **An ecosystem mandates grant management and sets access-token lifetime to 24 hours** — the configuration
   you measured. A regulator asks: "when a customer withdraws consent, when does access stop?" Write the
   honest answer, then the two-line change that makes it acceptable.

---

## Verification block

Tick only what you ran and saw:

- [ ] Located the **Final** attacker model and confirmed the numbering differs from the 2022 draft
- [ ] Named which attacker the logout open redirect serves — and why that makes it worse, not better
- [ ] Obtained a **24-hour Bearer token** from a flow with no PAR, no PKCE, and `client_secret_basic`
- [ ] Confirmed `iss` **is** returned (your first PASS)
- [ ] Measured `request_uri` `expires_in` = **600** and explained why that fails `< 600`
- [ ] Recorded `authorizationCodeDuration: 0` as **NOT EVIDENCED** rather than as a pass or a fail
- [ ] Read the advertised metadata as an attacker choosing the weakest permitted option
- [ ] Saw both FAPI endpoints fail with **HTTP 500**, and can say why the deployment therefore cannot
      report its own posture
- [ ] Can explain what the **200** they used to return came from, and why the status inversion and the
      SDK enum gap are two defects with two separate fixes
- [ ] Ran create → query → revoke → query and got **200 / 401 / 404 / 204 / 404**
- [ ] Confirmed the refresh token **is** revoked (MUST) and the access token **is not** (should)
- [ ] Argued that finding's severity from the *interaction* with the 24-hour lifetime
- [ ] Wrote and redacted `my-fapi-audit.md`

---

## Clean up

```bash
rm -f /tmp/gm.json /tmp/flow.sh
```

The grant you created is already revoked. The access token from it stays alive for 24 hours — which you
now know is the point.

---

## What to carry into Module 11

1. **A security claim without an attacker model is not a claim.** You now have a template for interrogating
   one, and you have seen a document honest enough to enumerate what it does not cover.
2. **Supported ≠ required, and an attacker picks the weakest permitted option.** This is the most reusable
   sentence in the module.
3. **Individually acceptable settings can combine into a defect.** A 24-hour token is fine. An unfollowed
   `should` is minor. Together they make consent withdrawal cosmetic.

And the handover to Module 11: everything you just audited concerns **getting a trustworthy token to the
resource server**. Suppose it all passes — mandatory PAR, PKCE, DPoP-bound tokens, 60-second codes, a
formally verified profile. The token arriving at your API is genuine, unforgeable, and provably belongs to
the presenter.

It still says nothing about whether that user may read **this** record. That question has no OAuth answer,
and it is where the most common serious API vulnerability in the world lives.
